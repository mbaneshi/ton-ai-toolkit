import { Address } from '@ton/ton'
import { Cell, beginCell, Dictionary, DictionaryValue } from '@ton/core'

/**
 * Build a transfer body with an optional text comment.
 * Comment format: 32-bit zero op + UTF-8 text.
 */
export function buildTransferBody(comment?: string): Cell {
  if (!comment) {
    return Cell.EMPTY
  }
  return beginCell()
    .storeUint(0x00000000, 32)
    .storeStringTail(comment)
    .endCell()
}

/**
 * Build a Jetton transfer body (TEP-74).
 * op: 0x0f8a7ea5
 */
export function buildJettonTransferBody(
  to: Address,
  amount: bigint,
  responseAddress: Address,
  forwardPayload?: Cell
): Cell {
  const builder = beginCell()
    .storeUint(0x0f8a7ea5, 32) // op: jetton transfer
    .storeUint(0, 64) // query_id
    .storeCoins(amount) // jetton amount
    .storeAddress(to) // destination
    .storeAddress(responseAddress) // response_destination
    .storeBit(false) // custom_payload = null
    .storeCoins(50_000_000n) // forward_ton_amount = 0.05 TON

  if (forwardPayload) {
    builder.storeBit(true) // forward_payload in ref
    builder.storeRef(forwardPayload)
  } else {
    builder.storeBit(false) // no forward_payload
  }

  return builder.endCell()
}

/**
 * Encode a text comment into a Cell.
 * op = 0x00000000 followed by UTF-8 text.
 */
export function encodeComment(text: string): Cell {
  return beginCell()
    .storeUint(0x00000000, 32)
    .storeStringTail(text)
    .endCell()
}

/**
 * Build a multisig order body.
 * op: 0xf718510f (new_order)
 * Body: query_id, order_seqno, signer_index, expiration_date, dictionary of actions
 */
export function buildMultisigOrder(
  actions: Array<{ to: string; amount: string; comment?: string }>,
  signerIndex: number,
  orderSeqno: number,
  expiresIn = 3600
): Cell {
  const now = Math.floor(Date.now() / 1000)
  const expirationDate = now + expiresIn

  // Build actions dictionary: uint8 index -> message Cell
  const ActionValue: DictionaryValue<Cell> = {
    serialize(src: Cell, builder) {
      builder.storeRef(src)
    },
    parse(src) {
      return src.loadRef()
    },
  }

  const actionsDict = Dictionary.empty(Dictionary.Keys.Uint(8), ActionValue)

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i]
    const dest = Address.parse(action.to)
    const amount = BigInt(action.amount)

    let body = Cell.EMPTY
    if (action.comment) {
      body = encodeComment(action.comment)
    }

    // Internal message as action
    const actionCell = beginCell()
      .storeUint(0x18, 6) // internal message flags (bounceable)
      .storeAddress(dest)
      .storeCoins(amount)
      .storeBit(false) // no init
      .storeBit(false) // body inline
      .storeUint(0, 1) // no state init
      .storeRef(body)
      .endCell()

    actionsDict.set(i, actionCell)
  }

  return beginCell()
    .storeUint(0xf718510f, 32) // op: new_order
    .storeUint(0, 64) // query_id
    .storeUint(orderSeqno, 256) // order_seqno
    .storeUint(signerIndex, 8) // signer_index
    .storeUint(expirationDate, 48) // expiration_date
    .storeDict(actionsDict)
    .endCell()
}

/**
 * Build a StateInit cell from code and data BOCs.
 */
export function buildStateInit(codeBoc: string, dataBoc: string): Cell {
  const code = Cell.fromBoc(Buffer.from(codeBoc, 'base64'))[0]
  const data = Cell.fromBoc(Buffer.from(dataBoc, 'base64'))[0]

  return beginCell()
    .storeBit(false) // split_depth
    .storeBit(false) // special
    .storeBit(true) // code present
    .storeRef(code)
    .storeBit(true) // data present
    .storeRef(data)
    .storeBit(false) // library
    .endCell()
}
