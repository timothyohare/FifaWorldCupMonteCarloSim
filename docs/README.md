# FIFA World Cup Monte Carlo Simulation — Planning Docs

A repeatable process that estimates each team's probability of winning the FIFA World
Cup from the **current standings**, re-runnable at any point during the tournament.

These documents define *what* we are building and *why*, before any production code is
written. Input data (group tables + remaining fixtures) comes from the existing
**kickpool** project, which already retrieves live standings from the ESPN
`fifa.world` API.

## Reading order

| # | Document | Purpose |
|---|----------|---------|
| 1 | [01-method-comparison.md](01-method-comparison.md) | Is Monte Carlo the right method? Compared against direct analytical computation and Generative-AI prediction, with a coin-flip baseline. **Compute/variable feasibility analysis.** |
| 2 | [02-prfaq.md](02-prfaq.md) | Amazon-style Press Release + FAQ. |
| 3 | [03-prd.md](03-prd.md) | Product Requirements Document. |
| 4 | [04-verification.md](04-verification.md) | How we will know it actually works (correctness + calibration). |
| 5 | [05-test-plan.md](05-test-plan.md) | Test plan across unit / integration / statistical / E2E / acceptance levels. |
| 6 | [06-architecture.md](06-architecture.md) | Proposed software architecture. |
| 7 | [07-infrastructure.md](07-infrastructure.md) | Local machine vs AWS — recommendation. |
| 8 | [08-visualisation.md](08-visualisation.md) | How results are presented. |
| 9 | [09-open-questions.md](09-open-questions.md) | Remaining decisions and unknowns. |
| 10 | [10-elo-poisson-model.md](10-elo-poisson-model.md) | Deep-dive on the reference Elo/Poisson per-match strength model. |
| 11 | [11-kickpool-integration.md](11-kickpool-integration.md) | Phase 2 plan: embedding the title-odds view inside kickpool's UI. |
| 12 | [12-rules-sources.md](12-rules-sources.md) | Authoritative sources for 2026 format/tiebreakers + backtest data, and the spike register. |
| 13 | [13-spike-findings.md](13-spike-findings.md) | Outcomes of the eight de-risking spikes (runnable code in `../spikes/`). |

The planning checklist lives in [`../TODO.md`](../TODO.md).

## One-paragraph summary

Monte Carlo is the recommended method. It is **not** a prediction model in itself — it
is a propagation engine that plays out the remainder of the tournament thousands of
times, sampling each unplayed match from a per-match outcome model, applying FIFA
tiebreakers and the knockout bracket, and counting how often each team lifts the
trophy. The compute concern is unfounded: the full remaining tournament is ~100 matches,
and 100,000 simulations run in seconds-to-low-minutes on a laptop. The real engineering
risk is the **quality and calibration of the per-match model** (the input), not the
Monte Carlo machinery — which is exactly why the alternatives (a single deterministic
analytical computation, or a one-shot Generative-AI prediction) are weaker: they hide
that uncertainty instead of quantifying it.
