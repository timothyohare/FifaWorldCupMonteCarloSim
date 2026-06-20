# Visualisation — How will the results be presented?

## 1. What the numbers are
Every run produces a `ResultSet`: for each remaining team, the probability of reaching each
stage (advance group → R16 → QF → SF → final → champion), each with a Monte Carlo margin of
error, plus run metadata (timestamp, snapshot hash, seed, N, model, version). The
visualisation job is to make that **scannable, honest about uncertainty, and comparable
across runs**.

## 2. Design principles
1. **Lead with the headline.** "Title odds, ranked" is what people came for — show it first.
2. **Always show uncertainty.** Never a bare "14%"; show "14.2% ± 0.3" so a reader doesn't
   over-read Monte Carlo noise or model confidence.
3. **Decompose by stage.** The interesting story is often *where* a team's run ends, not
   just whether they win.
4. **Make runs comparable.** Tag every view with the snapshot/seed/model so two boards can
   be compared meaningfully (e.g. "before vs after matchday 2").
5. **Reuse kickpool's visual language** (team colours/logos, the existing "friends" colours)
   so the two tools feel related.
6. **Accessible:** colourblind-safe palette, never colour-only encoding, readable in a
   terminal *and* a browser.

## 3. Output tiers (ship in this order)

### Tier 0 — CLI table (v1 default, always present)
The primary, zero-dependency view. A ranked table to the terminal:

```
World Cup title odds — snapshot 9f3a… · model=elo · N=100,000 · seed=42
─────────────────────────────────────────────────────────────────────
 #  Team         Champion   Final   Semi   Adv.Group
 1  Brazil        14.2%±0.3  31.0%   48%    99.8%
 2  France        12.8%±0.3  29.4%   45%    99.5%
 3  Argentina     11.1%±0.3  27.0%   43%    99.1%
 …
─────────────────────────────────────────────────────────────────────
```

- Plus a `--format json|csv` for piping into anything else.
- Sparkline/bar made of block characters (`█▆▃`) for at-a-glance ranking in the terminal.

### Tier 1 — Static results page (stretch in v1 / Phase 2)
A single page that reads the `ResultSet` JSON. Core charts:

- **Title-odds bar chart (the hero).** Horizontal bars, teams ranked, each labelled with
  the percentage and an error whisker for the margin. Team colours from kickpool.
- **Stage-progression stacked bars / "survival" chart.** For each team, a stacked bar split
  by furthest-stage probability (advance / R16 / QF / SF / final / champion). Shows the
  *shape* of a team's expected run, not just the trophy number.
- **Bracket heatmap (optional).** The knockout bracket with each slot shaded by the
  probability a given team reaches it — makes "the easy/hard side of the draw" visible.
- **Group-qualification table.** Per group, each team's P(win group) / P(runner-up) /
  P(advance) — the part that connects directly to the *current* standings users can see.

### Tier 2 — Trend / comparison view (Phase 2, needs stored history)
Only meaningful once multiple runs are persisted (AWS phase):

- **Odds-over-time line chart.** Each team's champion probability across matchdays — "watch
  the favourite emerge".
- **Run-diff view.** Two snapshots side by side with deltas ("Argentina +3.1pp after
  France's loss") — pairs naturally with the optional Gen-AI narrative.

## 4. Communicating uncertainty (non-negotiable)
- Show the **±margin of error** next to every probability (binomial proportion at N).
- Round sensibly — one decimal place; don't imply precision the model doesn't have.
- Distinguish the two uncertainties in copy: *Monte Carlo error* (shrinks with N, our
  machinery) vs *model uncertainty* (the football is genuinely uncertain). The error bar is
  the former; the spread of outcomes is the latter.
- Never colour-encode probability alone; always pair with the number and position.

## 5. Narrative layer (optional, clearly separated)
A short Gen-AI generated paragraph explaining the top movers ("Why did these odds change?")
can sit **beside** the charts — never inside the numbers. It must be visually marked as
commentary, and it reads *from* the `ResultSet`; it does not compute probabilities. (Keeps
the [method comparison](01-method-comparison.md) boundary intact: AI for prose, simulation
for numbers.)

## 6. Technology
- **Tier 0:** plain CLI rendering in the engine's language (TypeScript) — no deps.
- **Tier 1:** simplest path is a small static page consuming the JSON. If we want it inside
  kickpool, reuse its Next.js + React stack and chart approach so there's one design system.
  A standalone option is a single HTML file + a lightweight chart lib reading the JSON.
- **Backtest/calibration plots** (reliability diagrams, calibration curves from
  [`04-verification.md`](04-verification.md)) are developer-facing and can live in a Python
  notebook or a small script — off the user path.
- Apply the repo's **design skill** palette (colourblind-safe, brand-vs-data colour rules)
  for any browser charts.

## 7. Accessibility checklist
- Colourblind-safe categorical palette; redundant encoding (number + length + order).
- Sufficient contrast; readable without colour (works in a monochrome terminal).
- Tables have real headers; charts have text/`aria` equivalents in the web tier.

## 8. Recommendation
Ship **Tier 0 (CLI table + JSON/CSV)** in v1 — it fully satisfies "visualise the results"
and is reproducible and pipeable. Treat **Tier 1** (hero bar chart + stage-progression +
group table) as the fast-follow once a run target is settled, and **Tier 2** (trends) as a
Phase-2 capability that arrives with stored history on AWS.
