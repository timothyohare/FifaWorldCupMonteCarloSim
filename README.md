# FIFA World Cup Monte Carlo Simulator

A repeatable tool that reads the **current** World Cup standings and estimates, for every
team still in the tournament, the probability that they win the whole thing — by replaying
the rest of the tournament tens of thousands of times under FIFA's real rules and counting
how often each team lifts the trophy.

> **Status: working end-to-end on the real 2026 tournament.** A test-first TypeScript engine
> runs the full tournament — group stage → FIFA tiebreakers → qualifiers → the **official 2026
> knockout bracket** (Regulations §12.6–12.11 + the transcribed **Annex C** 495-scenario
> third-place table) → **champion & runner-up odds**. The strength model is **calibrated** on
> 49k historical internationals (beats coin-flip by ~18%). It runs on a **real 48-team
> snapshot** pulled from live data, and a post-run **Gen-AI narrator** explains the movers.
> Latest run (current standings): Argentina ~20% to win, Spain ~14%, France ~11%.

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

## Running it

```bash
npm install
npm test                       # 96 tests (engine + eval + io + narrate + spikes)
npm run typecheck

# Title odds for the REAL 2026 tournament (committed snapshot + Elo ratings):
npm run sim -- --snapshot fixtures/wc2026-snapshot.json --ratings fixtures/wc2026-ratings.json

# Refresh from a running kickpool instance (the live provider path; needs Node >=20.9):
npx tsx scripts/fetch-from-kickpool.ts http://localhost:3000   # via KickpoolApiProvider
#   …or pull the same upstream directly when kickpool isn't running:
npx tsx scripts/fetch-wc-snapshot.ts   # live ESPN fifa.world → fixtures/wc2026-snapshot.json
npx tsx scripts/build-ratings.ts       # Elo from data/results.csv → fixtures/wc2026-ratings.json

# Explain how the odds moved (post-run Gen-AI narrator, needs ANTHROPIC_API_KEY in .env):
npx tsx scripts/narrate-demo.ts

# Re-calibrate the Elo→Poisson constants against history (needs data/results.csv):
npx tsx src/eval/calibrate.ts

# Re-transcribe Annex C from the FIFA Regulations PDF:
npx tsx scripts/gen-annex-c.ts
```

Live data (a running kickpool on Node ≥20) flows in via `src/io/kickpool-provider.ts`
(`fetchTournamentInput`). Offline, the committed `fixtures/wc2026-*.json` reproduce the run.

The simulator is reproducible: identical `(snapshot, ratings, seed, sims)` ⇒ identical odds.

### `src/` layout

| Path | Role |
|------|------|
| [src/domain/](src/domain/) | Core types + deterministic RNG |
| [src/model/](src/model/) | `StrengthModel` seam + calibrated `EloPoissonModel` + `ClaudeAdapterModel` (`--model claude`) |
| [src/engine/](src/engine/) | standings/tiebreakers, group engine, **2026 bracket (Annex C)**, full-tournament runner |
| [src/eval/](src/eval/) | Elo ratings, backtest, calibration (the C3 gate) |
| [src/io/](src/io/) | kickpool snapshot adapter + **live API provider** |
| [src/narrate/](src/narrate/) | post-run Gen-AI narrator + guardrail |
| [src/cli.ts](src/cli.ts) | command-line entry point |
| [scripts/](scripts/) | data capture (snapshot, ratings), Annex C generator, narrator demo |

## Daily odds tracker

A GitHub Actions workflow ([.github/workflows/daily-odds.yml](.github/workflows/daily-odds.yml))
runs once a day (07:00 UTC) and commits the result to [history/](history/), so you can watch
the odds move as the tournament unfolds. Each run ([scripts/run-daily.ts](scripts/run-daily.ts)):

1. refreshes the historical results dataset and **recomputes Elo** (ratings evolve with the
   tournament),
2. pulls the live ESPN snapshot and runs 100k simulations,
3. writes `history/<date>.json` (full per-team odds + run metadata + snapshot hash),
4. appends to `history/champion-odds.csv` (long-format time-series for plotting), and
5. if `ANTHROPIC_API_KEY` is set, adds a one-paragraph **"what changed since yesterday"** note.

Run it locally for a given day with `npx tsx scripts/run-daily.ts 2026-06-21`. The job needs
an `ANTHROPIC_API_KEY` repo secret for the daily note (it's skipped gracefully without one).

Trigger the hosted run on demand (instead of waiting for 07:00 UTC) with:

```bash
gh workflow run daily-odds.yml
```

### Seeing the daily odds

The numbers are committed back to [history/](history/), so just read them from the repo:

- **Latest snapshot** — [`history/latest.json`](history/latest.json) (or the dated
  `history/<date>.json`): full per-team odds + run metadata.
- **Time-series across days** — [`history/champion-odds.csv`](history/champion-odds.csv):
  long-format (`date,team,…`), ready to plot how each team's odds move over the tournament.
- After a manual trigger, watch progress with `gh run watch` (or `gh run list --workflow daily-odds.yml`);
  once it finishes, `git pull` to get the new `history/` files.

> Note: the simulation **conditions on results already played** at both stages — completed group
> matches fix the standings, and a knockout tie that has been played pins that result instead of
> being re-simulated (the rest of the bracket still plays out). See
> [docs/11-kickpool-integration.md](docs/11-kickpool-integration.md) for the plan to surface this
> history inside kickpool.

### Knockout stage & elimination

- **Knockout conditioning** — once the bracket is underway, played ties are read from the snapshot
  (cross-group FINAL results → `TournamentInput.knockout`) and pinned by team pair, so the odds
  reflect who has actually gone through. Only the matches still to come are simulated.
- **Eliminated teams** — the CLI flags every side that is *mathematically* out of the running for
  the last 32 (`✗ out`), computed independently of the Monte Carlo by
  [src/engine/elimination.ts](src/engine/elimination.ts): a sound, points-only check that never
  flags a team with a surviving path. (Teams that can still finish 3rd but realistically won't
  qualify simply show ~0.0% escape in the table.)

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
