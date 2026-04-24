---
name: crypto-kol-strategies
description: Use this skill when evaluating SOL/BSC/Base meme or high-volatility tokens through the local X KOL strategy knowledge base, Binance Square heat, and on-chain scanner evidence. It helps decide whether a candidate deserves research, watchlist, or trade-plan status.
---

# Crypto KOL Strategies

Use this skill only as a research and risk framework. It does not authorize automatic trading.

## Source Accounts

- @CryptoApprenti1
- @MEJ50749
- @0x515151
- @Naive_BNB
- @0xSunNFT
- @LLLink_2026
- @mnmn94253156337

## Decision Flow

1. Start from a candidate token in the local dashboard or Obsidian `vault/candidates/`.
2. Read the candidate evidence and identify which source created the signal: X, Binance Square, GMGN, DEX Screener, or multiple sources.
3. Match the signal to one or more strategy patterns:
   - Early launch momentum: new pair, bonding curve progress, fast volume expansion.
   - Smart money confirmation: GMGN smart_degen or renowned wallets accumulating.
   - Narrative propagation: multiple sources mention the same token or theme in a short window.
   - Holder quality: acceptable top holder concentration and no obvious dev/bundler/rat-trader risk.
   - Risk rejection: honeypot, high rug ratio, low liquidity, concentrated holders, fake volume, missing pool.
4. Treat single-source social hype as research only unless chain data confirms it.
5. Require an invalidation condition before any trade plan: stale signal, liquidity drop, holder risk, failed volume follow-through, or narrative reversal.

## Default Output

When asked about a candidate, return:

- Verdict: `filtered`, `research`, `watch`, or `trade_watch`.
- Why it appeared.
- Evidence chain.
- Failed or missing filters.
- Maximum risk.
- What must happen next before it becomes actionable.

## Hard Safety Rules

- Do not recommend live execution for any token with a hard filter failure.
- Do not treat a KOL mention as proof of safety.
- Do not ignore missing liquidity, holder concentration, or honeypot data.
- Do not alter active rules automatically. Suggest rule changes for human review.
- Real trading requires explicit second confirmation and external execution adapter audit.
