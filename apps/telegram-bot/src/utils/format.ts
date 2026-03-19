/** Convert nanoTON string to human-readable TON string */
export function formatTON(nanoton: string | undefined | null): string {
  if (!nanoton) return '?'
  const n = BigInt(nanoton)
  const whole = n / 1_000_000_000n
  const frac = n % 1_000_000_000n
  if (frac === 0n) return whole.toString()
  const fracStr = frac.toString().padStart(9, '0').replace(/0+$/, '')
  return `${whole}.${fracStr}`
}
