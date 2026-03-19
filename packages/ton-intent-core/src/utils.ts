/**
 * Convert TON amount (human-readable) to nanoTON (bigint).
 * 1 TON = 1_000_000_000 nanoTON
 */
export function tonToNano(ton: string | number): bigint {
  const str = typeof ton === 'number' ? ton.toString() : ton
  const parts = str.split('.')
  const whole = parts[0] ?? '0'
  let frac = parts[1] ?? ''

  // Pad or truncate fractional part to 9 digits
  if (frac.length > 9) {
    frac = frac.slice(0, 9)
  } else {
    frac = frac.padEnd(9, '0')
  }

  const nanoStr = whole + frac
  // Remove leading zeros but keep at least one digit
  const cleaned = nanoStr.replace(/^0+/, '') || '0'
  return BigInt(cleaned)
}

/**
 * Convert nanoTON to human-readable TON string.
 */
export function nanoToTon(nano: bigint | string): string {
  const n = typeof nano === 'string' ? BigInt(nano) : nano
  const isNegative = n < 0n
  const abs = isNegative ? -n : n
  const str = abs.toString().padStart(10, '0')
  const whole = str.slice(0, str.length - 9)
  let frac = str.slice(str.length - 9)

  // Remove trailing zeros from fraction
  frac = frac.replace(/0+$/, '')

  const prefix = isNegative ? '-' : ''
  if (frac.length === 0) {
    return `${prefix}${whole}`
  }
  return `${prefix}${whole}.${frac}`
}

export const INTENT_SYSTEM_PROMPT = `You are a TON blockchain intent parser. Given a natural language instruction, extract the following information and return ONLY valid JSON (no markdown, no explanation):

{
  "action": one of "transfer", "multisig_propose", "jetton_transfer", "stake", "unknown",
  "recipient": the TON address if mentioned (EQ..., UQ..., or raw 0:hex format), or null,
  "amount": the amount in TON as a decimal string (e.g. "5", "10.5"), or null if not specified,
  "comment": any memo/comment to include in the transaction, or null,
  "confidence": a number 0-1 indicating how confident you are in the parsing
}

Rules:
- "transfer" = sending TON to an address
- "multisig_propose" = creating a multisig proposal or order
- "jetton_transfer" = transferring a jetton/token (not native TON)
- "stake" = staking/delegating TON to a pool or validator
- "unknown" = cannot determine the intent
- Addresses can be in bounceable (EQ...), non-bounceable (UQ...), or raw (0:hex...) format
- Always express amounts in TON (not nanoTON). Examples: "5 TON" → amount: "5", "0.5 TON" → amount: "0.5". Never return raw nanoTON values.
- If you see @username or similar, keep it as-is in the recipient field
- Extract any comment/memo that should be attached to the transaction
- Be conservative with confidence — use lower values when ambiguous
- Return ONLY the JSON object, nothing else`
