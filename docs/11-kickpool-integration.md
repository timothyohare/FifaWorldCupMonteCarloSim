# Phase 2 — Embedding Title Odds in kickpool

*Forward plan, not a v1 commitment. v1 ships as a standalone CLI/library
([`03-prd.md`](03-prd.md), [`07-infrastructure.md`](07-infrastructure.md)). This document
records how a **Phase 2** "title odds" surface inside kickpool's UI would work, so v1's
design choices keep that door open without paying for it now.*

This resolves the long-term half of **Q12** in
[`09-open-questions.md`](09-open-questions.md): *standalone for v1, embeddable later.*

---

## 1. Goal

Show kickpool users each remaining team's **probability of winning the World Cup** (and of
reaching the final / escaping the group) alongside the predictions they already see —
*"Brazil: 14.2% to win the cup"* — refreshed after each matchday. kickpool answers *"how are
my friends' teams doing?"*; this adds *"and who is actually favourite?"*.

## 2. Design rule that makes Phase 2 cheap

The **`ResultSet` JSON is the only contract.** The simulation core already emits a
per-team, per-stage `ResultSet` with confidence intervals and run metadata
([`06-architecture.md`](06-architecture.md) §3, §7: *"new output = new consumer of the same
`ResultSet` JSON"*). Phase 2 is therefore **a new consumer of an existing artifact**, not a
change to the engine. v1's only obligation is to keep `ResultSet` a stable, versioned,
self-describing JSON shape.

## 3. Where it lands in kickpool

kickpool is Next.js 16 (app router). Concretely:

| Piece | Location (proposed) | Notes |
|-------|---------------------|-------|
| Route / page | `kickpool/app/odds/page.tsx` | Sits beside existing `groups`, `leaderboard`, `my-teams`, `predictions`. |
| Components | `kickpool/components/odds/` | Hero title-odds bar chart + stage-progression bars (Tier 1 of [`08-visualisation.md`](08-visualisation.md)). |
| Data access | `kickpool/app/api/odds/route.ts` | Serves the latest `ResultSet` to the page; one of the source options in §4. |
| Shared types | `kickpool/lib/...` | `ResultSet` type lives with the sim and is imported (mirrors how the sim imports kickpool's `GroupStanding` / `Match` / `Prediction`). |

Reuse kickpool's existing design system — team colours/logos, the "friends" palette — so the
two tools feel like one product ([`08-visualisation.md`](08-visualisation.md) §2).

## 4. How the numbers get there (three options, increasing effort)

- **(A) Published JSON artifact (simplest).** A scheduled/manual sim run writes
  `result-set.json` to a known location (committed, or pushed to S3); kickpool's `/api/odds`
  reads it. No sim code runs inside kickpool. Matches the v1 snapshot discipline and stays
  reproducible. **Recommended starting point.**
- **(B) Sim as a library, called from a kickpool API route.** Because both are TypeScript,
  kickpool imports the sim package and runs it server-side on demand / via a cached route.
  100k sims is well within a serverless timeout, but keep it **off the request hot path**
  (cache + revalidate), never per page view.
- **(C) AWS-hosted endpoint.** The deferred AWS design in
  [`07-infrastructure.md`](07-infrastructure.md) §4–5 (Lambda + EventBridge cron +
  DynamoDB/S3) recomputes after each matchday; kickpool's widget reads the stored result.
  This is the full auto-refresh story and the natural home for **Tier 2** trend charts
  (odds-over-time), which need stored history.

Start at (A), graduate to (C) only when scheduled auto-refresh is actually wanted.

## 5. What v1 must do now to not block Phase 2

Cheap insurance to bake into v1:

1. **Stable `ResultSet` schema** — versioned (`schemaVersion`), with team identifiers that
   match kickpool's (`GroupStanding`/`Match` team refs), so a widget can join without a
   mapping table.
2. **Decouple compute from render** — already a principle ([`06-architecture.md`](06-architecture.md)
   §1); the engine never assumes a CLI consumer.
3. **Publishable artifact path** — make "write `ResultSet` JSON to a file/URL" a first-class
   output mode, not just stdout.
4. **Package boundary** — structure the engine so it can be imported as a library (option B),
   not only invoked as a CLI.

None of these add v1 scope beyond good hygiene; they just avoid a rewrite later.

## 6. Out of scope for Phase 2 (initial cut)

- In-play, minute-by-minute live odds (still a v1/v2 non-goal in [`03-prd.md`](03-prd.md)).
- Per-user personalisation of the odds view (e.g. "my friends' teams only") — a possible
  Phase 3 once the basic widget lands.
- Writing odds back into kickpool's prediction/scoring logic; this is a **read-only display**
  surface.

## 7. Display plan (concrete — now that daily history exists)

The daily tracker ([`../scripts/run-daily.ts`](../scripts/run-daily.ts) +
[`daily-odds.yml`](../.github/workflows/daily-odds.yml)) already produces exactly the
artifacts a kickpool view needs, committed to [`../history/`](../history/):

- `history/latest.json` — today's full per-team odds (champion / runner-up / final / semi /
  escape + margins of error) and the "what changed" narrative.
- `history/<date>.json` — the same, per day (the archive).
- `history/champion-odds.csv` — long-format time-series (`date,team,group,champion,…`) — the
  spine of the "odds over time" chart.

### 7.1 Data flow into kickpool

These files live in this repo, refreshed daily by Actions. Three ways kickpool can read them,
cheapest first:

- **(A) Fetch the committed raw files** from this repo (raw GitHub URL or a tiny
  `kickpool/app/api/odds/route.ts` that proxies + caches them). Zero coupling, no sim code in
  kickpool, updates automatically when the cron commits. **Recommended start.**
- **(B) Vendor at build time** — a kickpool build step copies `history/` in (or a git
  submodule). Simple, but a stale build = stale odds.
- **(C) Shared store** — the cron also writes to S3/KV that kickpool reads. Only worth it if
  kickpool moves off committed files (ties into option C of §4).

### 7.2 The `/odds` page (three panels)

| Panel | Source | What it shows |
|-------|--------|---------------|
| **Title-odds board** (hero) | `latest.json` | Ranked horizontal bars: each team's champion % with its margin-of-error whisker; team colours/logos from kickpool. The headline "who's favourite". |
| **Odds over time** | `champion-odds.csv` | Multi-line chart of champion % per day — "watch the favourite emerge". Default to the top ~8 teams + a picker; this is the payoff of capturing daily history. |
| **Stage breakdown** (per team) | `latest.json` | On row click/expand: champion / final / semi / escape-group bars for that team — the *shape* of its run, not just the trophy number. |

Plus a small **"what changed today"** card rendered from `latest.json.narrative`, and a
`generatedAt` / `snapshotHash` footnote so the numbers are auditable.

### 7.3 kickpool-side pieces

- Route: `kickpool/app/odds/page.tsx` (server component; reads via the §7.1 source).
- Components: `kickpool/components/odds/` — `TitleOddsBoard`, `OddsOverTime`, `StageBreakdown`,
  `WhatChangedCard`. Reuse kickpool's existing chart stack + the "friends" palette.
- Join key: `team` is the ESPN abbreviation, identical to kickpool's `TeamRef.abbr` — no
  mapping table needed (the design rule in §2/§5 paying off).
- Nav: add an **Odds** tab beside `groups` / `leaderboard` / `predictions` (P2-3).

### 7.4 Suggested build order

1. `/api/odds` proxy + the **Title-odds board** from `latest.json` (smallest useful slice).
2. **Odds over time** line chart from `champion-odds.csv`.
3. **Stage breakdown** expansion + the **what-changed** card.
4. Personalisation ("my friends' teams") — Phase 3.

A spike's worth of work for panel 1; the data contract is already stable and live.

## 8. Open items specific to Phase 2

- **P2-1.** Sim package distribution: monorepo/workspace with kickpool, a published private
  package, or a git submodule? Decide when Phase 2 starts.
- **P2-2.** Refresh cadence and trigger (manual rerun vs matchday cron) — couples to the
  source option in §4.
- **P2-3.** Navigation/IA: a top-level `Odds` tab vs a panel inside the existing groups view.
  A UX decision for kickpool, deferred until Phase 2 is scheduled.
