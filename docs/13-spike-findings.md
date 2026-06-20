# Spike Findings

*Outcomes of the de-risking spikes proposed in [`12-rules-sources.md`](12-rules-sources.md).
Each spike is runnable code under [`../spikes/`](../spikes/); this doc records what we
learned. Run date: **2026-06-20**, Node v18.19.1.*

## How these were produced

```bash
npm install
npm run typecheck     # tsc --noEmit — clean
npm test              # vitest — 40 tests across 8 spikes, all passing
npm run report        # prints the S1/S3/S5/S7/S8 demo numbers quoted below
```

All 40 assertions pass and the global `gate-ci` (typecheck + test) is green. The spikes are
**throwaway prototypes** — they validate assumptions, they are not the engine.

| Spike | Verdict | One-line outcome |
|-------|---------|------------------|
| S2 Tiebreakers | ✅ Validated | FIFA Art. 13 chain incl. H2H-first + 3-way recursion passes real + synthetic oracles. |
| S4 kickpool adapter | ✅ Validated | kickpool payloads → frozen, hashable `TournamentState`; fails loudly on bad data. |
| S3 Elo→Poisson | ✅ Validated | Mapping is monotone and produces believable W/D/L splits; constants need calibration. |
| S1 Knockout draw | ✅ Decided | Resolver choice moves champion odds 2–4×; **adopt two-stage** (regulation→shootout). |
| S5 Perf + RNG | ✅ Validated | 36M Poisson draws/s ⇒ ~0.6s of raw sampling for 100k sims; RNG bit-stable. |
| S6 Bracket mapping | ⚠️ Mechanism only | Lookup + validation work; the **official Annex table values are still pending**. |
| S7 Narrator | ✅ Validated (offline) | Prompt + read-only guardrail work against a mock; live run needs an API key. |
| S8 Backtest | ✅ Validated | log-loss / Brier / calibration harness works; calibrated predictor beats coin-flip. |

---

## S2 — Tiebreaker engine ([`spikes/s2-tiebreakers.ts`](../spikes/s2-tiebreakers.ts))

Implements the Article 13 chain with head-to-head applied **first** and the recursive
re-application among a shrunken tied subset. Oracle tests that pass:

- **2026 reversal:** a team with a far worse overall GD still ranks first because it won the
  head-to-head — proving H2H precedes overall GD.
- **Real oracle — 2018 World Cup Group H:** Japan ranked above Senegal on fair-play/conduct
  after they tied on points, GD, goals **and** head-to-head. Reproduced exactly.
- **3-way recursion:** in an A/B/C cycle, A separates on overall GD, then the remaining {B,C}
  are split by **re-applied head-to-head** — beating FIFA-ranking, which pointed the other
  way. This is the subtle behaviour most implementations get wrong.

**Finding:** the rule chain is well understood and testable in isolation (good for NFR7).
Build it as the table-driven `GroupEngine` core; carry the conduct (cards) data through from
the data source, since real groups *are* decided on it.

## S4 — kickpool data adapter ([`spikes/s4-kickpool-adapter.ts`](../spikes/s4-kickpool-adapter.ts))

Maps kickpool's `/api/standings` + `/api/fixtures` shapes (vendored from
`kickpool/types/index.ts`) into a `TournamentState`. The join key is `TeamRef.abbr`.

**Findings:**
- The mapping is clean: `STATUS_FINAL` + non-null score ⇒ played; everything else ⇒ remaining.
- Validation fails loudly (FR4) on wrong group size, FINAL-without-score, and unknown teams.
- A **canonical (sorted-key) hash** gives a stable 16-char `snapshotHash` for reproducibility
  and the Phase-2 widget join — confirmed identical across repeated runs.
- The sample artifact ([`spikes/s4-fixtures/mini-snapshot.json`](../spikes/s4-fixtures/mini-snapshot.json))
  documents the exact payload shape the real `KickpoolApiProvider` will consume.

Open: confirm auth/headers on the live kickpool routes and whether to import its types
directly vs vendoring (Q9 / P2-1).

## S3 — Elo→Poisson strength model ([`spikes/s3-elo-poisson.ts`](../spikes/s3-elo-poisson.ts))

Win/draw/loss by rating gap (home advantage on), from `npm run report`:

| Δ Elo | Home | Draw | Away | λ (home–away) |
|------:|-----:|-----:|-----:|:--------------|
| 0   | 41.7% | 25.6% | 32.6% | 1.45–1.25 |
| 150 | 52.8% | 23.8% | 23.3% | 1.72–1.06 |
| 300 | 63.8% | 20.5% | 15.7% | 2.04–0.90 |
| 500 | 77.0% | 14.7% |  8.3% | 2.55–0.71 |

**Finding:** monotone, with realistic draw mass (15–26%) and no Elo-only "99% blowouts".
The `base/homeAdv/spread` constants are placeholders — **calibrating them is the real work**
(feed S8). This confirms the model *shape* is sound (the PRFAQ's "riskiest part" is tractable).

## S1 — Knockout draw resolution ([`spikes/s1-knockout-draw.ts`](../spikes/s1-knockout-draw.ts))

P(favourite advances) for a Δ=150 tie, and how it compounds over four knockout rounds:

| Resolver | Per tie | Champion (×4 rounds) |
|----------|--------:|---------------------:|
| Flat coin-flip | 50.0% | 6.3% |
| **Two-stage (regulation→shootout)** | **61.4%** | **14.2%** |
| Strength-weighted | 70.3% | 24.5% |

**Finding / decision (resolves Q5):** the choice is **not** cosmetic — champion probability
varies ~4× across resolvers. **Adopt the two-stage model** (play regulation via the Poisson
model; if drawn, a strength-tilted shootout): it is the most physically faithful and sits
between the naive extremes. The shootout tilt constant should be calibrated in S8.

## S5 — Performance & RNG determinism ([`spikes/s5-perf-rng.ts`](../spikes/s5-perf-rng.ts))

- **Throughput:** 3,000,000 Poisson draws in **83 ms** → **36.3M draws/s**.
- **Projection:** 100k full-tournament sims ≈ **0.57 s** of raw sampling (104 matches × 2
  draws each). Even with full engine overhead (tiebreakers, bracket bookkeeping) this leaves
  comfortable headroom under the 10 s target (NFR1).
- **RNG:** `mulberry32` is **bit-stable** for a fixed seed and differs across seeds — the
  reproducibility promise (NFR2) holds with a trivial, dependency-free PRNG.

**Finding:** the "expensive simulation" worry is unfounded; single-core TS is ample.

## S6 — Third-placed bracket allocation ([`spikes/s6-bracket-mapping.ts`](../spikes/s6-bracket-mapping.ts))

The lookup **mechanism** is validated: a sorted-set key over the 8 qualifying groups → a
table entry → a structural validator (distinct slots, all qualifying thirds placed, no team
faces its own group). The code distinguishes **`BracketDataPending`** (table row missing)
from **`BracketInvalid`** (row malformed).

**Finding / gap:** the shipped table is a **structurally-valid PLACEHOLDER, not the official
mapping**. The real Annex values must be transcribed from the FIFA 2026 Regulations PDF and
committed as a fixture before `KnockoutEngine` is trustworthy. This is the single most
concrete remaining data task.

**Update (2026-06-20 research):** confirmed the mapping is **495 pre-defined scenarios**
(C(12,8) — one per combination of 8 qualifying groups from 12). The group winners who face a
third-placed team are **A, C, D, E, G, I, K, L**; winners of **B, F, H, J** face runners-up
instead. This structure is encoded-able now; only the 495 row *values* still need transcribing from
**Annex C** of the official **FIFA World Cup 26™ Competition Regulations** (PDF, verified
2026-06-20): <https://digitalhub.fifa.com/m/636f5c9c6f29771f/original/FWC2026_regulations_EN.pdf>.

**Update (2026-06-20 — TRANSCRIBED & SHIPPED).** The full bracket is now official, not a
placeholder. [`scripts/gen-annex-c.ts`](../scripts/gen-annex-c.ts) parses the PDF text and
emits [`src/engine/annex-c.ts`](../src/engine/annex-c.ts) — all **495 combinations**, each
**self-validated** against the §12.6 candidate sets (the generator throws on any mismatch).
The fixed slot tree (R32 M73–M88 → R16 → QF → SF → Final, §12.6–12.11) and Annex C are wired
into [`src/engine/bracket-2026.ts`](../src/engine/bracket-2026.ts) and used automatically for
the 12-group format. The generic placeholder seeding survives only for small test tournaments.

## S7 — Gen-AI narrator ([`spikes/s7-narrator.ts`](../spikes/s7-narrator.ts))

Computes top champion-odds movers between two runs, builds a prompt whose system message
**forbids computing or altering any number**, and runs it through an injectable client.

**Findings:**
- Against a faithful mock the narrative passes the guardrail; against a misbehaving mock that
  invents "88.8%", the `findUnsanctionedNumbers` guardrail **catches the fabricated figure**.
- This gives a concrete safety mechanism for FR18: every `%` in the prose must trace to a
  supplied number, enforcing the "storytelling never contaminates the numbers" rule.
- **Live execution needs `@anthropic-ai/sdk` + `ANTHROPIC_API_KEY`** (claude-haiku-4-5 is
  sufficient for narration). Not exercised in the spike to keep it offline/credential-free.

**Update (2026-06-20 — WIRED LIVE).** Promoted to [`src/narrate/`](../src/narrate/):
`narrator.ts` (movers + prompt + guardrail) and `anthropic-client.ts` (live SDK call,
claude-haiku-4-5). [`scripts/narrate-demo.ts`](../scripts/narrate-demo.ts) compares
pre-tournament vs current-standings odds and asks Claude to explain the movers — a real call
succeeds and the guardrail passes (no fabricated numbers). Unit tests use a mock client.

## S8 — Backtest harness ([`spikes/s8-backtest.ts`](../spikes/s8-backtest.ts))

Implements multiclass log-loss, Brier score, and reliability binning, plus the coin-flip
baseline. On a synthetic 4,000-match set drawn from known probabilities:

| Metric | Calibrated predictor | Coin-flip baseline |
|--------|---------------------:|-------------------:|
| Log loss | **0.914** | 1.099 (≈ ln 3) |
| Brier | **0.546** | 0.667 |

**Finding:** the **C3 kill/pivot gate is buildable and the math is correct** — a calibrated
predictor beats uniform on both metrics, and the baseline lands exactly on ln 3 as it should.

**Update (2026-06-20 — REAL calibration run).** The harness is now promoted to `src/eval/`
(`scoring`, `elo-ratings`, `backtest`, `calibrate`) and run against the acquired
`data/results.csv` (49,437 completed internationals). A walk-forward backtest (evolve Elo
match-by-match; predict each post-2010 match from pre-match ratings) grid-searched the
Elo→Poisson constants:

| Metric | Calibrated (base 1.35, homeAdv 95, spread 0.8) | Coin-flip baseline |
|--------|-----------------------------------------------:|-------------------:|
| Log loss (all, n≈16k) | **0.894** | 1.099 (ln 3) |
| Log loss (World Cup only, n=288) | **0.978** | 1.099 |

**The engine beats the coin-flip baseline by 18.6% (11.0% on World Cup matches) — the M1
hard gate passes, the project is not a kill.** These constants are now the
`EloPoissonModel` defaults.

---

## What remains blocked on external inputs

| Item | Blocked on | Spike | Status |
|------|-----------|-------|--------|
| Official third-place→slot table (495 rows) | FIFA Regulations PDF (Annex C) | S6 | ✅ **transcribed & shipped** (`src/engine/annex-c.ts`) |
| Strength-model constants | historical calibration run | S3, S1, S8 | ✅ calibrated & applied as defaults |
| Real calibration verdict (beat coin-flip?) | martj42 dataset + rewind harness | S8 | ✅ **passes — 18.6% better than baseline** |
| Live narrative | `ANTHROPIC_API_KEY` + `@anthropic-ai/sdk` | S7 | ✅ **wired live** (`src/narrate/`) |

The engine is a real, test-first `src/` implementation running the **official 2026 tournament**
end-to-end on a live-captured 48-team snapshot: group → tiebreakers → Annex C knockout →
champion & runner-up odds, calibrated model, live data provider, and a Gen-AI narrator.
Remaining nice-to-haves: the Claude strength adapter, and running kickpool's own server
(needs Node ≥20.9).
