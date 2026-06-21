# FIFA World Cup Monte Carlo Sim — Planning-Stage TODO

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done · `[?]` blocked / needs decision

Planning is complete and implementation is well underway — a working, calibrated engine runs
the real 2026 tournament end-to-end (see §6). Remaining items are tracked at the bottom of §6.

## 0. Discovery
- [x] Locate the existing standings source (`kickpool`, Next.js + ESPN `fifa.world` API).
- [x] Confirm reusable inputs: `GroupStanding`, `StandingRow`, `Match`, `Prediction`
      types and the Claude per-match predictor in `kickpool/lib`.
- [x] Confirm the 2026 tournament format we must model (48 teams / 12 groups of 4 /
      32-team knockout incl. 8 best third-placed). → confirmed, [`docs/12-rules-sources.md`](docs/12-rules-sources.md) Q2.
- [x] Confirm FIFA group tiebreaker ordering to implement exactly. → confirmed (H2H-first,
      7-step), [`docs/12-rules-sources.md`](docs/12-rules-sources.md) Q3.
- [x] Extract the exact third-place→bracket-slot allocation table from the FIFA Regulations
      PDF → [`src/engine/annex-c.ts`](src/engine/annex-c.ts) (495 rows, validated; see §6).

## 1. Method selection (decide before building)
- [x] Write method comparison: Monte Carlo vs 2 alternatives — [`docs/01-method-comparison.md`](docs/01-method-comparison.md).
- [x] Evaluate the "too many variables / too much compute" concern explicitly.
- [x] Sign-off: Monte Carlo confirmed — the calibrated engine beats the coin-flip baseline.

## 2. Product definition
- [x] PRFAQ — [`docs/02-prfaq.md`](docs/02-prfaq.md).
- [x] Product Requirements Document — [`docs/03-prd.md`](docs/03-prd.md).

## 3. Quality & verification
- [x] Verification strategy ("how do we know it works") — [`docs/04-verification.md`](docs/04-verification.md).
- [x] Test plan across test levels — [`docs/05-test-plan.md`](docs/05-test-plan.md).

## 4. Technical design
- [x] Architecture — [`docs/06-architecture.md`](docs/06-architecture.md).
- [x] Infrastructure (local vs AWS) — [`docs/07-infrastructure.md`](docs/07-infrastructure.md).
- [x] Visualisation of results — [`docs/08-visualisation.md`](docs/08-visualisation.md).
- [x] Elo/Poisson strength-model deep-dive — [`docs/10-elo-poisson-model.md`](docs/10-elo-poisson-model.md).
- [x] Phase 2 kickpool UI integration plan — [`docs/11-kickpool-integration.md`](docs/11-kickpool-integration.md).
- [x] Rules sources + spike register (Q2/Q3/Q7) — [`docs/12-rules-sources.md`](docs/12-rules-sources.md).
- [x] Run all 8 de-risking spikes; record outcomes — [`docs/13-spike-findings.md`](docs/13-spike-findings.md),
      code in [`spikes/`](spikes/). 40 tests pass, typecheck + gate-ci green.

## 5. Loose ends
- [x] Open questions register — [`docs/09-open-questions.md`](docs/09-open-questions.md).
- [x] Decide the match-outcome model source. → **Elo/Poisson default, kickpool Claude adapter
      optional** (Q1 RESOLVED).
- [x] Decide run target for v1. → **local CLI; AWS = Phase 2** (Q-infra RESOLVED).
- [x] Decide implementation language. → **hybrid: TypeScript engine + Python calibration** (Q4).
- [x] Run the knockout-draw-resolution spike (Q5 / S1). → **adopt two-stage** resolver.
- [x] Transcribe the official FIFA Annex C table → [`src/engine/annex-c.ts`](src/engine/annex-c.ts) (see §6).
- [x] Calibrate strength-model constants via the S8 harness → beats coin-flip by 18.6% (see §6).

## 6. Implementation (started — test-first)
- [x] Engine: standings + FIFA Art. 13 tiebreakers — [`src/engine/standings.ts`](src/engine/standings.ts).
- [x] Strength model: `StrengthModel` interface + `EloPoissonModel` — [`src/model/`](src/model/).
- [x] GroupEngine: complete remaining fixtures + qualifier selection — [`src/engine/group-engine.ts`](src/engine/group-engine.ts).
- [x] Monte Carlo runner + Aggregator (probs + margin of error) — [`src/engine/simulate.ts`](src/engine/simulate.ts).
- [x] Snapshot adapter (kickpool JSON → input) — [`src/io/snapshot.ts`](src/io/snapshot.ts).
- [x] CLI (`npm run sim`) — runs end-to-end, 100k group-stage sims in ~1.3s.
- [x] Acquire historical dataset — `data/results.csv` (martj42, CC0; see [`data/README.md`](data/README.md)).
- [x] KnockoutEngine — two-stage resolver [`knockout.ts`](src/engine/knockout.ts) + the
      **official 2026 bracket** [`bracket-2026.ts`](src/engine/bracket-2026.ts) (§12.6–12.11).
- [x] Transcribe the FIFA **Annex C** 495-scenario table — [`scripts/gen-annex-c.ts`](scripts/gen-annex-c.ts)
      → [`src/engine/annex-c.ts`](src/engine/annex-c.ts) (each row validated against §12.6).
- [x] Full-tournament runner → **champion & runner-up** + final/semi/escape — [`src/engine/tournament.ts`](src/engine/tournament.ts).
- [x] Calibrate strength-model constants on `data/results.csv` — [`src/eval/`](src/eval/).
      base 1.35 / homeAdv 95 / spread 0.8; **beats coin-flip by 18.6%** (M1 gate PASS).
- [x] Live data provider (`/api/standings` + `/api/fixtures`) — [`src/io/kickpool-provider.ts`](src/io/kickpool-provider.ts).
- [x] Real 48-team snapshot + Elo ratings — [`scripts/fetch-wc-snapshot.ts`](scripts/fetch-wc-snapshot.ts),
      [`scripts/build-ratings.ts`](scripts/build-ratings.ts) → [`fixtures/wc2026-*.json`](fixtures/).
- [x] Live Gen-AI narrator (S7) — [`src/narrate/`](src/narrate/) (real Anthropic call + guardrail).
- [x] CLI shows winner + runner-up — `npm run sim -- --snapshot fixtures/wc2026-snapshot.json --ratings fixtures/wc2026-ratings.json`.
- [x] Daily odds tracker — [`scripts/run-daily.ts`](scripts/run-daily.ts) +
      [`.github/workflows/daily-odds.yml`](.github/workflows/daily-odds.yml); captures to
      [`history/`](history/) (per-day JSON + `champion-odds.csv` time-series + daily AI note).
- [x] Reusable data modules (TDD) — ESPN provider [`src/io/espn-provider.ts`](src/io/espn-provider.ts),
      ratings [`src/eval/team-ratings.ts`](src/eval/team-ratings.ts), history [`src/history/record.ts`](src/history/record.ts).
- [x] kickpool display plan — [`docs/11-kickpool-integration.md`](docs/11-kickpool-integration.md) §7.
- [x] Verified live against kickpool's own server (Node 24) via the provider.
- [ ] Set the `ANTHROPIC_API_KEY` repo secret so the daily note works in CI.
- [ ] Condition the sim on knockout results once the bracket is underway (currently
      re-simulates the knockout from qualifiers each run).
- [x] ClaudeAdapterModel — [`src/model/claude-adapter.ts`](src/model/claude-adapter.ts);
      `--model claude --predictions <file>`, Elo/Poisson fallback for unpredicted pairings.
      Satisfies PRD FR13 / G5 (≥2 strength models).

## Exit criteria for the planning stage
1. Method comparison reviewed and Monte Carlo confirmed (or an alternative chosen).
2. PRD scope agreed (what v1 does and explicitly does not do).
3. Match-outcome model source decided (Q1).
4. Run target decided (local vs AWS) for v1.
5. Verification + test plan accepted as the definition of "works".
