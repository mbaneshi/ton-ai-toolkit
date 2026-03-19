import {
  Address,
  beginCell,
  Cell,
  Dictionary,
  MessageRelaxed,
  internal,
  storeMessageRelaxed,
} from "@ton/core";

// Multisig V2 opcodes
const OP_NEW_ORDER = 0xf718510f;
const OP_APPROVE = 0xa762230f;

/**
 * Build an internal message Cell for a TON transfer.
 * This becomes an action in the multisig order.
 */
export function buildTransferOrder(
  to: Address,
  amount: bigint,
  comment?: string
): Cell {
  let body: Cell | undefined;
  if (comment) {
    body = beginCell()
      .storeUint(0, 32) // text comment opcode
      .storeStringTail(comment)
      .endCell();
  }

  const msg: MessageRelaxed = internal({
    to,
    value: amount,
    bounce: false,
    body: body,
  });

  return beginCell().store(storeMessageRelaxed(msg)).endCell();
}

/**
 * Build the order body as a dictionary of actions.
 * Each action is indexed by a uint8 key and contains a message Cell as value.
 */
export function buildOrderBody(actions: Cell[]): Cell {
  const dict = Dictionary.empty(Dictionary.Keys.Uint(8), {
    serialize: (src: Cell, builder) => {
      builder.storeUint(0x0ec3c86d, 32); // send_message action tag
      builder.storeUint(3, 8); // send mode: carry all remaining value + ignore errors
      builder.storeRef(src);
    },
    parse: () => {
      throw new Error("Not implemented");
    },
  });

  for (let i = 0; i < actions.length; i++) {
    dict.set(i, actions[i]);
  }

  return beginCell().storeDictDirect(dict).endCell();
}

/**
 * Build a new_order message to send to the multisig contract.
 *
 * Format:
 *   op:uint32 = 0xf718510f
 *   query_id:uint64
 *   order_seqno:uint256
 *   signer_index:uint8
 *   expiration_date:uint48
 *   order_body: ref Cell (dictionary of actions)
 */
export function buildNewOrder(
  actions: Cell[],
  signerIndex: number,
  orderSeqno: bigint,
  expiresAt: number,
  queryId: bigint = 0n
): Cell {
  const orderBody = buildOrderBody(actions);

  return beginCell()
    .storeUint(OP_NEW_ORDER, 32)
    .storeUint(queryId, 64)
    .storeUint(orderSeqno, 256)
    .storeUint(signerIndex, 8)
    .storeUint(expiresAt, 48)
    .storeRef(orderBody)
    .endCell();
}

/**
 * Build an approve message to send to an existing order contract.
 *
 * Format:
 *   op:uint32 = 0xa762230f
 *   query_id:uint64
 *   signer_index:uint8
 *   approve:uint1
 */
export function buildApproveOrder(
  signerIndex: number,
  approve: boolean = true,
  queryId: bigint = 0n
): Cell {
  return beginCell()
    .storeUint(OP_APPROVE, 32)
    .storeUint(queryId, 64)
    .storeUint(signerIndex, 8)
    .storeBit(approve)
    .endCell();
}

/**
 * Calculate the default expiration time for an order (24 hours from now).
 */
export function defaultExpirationTime(): number {
  return Math.floor(Date.now() / 1000) + 24 * 60 * 60;
}
