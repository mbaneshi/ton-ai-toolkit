import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { Address, TonClient } from '@ton/ton'
import { Cell, beginCell } from '@ton/core'
import { TonClientWrapper } from '../ton/client.js'
import { parseAddress } from '../utils/address.js'
import { formatTransaction, nanoToTon } from '../utils/format.js'

/**
 * Wrap a successful result into MCP tool response format.
 * Pattern from telegram-mcp: dual-channel text + structured data.
 */
function toolResult(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  }
}

/**
 * Wrap an error into MCP tool response format.
 * Pattern from izTolkMcp: always set isError: true so the LLM knows it failed.
 */
function toolError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  return {
    content: [{ type: 'text' as const, text: `Error: ${message}` }],
    isError: true,
  }
}

/** Build a Cell containing an address (for use as slice argument to getters) */
function beginCellWithAddress(addr: Address): Buffer {
  return beginCell().storeAddress(addr).endCell().toBoc()
}

/** Encode domain bytes for DNS queries */
function buildDnsQueryCell(domainBytes: string): Buffer {
  const builder = beginCell()
  for (let i = 0; i < domainBytes.length; i++) {
    builder.storeUint(domainBytes.charCodeAt(i), 8)
  }
  return builder.endCell().toBoc()
}

export function registerReadTools(server: McpServer, tonClient: TonClientWrapper): void {
  // 1. ton_get_balance
  server.tool(
    'ton_get_balance',
    'Get the TON balance of an address in both nanoTON and TON',
    { address: z.string().describe('TON address in any format (raw, bounceable, non-bounceable)') },
    async ({ address }) => {
      try {
        return toolResult(await tonClient.getBalance(address))
      } catch (err) {
        return toolError(err)
      }
    }
  )

  // 2. ton_get_transactions
  server.tool(
    'ton_get_transactions',
    'Get recent transactions for a TON address',
    {
      address: z.string().describe('TON address'),
      limit: z.number().default(10).describe('Number of transactions to fetch (default 10)'),
    },
    async ({ address, limit }) => {
      try {
        const txs = await tonClient.getTransactions(address, limit)
        return toolResult(txs.map(formatTransaction))
      } catch (err) {
        return toolError(err)
      }
    }
  )

  // 3. ton_get_account_state
  server.tool(
    'ton_get_account_state',
    'Get account state including balance, code hash, and data hash',
    { address: z.string().describe('TON address') },
    async ({ address }) => {
      try {
        return toolResult(await tonClient.getAccountState(address))
      } catch (err) {
        return toolError(err)
      }
    }
  )

  // 4. ton_call_getter
  server.tool(
    'ton_call_getter',
    'Call a get-method on a TON smart contract and return the result stack',
    {
      address: z.string().describe('Contract address'),
      method: z.string().describe('Get-method name (e.g. "get_wallet_data", "seqno")'),
      args: z.array(z.string()).optional().describe('Optional method arguments as strings'),
    },
    async ({ address, method, args }) => {
      try {
        return toolResult(await tonClient.callGetter(address, method, args ?? []))
      } catch (err) {
        return toolError(err)
      }
    }
  )

  // 5. ton_get_jetton_balance
  server.tool(
    'ton_get_jetton_balance',
    'Get the Jetton (fungible token) balance for an owner given a Jetton master contract address',
    {
      owner: z.string().describe('Owner wallet address'),
      jetton_master: z.string().describe('Jetton master contract address'),
    },
    async ({ owner, jetton_master }) => {
      try {
        const ownerAddr = Address.parse(owner)
        const masterAddr = Address.parse(jetton_master)

        // Call get_wallet_address on the jetton master to find the jetton wallet
        const walletResult = await tonClient.callGetter(
          jetton_master,
          'get_wallet_address',
          [
            Cell.fromBoc(
              beginCellWithAddress(ownerAddr)
            )[0].toBoc().toString('base64'),
          ]
        )

        let jettonWalletAddr: string | null = null
        if (walletResult.stack.length > 0 && walletResult.stack[0].type === 'slice') {
          const cell = Cell.fromBoc(Buffer.from(walletResult.stack[0].boc, 'base64'))[0]
          const slice = cell.beginParse()
          jettonWalletAddr = slice.loadAddress()?.toString() ?? null
        }

        if (!jettonWalletAddr) {
          return toolError('Could not resolve jetton wallet address')
        }

        // Call get_wallet_data on the jetton wallet
        const dataResult = await tonClient.callGetter(jettonWalletAddr, 'get_wallet_data')

        let balance = '0'
        if (dataResult.stack.length > 0 && dataResult.stack[0].type === 'int') {
          balance = dataResult.stack[0].value
        }

        return toolResult({
          owner,
          jettonMaster: jetton_master,
          jettonWallet: jettonWalletAddr,
          balance,
        })
      } catch (err) {
        return toolError(err)
      }
    }
  )

  // 6. ton_resolve_dns
  server.tool(
    'ton_resolve_dns',
    'Resolve a TON DNS domain name (e.g. "alice.ton") to an address',
    { domain: z.string().describe('TON DNS domain (e.g. "alice.ton")') },
    async ({ domain }) => {
      try {
        // TON DNS root contract on mainnet
        const DNS_ROOT = 'EQC3dNlesgVD8YbAazcauIrXBPfiVhMMr5YYk2in0Mtsz0Bz'

        // Build domain name cell: reversed domain parts as bytes
        const parts = domain.replace(/\.ton$/i, '').split('.').reverse()
        const domainBytes = parts.join('\0') + '\0'

        const result = await tonClient.callGetter(DNS_ROOT, 'dnsresolve', [
          Cell.fromBoc(
            buildDnsQueryCell(domainBytes)
          )[0].toBoc().toString('base64'),
          '0', // category: wallet address
        ])

        let resolvedAddress: string | null = null
        if (result.stack.length >= 2) {
          const resolvedBits = result.stack[0]
          const valueCell = result.stack[1]
          if (valueCell.type === 'cell') {
            try {
              const cell = Cell.fromBoc(Buffer.from(valueCell.boc, 'base64'))[0]
              const slice = cell.beginParse()
              // DNS record value format: uint16 (record type) + address
              slice.loadUint(16) // skip record type prefix
              const addr = slice.loadAddress()
              if (addr) {
                resolvedAddress = addr.toString()
              }
            } catch {
              // could not parse DNS record
            }
          }
        }

        return toolResult({ domain, resolvedAddress, resolved: resolvedAddress !== null })
      } catch (err) {
        return toolError(err)
      }
    }
  )

  // 7. ton_get_nft_data
  server.tool(
    'ton_get_nft_data',
    'Get NFT item data including index, collection address, owner, and content URL',
    { address: z.string().describe('NFT item contract address') },
    async ({ address }) => {
      try {
        const result = await tonClient.callGetter(address, 'get_nft_data')

        let init = false
        let index = '0'
        let collection: string | null = null
        let owner: string | null = null
        let contentBoc: string | null = null

        const stack = result.stack
        if (stack.length >= 1 && stack[0].type === 'int') {
          init = stack[0].value !== '0'
        }
        if (stack.length >= 2 && stack[1].type === 'int') {
          index = stack[1].value
        }
        if (stack.length >= 3 && stack[2].type === 'slice') {
          try {
            const cell = Cell.fromBoc(Buffer.from(stack[2].boc, 'base64'))[0]
            const slice = cell.beginParse()
            const addr = slice.loadAddress()
            collection = addr?.toString() ?? null
          } catch { /* not an address */ }
        }
        if (stack.length >= 4 && stack[3].type === 'slice') {
          try {
            const cell = Cell.fromBoc(Buffer.from(stack[3].boc, 'base64'))[0]
            const slice = cell.beginParse()
            const addr = slice.loadAddress()
            owner = addr?.toString() ?? null
          } catch { /* not an address */ }
        }
        if (stack.length >= 5 && stack[4].type === 'cell') {
          contentBoc = stack[4].boc

          // Try to parse content as off-chain URL (TEP-64)
          try {
            const cell = Cell.fromBoc(Buffer.from(stack[4].boc, 'base64'))[0]
            const slice = cell.beginParse()
            const prefix = slice.loadUint(8)
            if (prefix === 0x01) {
              // off-chain content, URL follows
              const urlBytes: number[] = []
              while (slice.remainingBits >= 8) {
                urlBytes.push(slice.loadUint(8))
              }
              const url = String.fromCharCode(...urlBytes)
              contentBoc = url
            }
          } catch { /* not parseable */ }
        }

        return toolResult({ address, initialized: init, index, collection, owner, content: contentBoc })
      } catch (err) {
        return toolError(err)
      }
    }
  )

  // 8. ton_decode_message
  server.tool(
    'ton_decode_message',
    'Decode a BOC (bag of cells) from base64 and show its structure',
    { boc: z.string().describe('Base64-encoded BOC') },
    async ({ boc }) => {
      try {
        const cells = Cell.fromBoc(Buffer.from(boc, 'base64'))
        const decoded = cells.map((cell, i) => {
          const slice = cell.beginParse()
          const bits = slice.remainingBits
          const refs = slice.remainingRefs

          let parsed: any = {
            index: i,
            bits,
            refs,
            hash: cell.hash().toString('hex'),
          }

          // Try to detect common message types
          if (bits >= 32) {
            try {
              const op = slice.loadUint(32)
              parsed.opcode = `0x${op.toString(16).padStart(8, '0')}`

              if (op === 0) {
                // Text comment
                try {
                  parsed.comment = slice.loadStringTail()
                  parsed.type = 'text_comment'
                } catch { /* not a text comment */ }
              } else if (op === 0x0f8a7ea5) {
                parsed.type = 'jetton_transfer'
              } else if (op === 0x7362d09c) {
                parsed.type = 'jetton_notify'
              } else if (op === 0x5fcc3d14) {
                parsed.type = 'nft_transfer'
              } else if (op === 0xf718510f) {
                parsed.type = 'multisig_new_order'
              }
            } catch { /* couldn't read op */ }
          }

          parsed.bocBase64 = cell.toBoc().toString('base64')

          return parsed
        })

        return toolResult(decoded)
      } catch (err) {
        return toolError(err)
      }
    }
  )

  // 9. ton_estimate_fees
  server.tool(
    'ton_estimate_fees',
    'Estimate transaction fees for a TON transfer',
    {
      to: z.string().describe('Destination address'),
      amount: z.string().describe('Amount in nanoTON'),
      payload: z.string().optional().describe('Optional payload BOC base64'),
    },
    async ({ to, amount, payload }) => {
      try {
        const fees = await tonClient.estimateFees(to, BigInt(amount), payload)
        return toolResult({
          estimatedFee: fees,
          estimatedFeeTon: nanoToTon(fees),
          to,
          amount,
          amountTon: nanoToTon(amount),
        })
      } catch (err) {
        return toolError(err)
      }
    }
  )

  // 10. ton_parse_address
  server.tool(
    'ton_parse_address',
    'Parse a TON address and return all format variants (raw, bounceable, non-bounceable)',
    { address: z.string().describe('TON address in any format') },
    async ({ address }) => {
      const result = parseAddress(address)
      if (!result.isValid) {
        return toolError(`Invalid TON address: ${address}`)
      }
      return toolResult(result)
    }
  )
}
