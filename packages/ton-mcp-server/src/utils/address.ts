import { Address } from '@ton/core'

export interface AddressInfo {
  raw: string
  friendly: string
  bounceable: string
  nonBounceable: string
  isValid: boolean
}

/**
 * Parse a TON address in any format and return all representations.
 */
export function parseAddress(addr: string): AddressInfo {
  try {
    const parsed = Address.parse(addr)
    return {
      raw: `${parsed.workChain}:${parsed.hash.toString('hex')}`,
      friendly: parsed.toString(),
      bounceable: parsed.toString({ bounceable: true }),
      nonBounceable: parsed.toString({ bounceable: false }),
      isValid: true,
    }
  } catch {
    return {
      raw: '',
      friendly: '',
      bounceable: '',
      nonBounceable: '',
      isValid: false,
    }
  }
}

/**
 * Validate whether a string is a valid TON address.
 */
export function isValidAddress(addr: string): boolean {
  try {
    Address.parse(addr)
    return true
  } catch {
    return false
  }
}

/**
 * Normalize address to the friendly bounceable format.
 */
export function normalizeAddress(addr: string): string {
  const parsed = Address.parse(addr)
  return parsed.toString({ bounceable: true })
}
