/**
 * Convert nanoTON to TON string representation.
 */
export function nanoToTon(nano: bigint | string): string {
  const value = typeof nano === 'string' ? BigInt(nano) : nano
  const whole = value / 1_000_000_000n
  const frac = value % 1_000_000_000n
  const fracStr = frac.toString().padStart(9, '0')
  return `${whole}.${fracStr}`
}

/**
 * Convert TON to nanoTON bigint.
 */
export function tonToNano(ton: string | number): bigint {
  const str = typeof ton === 'number' ? ton.toFixed(9) : ton
  const parts = str.split('.')
  const whole = BigInt(parts[0] || '0')
  let frac = 0n
  if (parts[1]) {
    const fracPart = parts[1].padEnd(9, '0').slice(0, 9)
    frac = BigInt(fracPart)
  }
  return whole * 1_000_000_000n + frac
}

/**
 * Format a raw transaction object into a human-readable form.
 */
export function formatTransaction(tx: any): Record<string, any> {
  return {
    hash: tx.hash ?? 'unknown',
    lt: tx.lt ?? 'unknown',
    timestamp: tx.timestamp
      ? new Date(tx.timestamp * 1000).toISOString()
      : 'unknown',
    from: tx.from ?? 'unknown',
    to: tx.to ?? 'unknown',
    amount: tx.amount ?? '0',
    amountTon: tx.amountTon ?? nanoToTon(tx.amount ?? '0'),
    fee: tx.fee ?? '0',
    comment: tx.comment ?? null,
    success: tx.success ?? true,
  }
}

/**
 * Truncate a hex hash for display.
 */
export function truncateHash(hash: string): string {
  if (hash.length <= 16) return hash
  return `${hash.slice(0, 8)}...${hash.slice(-8)}`
}
