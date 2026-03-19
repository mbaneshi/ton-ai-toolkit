import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { Cell, beginCell, contractAddress, StateInit, storeStateInit } from '@ton/core'
import { TonClientWrapper } from '../ton/client.js'
import { WalletManager } from '../ton/wallet.js'
import { config } from '../config.js'

export function registerContractTools(server: McpServer, tonClient: TonClientWrapper, wallet?: WalletManager) {
  // ton_get_contract_state — read only, always available
  server.tool(
    'ton_get_contract_state',
    'Get detailed contract state including code hash, data, balance, and last transaction',
    {
      address: z.string().describe('Contract address'),
    },
    async ({ address }) => {
      try {
        const state = await tonClient.getAccountState(address)
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(state, null, 2) }]
        }
      } catch (error: any) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${error.message}` }],
          isError: true,
        }
      }
    }
  )

  // ton_deploy_contract — requires wallet
  if (wallet) {
    server.tool(
      'ton_deploy_contract',
      'Deploy a smart contract to TON blockchain. Requires MNEMONIC env var.',
      {
        code_boc: z.string().describe('Contract code as base64 BOC'),
        data_boc: z.string().describe('Initial contract data as base64 BOC'),
        amount: z.string().describe('TON amount to send with deployment (e.g. "0.5")'),
      },
      async ({ code_boc, data_boc, amount }) => {
        try {
          const code = Cell.fromBase64(code_boc)
          const data = Cell.fromBase64(data_boc)
          const stateInit: StateInit = { code, data }

          const stateInitCell = beginCell().store(storeStateInit(stateInit)).endCell()
          const addr = contractAddress(0, stateInit)

          const amountNano = BigInt(Math.floor(parseFloat(amount) * 1e9))

          if (config.dryRun) {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({
                dry_run: true,
                address: addr.toString(),
                amount_nano: amountNano.toString(),
                state_init_boc: stateInitCell.toBoc().toString('base64'),
              }, null, 2) }]
            }
          }

          const stateInitBoc = stateInitCell.toBoc().toString('base64')
          const hash = await wallet.sendTransfer(addr.toString(), amountNano, undefined, stateInitBoc)
          const explorerUrl = config.network === 'mainnet'
            ? `https://tonviewer.com/${addr.toString()}`
            : `https://testnet.tonviewer.com/${addr.toString()}`

          return {
            content: [{ type: 'text' as const, text: JSON.stringify({
              address: addr.toString(),
              tx_hash: hash,
              explorer_url: explorerUrl,
              amount_sent: amount + ' TON',
            }, null, 2) }]
          }
        } catch (error: any) {
          return {
            content: [{ type: 'text' as const, text: `Error: ${error.message}` }],
            isError: true,
          }
        }
      }
    )
  }
}
