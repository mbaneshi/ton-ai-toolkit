import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { WalletManager } from '../ton/wallet.js'
import { config } from '../config.js'
import { nanoToTon, tonToNano } from '../utils/format.js'

function toolResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
}

function toolError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true }
}

export function registerWalletTools(server: McpServer, wallet: WalletManager): void {
  // 1. ton_sign_and_send
  server.tool(
    'ton_sign_and_send',
    'Sign and send a TON transfer from the configured wallet. Requires MNEMONIC to be set. Will reject amounts exceeding MAX_SEND_TON.',
    {
      to: z.string().describe('Destination address'),
      amount: z.string().describe('Amount in TON (e.g. "1.5")'),
      comment: z.string().optional().describe('Optional text comment'),
      payload_boc: z.string().optional().describe('Optional custom payload as base64 BOC (overrides comment)'),
    },
    async ({ to, amount, comment, payload_boc }) => {
      try {
        const nanoAmount = tonToNano(amount)

        if (nanoAmount > config.maxSendAmount) {
          return toolError(
            `Amount exceeds maximum allowed: requested ${amount} TON, max ${nanoToTon(config.maxSendAmount)} TON`
          )
        }

        const result = await wallet.sendTransfer(to, nanoAmount, comment, payload_boc)

        const isDryRun = config.dryRun
        return toolResult({
          success: true,
          dryRun: isDryRun,
          ...(isDryRun ? { log: result } : { txHash: result }),
          from: wallet.getAddressString(),
          to,
          amount,
          amountNano: nanoAmount.toString(),
          comment: comment ?? null,
          hasCustomPayload: !!payload_boc,
        })
      } catch (err) {
        return toolError(err)
      }
    }
  )

  // 2. ton_get_wallet_address
  server.tool(
    'ton_get_wallet_address',
    'Get the address derived from the configured wallet mnemonic',
    {},
    async () => {
      try {
        const address = wallet.getAddress()
        return toolResult({
          address: address.toString({ bounceable: false }),
          addressBounceable: address.toString({ bounceable: true }),
          raw: `${address.workChain}:${address.hash.toString('hex')}`,
          network: config.network,
        })
      } catch (err) {
        return toolError(err)
      }
    }
  )

  // 3. ton_get_wallet_balance
  server.tool(
    'ton_get_wallet_balance',
    'Get the balance of the configured wallet',
    {},
    async () => {
      try {
        const balance = await wallet.getBalance()
        return toolResult({
          address: wallet.getAddressString(),
          balance: balance.toString(),
          balanceTon: nanoToTon(balance),
          network: config.network,
        })
      } catch (err) {
        return toolError(err)
      }
    }
  )
}
