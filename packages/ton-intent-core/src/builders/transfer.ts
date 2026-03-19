import { beginCell, Cell, Address } from '@ton/core'
import { IntentResult } from '../types.js'

/**
 * Build a transfer message body Cell.
 * If the intent includes a comment, it's encoded as a text snake cell
 * (opcode 0x00000000 followed by UTF-8 text).
 * If no comment, returns an empty cell.
 */
export function buildTransferBody(intent: IntentResult): Cell {
  if (intent.comment && intent.comment.length > 0) {
    // Text comment: 32-bit zero opcode + UTF-8 text
    const builder = beginCell()
    builder.storeUint(0x00000000, 32) // text comment opcode
    builder.storeStringTail(intent.comment)
    return builder.endCell()
  }
  return beginCell().endCell()
}

/**
 * Build full transfer message parameters from an IntentResult.
 * Returns the destination address, value in nanoTON, and body cell.
 *
 * @throws Error if recipient or amount is missing
 */
export function buildTransferMessage(intent: IntentResult): {
  to: Address
  value: bigint
  body: Cell
} {
  if (!intent.recipient) {
    throw new Error('Transfer intent must include a recipient address')
  }
  if (!intent.amount) {
    throw new Error('Transfer intent must include an amount')
  }

  const to = Address.parse(intent.recipient)
  const value = BigInt(intent.amount) // amount is already in nanoTON
  const body = buildTransferBody(intent)

  return { to, value, body }
}
