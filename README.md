# TON Hackathon — 3 Submissions

> "The Stack Is Ready, The Apps Aren't" — [Identity Research, March 2026](https://id.tg/blog/telegram-ai-agents)

As of March 2026, **zero of the top AI bots transact on TON on-chain**. The infrastructure exists — Cocoon, MCP, TON Pay SDK, x402 — but the application layer is missing. These 3 projects fill that gap:

| # | Project | Track | Package | Description |
|---|---------|-------|---------|-------------|
| 1 | [TON DAO Agent](./apps/telegram-bot) | User-Facing AI Agents | — | First AI bot that transacts on TON on-chain via NL |
| 2 | [@ton-intent/core](./packages/ton-intent-core) | Agent Infrastructure | `npm i @ton-intent/core` | The missing NL→TON framework primitive |
| 3 | [@ton-mcp/server](./packages/ton-mcp-server) | Agent Infrastructure | `npx @ton-mcp/server` | Only read+write MCP server for TON (20 tools) |

## Architecture

```
┌─────────────────────────────────────────┐
│           TON DAO Agent (Sub 1)          │
│     Telegram Bot + NL + Multisig V2      │
│                                          │
│  Uses: @ton-intent/core + @ton-mcp/server│
└──────────┬──────────────┬───────────────┘
           │              │
     ┌─────▼─────┐  ┌────▼──────────┐
     │ Sub 2      │  │ Sub 3          │
     │ Intent SDK │  │ MCP Server     │
     │ NL → Cell  │  │ 18 TON tools   │
     └────────────┘  └────────────────┘
           │              │
           └──────┬───────┘
                  ▼
          TON Blockchain
```

## Submission Checklist (March 25)

- [ ] 3 separate GitHub repos (public)
- [ ] Each has own README + demo video
- [ ] Sub 2+3 published on npm
- [ ] Sub 1 has live Telegram bot
- [ ] Testnet tx proof in each README
- [ ] All 3 cross-reference each other
- [ ] 3 Dorahacks submission forms
- [ ] Each selects correct track

## Judging (25% each)

| Criterion | Sub 1 | Sub 2 | Sub 3 |
|-----------|-------|-------|-------|
| Product Quality | Live bot demo | npm install → 60s | npx → Claude Desktop |
| Technical Execution | Strict TS, migrations, TL-B opcodes | 34+ tests, dual ESM/CJS | Zod schemas, rate limiting |
| Ecosystem Value | First AI bot on TON on-chain ([source](https://id.tg/blog/telegram-ai-agents)) | Fills "no native framework" gap ([source](https://id.tg/blog/telegram-ai-agents)) | Only read+write MCP, x402-adjacent |
| User Potential | 900M Telegram users, A2A payments | Every TON agent dev | Every Claude/Cursor user |

## Gap Analysis ([Identity Research](https://id.tg/blog/telegram-ai-agents))

| Gap Identified | Our Solution |
|----------------|-------------|
| "Zero top AI bots transact on TON" | Sub 1 — first AI bot with on-chain multisig |
| "No native AI agent framework" | Sub 2 — intent parsing + tx building in one package |
| "MCP is converging standard" | Sub 3 — most capable MCP server (20 tools, read+write) |
| "Agent-to-agent protocols beginning" | Sub 1 — `POST /agent/propose` + `GET /agent/info` |
| "x402 machine-to-machine payments emerging" | Sub 3 — enables agent→chain payment flows |
