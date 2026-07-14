# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this project is

A repeatable Monte Carlo simulator that estimates each team's probability of winning the
FIFA World Cup from the **current** standings, re-runnable at any point during the
tournament. See [README.md](README.md) and [docs/README.md](docs/README.md).

## Current state: working end-to-end on the real 2026 tournament, test-first

A real TypeScript engine in [src/](src/) runs the full tournament — group stage → FIFA
tiebreakers → qualifiers → the **official 2026 knockout bracket** (§12.6–12.11 + the
transcribed **Annex C** 495-scenario table) → **champion & runner-up odds** — via a CLI
(`npm run sim`). Calibrated on historical data (beats coin-flip ~18%), runs on a real
48-team snapshot, with a live Gen-AI narrator. Test-first; 96 tests; `gate-ci` green.

- `src/domain/` types+RNG · `src/model/` strength model · `src/engine/` rules + 2026 bracket
  (`bracket-2026.ts` + generated `annex-c.ts`) + runners · `src/eval/` calibration ·
  `src/io/` snapshot adapter + live `kickpool-provider.ts` · `src/narrate/` Gen-AI narrator ·
  `src/cli.ts`. `scripts/` holds data-capture + the Annex C generator (re-run, don't hand-edit
  `annex-c.ts`).
- [spikes/](spikes/) are the earlier **throwaway** prototypes; the engine has superseded them.
  Don't extend a spike when the `src/` equivalent exists.
- **Node note:** kickpool's Next 16 server needs Node ≥20.9. The default *non-interactive*
  shell here is Node 18.19, but Node 24 is available at
  `~/.nvm/versions/node/v24.15.0/bin/node` — prefix PATH with it to run kickpool. The live
  path has been exercised: `scripts/fetch-from-kickpool.ts` captures via `kickpool-provider.ts`
  against a running kickpool; `scripts/fetch-wc-snapshot.ts` is the direct-ESPN fallback.
- kickpool tags every fixture `GROUP_STAGE` and includes knockout placeholders (`2A`, `W73`),
  so `fromKickpoolSnapshot` selects group matches by **team membership**, not the stage label.

## Where things live

- `src/` — the engine (domain, model, engine, eval, io, cli). Test-first; the real codebase.
- `docs/` — numbered design documents (`01`–`13`); read order in [docs/README.md](docs/README.md).
- `spikes/` — runnable throwaway spikes (TypeScript); see [spikes/README.md](spikes/README.md).
- `data/` — external datasets (gitignored CSVs); provenance in [data/README.md](data/README.md).
- `fixtures/` — committed snapshots + ratings (`wc2026-*` = the real tournament).
- `history/` — daily odds captures (`<date>.json`, `champion-odds.csv`, `latest.json`),
  written by `scripts/run-daily.ts` via the `.github/workflows/daily-odds.yml` cron
  (runs until the final on 2026-07-19; disable with `gh workflow disable` after), plus
  `forecast-vs-reality.md` — the post-tournament verification report from
  `npm run report:forecast` (`src/eval/forecast-report.ts`), which scores every capture
  against realised outcomes (`fixtures/wc2026-outcomes.json` + the final snapshot).
  Update the outcomes fixture after the final and re-run to settle the champion market.
- `TODO.md` — checklist and status.
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
npm test            # vitest (engine + spikes)
npm run sim -- --snapshot fixtures/sample-snapshot.json --ratings fixtures/sample-ratings.json --best-thirds 0
npx tsx src/eval/calibrate.ts   # re-run the calibration backtest (needs data/results.csv)
npm run report      # prints the spike demo findings
```

`.claude/harness.json` binds `lint`/`typecheck` to these npm scripts (and the harness
auto-detects `test: npm test`), so the global `gate-ci` Stop hook runs lint + typecheck + the
full suite automatically. Keep it green.

An **end-to-end acceptance test** ([src/acceptance.test.ts](src/acceptance.test.ts),
`npm run test:acceptance`) runs the whole pipeline on the committed real snapshot and spawns
the actual CLI — it's part of `npm test`, so `gate-ci` enforces the boot-and-verify role for
this CLI. `gate-verify`/`gate-perf` proper stay unset: they require a bootable HTTP server,
which this CLI/library doesn't have.
