/**
 * Intent parsing service — wired to @ton-intent/core.
 *
 * Pattern learned from ton-agent-kit: keep local interface thin,
 * delegate NLP to the shared package, only add bot-specific
 * action mapping here.
 */
import {
  IntentParser,
  createAnthropicProvider,
  type IntentResult,
  validateAmount,
  isValidTONAddress,
} from '@ton-intent/core'

export interface ProposalIntent {
  action: 'send' | 'add_member' | 'remove_member' | 'change_threshold'
  amount?: string       // nanoTON as string
  recipient?: string
  reason: string
  confidence: number
}

// TON address patterns: EQ/UQ/kQ/0Q + base64, or 0:hex
const ADDRESS_RE = /(?:(?:[EUkK0]Q)[A-Za-z0-9_\-]{46}|0:[a-fA-F0-9]{64})/
const AMOUNT_RE = /(\d+(?:\.\d+)?)\s*(?:TON|ton|Ton)/
const USERNAME_RE = /@(\w{3,32})/

// Keyword → action mapping
const SEND_KEYWORDS = /\b(send|transfer|pay|wire|give)\b/i
const ADD_KEYWORDS = /\b(add|invite|register)\b.*\b(member|signer|user)s?\b/i
const REMOVE_KEYWORDS = /\b(remove|kick|delete)\b.*\b(member|signer|user)s?\b/i
const THRESHOLD_KEYWORDS = /\b(change|set|update)\b.*\b(threshold|quorum|approval)\b/i

function extractRecipient(text: string): string | undefined {
  const addrMatch = text.match(ADDRESS_RE)
  if (addrMatch) return addrMatch[0]

  const userMatch = text.match(USERNAME_RE)
  if (userMatch) return '@' + userMatch[1]

  return undefined
}

function extractAmount(text: string): string | undefined {
  const match = text.match(AMOUNT_RE)
  if (match) return match[1]

  // Try bare number near send keywords
  const bareMatch = text.match(/(?:send|transfer|pay)\s+(\d+(?:\.\d+)?)/i)
  if (bareMatch) return bareMatch[1]

  return undefined
}

function extractReason(text: string): string {
  // Look for "for <reason>" or "because <reason>"
  const forMatch = text.match(/\bfor\s+(.+?)(?:\.|$)/i)
  if (forMatch) return forMatch[1].trim()

  const becauseMatch = text.match(/\bbecause\s+(.+?)(?:\.|$)/i)
  if (becauseMatch) return becauseMatch[1].trim()

  return text.trim()
}

/**
 * Map a core IntentResult (transfer/multisig_propose/...) to a bot ProposalIntent (send/add_member/...).
 * Falls back to regex heuristics when LLM is unavailable.
 */
function mapCoreToProposal(core: IntentResult, originalText: string): ProposalIntent {
  let action: ProposalIntent['action'] = 'send'
  let confidence = core.confidence

  // Map core actions to bot-specific proposal actions
  if (core.action === 'transfer' || core.action === 'multisig_propose') {
    // Use regex to further classify within the bot's action space
    if (THRESHOLD_KEYWORDS.test(originalText)) {
      action = 'change_threshold'
    } else if (REMOVE_KEYWORDS.test(originalText)) {
      action = 'remove_member'
    } else if (ADD_KEYWORDS.test(originalText)) {
      action = 'add_member'
    } else {
      action = 'send'
    }
  } else {
    // For unknown/jetton_transfer/stake, try regex fallback
    if (THRESHOLD_KEYWORDS.test(originalText)) {
      action = 'change_threshold'
      confidence = Math.max(confidence, 0.85)
    } else if (REMOVE_KEYWORDS.test(originalText)) {
      action = 'remove_member'
      confidence = Math.max(confidence, 0.85)
    } else if (ADD_KEYWORDS.test(originalText)) {
      action = 'add_member'
      confidence = Math.max(confidence, 0.85)
    } else if (SEND_KEYWORDS.test(originalText)) {
      action = 'send'
      confidence = Math.max(confidence, 0.9)
    }
  }

  // Prefer core-extracted values, fall back to regex
  const recipient = core.recipient || extractRecipient(originalText)
  const reason = core.comment || extractReason(originalText)

  // Amount: core returns nanoTON string, regex extracts TON float
  let amount: string | undefined
  if (core.amount) {
    amount = core.amount // already nanoTON from core parser
  } else {
    const regexAmount = extractAmount(originalText)
    if (regexAmount) {
      // Validate & convert using core's validator
      const validation = validateAmount(regexAmount)
      if (validation.valid && validation.nanoton) {
        amount = validation.nanoton.toString()
      }
    }
  }

  // Boost confidence when we have structured data
  if (amount && recipient) confidence = Math.min(confidence + 0.1, 1.0)
  if (amount) confidence = Math.max(confidence, 0.7)

  // Special case: change_threshold extracts the number
  if (action === 'change_threshold') {
    const threshMatch = originalText.match(/(?:to|=)\s*(\d+)/i)
    if (threshMatch) {
      return { action, amount: threshMatch[1], reason, confidence }
    }
  }

  return { action, amount, recipient, reason, confidence }
}

// Lazily created parser instance
let _parser: IntentParser | null = null

function getParser(): IntentParser | null {
  if (_parser) return _parser

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const provider = createAnthropicProvider(apiKey)
  _parser = new IntentParser(provider)
  return _parser
}

/**
 * Parse a natural language proposal into a structured ProposalIntent.
 *
 * Uses @ton-intent/core's LLM-backed IntentParser when ANTHROPIC_API_KEY
 * is available, with regex-based fallback for offline/fast path.
 */
export async function parseProposalIntent(text: string): Promise<ProposalIntent> {
  const parser = getParser()

  if (parser) {
    try {
      const coreResult = await parser.parse(text)
      return mapCoreToProposal(coreResult, text)
    } catch (error) {
      console.error('[intent] Core parser failed, falling back to regex:', error)
    }
  }

  // Pure regex fallback (no LLM dependency)
  return regexFallback(text)
}

/**
 * Fast regex-only parsing — no LLM call required.
 */
function regexFallback(text: string): ProposalIntent {
  let action: ProposalIntent['action'] = 'send'
  let confidence = 0.3

  if (THRESHOLD_KEYWORDS.test(text)) {
    action = 'change_threshold'
    confidence = 0.85
  } else if (REMOVE_KEYWORDS.test(text)) {
    action = 'remove_member'
    confidence = 0.85
  } else if (ADD_KEYWORDS.test(text)) {
    action = 'add_member'
    confidence = 0.85
  } else if (SEND_KEYWORDS.test(text)) {
    action = 'send'
    confidence = 0.9
  }

  const rawAmount = extractAmount(text)
  let amount: string | undefined
  if (rawAmount) {
    const validation = validateAmount(rawAmount)
    if (validation.valid && validation.nanoton) {
      amount = validation.nanoton.toString()
    }
  }

  const recipient = extractRecipient(text)
  const reason = extractReason(text)

  if (amount && recipient) confidence = Math.min(confidence + 0.1, 1.0)
  if (amount) confidence = Math.max(confidence, 0.7)

  if (action === 'change_threshold') {
    const threshMatch = text.match(/(?:to|=)\s*(\d+)/i)
    if (threshMatch) {
      return { action, amount: threshMatch[1], reason, confidence }
    }
  }

  return { action, amount, recipient, reason, confidence }
}
