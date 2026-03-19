# TON DAO Agent
> As of March 2026, zero of the top AI bots transact on TON on-chain ([Identity Research](https://id.tg/blog/telegram-ai-agents)). TON DAO Agent is the first — group treasury management via natural language, settled on-chain through Multisig V2. Telegram is the interaction layer, Claude is the execution engine, TON is the trust and payments layer.

## The Problem

Managing shared funds in Telegram groups today requires trusting a single person with a wallet. DAOs on other chains need complex web apps that most Telegram users will never install. There's no way for a group to collectively control funds using the messaging app they already live in — until now.

## Demo

**Live bot:** [@ton_dao_agent_bot](https://t.me/ton_dao_agent_bot)

**Testnet wallet:** [EQC_m634GEbepPiq-akl9LlV4UU48H93UzdAdwiio1phmzjA](https://testnet.tonviewer.com/EQC_m634GEbepPiq-akl9LlV4UU48H93UzdAdwiio1phmzjA)

## Quick Start

```bash
# Clone and install
git clone https://github.com/mbaneshi/ton-dao-agent
cd ton-dao-agent
npm install

# Configure
cp .env.example .env
# Edit .env with your BOT_TOKEN, ANTHROPIC_API_KEY, DATABASE_URL

# Database
npx drizzle-kit migrate

# Run
npm run dev
```

Then add the bot to a Telegram group and type `/setup`.

## How It Works

```
User: "send 5 TON to @alice for design work"
         │
         ▼
┌─────────────────┐
│  grammY Bot      │ ← Telegram interaction layer
│  NL Handler      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Claude LLM      │ ← AI execution engine
│  Intent Parser   │
└────────┬────────┘
         │ ProposalIntent
         ▼
┌─────────────────┐
│  PostgreSQL      │ ← Proposal + vote tracking
│  Drizzle ORM     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Multisig V2     │ ← TON trust + payments layer
│  On-chain Order  │
│  N-of-M signing  │
└─────────────────┘
```

### Commands

| Command | Description |
|---------|-------------|
| `/setup [threshold]` | Initialize group multisig, register members |
| `/propose [text]` | Natural language proposal → on-chain order |
| `/vote yes\|no [id]` | Sign or reject an order |
| `/balance` | Show group wallet balance + address |
| `/proposals` | List pending proposals with vote counts |
| `/history` | Past executed proposals |

### Natural Language Understanding

No commands needed — just talk naturally:
- "send 5 TON to @alice for design work" → creates transfer proposal
- "add @bob as a signer" → creates membership proposal
- "change threshold to 3" → creates governance proposal

### Agent-to-Agent Payments

External AI agents can submit proposals programmatically via REST API:

```
POST /agent/propose
{
  "to": "EQ...",
  "amount": "1.5",
  "memo": "service payment",
  "auth_token": "group_api_key"
}
```

This enables agent-to-agent payment flows — any AI agent can submit a payment proposal to the DAO, which then goes through the same human approval flow on Telegram.

### Agent Registry

```
GET /agent/info
→ {
    "name": "TON DAO Agent",
    "version": "0.1.0",
    "capabilities": ["multisig_transfer", "member_management", "threshold_change"],
    "payment_methods": ["TON"],
    "mcp_compatible": true,
    "a2a_endpoint": "/agent/propose",
    "network": "testnet"
  }
```

Any MCP-compatible agent can discover this DAO's capabilities and submit proposals programmatically.

## TON Ecosystem Integration

- **Multisig V2 Contract**: Uses the official [ton-blockchain/multisig-contract-v2](https://github.com/ton-blockchain/multisig-contract-v2) — battle-tested N-of-M on-chain governance
- **Non-custodial**: Bot never holds private keys. All signing happens on-chain via Order child contracts
- **TON DNS**: Supports `.ton` domain resolution for recipient addresses
- **On-chain audit trail**: Every proposal, vote, and execution is recorded on TON blockchain
- **Powered by**: [@ton-intent/core](https://github.com/mbaneshi/ton-intent-core) for NL parsing and [@ton-mcp/server](https://github.com/mbaneshi/ton-mcp-server) for blockchain ops — also submitted to this hackathon
- **TON Pay SDK ready**: Direct on-chain TON payments with no Stars intermediary — zero commission to Telegram
- **Agent Registry**: Self-describing `GET /agent/info` endpoint for agent-to-agent discovery ([TAMP](https://github.com/nicholasgasior/tamp)-compatible)
- **Cocoon-ready**: Architecture supports swapping centralized LLM for [Cocoon](https://cocoon.org) decentralized inference for privacy-preserving intent parsing

## Judging Criteria Self-Assessment

| Criterion | How we address it |
|---|---|
| **Product Quality (25%)** | Working Telegram bot with live demo, human-readable errors, flawless happy path |
| **Technical Execution (25%)** | TypeScript strict mode, Drizzle ORM migrations, proper multisig V2 TL-B opcodes, meaningful git history |
| **Ecosystem Value (25%)** | First AI bot transacting on TON on-chain ([source](https://id.tg/blog/telegram-ai-agents)), uses multisig-v2 + TON DNS + TON Pay, A2A payment endpoint, agent registry |
| **User Potential (25%)** | Any of Telegram's 900M+ users can manage shared funds without crypto knowledge. Zero of 183 AI bots on Telegram use TON on-chain today — we're first. |

## Architecture

```
apps/telegram-bot/
  src/
    bot/
      commands/     # /setup /propose /vote /balance /history
      handlers/     # NL message handler
      context.ts    # grammY session + types
      index.ts      # bot assembly
    services/
      intent.ts     # Claude LLM → ProposalIntent
      ton.ts        # TonClient wrapper
      multisig.ts   # Order creation, signing, execution
    db/
      schema.ts     # Drizzle: groups, proposals, votes, members
      index.ts      # DB connection
    index.ts        # Entry point
```

## Tech Stack

- **Bot**: grammY (Telegram bot framework)
- **LLM**: Anthropic Claude for intent parsing
- **Blockchain**: @ton/ton + multisig-contract-v2
- **Database**: PostgreSQL + Drizzle ORM
- **Language**: TypeScript (strict mode)

## Roadmap

- TON Connect integration for in-chat wallet signing
- Jetton (token) transfer support in proposals
- Scheduled/recurring payment proposals
- Multi-language NL parsing (Russian, Chinese, Arabic)

## License

MIT
