import { z } from 'zod'

export const IntentActionSchema = z.enum([
  'transfer',
  'multisig_propose',
  'jetton_transfer',
  'stake',
  'unknown',
])
export type IntentAction = z.infer<typeof IntentActionSchema>

export const IntentResultSchema = z.object({
  action: IntentActionSchema,
  recipient: z.string().optional(),
  amount: z.string().optional(), // nanoTON as string for serialization
  comment: z.string().optional(),
  confidence: z.number().min(0).max(1),
  raw: z.string(),
})
export type IntentResult = z.infer<typeof IntentResultSchema>

export interface ILLMProvider {
  parseIntent(input: string, systemPrompt?: string): Promise<IntentResult>
}

export interface BuildResult {
  boc: string // base64 encoded
  description: string
  estimatedFees?: string
}

/**
 * Action definition following ton-agent-kit's pattern:
 * each action has a name, description, Zod schema, and async handler.
 * Use toAITools() to convert to OpenAI/Claude function-calling format.
 */
export interface ActionDefinition<TInput = any, TOutput = any> {
  name: string
  description: string
  schema: z.ZodType<TInput>
  handler: (params: TInput) => Promise<TOutput>
}

/**
 * Convert ActionDefinitions to OpenAI-compatible tool format.
 * Pattern from ton-agent-kit's toAITools() — works with any LLM provider.
 */
export function toAITools(actions: ActionDefinition[]): Array<{
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}> {
  return actions.map((action) => {
    // Extract JSON schema from Zod, strip $schema root key
    const jsonSchema = zodToJsonSchema(action.schema)
    return {
      type: 'function' as const,
      function: {
        name: action.name,
        description: action.description,
        parameters: jsonSchema,
      },
    }
  })
}

/** Minimal Zod → JSON Schema conversion for function-calling */
function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodType>
    const properties: Record<string, unknown> = {}
    const required: string[] = []

    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(value)
      if (!(value instanceof z.ZodOptional)) {
        required.push(key)
      }
    }

    return {
      type: 'object',
      properties,
      ...(required.length > 0 ? { required } : {}),
    }
  }
  if (schema instanceof z.ZodString) return { type: 'string' }
  if (schema instanceof z.ZodNumber) return { type: 'number' }
  if (schema instanceof z.ZodBoolean) return { type: 'boolean' }
  if (schema instanceof z.ZodEnum) {
    return { type: 'string', enum: schema.options }
  }
  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchema(schema.unwrap())
  }
  if (schema instanceof z.ZodArray) {
    return { type: 'array', items: zodToJsonSchema(schema.element) }
  }
  return { type: 'string' }
}
