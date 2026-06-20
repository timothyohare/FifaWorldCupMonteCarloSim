# Test Plan — World Cup Monte Carlo Simulator

This plan organises testing by **level**, from the smallest deterministic unit to a full
acceptance run. It implements the three verification claims (C1 mechanical, C2 statistical,
C3 predictive) from [`04-verification.md`](04-verification.md). A guiding principle: push
as much as possible into **deterministic** tests, and quarantine the inherently
**stochastic** checks into their own level with fixed seeds and explicit tolerances so they
don't become flaky.

```
        ┌───────────────────────────────────────────────┐  few, slow, high-value
        │ L6 Acceptance / backtest (calibration vs hist) │
        ├───────────────────────────────────────────────┤
        │ L5 End-to-end (CLI: data → odds, fixtures)     │
        ├───────────────────────────────────────────────┤
        │ L4 Statistical / property (seeded, tolerances) │
        ├───────────────────────────────────────────────┤
        │ L3 Integration (engine + model + data adapter) │
        ├───────────────────────────────────────────────┤
        │ L2 Component (group engine, knockout engine)   │
        ├───────────────────────────────────────────────┤
        │ L1 Unit (tiebreakers, RNG, sampler, parsing)   │  many, fast, deterministic
        └───────────────────────────────────────────────┘
```

---

## L1 — Unit tests (deterministic, fast, run on every change)

Pure functions, no randomness (or fully controlled RNG).

| Area | Representative tests |
|------|----------------------|
| Tiebreakers | Each FIFA key decides ordering in isolation (points, GD, GF, head-to-head, fair-play, lots); ties cascade correctly to the next key; full ordering on crafted tables. |
| Standings update | Applying a result updates P/W/D/L/GF/GA/GD/Pts correctly; idempotency of re-deriving a table from match list. |
| Match sampler | Given fixed RNG values, the sampler maps to the intended outcome and scoreline; probabilities normalise; degenerate (1.0/0.0) cases. |
| RNG | Seeded generator is deterministic and platform-stable; independent streams don't correlate. |
| Input parsing/validation | Maps kickpool `GroupStanding`/`Match` shapes correctly; rejects malformed groups (wrong team count, inconsistent played/remaining). |
| Bracket mapping | Group results → correct knockout slot seeding for the 2026 format. |
| Strength-model interface | Each model returns normalised P(win/draw/loss) and a valid scoreline sampler; baseline returns ~50/50. |

**Tooling:** mirror kickpool's stack where the implementation language allows (Vitest if
TS/JS). Target high line coverage on the rules modules specifically.

## L2 — Component tests (one engine in isolation)

- **Group engine:** feed a fixed group + a deterministic (degenerate) model; assert exact
  qualifiers and ordering. Then feed a probabilistic model with a fixed seed and assert the
  output matches the **analytical oracle** within Monte Carlo error.
- **Knockout engine:** feed a fixed 32-team bracket + degenerate model; assert the
  deterministic champion. With a guaranteed-draw model, assert every match reaches the
  shootout resolver and the resolver's win split matches its configured probability over
  many seeds.
- **Aggregator:** given canned per-simulation results, assert per-team/per-stage counts and
  margin-of-error computation are correct.

## L3 — Integration tests (engine + model + data adapter together)

- Real kickpool **fixture snapshot** in → full pipeline → output, asserting structure,
  metadata (seed, N, snapshot hash, model, version), and that all invariants hold.
- Each pluggable model wired end-to-end: Elo/Poisson, coin-flip baseline, and the **Claude
  adapter using a stubbed/recorded predictor** (no live API in tests — precomputed
  probabilities, matching the "never call the LLM in the loop" rule).
- Offline guarantee: a simulation run performs **zero network calls** (assert via a
  network-blocking test harness).

## L4 — Statistical / property tests (seeded, tolerance-based)

The stochastic heart — isolated so flakiness is controlled by fixed seeds + stated
tolerances.

- **Invariants (every run):** Σ P(win cup)=1; nested ordering P(win)≤P(final)≤P(semi)≤
  P(advance); correct survivor counts each round.
- **Convergence:** margin of error scales ~`1/√N` across N ∈ {1k,10k,100k}; a team's
  estimate stabilises within reported error at default N.
- **Oracle agreement:** group-stage probabilities match the analytical computation within
  k·(Monte Carlo σ) on fixture groups.
- **Metamorphic / property tests:** improving a team's strength never decreases its title
  probability (monotonicity); swapping two symmetric teams swaps their probabilities;
  adding a guaranteed win for a team weakly increases its odds.
- **Seed stability:** two seeds agree within ~3σ for all non-trivial teams.

## L5 — End-to-end tests (the actual user command)

- Run the shipped CLI against a committed fixture exactly as a user would
  (`run --fixtures snapshot.json --seed 42 --sims 100000 --model elo`); assert exit code,
  output files (JSON/CSV), and a stable golden snapshot of the rendered table.
- Boundary tournament states (pre-tournament, group-complete, one-match-left, finished)
  produce the sane outputs specified in the verification doc.
- Reproducibility E2E: identical command run twice ⇒ byte-identical numeric output.
- (If a results view ships) a smoke test that it renders the produced JSON without error.

## L6 — Acceptance / backtest (the "is it useful" gate)

- The **historical backtest** from C3: rewind completed World Cups to several decision
  points, predict, and score **log-loss + calibration** vs the **coin-flip baseline**.
- **Pass condition (hard gate):** default model beats baseline on log-loss and meets the
  calibration tolerance. This is the project's go/no-go.
- Comparative report: Elo/Poisson vs Claude adapter on the same protocol; record the winner
  as the default.
- Heavy + slower ⇒ on-demand (like kickpool's perf gate), output written to a tracked
  report, not part of the fast Stop-hook gate.

---

## Test data strategy
- **Golden fixtures:** committed standings/fixtures snapshots from kickpool (offline,
  deterministic) — reuse the `USE_FIXTURES` pattern.
- **Synthetic crafted cases:** hand-built groups/brackets for L1/L2 oracles where the
  correct answer is known by construction.
- **Historical dataset:** completed tournaments with intermediate standings for L6.
- **Stubbed model outputs:** recorded per-match probabilities for the Claude adapter so
  tests never hit the network or vary.

## Environments & gating
- **L1–L5** are deterministic/seeded and offline ⇒ run in CI on every change; wire into the
  harness Stop-hook gate (`gate-ci`) after onboarding (`.claude/harness.json`).
- **L4** uses fixed seeds + explicit tolerances to stay non-flaky in CI.
- **L6** runs on demand and on model changes; gates releases, not every commit.
- **Performance** (NFR1: 100k sims ≤ 60s) measured by a dedicated timed test, optionally via
  the harness perf gate against a committed baseline.

## Exit criteria
1. L1–L3 green and deterministic.
2. L4 invariants + oracle agreement + monotonicity hold at default N.
3. L5 reproducibility and golden-output tests green; all boundary states sane.
4. L6 default model beats the coin-flip baseline and is acceptably calibrated.
