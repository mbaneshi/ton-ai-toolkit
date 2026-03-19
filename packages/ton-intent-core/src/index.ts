// Core types
export {
  IntentActionSchema,
  IntentResultSchema,
  type IntentAction,
  type IntentResult,
  type ILLMProvider,
  type BuildResult,
  type ActionDefinition,
  toAITools,
} from './types.js'

// Parser
export { IntentParser } from './parsers/intent.js'

// Validators
export {
  isValidTONAddress,
  validateAmount,
  normalizeAddress,
  isBounceable,
  toFriendly,
} from './parsers/validators.js'

// Builders
export { buildTransferBody, buildTransferMessage } from './builders/transfer.js'
export { buildMultisigOrderBody, buildNewOrderMessage } from './builders/multisig.js'

// Providers
export { createAnthropicProvider } from './providers/anthropic.js'
export { createOpenAIProvider } from './providers/openai.js'
export type { ILLMProvider as LLMProvider } from './providers/interface.js'

// Utils
export { tonToNano, nanoToTon, INTENT_SYSTEM_PROMPT } from './utils.js'

// Convenience classes and functions
import { IntentParser } from './parsers/intent.js'
import { buildTransferMessage } from './builders/transfer.js'
import { buildMultisigOrderBody, buildNewOrderMessage } from './builders/multisig.js'
import { type IntentResult, type ILLMProvider, type BuildResult } from './types.js'
import { Address, beginCell } from '@ton/core'

/**
 * TONTxBuilder wraps the transfer and multisig builders into a single convenient API.
 */
export class TONTxBuilder {
  /**
   * Build a simple TON transfer message from an intent.
   */
  buildTransfer(intent: IntentResult): { to: Address; value: bigint; body: ReturnType<typeof beginCell>['endCell'] extends () => infer R ? R : never } {
    return buildTransferMessage(intent)
  }

  /**
   * Build a multisig order from multiple actions.
   */
  buildMultisigOrder(
    actions: { to: Address; value: bigint; body?: ReturnType<typeof beginCell>['endCell'] extends () => infer R ? R : never }[],
    signerIndex: number,
    orderSeqno: bigint,
    expiresIn?: number
  ) {
    const orderBody = buildMultisigOrderBody(actions)
    const message = buildNewOrderMessage(orderBody, signerIndex, orderSeqno, expiresIn)
    return { orderBody, message }
  }

  /**
   * Build a transfer and return a base64-encoded BOC with description.
   */
  buildTransferBoc(intent: IntentResult): BuildResult {
    const { to, value, body } = buildTransferMessage(intent)
    const boc = beginCell()
      .storeAddress(to)
      .storeCoins(value)
      .storeRef(body)
      .endCell()
      .toBoc()
      .toString('base64')

    const tonAmount = Number(value) / 1_000_000_000
    return {
      boc,
      description: `Transfer ${tonAmount} TON to ${to.toString()}`,
    }
  }
}

/**
 * Convenience function: parse a natural language string and build a transfer message in one step.
 *
 * @param text - Natural language input (e.g., "send 5 TON to EQ...")
 * @param provider - LLM provider for intent parsing
 * @returns The parsed intent and built message (if action is transfer)
 */
export async function parseAndBuild(
  text: string,
  provider: ILLMProvider
): Promise<{
  intent: IntentResult
  message?: { to: Address; value: bigint; body: ReturnType<typeof beginCell>['endCell'] extends () => infer R ? R : never }
}> {
  const parser = new IntentParser(provider)
  const intent = await parser.parse(text)

  if (intent.action === 'transfer' && intent.recipient && intent.amount) {
    try {
      const message = buildTransferMessage(intent)
      return { intent, message }
    } catch {
      return { intent }
    }
  }

  return { intent }
}
