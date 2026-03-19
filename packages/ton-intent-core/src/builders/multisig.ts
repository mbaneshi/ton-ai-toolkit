import { beginCell, Cell, Address, Dictionary } from '@ton/core'

/** Opcode for creating a new multisig order */
const OP_NEW_ORDER = 0xf718510f

/**
 * Build a multisig order body cell containing a dictionary of actions.
 * Each action is stored as a Cell ref in a dictionary with uint8 keys.
 *
 * @param actions - Array of actions, each with destination address, value, and optional body
 * @returns Cell containing the order body (dictionary of actions)
 */
export function buildMultisigOrderBody(
  actions: { to: Address; value: bigint; body?: Cell }[]
): Cell {
  if (actions.length === 0) {
    throw new Error('At least one action is required for a multisig order')
  }
  if (actions.length > 255) {
    throw new Error('Maximum 255 actions per multisig order')
  }

  // Build dictionary: uint8 key → message Cell as ref
  const dict = Dictionary.empty(Dictionary.Keys.Uint(8), Dictionary.Values.Cell())

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i]!
    // Build internal message cell for this action
    // Using a simplified internal message layout:
    // mode (uint8) + message ref
    const messageCell = beginCell()
      .storeUint(0x18, 6) // internal message flags: bounce=true, no ihd_disabled, no bounced
      .storeAddress(action.to)
      .storeCoins(action.value)
      .storeUint(0, 1 + 4 + 4 + 64 + 32 + 1) // default fields
      .storeBit(action.body ? true : false) // body as ref?
    if (action.body) {
      messageCell.storeRef(action.body)
    }

    // Wrap: uint8 send_mode (3 = pay fees separately + ignore errors) + message ref
    const actionCell = beginCell()
      .storeUint(3, 8) // send mode
      .storeRef(messageCell.endCell())
      .endCell()

    dict.set(i, actionCell)
  }

  return beginCell().storeDict(dict).endCell()
}

/**
 * Build a new_order message to send to a multisig wallet contract.
 *
 * Message layout:
 * - uint32 op = 0xf718510f (new_order)
 * - uint64 query_id = 0
 * - uint256 order_seqno
 * - bit approve_on_init = true
 * - uint8 signer_index
 * - uint48 expiration_date (unix timestamp)
 * - ref: order_body
 *
 * @param orderBody - The order body cell (from buildMultisigOrderBody)
 * @param signerIndex - Index of the signer proposing the order (0-255)
 * @param orderSeqno - Sequence number for this order
 * @param expiresIn - Expiration time in seconds from now (default: 3600 = 1 hour)
 * @returns Cell containing the new_order message body
 */
export function buildNewOrderMessage(
  orderBody: Cell,
  signerIndex: number,
  orderSeqno: bigint,
  expiresIn: number = 3600
): Cell {
  if (signerIndex < 0 || signerIndex > 255) {
    throw new Error('Signer index must be between 0 and 255')
  }

  const expirationDate = Math.floor(Date.now() / 1000) + expiresIn

  return beginCell()
    .storeUint(OP_NEW_ORDER, 32) // op
    .storeUint(0, 64) // query_id
    .storeUint(orderSeqno, 256) // order_seqno (uint256)
    .storeBit(true) // approve_on_init
    .storeUint(signerIndex, 8) // signer_index
    .storeUint(expirationDate, 48) // expiration_date
    .storeRef(orderBody) // order_body as ref
    .endCell()
}
