import { IntentResult, IntentResultSchema, ILLMProvider } from '../types.js'
import { INTENT_SYSTEM_PROMPT, tonToNano } from '../utils.js'

/**
 * IntentParser uses an LLM provider to parse natural language into structured TON intents.
 */
export class IntentParser {
  private provider: ILLMProvider

  constructor(provider: ILLMProvider) {
    this.provider = provider
  }

  /**
   * Parse a natural language string into a structured IntentResult.
   * The LLM provider extracts the action, recipient, amount, comment, and confidence.
   * Amount is converted from TON to nanoTON string.
   */
  async parse(text: string): Promise<IntentResult> {
    try {
      const result = await this.provider.parseIntent(text, INTENT_SYSTEM_PROMPT)

      // The LLM always returns TON float strings — convert to nanoTON
      let processedResult = { ...result }
      if (processedResult.amount) {
        processedResult.amount = tonToNano(processedResult.amount).toString()
      }

      // Validate with Zod
      const validated = IntentResultSchema.parse({
        ...processedResult,
        raw: text,
      })

      return validated
    } catch (error) {
      // Log with context so callers can diagnose failures
      // (pattern from izTolkMcp: always surface error details)
      const errMsg = error instanceof Error ? error.message : String(error)
      console.error(`[ton-intent-core] parse failed for "${text.slice(0, 80)}": ${errMsg}`)
      // Fallback on any parse failure
      return {
        action: 'unknown',
        confidence: 0,
        raw: text,
      }
    }
  }
}
