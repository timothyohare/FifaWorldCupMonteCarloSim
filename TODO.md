# FIFA World Cup Monte Carlo Sim — Planning-Stage TODO

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done · `[?]` blocked / needs decision

This TODO covers the **planning stage only**. No production code is written until the
planning artifacts below are reviewed and the open questions in
[`docs/09-open-questions.md`](docs/09-open-questions.md) are resolved.

## 0. Discovery
- [x] Locate the existing standings source (`kickpool`, Next.js + ESPN `fifa.world` API).
- [x] Confirm reusable inputs: `GroupStanding`, `StandingRow`, `Match`, `Prediction`
      types and the Claude per-match predictor in `kickpool/lib`.
- [x] Confirm the 2026 tournament format we must model (48 teams / 12 groups of 4 /
      32-team knockout incl. 8 best third-placed). → confirmed, [`docs/12-rules-sources.md`](docs/12-rules-sources.md) Q2.
- [x] Confirm FIFA group tiebreaker ordering to implement exactly. → confirmed (H2H-first,
      7-step), [`docs/12-rules-sources.md`](docs/12-rules-sources.md) Q3.
- [ ] Extract the exact third-place→bracket-slot allocation table from the FIFA Regulations
      PDF and commit it as a fixture (spike S6).

## 1. Method selection (decide before building)
- [x] Write method comparison: Monte Carlo vs 2 alternatives — [`docs/01-method-comparison.md`](docs/01-method-comparison.md).
- [x] Evaluate the "too many variables / too much compute" concern explicitly.
- [ ] Sign-off: confirm Monte Carlo is the chosen method (recommendation: **yes**).

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
- [ ] Transcribe the official FIFA third-place→R32 Annex table into the S6 mechanism (only
      remaining hard data gap before `KnockoutEngine` is trustworthy).
- [ ] Calibrate strength-model constants on historical data via the S8 harness (Elo→λ,
      shootout tilt) and confirm the engine beats the coin-flip baseline (the C3 gate).

## 6. Implementation (started — test-first)
- [x] Engine: standings + FIFA Art. 13 tiebreakers — [`src/engine/standings.ts`](src/engine/standings.ts).
- [x] Strength model: `StrengthModel` interface + `EloPoissonModel` — [`src/model/`](src/model/).
- [x] GroupEngine: complete remaining fixtures + qualifier selection — [`src/engine/group-engine.ts`](src/engine/group-engine.ts).
- [x] Monte Carlo runner + Aggregator (probs + margin of error) — [`src/engine/simulate.ts`](src/engine/simulate.ts).
- [x] Snapshot adapter (kickpool JSON → input) — [`src/io/snapshot.ts`](src/io/snapshot.ts).
- [x] CLI (`npm run sim`) — runs end-to-end, 100k group-stage sims in ~1.3s.
- [x] Acquire historical dataset — `data/results.csv` (martj42, CC0; see [`data/README.md`](data/README.md)).
- [ ] KnockoutEngine — blocked on the FIFA 495-scenario Annex table (winners A,C,D,E,G,I,K,L
      face thirds; values pending the regulations PDF).
- [ ] Calibrate strength-model constants on `data/results.csv` via the S8 harness.
- [ ] Wire the live Gen-AI narrator (S7) — key now available.
- [ ] Promote remaining spikes (S6 mechanism, S8 harness) into `src/` as they unblock.

## Exit criteria for the planning stage
1. Method comparison reviewed and Monte Carlo confirmed (or an alternative chosen).
2. PRD scope agreed (what v1 does and explicitly does not do).
3. Match-outcome model source decided (Q1).
4. Run target decided (local vs AWS) for v1.
5. Verification + test plan accepted as the definition of "works".
