# Competitive Analysis — TON AI Hackathon

> Generated March 19, 2026. Based on deep analysis of 10 competitor repos from the 33 submissions on DoraHacks.

## Table of Contents

- [Executive Summary](#executive-summary)
- [Our Project Status](#our-project-status)
- [Tier 1 Competitors (Direct Threats)](#tier-1-competitors)
  - [ENACT Protocol](#1-enact-protocol)
  - [TON Agent Kit](#2-ton-agent-kit)
  - [TonBrain](#3-tonbrain)
- [Tier 2 Competitors (Useful Patterns)](#tier-2-competitors)
  - [Telegram MCP](#4-telegram-mcp)
  - [TON MCP](#5-ton-mcp)
  - [TON Agent Platform](#6-ton-agent-platform)
  - [TON AI Framework](#7-ton-ai-framework)
- [Tier 3 Competitors (Quick Reference)](#tier-3-competitors)
- [Head-to-Head Comparison](#head-to-head-comparison)
- [Gap Analysis](#gap-analysis)
- [Patterns to Adopt](#patterns-to-adopt)
- [Our Differentiator](#our-differentiator)
- [Action Plan](#action-plan)

---

## Executive Summary

Of 33 hackathon submissions, **3 are direct threats** to our placement:

| Rank | Project | Why Dangerous |
|------|---------|---------------|
| 1 | **ENACT Protocol** | Already on mainnet. 59 tests. 15 MCP tools. AI evaluator running 24/7. Solo dev, Claude Code built. |
| 2 | **TON Agent Kit** | 18 npm packages, 68 actions, 2 Tact contracts. Claims "Solana Agent Kit for TON." |
| 3 | **TonBrain** | Near-identical architecture to ours (SDK + MCP + Bot). Bidirectional MCP. |

**Our edge**: We are the only project that parses natural language into TON Cell objects directly. Nobody else does `NL → Intent → Cell` as a standalone SDK primitive.

**Our risk**: We have zero live deployments, zero testnet proof, zero demo videos. The deadline is March 25.

---

## Our Project Status

### Architecture

```
┌─────────────────────────────────────────┐
│        TON DAO Agent (Sub 1)            │
│   Telegram Bot + NL + Multisig V2       │
│                                         │
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

### Completeness

| Component | Code | Tests | Docs | On-chain Proof | Ship-ready |
|-----------|------|-------|------|----------------|------------|
| `apps/telegram-bot` | 95% | 0 | 70% | 0% | **No** — vote→blockchain gap |
| `packages/ton-intent-core` | 100% | 34 passing | 70% | 0% | **Yes** — ready for npm |
| `packages/ton-mcp-server` | 95% | 0 | 70% | 0% | **Yes** — ready for npm |

### Blocking Issues

1. **No live testnet proof** — All 3 READMEs have `[paste tonviewer link]` placeholders
2. **No demo videos** — All 3 READMEs say "record by March 24"
3. **No npm publications** — Packages claim `npm i` but aren't published
4. **Monorepo not split** — Need 3 separate public GitHub repos
5. **Vote → blockchain gap** — Bot creates "approved" proposals but doesn't broadcast the multisig tx

---

## Tier 1 Competitors

### 1. ENACT Protocol

**Repo**: `github.com/ENACT-protocol/enact-protocol`
**Track**: Agent Infrastructure
**Author**: @0xFaylen (solo dev, built with Claude Code)

#### What It Is

Trustless on-chain escrow protocol for AI agent commerce on TON. Implements ERC-8183 (Agentic Commerce) — first implementation outside Ethereum.

#### Architecture

```
enact-protocol/
├── contracts/       4 Tolk contracts (1,078 LOC)
├── wrappers/        TypeScript contract wrappers
├── tests/           59 tests (1,158 LOC)
├── mcp-server/      15 MCP tools (624 LOC)
├── bot/             Telegram bot (2,434 LOC)
├── sdk/             npm package (@enact-protocol/sdk)
├── scripts/         AI evaluator agent
├── site/            Next.js documentation site
└── plugins/         Teleton agent plugin (511 LOC)
```

**Total**: ~11,700 lines of production code.

#### Smart Contracts (Tolk 1.2, MAINNET)

| Contract | LOC | Purpose |
|----------|-----|---------|
| `job.tolk` | 366 | Per-job TON escrow |
| `job_factory.tolk` | 157 | Job deployment factory |
| `jetton_job.tolk` | 398 | USDT/Jetton escrow variant |
| `jetton_job_factory.tolk` | 157 | Jetton factory |

**State machine**: OPEN → FUNDED → SUBMITTED → COMPLETED/DISPUTED/CANCELLED

**9 opcodes**: FundJob, TakeJob, SubmitResult, EvaluateJob, CancelJob, InitJob, ClaimJob, QuitJob, SetBudget

**Security**: Role-based access control, state-dependent validation, budget enforcement, configurable timeouts (1h–30d), auto-claim if evaluator silent, 0% protocol fee, excess gas return.

**Mainnet addresses**:
- JobFactory: `EQAFHodWCzrYJTbrbJp1lMDQLfypTHoJCd0UcerjsdxPECjX`
- JettonJobFactory: `EQCgYmwi8uwrG7I6bI3Cdv0ct-bAB1jZ0DQ7C3dX3MYn6VTj`

#### MCP Server (15 tools)

| # | Tool | Category |
|---|------|----------|
| 1 | `create_job` | Core |
| 2 | `fund_job` | Core |
| 3 | `take_job` | Core |
| 4 | `submit_result` | Core |
| 5 | `evaluate_job` | Core |
| 6 | `cancel_job` | Core |
| 7 | `claim_job` | Core |
| 8 | `quit_job` | Core |
| 9 | `set_budget` | Core |
| 10 | `get_job_status` | Read |
| 11 | `list_jobs` | Read |
| 12 | `create_jetton_job` | Jetton |
| 13 | `fund_jetton_job` | Jetton |
| 14 | `set_jetton_wallet` | Jetton |
| 15 | `list_jetton_jobs` | Jetton |

**Dual mode**: Remote HTTP (`https://mcp.enact.info/mcp`) + Local stdio with wallet signing.

**IPFS**: Pinata integration for job descriptions and results (hash stored on-chain, content on IPFS).

#### AI Evaluator Agent

- Autonomous agent on mainnet (`UQCDP52RhgJmylkjOBSJGqCsaTwRo9XFzrr6opHUg4mqkQAu`)
- Monitors SUBMITTED jobs, reviews via LLM (Groq llama-3.3-70b, free tier)
- Auto-approves/rejects with reason
- Polls every 60 seconds
- `--dry-run` mode for testing

#### Testing

- **59 tests** across 3 files (Job, JobFactory, JettonJob)
- Jest + @ton/sandbox
- Happy path, rejection, access control, state transitions, timeout enforcement
- GitHub Actions CI

#### Strengths

1. **Already on mainnet** — not just testnet
2. **4 integration surfaces** — MCP, Bot, SDK, Teleton Plugin
3. **Autonomous AI agent** running 24/7
4. **Professional README** — badges, diagrams, expandable sections, architecture
5. **Published npm** — `@enact-protocol/sdk`
6. **Documentation site** — Next.js at enact.info
7. **59 well-organized tests**
8. **Novel**: Per-job escrow contracts, AI evaluator, IPFS off-chain data

#### Weaknesses

1. No reputation system yet (roadmap)
2. Single Jetton (USDT only)
3. MCP server is a single 624 LOC file
4. Using free-tier Groq (14,400 req/day limit)
5. No multi-agent orchestration

#### Threat Assessment: **HIGH**

ENACT is the most polished, production-ready submission. It's already deployed to mainnet with real transactions, has professional documentation, and demonstrates a complete product lifecycle. To beat it, we need to show something it can't do — which is NL intent parsing.

---

### 2. TON Agent Kit

**Repo**: `github.com/Andy00L/ton-agent-kit`
**Track**: Agent Infrastructure
**Author**: @Andy00L

#### What It Is

"The Solana Agent Kit for TON." 18 npm packages, 68 actions, 12 plugins. Install what you need, connect any LLM to TON in one line.

#### Architecture

**Core + Infrastructure (4 packages)**:
- `@ton-agent-kit/core` — Plugin system, wallet, agent, cache, strategies
- `@ton-agent-kit/orchestrator` — Multi-agent coordination with parallel dispatch
- `@ton-agent-kit/strategies` — Deterministic workflow engine
- `@ton-agent-kit/x402-middleware` — HTTP 402 payment middleware

**Plugins (12 packages)**:
- `plugin-token` (7 actions) — TON & Jetton transfers, deploy
- `plugin-defi` (11 actions) — Swaps (DeDust/STON.fi), DCA, limit orders, yield
- `plugin-nft` (3 actions) — NFT metadata, transfers
- `plugin-dns` (3 actions) — .ton domain resolution
- `plugin-staking` (3 actions) — Stake/unstake
- `plugin-analytics` (8 actions) — TX history, portfolio, webhooks
- `plugin-escrow` (14 actions) — On-chain Tact escrow with dispute resolution
- `plugin-identity` (9 actions) — Agent registry, reputation
- `plugin-agent-comm` (7 actions) — Intent/offer protocol
- `plugin-payments` (2 actions) — x402 payments
- `plugin-memory` — Agent memory/caching

**Framework Integration (3 packages)**:
- `mcp-server` — 68 tools for Claude/Cursor
- `langchain` — LangChain adapter
- `ai-tools` — Vercel AI SDK tools

#### Key Innovation: `toAITools()`

```typescript
// Converts all plugin actions to OpenAI-compatible tool definitions
toAITools(): Array<{ type: "function"; function: {...} }> {
  return this.getAvailableActions().map((action) => {
    const { $schema, ...parameters } = toJSONSchema(action.schema);
    return {
      type: "function" as const,
      function: {
        name: action.name,
        description: action.description,
        parameters,
      },
    };
  });
}
```

Uses Zod v4 native `toJSONSchema()` — works with OpenAI, Anthropic, Google, Groq, Mistral, any provider.

#### Smart Contracts (Tact, testnet)

**escrow.tact**: Per-deal contract with bidirectional staking, self-selecting arbiters, majority voting (72h window), gas refund pattern, cross-contract notifications to reputation contract.

**reputation.tact**: Shared contract. Agent registry, capability index (O(1) lookup), dispute registry, intent/offer marketplace, auto-cleanup for low-score agents.

#### Agent Commerce Protocol

```
Register → Discover → Pay (x402) → Escrow → Deliver → Rate → Reputation
```

Fully trustless, on-chain, incentive-aligned with arbiter staking rewards.

#### Smart Caching

- TTL-based per-action (10s–5min)
- Write actions auto-invalidate related read caches
- LRU eviction (500 entries)
- Claims 376x speedup on repeated queries

#### Testing

- 400+ tests across 10+ test files
- Custom test harness (not Jest)
- Covers: all 68 actions, orchestrator, escrow lifecycle, x402 security (anti-replay), npm install, schema generation
- 5-agent autonomous simulation on testnet

#### Strengths

1. **Massive scope** — 68 actions, 18 packages
2. **Elegant plugin system** — `definePlugin`/`defineAction` with fluent chaining
3. **LLM-first** — `toAITools()` + `runLoop()` for autonomous execution
4. **On-chain commerce** — escrow + reputation + discovery + x402
5. **Multi-agent orchestrator** — parallel dispatch with dependency resolution
6. **Multiple framework adapters** — MCP, LangChain, Vercel AI
7. **400+ tests**
8. **Professional README** — 1188 lines with mermaid diagrams

#### Weaknesses

1. **Most actions "Schema Validated" only** — not live-tested on mainnet
2. **Testnet only** — no mainnet deployment
3. **Depends on external APIs** — TONAPI, swap.coffee, DYOR.io
4. **Requires Bun** — not Node.js
5. **Custom test harness** — harder CI/CD integration
6. **Zod v4 peer dependency friction** — can break if multiple versions installed

#### Threat Assessment: **HIGH**

TON Agent Kit wins on breadth and ambition. But it's testnet-only and many actions aren't live-tested. If judges reward "working MVP" over "comprehensive SDK," it's vulnerable.

---

### 3. TonBrain

**Repo**: `github.com/alawalmuazu/tonbrain`
**Track**: Agent Infrastructure + User-Facing (dual submission)
**Author**: @alawalmuazu

#### What It Is

Three-package monorepo: SDK + MCP Server + Telegram Bot. Nearly identical architecture to ours.

#### Architecture

```
tonbrain/
├── packages/
│   ├── sdk/    (1,847 LOC) — Wallet, escrow, invoicing, agent registry, protocol
│   ├── mcp/    (488 LOC)   — 13 MCP tools
│   └── bot/    (varies)    — Telegram bot with Gemini AI
└── web/        — Landing page
```

**Total**: 4,572 TypeScript lines.

#### SDK Features

| Module | What It Does |
|--------|-------------|
| `WalletManager` | Balance, TX history, jettons, NFTs, DNS, swap quotes |
| `EscrowManager` | State machine: created → funded → released/refunded/disputed |
| `InvoiceManager` | `ton://` deep links, status tracking, memo matching |
| `PaymentSplitter` | Proportional (bps) and fixed-amount splits |
| `AgentRegistry` | Register, discover, heartbeat, best-agent selection |
| `AgentProtocol` | Task messages, inbox/outbox, threading |
| `TaskRouter` | Registry + Protocol + Escrow integration |

#### MCP Tools (13)

| Category | Tools |
|----------|-------|
| Wallet (5) | balance, transactions, NFTs, jettons, DNS |
| Payments (4) | invoice, escrow create/action, split payment |
| Coordination (4) | register agent, discover, route task, status |

#### Telegram Bot

- 15 commands, Gemini 2.0 Flash AI, conversation memory
- TON Connect wallet integration
- HTML-formatted messages, inline keyboards
- Intent detection via regex (not semantic)

#### Bidirectional MCP (Unique)

```
Claude Desktop
    ↕ consumes tonbrain-mcp (13 tools)  ← TonBrain PRODUCES
    ↕ consumes @ton/mcp (official)      ← TON Foundation PRODUCES
TonBrain Agent
```

Consumes the official `@ton/mcp` for blockchain ops AND produces its own MCP for agent-level primitives.

#### Strengths

1. **Bidirectional MCP** — unique architectural choice
2. **Complete monorepo** — SDK + MCP + Bot
3. **Production UX** — branded welcome, landing page, 15 commands
4. **Dual-track submission** — Infrastructure AND User-Facing
5. **Docker + Railway ready**

#### Weaknesses

1. **Zero tests** — vitest configured but no test files
2. **All state management is off-chain** — escrow, registry in memory/JSON, not smart contracts
3. **Regex intent detection** — not semantic AI
4. **JSON file database** — doesn't scale
5. **No mainnet/testnet proof**
6. **4,572 LOC** — smallest of the top competitors

#### Threat Assessment: **MEDIUM**

Similar architecture to ours but weaker execution. No tests, no on-chain primitives, no live proof. We should beat TonBrain easily if we ship our testnet proofs and maintain our test coverage advantage.

---

## Tier 2 Competitors

### 4. Telegram MCP

**Repo**: `github.com/mhbdev/telegram-mcp`
**Track**: Agent Infrastructure
**Author**: @mhbdev (OG + Grant Winner)

Production-grade Telegram MCP server with **277+ operations**:
- **167 Bot API methods** (complete coverage from `@grammyjs/types`)
- **110+ MTProto v2 operations** across 10 service layers (chats, messages, contacts, profile, search, privacy, drafts, inline, media, approval)

**Production features worth noting**:
- OIDC JWT auth (Keycloak) with RBAC
- Tool allowlists per role
- Encrypted-at-rest credentials
- Risk classification (low/medium/high) per operation
- Approval workflow for high-risk ops (JIT tokens)
- PostgreSQL persistence with migrations
- Prometheus metrics endpoint
- Dual transport (stdio + HTTP)

**Why it matters for us**: This is the gold standard for MCP server security and production hardening. Our MCP server should adopt risk classification and rate limiting patterns from here.

---

### 5. TON MCP

**Repo**: `github.com/nessshon/ton-mcp` (renamed)
**Track**: Agent Infrastructure
**Author**: @ness (OG + Builder)

"One server, one config line — your AI can do anything on TON." Covers transfers, token launches, NFT minting, DNS, batch operations in natural language.

**Why it matters for us**: This is the "official" TON MCP that other projects consume (TonBrain consumes it). We need to differentiate by offering things it doesn't — intent parsing and multisig support.

---

### 6. TON Agent Platform

**Repo**: `github.com/spendollars/TonAgentPlatform`
**Track**: Agent Infrastructure + User-Facing (dual submission)
**Author**: @spend (Previous Grant Winner)

No-code platform for AI agents on TON. 180+ tools. Agents operate as real Telegram users via MTProto. Visual workflow constructor. 7 AI providers with auto-fallback.

**Why it matters for us**: Shows judges value "no-code" and "real Telegram user" approaches. Our bot-based approach is more conventional.

---

### 7. TON AI Framework

**Repo**: `github.com/isopen/ton-ai-core`
**Track**: Agent Infrastructure
**Author**: @wolf (OG + Builder)

Lightweight, modular framework with plugins architecture for TON agent development.

**Why it matters for us**: Plugin architecture patterns. Similar to TON Agent Kit's approach but lighter.

---

## Tier 3 Competitors

| Repo | What to Learn |
|------|---------------|
| **Cocoon AI SDK** (`shitilestan/cocoon-ai-sdk`) | Vercel AI SDK v6 provider pattern for decentralized LLM inference |
| **tonapi-langchain-tools** (`1lastphoenix/tonapi-langchain-tools`) | OpenAPI spec → LangChain DynamicStructuredTool generation with Zod schemas |
| **TTI** (`mhbdev/tti`) | Transaction trace analysis patterns, risk scoring, streaming reports |
| **izEscrowAI** (`izzzzzi/izEscrowAI`) | AI freelance marketplace, Tolk escrow, GitHub skill verification |
| **ExplorAI** (`4rdii/transaction-debugger-agent`) | Transaction explanation in plain language |
| **TonPilot** (`zabatka/TonPilot`) | Trading agent with STON.fi + TON Connect 2.0 + aiogram 3 |
| **TON Security Agent** (`Atakanus/ton-security-agent`) | Wallet risk analysis, phishing detection, community scam DB |

---

## Head-to-Head Comparison

### Feature Matrix

| Feature | ENACT | Agent Kit | TonBrain | **Us** |
|---------|-------|-----------|----------|--------|
| Smart contracts | 4 Tolk (mainnet) | 2 Tact (testnet) | None | None (uses existing multisig) |
| MCP tools | 15 | 68 | 13 | **18** |
| Tests | 59 | 400+ | 0 | **34** |
| npm published | Yes | Yes | No | **No** |
| Mainnet proof | Yes | No | No | **No** |
| Testnet proof | Yes | Yes | No | **No** |
| Demo video | Yes | Yes | No | **No** |
| Telegram bot | Yes | Yes | Yes | **Yes** |
| AI integration | Groq evaluator | Multi-provider runLoop | Gemini regex | **Claude/OpenAI intent parsing** |
| Unique feature | AI evaluator | Plugin system + commerce | Bidirectional MCP | **NL → Cell** |
| Documentation site | Yes (Next.js) | No | Landing page | **No** |
| LOC | ~11,700 | ~15,000+ | ~4,572 | **~3,500** |
| CI/CD | GitHub Actions | Custom | None | **None** |

### Judging Criteria Alignment (25% each)

| Criterion | ENACT | Agent Kit | TonBrain | **Us** |
|-----------|-------|-----------|----------|--------|
| **Product Quality** | 9/10 (live, polished) | 8/10 (broad, npm) | 6/10 (bot works) | **5/10** (code done, nothing live) |
| **Technical Execution** | 9/10 (Tolk, tests, CI) | 9/10 (Tact, 400 tests) | 5/10 (no tests) | **7/10** (34 tests, strict TS) |
| **Ecosystem Value** | 8/10 (escrow primitive) | 9/10 (full SDK) | 6/10 (similar exists) | **8/10** (unique NL→Cell gap) |
| **User Potential** | 7/10 (agent devs) | 8/10 (all TON devs) | 7/10 (900M TG users) | **8/10** (900M TG + all devs) |
| **Estimated Total** | **33/40** | **34/40** | **24/40** | **28/40** |

### With Our Gaps Fixed

If we ship testnet proof, demo videos, npm publish, and split repos by March 25:

| Criterion | Current | After Fixes |
|-----------|---------|-------------|
| Product Quality | 5/10 | **8/10** |
| Technical Execution | 7/10 | **8/10** |
| Ecosystem Value | 8/10 | **8/10** |
| User Potential | 8/10 | **8/10** |
| **Total** | **28/40** | **32/40** |

This puts us competitive with ENACT (33) and Agent Kit (34).

---

## Gap Analysis

### What Competitors Have That We Don't

| Gap | Who Has It | Priority | Effort |
|-----|-----------|----------|--------|
| Live mainnet deployment | ENACT | Low (testnet is fine for hackathon) | High |
| Live testnet proof | ENACT, Agent Kit | **CRITICAL** | Medium |
| Demo video | ENACT, Agent Kit | **CRITICAL** | Low |
| npm publication | ENACT, Agent Kit | **HIGH** | Low |
| Separate GitHub repos | Everyone | **HIGH** | Low |
| CI/CD (GitHub Actions) | ENACT | Medium | Low |
| Documentation site | ENACT | Low | Medium |
| IPFS integration | ENACT | Low | Medium |
| Plugin architecture | Agent Kit | Low (not our pattern) | High |
| Multi-agent orchestration | Agent Kit | Low | High |
| Smart caching | Agent Kit | Low | Medium |
| x402 payments | Agent Kit | Low | High |
| Risk classification per tool | Telegram MCP | Nice-to-have | Low |
| On-chain reputation | Agent Kit | Low | High |

### What We Have That They Don't

| Our Advantage | Why It Matters |
|---------------|----------------|
| **NL → Intent → Cell** as standalone SDK | Nobody else does this. Every other project either wraps APIs or builds escrow. We're the only intent parsing primitive. |
| **Multisig V2 integration** | ENACT does escrow, Agent Kit does escrow. Nobody integrates with existing multisig contracts. |
| **Provider-agnostic intent parsing** | Works with Claude, GPT, custom providers. Not locked to one LLM. |
| **Dual ESM/CJS build** | Agent Kit requires Bun. We work everywhere. |
| **Three complementary submissions** | SDK + MCP + Bot that cross-reference each other. Only Agent Kit does something similar. |

---

## Patterns to Adopt

### From ENACT Protocol

1. **Dual MCP mode** — Add HTTP transport to our MCP server (currently stdio only)
   ```
   Remote: https://your-url.com/mcp (unsigned txs + Tonkeeper deeplinks)
   Local: stdio with wallet signing
   ```

2. **Professional README structure**:
   - Hero image + badges (test status, npm version, tool count)
   - Quick start (3 paths: remote, local, SDK)
   - Architecture diagram
   - Expandable sections for security model, storage layout
   - Tech stack table

3. **IPFS for off-chain data** — Store intent descriptions on Pinata, hash on-chain

4. **AI evaluator concept** — Could add an "intent validator" that auto-verifies parsed intents match user request

### From TON Agent Kit

1. **`toAITools()` pattern** — We should expose our intent actions as OpenAI-compatible tool definitions:
   ```typescript
   import { toJSONSchema } from 'zod/v4';
   // Convert our Zod schemas to LLM tool definitions
   ```

2. **Smart caching** — Add TTL-based cache to MCP server read operations:
   - `ton_get_balance`: 10s TTL
   - `ton_get_transactions`: 30s TTL
   - `ton_resolve_dns`: 5min TTL
   - Auto-invalidate on `ton_sign_and_send`

3. **Balance guards** — Before building transfer Cell, check sender has sufficient balance

4. **README badges** — npm version, test count, tool count, license

### From Telegram MCP

1. **Risk classification** — Tag each MCP tool as low/medium/high risk:
   - Low: `ton_get_balance`, `ton_resolve_dns`
   - Medium: `ton_build_transfer`, `ton_estimate_fees`
   - High: `ton_sign_and_send`, `ton_build_multisig_order`

2. **Rate limiting improvement** — Our token bucket is good, but add per-tool limits for high-risk ops

---

## Our Differentiator

### The "NL → Cell" Gap

Every competitor solves a different problem:
- **ENACT**: "How do AI agents pay each other?" → Escrow
- **Agent Kit**: "How do I connect any LLM to TON?" → Plugin SDK
- **TonBrain**: "How do I query TON from Claude?" → MCP wrapper
- **Telegram MCP**: "How do I control Telegram from AI?" → Bot API MCP

**We solve**: "How does a human's natural language become a TON transaction?"

This is the **missing primitive**. Every agent needs to understand user intent before it can act. ENACT assumes the intent is known. Agent Kit assumes you'll call the right action. TonBrain does regex matching.

**We parse**: "Send 5 TON to alice.ton for the design work" → `{ action: "transfer", to: "alice.ton", amount: "5", comment: "design work" }` → `Cell` ready to sign.

### How to Lean Into This

1. **Benchmark against competitors** — Show that our intent parser handles edge cases they can't:
   - "Split 10 TON equally between alice.ton and bob.ton" → 2 transfers
   - "Propose sending 100 TON from the team wallet" → multisig order
   - "What's the gas fee for sending USDT?" → estimate, not execute

2. **Position as infrastructure** — "Every TON agent needs an intent parser. Ours is the only one."

3. **Show composability** — Our SDK works with ENACT's MCP, Agent Kit's plugins, TonBrain's bot. We're the intent layer they're all missing.

---

## Action Plan (March 19–25)

### Day 1–2 (March 19–20): Fix Blocking Issues

| # | Task | Priority | Est. Hours |
|---|------|----------|-----------|
| 1 | Fix vote → blockchain execution in telegram-bot | CRITICAL | 3h |
| 2 | Deploy multisig on testnet, execute real proposals | CRITICAL | 2h |
| 3 | Execute `ton_sign_and_send` on testnet, get tonviewer links | CRITICAL | 1h |
| 4 | Execute intent parsing → transfer on testnet | CRITICAL | 1h |

### Day 3 (March 21): Package & Publish

| # | Task | Priority | Est. Hours |
|---|------|----------|-----------|
| 5 | Publish `@ton-intent/core` to npm | HIGH | 1h |
| 6 | Publish `@ton-mcp/server` to npm (npx support) | HIGH | 1h |
| 7 | Split monorepo into 3 public GitHub repos | HIGH | 2h |
| 8 | Add GitHub Actions CI (test + lint) | MEDIUM | 1h |

### Day 4 (March 22): Polish READMEs

| # | Task | Priority | Est. Hours |
|---|------|----------|-----------|
| 9 | Rewrite all 3 READMEs (badges, diagrams, quick start) | HIGH | 3h |
| 10 | Add testnet proof links to each README | HIGH | 0.5h |
| 11 | Cross-reference all 3 submissions | HIGH | 0.5h |

### Day 5 (March 23): Demo Videos

| # | Task | Priority | Est. Hours |
|---|------|----------|-----------|
| 12 | Record telegram-bot demo (NL → proposal → vote → execute) | CRITICAL | 1h |
| 13 | Record intent-core demo (npm install → parse → Cell) | CRITICAL | 1h |
| 14 | Record MCP server demo (npx → Claude Desktop) | CRITICAL | 1h |

### Day 6 (March 24): Submit

| # | Task | Priority | Est. Hours |
|---|------|----------|-----------|
| 15 | Fill 3 DoraHacks submission forms | CRITICAL | 1h |
| 16 | Final testing of all live links | HIGH | 1h |
| 17 | Post announcement / share with community | MEDIUM | 0.5h |

### Nice-to-Haves (if time permits)

| Task | Impact |
|------|--------|
| Add HTTP transport to MCP server | Matches ENACT's dual-mode |
| Add risk classification to MCP tools | Matches Telegram MCP pattern |
| Add smart caching to MCP read tools | Matches Agent Kit pattern |
| Add `toAITools()` export to intent-core | Makes SDK LLM-native |
| Add MCP tests | Improves Technical Execution score |

---

## Repos Cloned for Reference

All stored in `/references/` (gitignored):

```
references/
├── enact-protocol/        # Tier 1 — Escrow + MCP + AI evaluator
├── ton-agent-kit/         # Tier 1 — 18 packages, 68 actions
├── tonbrain/              # Tier 1 — SDK + MCP + Bot (similar to us)
├── telegram-mcp/          # Tier 2 — Production MCP patterns
├── ton-mcp/               # Tier 2 — Official TON MCP
├── TonAgentPlatform/      # Tier 2 — No-code agent platform
├── ton-ai-core/           # Tier 2 — Modular framework
├── cocoon-ai-sdk/         # Tier 3 — Vercel AI provider
├── tonapi-langchain-tools/# Tier 3 — OpenAPI → LangChain tools
└── tti/                   # Tier 3 — Transaction inspector
```

---

## Key Takeaway

**We can win if we ship.** Our NL → Cell angle is genuinely unique among 33 submissions. But right now ENACT and Agent Kit are ahead because they're deployed, tested, and polished. The next 6 days are about closing that gap — not adding features, but proving what we've already built actually works on-chain.
