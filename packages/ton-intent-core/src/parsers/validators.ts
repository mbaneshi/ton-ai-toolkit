import { Address } from '@ton/core'

const RAW_ADDRESS_RE = /^-?[0-1]:[0-9a-fA-F]{64}$/
const FRIENDLY_ADDRESS_RE = /^[EU]Q[A-Za-z0-9_-]{46}$/

/**
 * Check if a string is a valid TON address in any format:
 * - Raw: 0:abc...64hex
 * - Bounceable: EQ...
 * - Non-bounceable: UQ...
 */
export function isValidTONAddress(addr: string): boolean {
  if (!addr || typeof addr !== 'string') return false

  // Quick regex pre-check
  if (RAW_ADDRESS_RE.test(addr) || FRIENDLY_ADDRESS_RE.test(addr)) {
    try {
      Address.parse(addr)
      return true
    } catch {
      return false
    }
  }

  // Fallback: try Address.parse directly
  try {
    Address.parse(addr)
    return true
  } catch {
    return false
  }
}

/** Maximum transfer amount: 1,000,000 TON in nanoTON */
const MAX_AMOUNT_NANO = 1_000_000n * 1_000_000_000n

/**
 * Validate a TON amount string and convert to nanoTON.
 * Amount must be > 0 and <= 1,000,000 TON.
 */
export function validateAmount(amount: string): {
  valid: boolean
  nanoton?: bigint
  error?: string
} {
  if (!amount || typeof amount !== 'string') {
    return { valid: false, error: 'Amount is required' }
  }

  // Check it's a valid number format
  if (!/^\d+(\.\d+)?$/.test(amount)) {
    return { valid: false, error: 'Invalid amount format — must be a positive decimal number' }
  }

  try {
    const parts = amount.split('.')
    const whole = parts[0] ?? '0'
    let frac = parts[1] ?? ''

    if (frac.length > 9) {
      frac = frac.slice(0, 9)
    } else {
      frac = frac.padEnd(9, '0')
    }

    const nanoStr = (whole + frac).replace(/^0+/, '') || '0'
    const nanoton = BigInt(nanoStr)

    if (nanoton <= 0n) {
      return { valid: false, error: 'Amount must be greater than 0' }
    }

    if (nanoton > MAX_AMOUNT_NANO) {
      return { valid: false, error: 'Amount exceeds maximum of 1,000,000 TON' }
    }

    return { valid: true, nanoton }
  } catch {
    return { valid: false, error: 'Failed to parse amount' }
  }
}

/**
 * Normalize any TON address format to raw string (workchain:hex).
 */
export function normalizeAddress(addr: string): string {
  const address = Address.parse(addr)
  return address.toRawString()
}

/**
 * Check if a friendly-format address is bounceable (starts with EQ).
 */
export function isBounceable(addr: string): boolean {
  if (FRIENDLY_ADDRESS_RE.test(addr)) {
    return addr.startsWith('EQ')
  }
  // For raw addresses, default to true (contracts are bounceable by convention)
  return true
}

/**
 * Convert any TON address to friendly format.
 * @param addr - Address in any format
 * @param bounceable - Whether to produce bounceable (EQ) or non-bounceable (UQ) format. Defaults to true.
 */
export function toFriendly(addr: string, bounceable: boolean = true): string {
  const address = Address.parse(addr)
  return address.toString({ bounceable })
}
