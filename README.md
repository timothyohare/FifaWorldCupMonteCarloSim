# FIFA World Cup Monte Carlo Simulator

A repeatable tool that reads the **current** World Cup standings and estimates, for every
team still in the tournament, the probability that they win the whole thing — by replaying
the rest of the tournament tens of thousands of times under FIFA's real rules and counting
how often each team lifts the trophy.

> **Status: planning stage.** This repository currently contains design documents only. No
> production code has been written yet. The plan is to lock the design (and resolve the
> [open questions](docs/09-open-questions.md)) before implementation begins.

## What it does

- Pulls the latest group tables and remaining fixtures (consumed from the existing
  **kickpool** project, which sources them from the ESPN `fifa.world` API).
- Plays out every unplayed match using a pluggable **strength model**, applies FIFA's exact
  group tiebreakers, builds the knockout bracket, and runs penalties.
- Repeats ~100,000 times with a **seeded, reproducible** RNG (~10s on a laptop).
- Outputs an ordered board of per-stage probabilities (win cup / reach final / escape group)
  with margins of error.

## How it works

Monte Carlo is a **propagation engine**, not a prediction model itself. It samples each
match from a per-match *strength model* and counts outcomes. Three interchangeable strength
models are planned:

- **Elo/Poisson** — transparent, offline reference model. See
  [docs/10-elo-poisson-model.md](docs/10-elo-poisson-model.md).
- **Claude adapter** — reuses kickpool's precomputed per-match predictions (never called
  inside the simulation loop).
- **Baseline** — coin-flip / seed-weighted benchmark for calibration.

The real engineering risk is the **calibration of the strength model**, not the simulation
machinery — which is why verification centres on calibration and log-loss against a
coin-flip baseline.

## Documentation

All design docs live in [`docs/`](docs/) with a recommended reading order in
[docs/README.md](docs/README.md):

| # | Document | Purpose |
|---|----------|---------|
| 1 | [method-comparison](docs/01-method-comparison.md) | Why Monte Carlo over analytics or one-shot AI. |
| 2 | [prfaq](docs/02-prfaq.md) | Press release + FAQ. |
| 3 | [prd](docs/03-prd.md) | Product requirements. |
| 4 | [verification](docs/04-verification.md) | How we know it works (correctness + calibration). |
| 5 | [test-plan](docs/05-test-plan.md) | Tests across all levels. |
| 6 | [architecture](docs/06-architecture.md) | Software architecture. |
| 7 | [infrastructure](docs/07-infrastructure.md) | Local vs AWS. |
| 8 | [visualisation](docs/08-visualisation.md) | How results are presented. |
| 9 | [open-questions](docs/09-open-questions.md) | Remaining decisions. |
| 10 | [elo-poisson-model](docs/10-elo-poisson-model.md) | The reference strength model, in depth. |

The planning checklist is in [TODO.md](TODO.md).

## Relationship to kickpool

Separate tool, shared data. kickpool answers *"how are my friends' teams doing?"*; this
answers *"what are the title odds?"*. v1 is a standalone CLI/library that **consumes**
kickpool data; a later phase could surface the odds inside kickpool's UI.
