import { describe, it, expect } from 'vitest'
import { Address, beginCell } from '@ton/core'
import { buildTransferBody, buildTransferMessage } from '../src/builders/transfer.js'
import { buildMultisigOrderBody, buildNewOrderMessage } from '../src/builders/multisig.js'
import {
  isValidTONAddress,
  validateAmount,
  normalizeAddress,
  isBounceable,
  toFriendly,
} from '../src/parsers/validators.js'
import { IntentResult } from '../src/types.js'
import { tonToNano } from '../src/utils.js'

// A known valid testnet address for testing
const TEST_ADDRESS = 'EQBvW8Z5huBkMJYdnfAEM5JqTNkuWX3diqYENkWsIL0XggGG'
const TEST_ADDRESS_RAW = Address.parse(TEST_ADDRESS).toRawString()

describe('buildTransferBody', () => {
  it('should create an empty cell when no comment', () => {
    const intent: IntentResult = {
      action: 'transfer',
      recipient: TEST_ADDRESS,
      amount: '1000000000',
      confidence: 0.9,
      raw: 'send 1 TON',
    }

    const body = buildTransferBody(intent)
    expect(body).toBeDefined()
    // Empty cell has 0 bits (or minimal)
    expect(body.bits.length).toBe(0)
  })

  it('should create a comment cell with opcode 0x00000000', () => {
    const intent: IntentResult = {
      action: 'transfer',
      recipient: TEST_ADDRESS,
      amount: '1000000000',
      comment: 'Hello TON!',
      confidence: 0.9,
      raw: 'send 1 TON with comment Hello TON!',
    }

    const body = buildTransferBody(intent)
    expect(body).toBeDefined()
    // Should have at least 32 bits for the opcode
    expect(body.bits.length).toBeGreaterThanOrEqual(32)

    // Parse the cell to verify opcode
    const slice = body.beginParse()
    const opcode = slice.loadUint(32)
    expect(opcode).toBe(0)
  })
})

describe('buildTransferMessage', () => {
  it('should build a complete transfer message', () => {
    const intent: IntentResult = {
      action: 'transfer',
      recipient: TEST_ADDRESS,
      amount: '5000000000', // 5 TON
      confidence: 0.95,
      raw: 'send 5 TON',
    }

    const msg = buildTransferMessage(intent)
    expect(msg.to.equals(Address.parse(TEST_ADDRESS))).toBe(true)
    expect(msg.value).toBe(5_000_000_000n)
    expect(msg.body).toBeDefined()
  })

  it('should throw if no recipient', () => {
    const intent: IntentResult = {
      action: 'transfer',
      amount: '1000000000',
      confidence: 0.9,
      raw: 'send 1 TON',
    }

    expect(() => buildTransferMessage(intent)).toThrow('recipient')
  })

  it('should throw if no amount', () => {
    const intent: IntentResult = {
      action: 'transfer',
      recipient: TEST_ADDRESS,
      confidence: 0.9,
      raw: 'send TON',
    }

    expect(() => buildTransferMessage(intent)).toThrow('amount')
  })
})

describe('buildMultisigOrderBody', () => {
  it('should build an order body with one action', () => {
    const actions = [
      {
        to: Address.parse(TEST_ADDRESS),
        value: 1_000_000_000n,
      },
    ]

    const orderBody = buildMultisigOrderBody(actions)
    expect(orderBody).toBeDefined()
    expect(orderBody.bits.length).toBeGreaterThan(0)
  })

  it('should build an order body with multiple actions', () => {
    const actions = [
      {
        to: Address.parse(TEST_ADDRESS),
        value: 1_000_000_000n,
      },
      {
        to: Address.parse(TEST_ADDRESS),
        value: 2_000_000_000n,
        body: beginCell().storeUint(0, 32).storeStringTail('test').endCell(),
      },
    ]

    const orderBody = buildMultisigOrderBody(actions)
    expect(orderBody).toBeDefined()
  })

  it('should throw on empty actions', () => {
    expect(() => buildMultisigOrderBody([])).toThrow('At least one action')
  })
})

describe('buildNewOrderMessage', () => {
  it('should build a valid new_order message', () => {
    const actions = [
      {
        to: Address.parse(TEST_ADDRESS),
        value: 1_000_000_000n,
      },
    ]

    const orderBody = buildMultisigOrderBody(actions)
    const msg = buildNewOrderMessage(orderBody, 0, 1n)

    expect(msg).toBeDefined()

    // Parse and verify opcode
    const slice = msg.beginParse()
    const op = slice.loadUint(32)
    expect(op).toBe(0xf718510f)

    const queryId = slice.loadUint(64)
    expect(queryId).toBe(0)

    // order_seqno is uint256
    const seqno = slice.loadUintBig(256)
    expect(seqno).toBe(1n)

    // approve_on_init
    const approve = slice.loadBit()
    expect(approve).toBe(true)

    // signer_index
    const signerIdx = slice.loadUint(8)
    expect(signerIdx).toBe(0)

    // expiration_date — should be in the future
    const expDate = slice.loadUint(48)
    expect(expDate).toBeGreaterThan(Math.floor(Date.now() / 1000))
  })

  it('should throw on invalid signer index', () => {
    const orderBody = beginCell().endCell()
    expect(() => buildNewOrderMessage(orderBody, -1, 0n)).toThrow('Signer index')
    expect(() => buildNewOrderMessage(orderBody, 256, 0n)).toThrow('Signer index')
  })

  it('should accept custom expiration time', () => {
    const orderBody = buildMultisigOrderBody([
      { to: Address.parse(TEST_ADDRESS), value: 1_000_000_000n },
    ])
    const msg = buildNewOrderMessage(orderBody, 0, 1n, 7200) // 2 hours

    const slice = msg.beginParse()
    slice.loadUint(32) // op
    slice.loadUint(64) // query_id
    slice.loadUintBig(256) // seqno
    slice.loadBit() // approve
    slice.loadUint(8) // signer_index
    const expDate = slice.loadUint(48)

    const now = Math.floor(Date.now() / 1000)
    // Should be ~2 hours from now (within 5 seconds tolerance)
    expect(expDate).toBeGreaterThan(now + 7190)
    expect(expDate).toBeLessThan(now + 7210)
  })
})

describe('Address validators', () => {
  it('isValidTONAddress should accept valid bounceable addresses', () => {
    expect(isValidTONAddress(TEST_ADDRESS)).toBe(true)
  })

  it('isValidTONAddress should accept raw addresses', () => {
    expect(isValidTONAddress(TEST_ADDRESS_RAW)).toBe(true)
  })

  it('isValidTONAddress should reject invalid addresses', () => {
    expect(isValidTONAddress('')).toBe(false)
    expect(isValidTONAddress('not-an-address')).toBe(false)
    expect(isValidTONAddress('EQinvalid')).toBe(false)
  })

  it('normalizeAddress should return raw format', () => {
    const raw = normalizeAddress(TEST_ADDRESS)
    expect(raw).toMatch(/^0:[0-9a-fA-F]{64}$/)
  })

  it('isBounceable should identify bounceable addresses', () => {
    expect(isBounceable(TEST_ADDRESS)).toBe(true)
  })

  it('toFriendly should produce bounceable address', () => {
    const friendly = toFriendly(TEST_ADDRESS_RAW, true)
    expect(friendly.startsWith('EQ')).toBe(true)
  })

  it('toFriendly should produce non-bounceable address', () => {
    const friendly = toFriendly(TEST_ADDRESS_RAW, false)
    expect(friendly.startsWith('UQ')).toBe(true)
  })
})

describe('Amount validation', () => {
  it('should validate valid amounts', () => {
    const r1 = validateAmount('1')
    expect(r1.valid).toBe(true)
    expect(r1.nanoton).toBe(1_000_000_000n)

    const r2 = validateAmount('0.5')
    expect(r2.valid).toBe(true)
    expect(r2.nanoton).toBe(500_000_000n)

    const r3 = validateAmount('999999')
    expect(r3.valid).toBe(true)
  })

  it('should reject zero amount', () => {
    const r = validateAmount('0')
    expect(r.valid).toBe(false)
    expect(r.error).toContain('greater than 0')
  })

  it('should reject amounts over 1,000,000 TON', () => {
    const r = validateAmount('1000001')
    expect(r.valid).toBe(false)
    expect(r.error).toContain('maximum')
  })

  it('should reject invalid format', () => {
    expect(validateAmount('').valid).toBe(false)
    expect(validateAmount('abc').valid).toBe(false)
    expect(validateAmount('-5').valid).toBe(false)
  })
})
