# Open Questions & Decisions Register

Status: `OPEN` needs a decision · `LEANING` provisional recommendation · `RESOLVED` decided.
**Blocking** questions must be resolved before build starts.

> **M1 hard gate — RESULT (2026-06-20): PASS.** The calibrated Elo/Poisson model beats the
> coin-flip baseline by **18.6%** on log loss over 16k post-2010 internationals (11% on World
> Cup matches). The "kill if it can't beat coin-flip" condition is cleared. See
> [`13-spike-findings.md`](13-spike-findings.md) (S8).

## Blocking (resolve before coding)

### Q1 — What is the default strength model (Layer A)? **[BLOCKING]**
The single biggest driver of output quality. Options:
- **(a) Elo/Poisson** — transparent, offline, no API cost, easy to backtest. *Leaning
  default.*
- **(b) Reuse kickpool's Claude per-match predictor** — already exists, richer context,
  but API cost + must be precomputed (never in the loop) and benchmarked for calibration.
- **(c) Market/bookmaker odds** — often best-calibrated, but sourcing/licensing and not
  "from current standings" in spirit.

**Recommendation:** ship **(a)** as default, implement **(b)** as a selectable model, pick
the winner by backtest calibration ([`04-verification.md`](04-verification.md) C3).
**Status: RESOLVED — (a) Elo/Poisson is the default; (b) the kickpool Claude per-match
predictor is an optional selectable model. (c) market odds not pursued.**

### Q-infra — Local CLI or AWS for v1? **[BLOCKING]**
[`07-infrastructure.md`](07-infrastructure.md) recommends **local CLI for v1**, AWS only when
scheduled auto-refresh / hosted page is wanted.
**Status: RESOLVED — local CLI for v1; AWS deferred to Phase 2 (see
[`11-kickpool-integration.md`](11-kickpool-integration.md) §4).**

## High priority

### Q2 — Exact 2026 tournament format & bracket mapping
Confirm: 48 teams, 12 groups of 4, 32 advance (12 winners + 12 runners-up + **8 best
third-placed**), then single elimination R32→final. The third-placed selection and the
*specific* bracket-slot assignment rules must be pinned to an authoritative source before
implementing `KnockoutEngine`.
**Status: CONFIRMED (48/12×4/104 matches; 12+12+8 → R32→Final) — see
[`12-rules-sources.md`](12-rules-sources.md). Remaining: extract the exact third-place→slot
allocation table from the FIFA Regulations PDF and commit it as a fixture.**

### Q3 — Exact FIFA tiebreaker ordering
Implement the precise sequence (points → goal difference → goals for → head-to-head among
tied → disciplinary/fair-play → drawing of lots). Confirm the exact list and order for 2026,
especially how head-to-head interacts when 3+ teams are tied, and the fair-play data source.
**Status: CONFIRMED — FIFA Article 13, head-to-head FIRST (a reversal from 2022), full
7-step order + the separate third-place ranking captured in
[`12-rules-sources.md`](12-rules-sources.md). 3+-way / circular ties must be oracle-tested
(spike S2).**

### Q4 — Implementation language
[`06-architecture.md`](06-architecture.md) recommends **TypeScript** (reuse kickpool types,
data adapters, and the Claude predictor; one language). Python is the alternative for
stats/plotting ergonomics in backtests. Decide, or adopt the hybrid (TS engine, Python for
offline calibration analysis).
**Status: RESOLVED — hybrid adopted: TypeScript engine (reuse kickpool types/adapters/Claude
predictor); Python for offline backtest/calibration analysis only, off the critical path.**

## Medium priority

### Q5 — Knockout draw resolution
How to model drawn knockout matches: a flat ~50/50 shootout, strength-weighted, or an
extra-time-then-penalties two-stage model? Affects realism of deep-run probabilities.
**Status: RESOLVED — spike run (S1, [`13-spike-findings.md`](13-spike-findings.md)). The
resolver choice moves champion odds ~4×, so it matters. **Adopt the two-stage model**
(regulation via Poisson → strength-tilted shootout). The shootout-tilt constant is left for
calibration in S8.**

### Q6 — Default number of simulations `N`
100k gives ≤0.3% error in ~10s. Is that the right default, or do we want a faster default
(10k, ~1s) for interactive use and 100k for "final" runs?
**Status: RESOLVED — N=100k default, `--sims` overridable.**

### Q7 — Historical backtest dataset
Which completed tournaments, at which rewind points, and where does the historical standings
data come from? World Cups alone (~22) may be a thin sample; do we augment with other
group+knockout tournaments? Required to make the C3 gate meaningful.
**Status: SOURCED — primary dataset identified (martj42 results, CC0) + Elo sources, in
[`12-rules-sources.md`](12-rules-sources.md). Remaining decisions: rewind points and whether
to augment World Cups with Euros/Copa to widen the sample (spike S8).**

### Q8 — Match independence / extra effects
v1 assumes matches independent given strength (no fatigue, travel, altitude, home-advantage
for host nations, injuries). Acceptable for v1? Which, if any, are worth adding later?
**Status: RESOLVED — v1 keeps it simple (matches independent given strength); extra effects
logged as future work.**

### Q9 — How is "current standings" handed over from kickpool?
Snapshot-first (recommended) vs live adapter; exact kickpool endpoints/auth; do we vendor a
copy of its types or import them? Confirms the DataProvider contract.
**Status: RESOLVED — snapshot-first via kickpool `/api/standings` + `/api/fixtures`, written
to a hashed JSON snapshot before the run.**

## Lower priority

### Q10 — Visualisation scope for v1
CLI table + JSON/CSV only (Tier 0), or also the static results page (Tier 1)? See
[`08-visualisation.md`](08-visualisation.md).
**Status: RESOLVED — Tier 0 (CLI + JSON/CSV) in v1; Tier 1 (static results page) is a
prioritised fast-follow wanted very soon after v1, not a distant stretch.**

### Q11 — Gen-AI narrative in v1?
Include the optional plain-language "why did odds move" narrative in v1, or defer? It needs
the Anthropic SDK and is purely additive.
**Status: RESOLVED — INCLUDE in v1. The plain-language "why did odds move" narrative ships in
v1; it explains the numbers well. Generated strictly **after** the probabilities so it never
contaminates them. Implication: v1 now depends on the Anthropic SDK + an API key, even though
the simulation core stays offline (the narrator runs at the output edge, post-run).**

### Q12 — Relationship to kickpool long-term
Stays a standalone tool, or eventually a "title odds" widget embedded in kickpool's UI?
Influences how much we invest in shared types now.
**Status: RESOLVED — standalone for v1; embedding planned as a Phase 2 surface in kickpool.
See [`11-kickpool-integration.md`](11-kickpool-integration.md). v1 keeps the `ResultSet` JSON
stable, versioned, and publishable so Phase 2 is a new consumer, not an engine change.**

---

## Decisions log & remaining blockers

**Decided (2026-06-20):** Q1 (Elo/Poisson default, Claude adapter optional) · Q-infra (local
CLI v1, AWS Phase 2) · Q4 (hybrid TS engine + Python calibration) · Q6 (N=100k, overridable) ·
Q8 (independence assumption for v1) · Q9 (snapshot-first) · Q10 (Tier 0 v1, Tier 1 prioritised
fast-follow) · Q11 (**Gen-AI narrative in v1**) · Q12 (standalone v1, kickpool embed Phase 2).

**Still open before/while building:**
1. **Q2 / Q3** — confirm the official 2026 format + bracket-slot rules and the exact FIFA
   tiebreaker ordering against authoritative sources (see [`12-rules-sources.md`](12-rules-sources.md)).
2. **Q5** — run a **knockout-draw-resolution spike** and pick a model by calibration.
3. **Q7** — settle the historical backtest dataset and its source (see
   [`12-rules-sources.md`](12-rules-sources.md)).

A consolidated source register and the proposed spikes live in
[`12-rules-sources.md`](12-rules-sources.md).
