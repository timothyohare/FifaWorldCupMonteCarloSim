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

## 7. Open items specific to Phase 2

- **P2-1.** Sim package distribution: monorepo/workspace with kickpool, a published private
  package, or a git submodule? Decide when Phase 2 starts.
- **P2-2.** Refresh cadence and trigger (manual rerun vs matchday cron) — couples to the
  source option in §4.
- **P2-3.** Navigation/IA: a top-level `Odds` tab vs a panel inside the existing groups view.
  A UX decision for kickpool, deferred until Phase 2 is scheduled.
