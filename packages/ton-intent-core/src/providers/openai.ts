import { ILLMProvider, IntentResult, IntentResultSchema } from '../types.js'

/**
 * Create an LLM provider backed by OpenAI's API.
 * Dynamically imports openai so it remains an optional dependency.
 *
 * @param apiKey - OpenAI API key
 * @returns ILLMProvider implementation using GPT
 */
export function createOpenAIProvider(
  apiKey: string,
  options?: { model?: string },
): ILLMProvider {
  const model = options?.model ?? 'gpt-4o-mini'
  return {
    async parseIntent(input: string, systemPrompt?: string): Promise<IntentResult> {
      // Dynamic import — openai is an optional dependency
      const { default: OpenAI } = await import('openai')

      const client = new OpenAI({ apiKey })

      const response = await client.chat.completions.create({
        model,
        max_tokens: 1024,
        messages: [
          {
            role: 'system',
            content:
              systemPrompt ?? 'You are a TON blockchain intent parser. Return only valid JSON.',
          },
          {
            role: 'user',
            content: input,
          },
        ],
        temperature: 0.1,
      })

      const content = response.choices[0]?.message?.content
      if (!content) {
        throw new Error('No response content from OpenAI API')
      }

      const rawJson = content.trim()

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
