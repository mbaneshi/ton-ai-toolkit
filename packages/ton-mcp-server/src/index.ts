#!/usr/bin/env node
import 'dotenv/config'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { config } from './config.js'
import { TonClientWrapper } from './ton/client.js'
import { WalletManager } from './ton/wallet.js'
import { registerReadTools } from './tools/read.js'
import { registerBuildTools } from './tools/build.js'
import { registerWalletTools } from './tools/wallet.js'
import { registerContractTools } from './tools/contract.js'

const server = new McpServer({
  name: 'ton-mcp',
  version: '0.1.0',
  description: 'TON blockchain MCP server — read, build, sign, deploy',
})

// Initialize TON client
const tonClient = new TonClientWrapper()

// Register read-only tools (always available)
registerReadTools(server, tonClient)

// Register build tools (always available)
registerBuildTools(server, tonClient)

// Conditionally register wallet tools (only if mnemonic is configured)
if (config.hasWallet) {
  const wallet = new WalletManager(tonClient)
  await wallet.init()
  registerWalletTools(server, wallet)
  registerContractTools(server, tonClient, wallet)
  console.error(`[ton-mcp] Wallet loaded: ${wallet.getAddressString()}`)
} else {
  registerContractTools(server, tonClient)
  console.error('[ton-mcp] No mnemonic configured — wallet tools disabled')
}

console.error(`[ton-mcp] Network: ${config.network}`)
console.error(`[ton-mcp] Dry run: ${config.dryRun}`)
console.error(`[ton-mcp] Starting MCP server...`)

// Start server
const transport = new StdioServerTransport()
await server.connect(transport)
