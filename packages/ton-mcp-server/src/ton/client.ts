import { TonClient, Address } from '@ton/ton'
import { Cell, beginCell } from '@ton/core'
import { config } from '../config.js'

export interface AccountState {
  address: string
  balance: string
  balanceTon: string
  state: string
  codeHash: string | null
  dataHash: string | null
  lastTransactionLt: string | null
  lastTransactionHash: string | null
}

export interface TransactionInfo {
  hash: string
  lt: string
  timestamp: number
  from: string | null
  to: string | null
  amount: string
  amountTon: string
  fee: string
  comment: string | null
  success: boolean
}

class RateLimiter {
  private tokens: number
  private maxTokens: number
  private refillRate: number // tokens per ms
  private lastRefill: number

  constructor(maxPerMinute: number) {
    this.maxTokens = maxPerMinute
    this.tokens = maxPerMinute
    this.refillRate = maxPerMinute / 60_000
    this.lastRefill = Date.now()
  }

  async acquire(): Promise<void> {
    this.refill()
    if (this.tokens < 1) {
      const waitMs = Math.ceil((1 - this.tokens) / this.refillRate)
      await new Promise((resolve) => setTimeout(resolve, waitMs))
      this.refill()
    }
    this.tokens -= 1
  }

  private refill(): void {
    const now = Date.now()
    const elapsed = now - this.lastRefill
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate)
    this.lastRefill = now
  }
}

async function withRetry<T>(fn: () => Promise<T>, retries = 3, baseDelay = 500): Promise<T> {
  let lastError: Error | undefined
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt < retries - 1) {
        const delay = baseDelay * Math.pow(2, attempt)
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }
  throw lastError
}

export class TonClientWrapper {
  private client: TonClient
  private limiter: RateLimiter

  constructor() {
    this.client = new TonClient({
      endpoint: config.endpoint,
      apiKey: config.toncenterApiKey || undefined,
    })
    this.limiter = new RateLimiter(100)
  }

  private async call<T>(fn: () => Promise<T>): Promise<T> {
    await this.limiter.acquire()
    return withRetry(fn)
  }

  async getBalance(address: string): Promise<{ nanoton: string; ton: string }> {
    const addr = Address.parse(address)
    const balance = await this.call(() => this.client.getBalance(addr))
    return {
      nanoton: balance.toString(),
      ton: (Number(balance) / 1_000_000_000).toFixed(9),
    }
  }

  async getTransactions(address: string, limit = 10): Promise<TransactionInfo[]> {
    const addr = Address.parse(address)
    const txs = await this.call(() => this.client.getTransactions(addr, { limit }))

    return txs.map((tx) => {
      let from: string | null = null
      let to: string | null = null
      let amount = '0'
      let comment: string | null = null

      const inMsg = tx.inMessage
      if (inMsg) {
        if (inMsg.info.type === 'internal') {
          from = inMsg.info.src?.toString() ?? null
          to = inMsg.info.dest?.toString() ?? null
          amount = inMsg.info.value.coins.toString()

          if (inMsg.body) {
            try {
              const slice = inMsg.body.beginParse()
              if (slice.remainingBits >= 32) {
                const op = slice.loadUint(32)
                if (op === 0) {
                  comment = slice.loadStringTail()
                }
              }
            } catch {
              // not a text comment
            }
          }
        } else if (inMsg.info.type === 'external-in') {
          from = 'external'
          to = inMsg.info.dest?.toString() ?? null
        }
      }

      const fee =
        tx.totalFees.coins.toString()

      return {
        hash: tx.hash().toString('hex'),
        lt: tx.lt.toString(),
        timestamp: tx.now,
        from,
        to,
        amount,
        amountTon: (Number(amount) / 1_000_000_000).toFixed(9),
        fee,
        comment,
        success: tx.description.type === 'generic' ? tx.description.aborted === false : true,
      }
    })
  }

  async getAccountState(address: string): Promise<AccountState> {
    const addr = Address.parse(address)
    const [balance, state] = await Promise.all([
      this.call(() => this.client.getBalance(addr)),
      this.call(() => this.client.getContractState(addr)),
    ])

    let codeHash: string | null = null
    let dataHash: string | null = null

    if (state.code) {
      const codeCell = Cell.fromBoc(state.code)[0]
      codeHash = codeCell.hash().toString('hex')
    }
    if (state.data) {
      const dataCell = Cell.fromBoc(state.data)[0]
      dataHash = dataCell.hash().toString('hex')
    }

    return {
      address: addr.toString(),
      balance: balance.toString(),
      balanceTon: (Number(balance) / 1_000_000_000).toFixed(9),
      state: state.state,
      codeHash,
      dataHash,
      lastTransactionLt: state.lastTransaction?.lt ?? null,
      lastTransactionHash: state.lastTransaction?.hash ?? null,
    }
  }

  async callGetter(address: string, method: string, args: any[] = []): Promise<any> {
    const addr = Address.parse(address)

    const stackArgs = args.map((arg) => {
      if (typeof arg === 'string' && arg.startsWith('0x')) {
        return { type: 'int' as const, value: BigInt(arg) }
      }
      if (typeof arg === 'string' && /^\d+$/.test(arg)) {
        return { type: 'int' as const, value: BigInt(arg) }
      }
      if (typeof arg === 'string') {
        try {
          const slice = Cell.fromBoc(Buffer.from(arg, 'base64'))[0].beginParse()
          return { type: 'slice' as const, cell: slice.asCell() }
        } catch {
          return { type: 'int' as const, value: BigInt(0) }
        }
      }
      return { type: 'int' as const, value: BigInt(arg) }
    })

    const result = await this.call(() => this.client.runMethod(addr, method, stackArgs))

    const items: any[] = []
    const stack = result.stack
    while (stack.remaining > 0) {
      try {
        const type = stack.peek().type
        if (type === 'int') {
          items.push({ type: 'int', value: stack.readBigNumber().toString() })
        } else if (type === 'cell') {
          items.push({ type: 'cell', boc: stack.readCell().toBoc().toString('base64') })
        } else if (type === 'slice') {
          items.push({ type: 'slice', boc: stack.readCell().toBoc().toString('base64') })
        } else {
          stack.skip(1)
          items.push({ type: 'unknown' })
        }
      } catch {
        break
      }
    }

    return {
      gasUsed: result.gas_used.toString(),
      exitCode: 0,
      stack: items,
    }
  }

  async estimateFees(to: string, amount: bigint, payload?: string): Promise<string> {
    try {
      const body = payload
        ? Cell.fromBase64(payload)
        : beginCell().endCell()

      const response = await fetch(
        `${config.endpoint.replace('/jsonRPC', '')}/estimateFee`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(config.toncenterApiKey ? { 'X-API-Key': config.toncenterApiKey } : {})
          },
          body: JSON.stringify({
            address: to,
            body: body.toBoc().toString('base64'),
            init_code: '',
            init_data: '',
            ignore_chksig: true
          })
        }
      )
      const data = await response.json() as any
      const fees = data.result?.source_fees
      if (fees) {
        const totalFee = BigInt(fees.fwd_fee ?? 0) + BigInt(fees.gas_fee ?? 0)
          + BigInt(fees.in_fwd_fee ?? 0) + BigInt(fees.storage_fee ?? 0)
        return totalFee.toString()
      }
      return (9_000_000n).toString()
    } catch {
      return (9_000_000n).toString() // 0.009 TON fallback
    }
  }

  getClient(): TonClient {
    return this.client
  }
}
