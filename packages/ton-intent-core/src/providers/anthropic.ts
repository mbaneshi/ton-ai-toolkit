import { ILLMProvider, IntentResult, IntentResultSchema } from '../types.js'

/**
 * Create an LLM provider backed by Anthropic's Claude API.
 * Dynamically imports @anthropic-ai/sdk so it remains an optional dependency.
 *
 * @param apiKey - Anthropic API key
 * @returns ILLMProvider implementation using Claude
 */
export function createAnthropicProvider(
  apiKey: string,
  options?: { model?: string },
): ILLMProvider {
  const model = options?.model ?? 'claude-sonnet-4-20250514'
  return {
    async parseIntent(input: string, systemPrompt?: string): Promise<IntentResult> {
      // Dynamic import — @anthropic-ai/sdk is an optional dependency
      const { default: Anthropic } = await import('@anthropic-ai/sdk')

      const client = new Anthropic({ apiKey })

      const response = await client.messages.create({
        model,
        max_tokens: 1024,
        system: systemPrompt ?? 'You are a TON blockchain intent parser. Return only valid JSON.',
        messages: [
          {
            role: 'user',
            content: input,
          },
        ],
      })

      // Extract text content from the response
      const textBlock = response.content.find((block) => block.type === 'text')
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error('No text response from Anthropic API')
      }

      const rawJson = textBlock.text.trim()

      // Parse JSON — handle potential markdown code blocks
      let jsonStr = rawJson
      const codeBlockMatch = rawJson.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1]!
      }

      const parsed = JSON.parse(jsonStr)

      // Map null values to undefined for Zod compatibility
      const cleaned = {
        action: parsed.action ?? 'unknown',
        recipient: parsed.recipient ?? undefined,
        amount: parsed.amount != null ? String(parsed.amount) : undefined,
        comment: parsed.comment ?? undefined,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
        raw: input,
      }

      return IntentResultSchema.parse(cleaned)
    },
  }
}
