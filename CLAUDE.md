# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this project is

A repeatable Monte Carlo simulator that estimates each team's probability of winning the
FIFA World Cup from the **current** standings, re-runnable at any point during the
tournament. See [README.md](README.md) and [docs/README.md](docs/README.md).

## Current state: planning + de-risking spikes

**No production engine exists yet** — the deliverable so far is design documents plus a set
of **throwaway spikes** under [spikes/](spikes/) that de-risk specific assumptions (see
[docs/13-spike-findings.md](docs/13-spike-findings.md)). Per [TODO.md](TODO.md), the real
engine should not be built until the planning artifacts are signed off and the
[open questions](docs/09-open-questions.md) are resolved. The spikes are validation
prototypes, **not** the architecture — do not treat them as the engine or extend them into
one without being asked.

## Where things live

- `docs/` — numbered design documents (`01`–`13`); read order in [docs/README.md](docs/README.md).
- `spikes/` — runnable throwaway spikes (TypeScript); see [spikes/README.md](spikes/README.md).
- `TODO.md` — planning-stage checklist and status.
- Root `README.md` / `CLAUDE.md` — project overview and this file.
- **kickpool** (`../kickpool`, i.e. `/home/timohare/dev/newdev/kickpool`) — the existing
  upstream project this tool consumes data from. A separate Next.js codebase; reuse its
  `GroupStanding` / `Match` / `Prediction` types and the Claude per-match predictor in
  `kickpool/lib`. Do not modify it as part of this project.

## Key domain facts

- **Monte Carlo is a propagation engine, not a predictor.** It samples each unplayed match
  from a pluggable *strength model*, applies FIFA tiebreakers and the knockout bracket, and
  counts trophy wins. The engineering risk lives in **strength-model calibration**, not the
  simulation loop.
- **Three strength models:** Elo/Poisson (offline reference — see
  [docs/10-elo-poisson-model.md](docs/10-elo-poisson-model.md)), a Claude adapter over
  kickpool's **precomputed** predictions, and a coin-flip baseline. An LLM is **never**
  called inside the simulation loop.
- **Input data is consumed, not re-scraped** — group standings and remaining fixtures come
  from the existing **kickpool** project (ESPN `fifa.world` API), reusing its
  `GroupStanding` / `Match` / `Prediction` types.
- **Reproducibility is a hard requirement** — every run uses a seeded RNG so results are
  auditable and identical across runs.

## Working conventions

- Documents use **British English** spelling (e.g. "visualisation", "favourite"), matching
  the existing docs. Keep new prose consistent.
- Docs are numbered with a zero-padded prefix and cross-link with relative Markdown links.
  When adding a doc, register it in [docs/README.md](docs/README.md)'s reading-order table.
- Keep the numbers and the storytelling separate: any narrative/prose is generated **after**
  the probabilities and must not influence them.

## Tooling & quality gates

The spikes use a minimal TypeScript setup (ESM, Node ≥18, no framework):

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest (40 tests across the 8 spikes)
npm run report      # prints the demo findings captured in docs/13-spike-findings.md
```

`.claude/harness.json` binds `lint`/`typecheck` to these npm scripts, so the global
`gate-ci` Stop hook runs them automatically. Keep the suite green. `gate-verify`/`perf` keys
are unset (no bootable app yet); add them when the engine and CLI exist.
