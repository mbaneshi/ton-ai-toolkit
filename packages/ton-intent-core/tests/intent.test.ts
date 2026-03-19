import { describe, it, expect, vi } from 'vitest'
import { IntentParser } from '../src/parsers/intent.js'
import { ILLMProvider, IntentResult } from '../src/types.js'
import { tonToNano, nanoToTon } from '../src/utils.js'

/**
 * Create a mock LLM provider that returns a predetermined IntentResult.
 */
function createMockProvider(result: Partial<IntentResult>): ILLMProvider {
  return {
    async parseIntent(input: string): Promise<IntentResult> {
      return {
        action: result.action ?? 'unknown',
        recipient: result.recipient,
        amount: result.amount,
        comment: result.comment,
        confidence: result.confidence ?? 0.9,
        raw: input,
      }
    },
  }
}

/**
 * Create a mock provider that throws an error.
 */
function createFailingProvider(): ILLMProvider {
  return {
    async parseIntent(): Promise<IntentResult> {
      throw new Error('LLM API failed')
    },
  }
}

describe('IntentParser', () => {
  it('should parse a simple transfer intent', async () => {
    const provider = createMockProvider({
      action: 'transfer',
      recipient: 'EQBvW8Z5huBkMJYdnfAEM5JqTNkuWX3diqYENkWsIL0XggGG',
      amount: '5', // 5 TON — will be converted to nanoTON
      confidence: 0.95,
    })

    const parser = new IntentParser(provider)
    const result = await parser.parse('send 5 TON to EQBvW8Z5huBkMJYdnfAEM5JqTNkuWX3diqYENkWsIL0XggGG')

    expect(result.action).toBe('transfer')
    expect(result.recipient).toBe('EQBvW8Z5huBkMJYdnfAEM5JqTNkuWX3diqYENkWsIL0XggGG')
    expect(result.amount).toBe('5000000000') // 5 TON in nanoTON
    expect(result.confidence).toBe(0.95)
    expect(result.raw).toBe('send 5 TON to EQBvW8Z5huBkMJYdnfAEM5JqTNkuWX3diqYENkWsIL0XggGG')
  })

  it('should parse a transfer with decimal amount', async () => {
    const provider = createMockProvider({
      action: 'transfer',
      recipient: 'EQBvW8Z5huBkMJYdnfAEM5JqTNkuWX3diqYENkWsIL0XggGG',
      amount: '10.5',
      confidence: 0.9,
    })

    const parser = new IntentParser(provider)
    const result = await parser.parse('transfer 10.5 TON to EQBvW8Z5huBkMJYdnfAEM5JqTNkuWX3diqYENkWsIL0XggGG')

    expect(result.action).toBe('transfer')
    expect(result.amount).toBe('10500000000') // 10.5 TON in nanoTON
  })

  it('should parse a transfer with a comment', async () => {
    const provider = createMockProvider({
      action: 'transfer',
      recipient: 'EQBvW8Z5huBkMJYdnfAEM5JqTNkuWX3diqYENkWsIL0XggGG',
      amount: '1',
      comment: 'Payment for coffee',
      confidence: 0.88,
    })

    const parser = new IntentParser(provider)
    const result = await parser.parse('send 1 TON to EQBvW8Z5huBkMJYdnfAEM5JqTNkuWX3diqYENkWsIL0XggGG with memo "Payment for coffee"')

    expect(result.action).toBe('transfer')
    expect(result.comment).toBe('Payment for coffee')
    expect(result.amount).toBe('1000000000')
  })

  it('should handle stake intent', async () => {
    const provider = createMockProvider({
      action: 'stake',
      amount: '100',
      confidence: 0.85,
    })

    const parser = new IntentParser(provider)
    const result = await parser.parse('stake 100 TON')

    expect(result.action).toBe('stake')
    expect(result.amount).toBe('100000000000') // 100 TON in nanoTON
    expect(result.confidence).toBe(0.85)
  })

  it('should handle recipient-only intent (e.g., @username)', async () => {
    const provider = createMockProvider({
      action: 'transfer',
      recipient: '@alice',
      amount: '2',
      confidence: 0.7,
    })

    const parser = new IntentParser(provider)
    const result = await parser.parse('transfer 10.5 TON to @alice')

    expect(result.action).toBe('transfer')
    expect(result.recipient).toBe('@alice')
  })

  it('should fall back to unknown on provider failure', async () => {
    const provider = createFailingProvider()
    const parser = new IntentParser(provider)
    const result = await parser.parse('some invalid input')

    expect(result.action).toBe('unknown')
    expect(result.confidence).toBe(0)
    expect(result.raw).toBe('some invalid input')
  })

  it('should fall back to unknown when Zod validation fails', async () => {
    const provider: ILLMProvider = {
      async parseIntent(input: string): Promise<IntentResult> {
        return {
          action: 'invalid_action' as any,
          confidence: 2, // invalid: > 1
          raw: input,
        }
      },
    }

    const parser = new IntentParser(provider)
    const result = await parser.parse('bad data')

    expect(result.action).toBe('unknown')
    expect(result.confidence).toBe(0)
  })

  it('should always convert LLM amount as TON to nanoTON', async () => {
    const provider = createMockProvider({
      action: 'transfer',
      recipient: 'EQBvW8Z5huBkMJYdnfAEM5JqTNkuWX3diqYENkWsIL0XggGG',
      amount: '5', // LLM always returns TON
      confidence: 0.9,
    })

    const parser = new IntentParser(provider)
    const result = await parser.parse('send 5 TON')

    // 5 TON = 5000000000 nanoTON
    expect(result.amount).toBe('5000000000')
  })
})

describe('tonToNano / nanoToTon', () => {
  it('should convert whole TON to nanoTON', () => {
    expect(tonToNano('1')).toBe(1_000_000_000n)
    expect(tonToNano('100')).toBe(100_000_000_000n)
    expect(tonToNano(5)).toBe(5_000_000_000n)
  })

  it('should convert fractional TON to nanoTON', () => {
    expect(tonToNano('0.5')).toBe(500_000_000n)
    expect(tonToNano('10.5')).toBe(10_500_000_000n)
    expect(tonToNano('0.000000001')).toBe(1n)
  })

  it('should convert nanoTON to TON string', () => {
    expect(nanoToTon(1_000_000_000n)).toBe('1')
    expect(nanoToTon(10_500_000_000n)).toBe('10.5')
    expect(nanoToTon(1n)).toBe('0.000000001')
    expect(nanoToTon('500000000')).toBe('0.5')
  })

  it('should handle zero', () => {
    expect(tonToNano('0')).toBe(0n)
    expect(nanoToTon(0n)).toBe('0')
  })
})
