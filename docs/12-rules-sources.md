# Rules Sources & Spike Register (Q2 / Q3 / Q5 / Q7)

*Consolidates the authoritative sources needed to unblock the rule engine and the
calibration backtest, plus the spikes recommended before/while building. Research current as
of **2026-06-20**; the FIFA regulations PDF is the source of record — secondary sites are
corroboration only.*

Resolves the "pointers/sources" action from [`09-open-questions.md`](09-open-questions.md).

---

## Q2 — 2026 tournament format & bracket mapping

**Confirmed facts (corroborated by FIFA + ESPN):**
- **48 teams, 12 groups of 4, 104 matches** total.
- **32 advance:** 12 group winners + 12 runners-up + **8 best third-placed** teams.
- Knockout is **Round of 32 → R16 → QF → SF → Final**, single elimination.
- Third-placed teams' bracket slots are assigned by a **pre-set allocation table**
  (historically FIFA's *"Annex C"*-style table) keyed on *which groups* the eight
  third-placed qualifiers came from — not a free draw. This is what `KnockoutEngine` must
  encode as data.

**Source of record:** the official **FIFA 2026 Regulations** PDF (format + the third-place
allocation table) — download from fifa.com and commit the relevant table into the repo as a
fixture so the bracket mapping is auditable.
**Corroboration:** [FIFA — groups, qualification & tie-breakers](https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/articles/groups-how-teams-qualify-tie-breakers) ·
[ESPN — format, tiebreakers, schedule](https://www.espn.com/soccer/story/_/id/47108758/2026-fifa-world-cup-format-tiebreakers-fixtures-schedule) ·
[Al Jazeera — explained in maps & charts](https://www.aljazeera.com/sports/2026/6/10/fifa-world-cup-2026-explained-in-maps-and-charts).

> **Open item:** obtain the exact third-place→slot table from the regulations PDF. The
> allocation depends on the *set* of qualifying groups: **495 pre-defined scenarios**
> (C(12,8)). Confirmed structure (2026-06-20): winners of groups **A, C, D, E, G, I, K, L**
> face a third-placed team; winners of **B, F, H, J** face runners-up. Only the 495 row
> *values* still need the PDF. Pin them before trusting `KnockoutEngine`.

## Q3 — Exact group tiebreaker ordering

**Confirmed order (FIFA Article 13, corroborated by ESPN — head-to-head is applied FIRST):**

1. Most points in matches **between the tied teams** (head-to-head)
2. Superior goal difference **between the tied teams**
3. Most goals scored **between the tied teams**
4. Superior goal difference **in all group matches**
5. Most goals scored **in all group matches**
6. Highest team **conduct / fair-play** score (cards) in all group matches
7. **FIFA world ranking**

**Eight best third-placed teams** are ranked differently (they are in different groups, so no
head-to-head): **points → goal difference → goals scored → conduct score → FIFA ranking.**

> **Critical implementation note:** applying head-to-head **before** overall goal difference
> is a **reversal of the 2022 ordering**. When 3+ teams are tied, criteria 1–3 are computed
> **only among the still-tied subset**, and if that splits some but not all teams, the chain
> **restarts from criterion 1** for the remaining tied teams. This recursive behaviour is the
> single most error-prone part of `GroupEngine` and must be oracle-tested (see S2).

**Source of record:** FIFA 2026 Regulations, Article 13.
**Corroboration:** [ESPN](https://www.espn.com/soccer/story/_/id/47108758/2026-fifa-world-cup-format-tiebreakers-fixtures-schedule) ·
[Sofascore](https://www.sofascore.com/news/what-happens-when-intra-group-teams-finish-level-on-points) ·
[FOX Sports](https://www.foxsports.com/stories/soccer/fifa-world-cup-group-stage-third-place-tiebreakers).

## Q7 — Historical backtest dataset

For the C3 calibration gate ([`04-verification.md`](04-verification.md)) we need (a) match
results to backtest against and (b) pre-match team strengths to seed the model.

**Match results (recommended primary — ACQUIRED 2026-06-20):**
- **martj42 — *International football results 1872→present*** (**CC0/public domain**, ~49.5k
  men's full internationals). Fetched to `data/results.csv` (gitignored; provenance + fetch
  command in [`../data/README.md`](../data/README.md)). Columns include `tournament` (filter
  to `FIFA World Cup`) and `neutral`. Direct raw source (no Kaggle login needed):
  <https://raw.githubusercontent.com/martj42/international_results/master/results.csv>
  (Kaggle mirror: <https://www.kaggle.com/datasets/martj42/international-football-results-from-1872-to-2017>)

**Team strength / Elo:**
- **World Football Elo Ratings** — methodology and historical ratings; the reference for the
  Elo half of the model. <https://en.wikipedia.org/wiki/World_Football_Elo_Ratings> ·
  source ratings at eloratings.net.
- **International Football Elo Ratings (1872–2025)** (Kaggle) — time-series Elo for joining to
  match dates. <https://www.kaggle.com/datasets/saifalnimri/international-football-elo-ratings>
- **2026 World Cup Historical Elo Ratings** (Kaggle) — pre-tournament Elo for the 48 qualified
  teams, useful for the live run's initial ratings.
  <https://www.kaggle.com/datasets/afonsofernandescruz/2026-fifa-world-cup-historical-elo-ratings>

> **Open items:** (1) confirm licensing for any non-CC0 dataset before vendoring; (2) decide
> the **rewind points** (e.g. simulate each past World Cup from the end of the group stage)
> and whether to augment the ~22 World Cups with other group+knockout tournaments (Euros,
> Copa América) so the calibration sample isn't too thin. World Cups alone are a small N.

---

## Spike register

Time-boxed investigations to de-risk the build. Each produces a throwaway prototype + a
written finding, not production code.

| ID | Spike | Question it answers | Why it matters |
|----|-------|---------------------|----------------|
| **S1** | **Knockout-draw resolution** (Q5) | Flat ~50/50 vs strength-weighted vs ET-then-penalties two-stage? | Drives realism of deep-run probabilities; pick by calibration. |
| **S2** | **Tiebreaker engine correctness** (Q3) | Does the H2H-first chain handle 3+ way and circular ties correctly? | Highest-risk rule logic; wrong order silently corrupts every group. Oracle-test vs real historical groups. |
| **S3** | **Elo→λ calibration** | What mapping from rating diff to expected goals is well-calibrated? | The PRFAQ's "riskiest part" — bad λ = confident garbage. Validate on historical results. |
| **S4** | **kickpool data adapter** (Q9) | Exact shape/auth of `/api/standings` + `/api/fixtures`; team-identity join; snapshot hashing. | The whole input edge depends on it; team IDs must join cleanly for the Phase 2 widget too. |
| **S5** | **Perf & RNG determinism** | Can TS run 100k sims in ~10s, and is the seeded RNG bit-stable across platforms? | Core promises (speed + reproducibility) must be proven, not assumed. |
| **S6** | **Annex C bracket mapping** (Q2) | Encode the third-place→slot allocation table as data and validate against known cases. | Bracket correctness for the 8 third-placed teams; pure lookup but fiddly. |
| **S7** | **Gen-AI narrator** (Q11) | Given two `ResultSet`s (odds delta), generate the "why odds moved" prose; latency/cost; guardrail that it can't alter numbers. | Now in v1 scope; needs Anthropic SDK + a hard separation from the numbers. |
| **S8** | **Backtest harness** (Q7) | Ingest martj42 data, rewind a past tournament, compute log-loss + calibration vs the coin-flip baseline. | This *is* the C3 kill/pivot gate; build it early so the engine is judged against it. |

**Suggested order:** S4 (unblocks data) → S2 + S3 (the two riskiest correctness/quality
items) → S8 (so everything is measured against calibration from the start) → S1, S6, S5, S7.

> **All eight spikes have been run (2026-06-20).** Code lives in [`../spikes/`](../spikes/);
> outcomes are written up in [`13-spike-findings.md`](13-spike-findings.md). Summary: S2, S4,
> S3, S5, S7, S8 validated; **S1 decided** (adopt two-stage draw resolution); **S6 mechanism
> validated but the official FIFA Annex table is still pending transcription.** 40 tests pass,
> typecheck + `gate-ci` green.
