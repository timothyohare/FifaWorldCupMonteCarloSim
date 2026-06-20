# Product Requirements Document — World Cup Monte Carlo Simulator

| | |
|---|---|
| **Status** | Draft (planning stage) |
| **Owner** | timohare |
| **Last updated** | 2026-06-20 |
| **Related** | [Method comparison](01-method-comparison.md) · [PRFAQ](02-prfaq.md) · [Architecture](06-architecture.md) · [Open questions](09-open-questions.md) |

## 1. Problem statement

Once a World Cup is underway, "who is the favourite?" stops being obvious. Final placings
depend on remaining group results, exact tiebreakers, and the bracket a team earns. People
currently answer this with gut feel or scattered third-party odds. We want a **repeatable,
reproducible, rule-accurate** way to convert the *current standings* into each team's
probability of winning — re-runnable at any moment in the tournament.

## 2. Goals & non-goals

### Goals (v1)
- G1. From current standings + remaining fixtures, output each team's probability of:
  winning the cup, reaching the final, reaching the semis, advancing from the group.
- G2. Be a **single repeatable command/process** runnable at any tournament state.
- G3. Be **reproducible**: same inputs + same seed ⇒ identical outputs.
- G4. Implement the FIFA rules exactly (tiebreakers, 2026 format, knockout bracket).
- G5. Make the per-match strength model **pluggable**, with ≥2 implementations.
- G6. Report **uncertainty** (Monte Carlo margin of error) alongside each probability.
- G7. Reuse kickpool's standings/fixtures data rather than re-fetching.

### Non-goals (v1)
- NG1. Live, minute-by-minute in-play probabilities.
- NG2. Betting features, odds comparison, or any monetisation.
- NG3. Player-level modelling (injuries, suspensions, lineups).
- NG4. A polished consumer web app (basic results view only).
- NG5. Predicting *which* matches happen / fixture scheduling — taken as given from data.
- NG6. Real-time auto-refresh infrastructure (deferred to a later phase / AWS).

## 3. Users & use cases

| User | Use case |
|------|----------|
| Pool organiser (kickpool host) | "After today's matches, what are the updated title odds for the board?" |
| Fan | "What's my team's realistic chance now, and what do they need?" |
| The developer | "Did my model change improve calibration vs the last version?" |
| (Later) kickpool UI | Embed a 'title odds' widget alongside the existing predictions. |

## 4. Functional requirements

### 4.1 Input
- FR1. Accept current standings as structured data compatible with kickpool's
  `GroupStanding` / `StandingRow` and remaining fixtures as `Match[]`.
- FR2. Support a **fixtures/offline mode** (committed JSON snapshot) for deterministic runs
  and testing — mirroring kickpool's `USE_FIXTURES=1` pattern.
- FR3. Accept run parameters: number of simulations `N`, random `seed`, strength-model
  selection, and output format.
- FR4. Validate inputs (e.g., a group has the right number of teams; played + remaining
  fixtures are consistent) and fail loudly on malformed data.

### 4.2 Simulation engine
- FR5. For each simulation: sample every **remaining group match** from the strength model,
  update standings, and resolve final group order using the **exact FIFA tiebreaker
  sequence**.
- FR6. Determine qualifiers per the **2026 format** (12 group winners + 12 runners-up + 8
  best third-placed) and seed them into the knockout bracket correctly.
- FR7. For each simulation: play the knockout rounds as single elimination, including
  extra-time/penalty resolution for drawn knockout matches.
- FR8. Run `N` independent simulations with a seeded RNG; aggregate outcome counts per team
  per stage.
- FR9. Handle a tournament at **any state**, including: pre-tournament (all matches
  unplayed), mid-group, knockouts-only (group stage complete), and a near-finished bracket.
- FR10. Be deterministic given `(inputs, seed, N, model)`.

### 4.3 Strength model (Layer A — pluggable)
- FR11. Define a strength-model interface: given two teams + context, return
  P(win/draw/loss) and a scoreline sampler (needed for goal-difference tiebreakers).
- FR12. Provide an **Elo/Poisson** reference implementation (transparent, offline, fast).
- FR13. Provide an adapter to reuse **kickpool's Claude per-match predictor**
  (`Prediction.homeWinProbability` etc.) as a model source — precomputed, **never called
  inside the simulation loop**.
- FR14. Provide a **coin-flip / seeding baseline** model for benchmarking.

### 4.4 Output
- FR15. Produce a per-team table: P(win cup), P(final), P(semi), P(advance group), each
  with a Monte Carlo margin of error.
- FR16. Emit machine-readable output (JSON/CSV) and a human-readable summary (CLI table).
- FR17. Record run metadata: timestamp, input snapshot id/hash, seed, N, model, version.
- FR18. Generate a plain-language narrative for the top movers ("why did the odds move"),
  using Gen-AI **outside** the numeric pipeline — produced strictly **after** the
  probabilities, from the `ResultSet`(s), so it can never alter them. In v1 scope (Q11).

## 5. Non-functional requirements
- NFR1. **Performance:** 100,000 simulations of a full remaining tournament complete in
  ≤ 60 s on a typical laptop core (target ~10 s).
- NFR2. **Reproducibility:** byte-identical numeric output for identical
  `(inputs, seed, N, model)`.
- NFR3. **Accuracy/precision:** Monte Carlo standard error on any reported probability
  ≤ 0.3% absolute at the default `N`.
- NFR4. **Testability:** group-stage outputs checkable against an exact analytical oracle
  on small cases (see test plan).
- NFR5. **Portability:** runs offline with no external network call required for a
  simulation run (data is fetched/snapshotted beforehand).
- NFR6. **Observability:** log run metadata and convergence diagnostics.
- NFR7. **Maintainability:** rules (tiebreakers, format) isolated and unit-tested so a
  format change is a localised edit.

## 6. Assumptions & dependencies
- A1. kickpool remains the source of standings/fixtures and its data shapes are stable.
- A2. The 2026 format is as publicly documented (48 teams / 12×4 / 32-team knockout).
  Confirmed against FIFA + ESPN — see [`12-rules-sources.md`](12-rules-sources.md).
- A3. Matches are independent given team strengths (no explicit fatigue/travel modelling in
  v1).
- D1. Reusing the Claude model source depends on kickpool's predictor and (if live) API
  credentials; the offline Elo/Poisson model has no such dependency.
- D2. The v1 **narrative** (FR18) depends on the Anthropic SDK + an API key. This is the only
  network/credential dependency in the default v1 path; it runs at the **output edge after**
  the run, so the simulation core stays fully offline and reproducible (NFR2, NFR5 unaffected).

## 7. Success metrics
- M1. Engine beats the coin-flip baseline on historical-tournament log-loss & calibration
  (hard gate — see verification).
- M2. Reproducibility test passes (identical output for fixed seed) in CI.
- M3. Full-tournament 100k-sim run within the NFR1 time budget.
- M4. Group-stage probabilities match the analytical oracle within Monte Carlo error on the
  test fixtures.

## 8. Milestones (post-planning, indicative)
1. **M0 Skeleton:** data adapters + types + fixtures snapshot from kickpool.
2. **M1 Group engine:** sample group matches, exact tiebreakers, qualifiers. (Oracle-tested.)
3. **M2 Knockout engine:** bracket build + single-elim + shootouts; full-tournament run.
4. **M3 Models:** Elo/Poisson + baseline + Claude adapter; calibration harness.
5. **M4 Output & viz:** JSON/CSV + CLI table + basic results view.
6. **M5 Hardening + narrative:** perf, reproducibility, CI gates, and the Gen-AI narrative
   (FR18, now in v1 scope — Q11).

## 9. Open questions
Tracked in [`09-open-questions.md`](09-open-questions.md). The blocking ones for build
start are: the default strength-model source (Q1) and the v1 run target (local vs AWS, Q-infra).
