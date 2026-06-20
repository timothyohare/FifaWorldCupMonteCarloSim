# Verification — How will we know it actually works?

A probabilistic tool can't be verified by "the answer looks right" — any single result is
consistent with almost any probability. We split *"works"* into three independent claims,
each backed by a check that **fails loudly when the claim is false** (per the SDLC harness
philosophy: a quality claim is only worth the command that can falsify it).

| Claim | Plain meaning | Primary check |
|-------|---------------|---------------|
| **C1. Mechanically correct** | The engine obeys the rules and the maths of simulation. | Deterministic unit tests + analytical oracle. |
| **C2. Statistically sound** | The Monte Carlo output is internally consistent and converged. | Convergence, conservation, and invariant tests. |
| **C3. Predictively useful** | The numbers track reality better than chance. | Backtest calibration & log-loss vs baseline. |

A tool can pass C1+C2 and still be useless (well-built engine, bad strength model), so C3
is a separate, hard gate. Conversely C3 can look fine while C1 is broken (a bug that
cancels out) — so all three are required.

---

## C1 — Mechanical correctness (the engine does what the rules say)

### Deterministic, seeded behaviour
- Fix the seed ⇒ output is **byte-identical** across runs and machines. This is the single
  most important property; without it nothing else is debuggable. (NFR2)
- Same input, two different seeds ⇒ outputs differ but agree within Monte Carlo error.

### Rule oracles (hand-computable cases)
- **Tiebreakers:** construct group tables that exercise each tiebreaker key in turn
  (points → goal difference → goals for → head-to-head → fair play → drawing of lots) and
  assert the final ordering exactly. These are deterministic, not probabilistic.
- **Qualifier selection:** craft a completed group stage and assert the right 12 winners,
  12 runners-up, and 8 best third-placed are chosen and seeded into the correct bracket
  slots.
- **Degenerate matches:** a strength model that returns P(home win)=1.0 must make the home
  team always win; P=0/0 split must never crash; a guaranteed-draw knockout must always go
  to the shootout resolver.

### Analytical oracle for the group stage
For a **single group** with a handful of remaining matches, the exact qualification
probabilities are computable by enumeration (see method comparison §5). We compute them
exactly and require the simulator's group-stage numbers to match **within Monte Carlo
error** at high `N`. This catches subtle bugs (e.g. mis-ordered tiebreakers) that
calibration tests would miss.

### Boundary tournament states
Run the engine at every state from FR9 and assert sane output:
- Pre-tournament (all unplayed) — every team has non-zero, normalised probability.
- Group stage complete — group-advance probabilities are exactly 0 or 1.
- One match left in the final — champion probability equals the modelled win prob of that
  match's favourite, nothing else.
- An already-decided tournament — champion is 100% the actual winner.

---

## C2 — Statistical soundness (the Monte Carlo itself is trustworthy)

### Conservation / normalisation invariants (must hold every run)
- Σ P(win cup) over all teams = 1.0 (within float tolerance).
- For every team: P(win cup) ≤ P(reach final) ≤ P(reach semi) ≤ P(advance group). A nested
  ordering violation is a guaranteed bug.
- Exactly the right number of teams advance each round in every simulation (12+12+8 = 32,
  then 16, 8, 4, 2, 1).

### Convergence
- Reported margin of error shrinks like `1/√N`; plot/assert the trend.
- A team's probability stabilises (e.g. last-10% of sims move it < the reported error) at
  the default `N`. Surface a convergence diagnostic in run metadata.

### Reproducibility of aggregate stats
- Two seeds give probabilities within ~3σ of each other for all non-trivial teams.

---

## C3 — Predictive usefulness (it beats chance on real history)

This is the gate that decides whether the project is worth shipping (PRD M1 / kill
criterion in the PRFAQ).

### Backtesting protocol
- Take **completed historical World Cups** (and optionally other completed group+knockout
  tournaments to enlarge the sample).
- For each, "rewind" to several decision points (pre-tournament, end of matchday 2, end of
  group stage) using only the standings known *at that point*, run the simulator, and
  record the predicted probabilities.
- Compare predictions to what actually happened.

### Metrics (lower is better for losses)
- **Log-loss / Brier score** on stage outcomes (advanced group? reached final? won cup?).
- **Calibration curve / reliability diagram:** of all the times we said "~20%", did it
  happen ~20% of the time? Bucket predictions and compare predicted vs observed frequency.
- **Ranking quality:** did higher-probability teams systematically outlast lower ones?

### Hard gates
- **G-baseline:** the chosen strength model must beat the **coin-flip / seeding baseline**
  on log-loss. If it can't, we don't ship it. (This is why the baseline model is a
  first-class deliverable, FR14.)
- **G-calibration:** calibration error within an agreed tolerance band; no systematic
  over/under-confidence.
- Compare **Elo/Poisson vs the Claude adapter** on the same protocol and record which wins;
  the better-calibrated model becomes the default.

> Important nuance: a *good* champion-probability of, say, 18% for the eventual winner is
> not "wrong" because they won. C3 is judged over **many** predictions via calibration,
> never on a single tournament outcome.

---

## Tooling & automation
- All of C1 and C2 run in CI on every change (fast, deterministic; offline fixtures).
- C3 backtesting is a heavier, on-demand suite (like kickpool's perf gate) — run when the
  strength model changes, with results recorded to a tracked report.
- Wire the fast checks into the repo's Stop-hook gate (`gate-ci`) once the project is
  onboarded to the harness (`.claude/harness.json`), so "done" can't be claimed while a
  rule oracle or invariant is red.

## Definition of "works"
The simulator **works** when, on the committed fixtures and historical backtests:
1. all C1 rule oracles and boundary cases pass deterministically;
2. all C2 invariants hold and the run is converged at default `N`;
3. the default strength model **beats the coin-flip baseline** on log-loss and is
   acceptably calibrated (C3).

Anything less is "it ran", not "it works".
