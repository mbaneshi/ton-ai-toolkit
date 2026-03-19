import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { Address } from '@ton/ton'
import { Address as CoreAddress, beginCell, Cell, internal } from '@ton/core'
import { TonClientWrapper } from '../ton/client.js'
import {
  buildTransferBody,
  buildJettonTransferBody,
  buildMultisigOrder,
  encodeComment,
  buildStateInit,
} from '../ton/builders.js'
import { tonToNano, nanoToTon } from '../utils/format.js'

function toolResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
}

function toolError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true }
}

export function registerBuildTools(server: McpServer, tonClient: TonClientWrapper): void {
  // 1. ton_build_transfer
  server.tool(
    'ton_build_transfer',
    'Build a TON transfer message and return the BOC as base64. Does NOT send — use ton_sign_and_send to broadcast.',
    {
      to: z.string().describe('Destination address'),
      amount: z.string().describe('Amount in TON (e.g. "1.5")'),
      comment: z.string().optional().describe('Optional text comment'),
    },
    async ({ to, amount, comment }) => {
      try {
        const dest = Address.parse(to)
        const nanoAmount = tonToNano(amount)

        const body = buildTransferBody(comment)

        const msg = beginCell()
          .storeUint(0x18, 6) // internal message, bounceable
          .storeAddress(dest)
          .storeCoins(nanoAmount)
          .storeUint(0, 1 + 4 + 4 + 64 + 32 + 1) // default fields
          .storeBit(body !== Cell.EMPTY) // body in ref if present
        if (body !== Cell.EMPTY) {
          msg.storeRef(body)
        }

        const boc = msg.endCell().toBoc().toString('base64')

        return toolResult({
          boc,
          to: dest.toString(),
          amount,
          amountNano: nanoAmount.toString(),
          comment: comment ?? null,
          note: 'This message is NOT signed or sent. Use ton_sign_and_send to broadcast.',
        })
      } catch (err) {
        return toolError(err)
      }
    }
  )

  // 2. ton_build_jetton_transfer
  server.tool(
    'ton_build_jetton_transfer',
    'Build a Jetton (TEP-74) transfer message body as BOC base64. Send this as payload to the sender\'s jetton wallet.',
    {
      jetton_wallet: z.string().describe('Sender\'s jetton wallet address (not the master)'),
      to: z.string().describe('Destination owner address (the jetton will resolve their wallet)'),
      amount: z.string().describe('Jetton amount in smallest units (raw integer)'),
      response_address: z.string().optional().describe('Address for excess TON return (defaults to sender)'),
    },
    async ({ jetton_wallet, to, amount, response_address }) => {
      try {
        const dest = Address.parse(to)
        const jettonAmount = BigInt(amount)
        const responseAddr = response_address ? Address.parse(response_address) : dest

        const body = buildJettonTransferBody(dest, jettonAmount, responseAddr)
        const boc = body.toBoc().toString('base64')

        return toolResult({
          boc,
          jettonWallet: jetton_wallet,
          to: dest.toString(),
          amount,
          responseAddress: responseAddr.toString(),
          note: 'Send this BOC as the payload of a transfer to the jetton_wallet address with ~0.1 TON attached.',
        })
      } catch (err) {
        return toolError(err)
      }
    }
  )

  // 3. ton_build_multisig_order
  server.tool(
    'ton_build_multisig_order',
    'Build a multisig new_order message body (op 0xf718510f) with a list of transfer actions',
    {
      actions: z.array(z.object({
        to: z.string().describe('Destination address'),
        amount: z.string().describe('Amount in nanoTON'),
        comment: z.string().optional().describe('Optional text comment'),
      })).describe('List of transfer actions'),
      signer_index: z.number().describe('Index of the signer in the multisig'),
      order_seqno: z.number().describe('Order sequence number'),
      expires_in: z.number().optional().describe('Expiration time in seconds from now (default 3600)'),
    },
    async ({ actions, signer_index, order_seqno, expires_in }) => {
      try {
        const body = buildMultisigOrder(actions, signer_index, order_seqno, expires_in ?? 3600)
        const boc = body.toBoc().toString('base64')

        return toolResult({
          boc,
          actionsCount: actions.length,
          signerIndex: signer_index,
          orderSeqno: order_seqno,
          expiresIn: expires_in ?? 3600,
          note: 'Send this BOC as the payload of a transfer to the multisig contract address.',
        })
      } catch (err) {
        return toolError(err)
      }
    }
  )

  // 4. ton_encode_comment
  server.tool(
    'ton_encode_comment',
    'Encode a text string as a TON comment Cell (op=0x00000000 + UTF-8) and return BOC base64',
    {
      text: z.string().describe('Comment text to encode'),
    },
    async ({ text }) => {
      try {
        const cell = encodeComment(text)
        const boc = cell.toBoc().toString('base64')

        return toolResult({ boc, text, hash: cell.hash().toString('hex') })
      } catch (err) {
        return toolError(err)
      }
    }
  )

  // 5. ton_build_state_init
  server.tool(
    'ton_build_state_init',
    'Build a StateInit cell from code and data BOCs (for contract deployment)',
    {
      code_boc: z.string().describe('Contract code as base64 BOC'),
      data_boc: z.string().describe('Contract initial data as base64 BOC'),
    },
    async ({ code_boc, data_boc }) => {
      try {
        const stateInit = buildStateInit(code_boc, data_boc)
        const boc = stateInit.toBoc().toString('base64')

        // Compute the contract address (workchain 0)
        const hash = stateInit.hash()
        const contractAddr = new CoreAddress(0, hash)

        return toolResult({
          boc,
          stateInitHash: hash.toString('hex'),
          contractAddress: contractAddr.toString({ bounceable: true }),
          contractAddressNonBounceable: contractAddr.toString({ bounceable: false }),
          note: 'Deploy by sending a message to this address with the state_init attached.',
        })
      } catch (err) {
        return toolError(err)
      }
    }
  )
}
