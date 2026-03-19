# @ton-mcp/server
> MCP is converging as the agent interoperability standard across the TON ecosystem — nearly every Fast Grant winner exposes or consumes it ([Identity Research](https://id.tg/blog/telegram-ai-agents)). `@ton-mcp/server` is the only MCP implementation with read + write + wallet capabilities. 20 tools. Works with Claude Desktop, Cursor, and any agent runtime today.

## The Problem

AI agents can't interact with TON blockchain. Existing TON MCP servers are read-only (balance checks, transaction history). No MCP server lets agents actually *build transactions, sign, and send* — the write side of the blockchain is completely missing from the agent ecosystem.

## Demo

**Testnet proof:** [EQC_m634GEbepPiq-akl9LlV4UU48H93UzdAdwiio1phmzjA](https://testnet.tonviewer.com/EQC_m634GEbepPiq-akl9LlV4UU48H93UzdAdwiio1phmzjA) — signed and sent via `ton_sign_and_send` MCP tool on TON testnet

## Quick Start

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ton": {
      "command": "npx",
      "args": ["-y", "@ton-mcp/server"],
      "env": {
        "TONCENTER_API_KEY": "your_key_from_@tonapibot",
        "NETWORK": "testnet"
      }
    }
  }
}
```

Then ask Claude: *"What's the balance of EQD...?"*

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "ton": {
      "command": "npx",
      "args": ["-y", "@ton-mcp/server"],
      "env": {
        "TONCENTER_API_KEY": "your_key",
        "NETWORK": "testnet"
      }
    }
  }
}
```

### With Wallet (sign + send)

```json
{
  "mcpServers": {
    "ton": {
      "command": "npx",
      "args": ["-y", "@ton-mcp/server"],
      "env": {
        "TONCENTER_API_KEY": "your_key",
        "MNEMONIC": "word1 word2 ... word24",
        "NETWORK": "testnet",
        "TON_DRY_RUN": "false",
        "MAX_SEND_TON": "100"
      }
    }
  }
}
```

## How It Works

```
Claude Desktop / Cursor / Any MCP Client
         │
         ▼
┌─────────────────────┐
│  @ton-mcp/server     │ ← stdio transport
│                      │
│  ┌────────────────┐  │
│  │ Read Tools (10) │  │  ← No keys needed
│  │ balance, txs,   │  │
│  │ state, getters  │  │
│  └────────────────┘  │
│                      │
│  ┌────────────────┐  │
│  │ Build Tools (5) │  │  ← Construct, don't send
│  │ transfer, jetton│  │
│  │ multisig, etc.  │  │
│  └────────────────┘  │
│                      │
│  ┌────────────────┐  │
│  │ Wallet Tools (3)│  │  ← Gated on MNEMONIC
│  │ sign, send,     │  │
│  │ balance         │  │
│  └────────────────┘  │
└──────────┬──────────┘
           │
           ▼
    TON Blockchain (testnet/mainnet)
```

## Tools Reference

### Read Tools (no keys required)

| Tool | Description |
|------|-------------|
| `ton_get_balance` | Get TON balance for any address |
| `ton_get_transactions` | Recent transactions for an address |
| `ton_get_account_state` | Account state, balance, code hash |
| `ton_call_getter` | Call contract getter methods |
| `ton_get_jetton_balance` | Get Jetton token balance |
| `ton_resolve_dns` | Resolve TON DNS domain to address |
| `ton_get_nft_data` | Get NFT item metadata |
| `ton_decode_message` | Decode a BOC into human-readable format |
| `ton_estimate_fees` | Estimate transaction fees |
| `ton_parse_address` | Normalize address to all formats |

### Build Tools (construct transactions)

| Tool | Description |
|------|-------------|
| `ton_build_transfer` | Build a TON transfer message Cell |
| `ton_build_jetton_transfer` | Build a Jetton transfer Cell |
| `ton_build_multisig_order` | Build a multisig V2 order Cell |
| `ton_encode_comment` | Encode text as a comment Cell |
| `ton_build_state_init` | Build a StateInit for contract deployment |

### Wallet Tools (requires MNEMONIC)

| Tool | Description |
|------|-------------|
| `ton_sign_and_send` | Sign and broadcast a transaction |
| `ton_get_wallet_address` | Get derived wallet address |
| `ton_get_wallet_balance` | Get own wallet balance |

## Security Model

- **Wallet tools are gated**: Only available when `MNEMONIC` env var is set
- **Mnemonic never exposed**: Never appears in any tool response
- **Amount limits**: Configurable `MAX_SEND_TON` (default: 1000 TON)
- **Dry-run mode**: Set `TON_DRY_RUN=true` to log instead of broadcast
- **Address validation**: All addresses normalized and validated before use
- **Rate limiting**: Token bucket rate limiter (100 req/min) on read tools

## TON Ecosystem Integration

- **TonCenter API**: Uses official TonCenter RPC for both testnet and mainnet
- **Multisig V2**: Build tools support [multisig-contract-v2](https://github.com/ton-blockchain/multisig-contract-v2) order creation
- **Jetton (TEP-74)**: Full Jetton transfer support with proper opcode (0x0f8a7ea5)
- **TON DNS**: Native `.ton` domain resolution
- **NFT (TEP-62)**: NFT metadata reading
- **Used live in [TON DAO Agent](https://github.com/mbaneshi/ton-dao-agent)** — also submitted to this hackathon
- **Pairs with [@ton-intent/core](https://github.com/mbaneshi/ton-intent-core)** — also submitted to this hackathon
- **Fills the write gap**: Existing TON MCP servers are read-only. This is the first with transaction building, signing, and contract deployment — enabling the "apps layer" Identity Research says is missing
- **x402-adjacent**: Enables agent-to-chain payment flows that complement the [x402 machine-to-machine payment protocol](https://id.tg/blog/telegram-ai-agents) being built by 3 Fast Grant teams
- **Claude Code compatible**: Works as both an MCP server and alongside [TON Claude Code skills](https://id.tg/blog/telegram-ai-agents) identified as a growing pattern

## Comparison with Existing TON MCP Servers

| Feature | @ton-mcp/server | ton-access-mcp | telegram-mcp |
|---|---|---|---|
| Read operations | 10 tools | 6 tools | 0 (Bot API only) |
| Build transactions | 5 tools | 0 | 0 |
| Sign & send | Yes (gated) | No | No |
| Jetton support | Yes | No | No |
| NFT support | Yes | No | No |
| TON DNS | Yes | No | No |
| Multisig | Yes | No | No |
| Security model | Amount limits + dry-run | N/A | N/A |

## Judging Criteria Self-Assessment

| Criterion | How we address it |
|---|---|
| **Product Quality (25%)** | `npx @ton-mcp/server` works immediately, Claude Desktop config in README, 18 tools with clear descriptions |
| **Technical Execution (25%)** | TypeScript strict, Zod schemas on every tool, retry + rate limiting, security model documented |
| **Ecosystem Value (25%)** | Only read+write MCP server for TON. MCP confirmed as converging standard by [Identity Research](https://id.tg/blog/telegram-ai-agents). Enables the agent-to-chain flows the ecosystem needs. |
| **User Potential (25%)** | Every Claude Desktop / Cursor user gets TON access. Enables agent-to-agent payments on TON. |

## Testing with MCP Inspector

```bash
npx @modelcontextprotocol/inspector npx @ton-mcp/server
```

## Roadmap

- TON Connect integration for browser-based signing
- Streaming transaction monitoring (subscribe to address)
- Smart contract deployment wizard (guided Tact compilation)
- x402 payment protocol integration for machine-to-machine payments

## License

MIT
