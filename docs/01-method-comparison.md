# Method Comparison: How should we compute World Cup win probabilities?

**Question to answer first:** Is Monte Carlo the best method to estimate each team's
probability of winning the FIFA World Cup from the current standings — or do the number
of variables / the compute cost make it impractical compared with something else?

**Short answer:** Monte Carlo is the right method. The compute fear is unfounded (full
problem runs in seconds-to-low-minutes on a laptop). The "too many variables" concern is
real but it is a property of the *underlying match model*, not of Monte Carlo — and every
alternative has to deal with the same variables, usually less honestly.

---

## 1. Framing: separate the *engine* from the *match model*

A common confusion is to treat "Monte Carlo" as a competitor to "machine learning" or
"AI prediction". They operate at different layers:

```
                 ┌─────────────────────────────────────────┐
   LAYER A       │  Per-match model:  P(win/draw/loss) and   │   ← where the
   "the model"   │  scoreline distribution for ONE fixture   │     football
                 └─────────────────────────────────────────┘     knowledge lives
                                  │ feeds
                                  ▼
                 ┌─────────────────────────────────────────┐
   LAYER B       │  Propagation:  turn per-match probs into  │   ← where Monte
   "the engine"  │  a tournament-level "P(team wins cup)"     │     Carlo lives
                 └─────────────────────────────────────────┘
```

- **Layer A** can be an Elo/Poisson statistical model, a trained ML model, market
  (bookmaker) odds, or the **Claude per-match predictor that already exists in
  `kickpool/lib/claude/predict.ts`** (it emits `homeWinProbability`, `drawProbability`,
  `awayWinProbability`, `predictedScore`).
- **Layer B** is the hard combinatorial part: group tiebreakers, who-plays-who in the
  bracket, single-elimination knockouts, penalties. Monte Carlo is a Layer-B technique.

So the real comparison is: **given a Layer-A model, what is the best Layer-B method?** —
plus the question of whether to skip Layer B entirely and predict the champion directly.

---

## 2. The candidates

| | Method | Layer | One-line description |
|---|--------|-------|----------------------|
| **A** | **Monte Carlo simulation** (recommended) | B | Play the rest of the tournament 10k–100k times, sampling each match; count trophies. |
| **B** | **Direct analytical computation** | B | Compute probabilities in closed form / by exhaustive enumeration instead of sampling. |
| **C** | **Generative-AI tournament prediction** | A+B | Ask an LLM (Claude) to predict outcomes / champion probabilities directly. |
| — | *Coin flip / seeding baseline* | — | Null model used only to benchmark calibration; not a serious candidate. |

I deliberately picked **B** and **C** as the two alternatives because they bracket Monte
Carlo from both sides: B is "more rigorous / more deterministic", C is "more AI / less
structured". (Pure supervised ML — "train a classifier to output champion probability" —
is discussed under C-adjacent notes, because with only ~22 World Cups of history it
collapses into the same data-starvation problem as the LLM approach.)

---

## 3. The variables in play

Whatever method we pick must somehow account for:

1. Current group standings (points, goal difference, goals for, head-to-head).
2. Remaining group fixtures (who still plays whom).
3. FIFA tiebreakers (a strict, multi-key ordering, incl. fair-play points).
4. The 2026 format: 12 groups of 4 → 32 advance (12 winners + 12 runners-up + 8 best
   third-placed) → single-elimination knockout to the final.
5. Relative team strength (the actual football).
6. Match-level randomness (a strong team still loses sometimes).
7. Knockout-specific effects (extra time, penalty shootouts ≈ near-coin-flip).
8. Correlation: the bracket position a team earns changes *who* they then face.

Variable #8 is the killer for the "just do the maths" approach and the reason Monte Carlo
shines: in a sampled simulation, correlations propagate automatically — if Brazil tops its
group in a given simulated run, that *same run* already knows Brazil takes the easier
bracket path. No alternative gets this for free.

---

## 4. The compute question, answered with numbers

Is this "too much compute"? No. Let's size it.

- Remaining matches at the start of a tournament: ~104 total (2026). Mid-tournament it is
  far fewer. Call it **~100 match samples per simulation** worst case.
- One match sample = a few RNG draws + a Poisson/lookup = sub-microsecond.
- One full simulation (group sort + bracket + knockouts) ≈ **10–50 microseconds** of real
  work in a compiled/typed runtime; generously **~0.1 ms** in plain Python/JS.
- Monte Carlo standard error on a probability shrinks as `1/√N`:

  | Simulations N | Std error on a ~10% probability | Wall-clock (≈0.1 ms/sim) |
  |---------------|---------------------------------|--------------------------|
  | 1,000 | ±0.95% | ~0.1 s |
  | 10,000 | ±0.30% | ~1 s |
  | 100,000 | ±0.095% | ~10 s |
  | 1,000,000 | ±0.030% | ~100 s |

**Conclusion:** 100,000 simulations — more than enough precision for a leaderboard quoted
to one decimal place — costs about **ten seconds on a single laptop core**, and is
embarrassingly parallel if we ever want more. The compute objection does not survive
contact with arithmetic. The only thing that is genuinely expensive is calling an LLM
*inside* the loop (see §6), which we avoid by precomputing the Layer-A model once.

---

## 5. Why not Direct Analytical Computation (Method B)?

The group stage *alone* is tractable analytically: with ≤6 remaining matches in a group,
each having 3 outcomes (×scoreline for tiebreakers), you can enumerate every combination
and sum probabilities exactly. Some published "chance of qualifying" tools do exactly this.

It breaks down at the tournament level:

- **Combinatorial explosion across the bracket.** Win probability requires summing over
  *every path* through a 32-team single-elimination tree, where each node's opponent
  depends on results elsewhere. The number of distinct bracket states is astronomically
  large; exact enumeration is infeasible.
- **Tiebreakers need scorelines, not just W/D/L.** Goal difference and goals-for mean you
  must track score distributions, multiplying the state space again.
- **Correlations (variable #8) must be tracked by hand**, which is precisely the
  bookkeeping Monte Carlo does automatically by sampling.

You *can* do a hybrid — analytical for group qualification, Monte Carlo for the knockouts —
and that is a legitimate optimisation we may adopt for the group-stage numbers. But as the
*primary* method it offers no accuracy benefit (Monte Carlo converges to the same answer)
at a large complexity cost. **Rejected as primary; retained as an optional exact check for
group-stage outputs (a great test oracle — see the test plan).**

## 6. Why not Generative-AI prediction (Method C)?

Using Claude to predict the tournament comes in two flavours:

1. **LLM as the Layer-A match model**, then Monte Carlo on top. This is *not* an
   alternative to Monte Carlo — it is a way to *feed* it, and a good one: kickpool already
   produces calibrated-ish per-match probabilities with Claude. We can use these as the
   sampling distribution. ✅ Compatible, recommended as one selectable model source.
2. **LLM as the whole pipeline** — "Claude, here are the standings, give me each team's
   championship probability." This is the actual Method-C alternative, and it is weak as
   the system of record:
   - **No guaranteed internal consistency.** Probabilities may not sum to 100%, may
     violate the bracket structure, or contradict the tiebreaker rules.
   - **Not reproducible.** Same input can give different numbers; hard to defend "why is
     it 12.4%?" There is no auditable computation, only a narrative.
   - **Cost & latency in a loop.** If you wanted LLM judgement *per simulated match*, that
     is ~100 calls × 100k sims = 10M calls — absurd cost and time. (This is the only place
     the "too much compute" fear becomes true, and it is an argument *against* Method C,
     not against Monte Carlo.)
   - **Data starvation, same as pure ML.** Whether you fine-tune a classifier or prompt an
     LLM to emit final probabilities, there are only ~22 completed World Cups to learn the
     *tournament-level* mapping from. That is far too few examples to beat an explicit
     simulation that already encodes the rules.

   **Where it IS valuable:** generating human-readable narrative ("Why does Argentina lead
   the table?"), match-preview colour, and as a *secondary opinion* to compare against the
   simulation. **Rejected as the primary probability engine; retained for narrative and as
   an optional Layer-A model source.**

## 7. The coin-flip / seeding baseline

Not a real candidate — but essential. We will always compute a trivial baseline (every
match a 50/50, or seed-weighted) and require the real model to **beat it on calibration
and log-loss** on historical data. A model that cannot out-predict a coin flip is not
shipping. (See verification doc.)

---

## 8. Scorecard

Weighting reflects what matters for "repeatable probabilities from current standings".

| Criterion (weight) | A. Monte Carlo | B. Analytical | C. Gen-AI (whole pipeline) | Coin flip |
|---|---|---|---|---|
| Accuracy / rule-fidelity (25%) | ★★★★★ exact rules, converges to truth | ★★★★☆ exact but infeasible at full scale | ★★☆☆☆ can violate rules | ★☆☆☆☆ |
| Handles correlations / bracket (20%) | ★★★★★ free, by sampling | ★★☆☆☆ manual, explodes | ★★☆☆☆ implicit, unverifiable | ★☆☆☆☆ |
| Compute feasibility (15%) | ★★★★★ ~10s for 100k sims | ★★☆☆☆ explodes on knockouts | ★★★☆☆ (★ if LLM-in-loop) | ★★★★★ |
| Reproducibility / auditability (15%) | ★★★★★ seeded RNG, deterministic | ★★★★★ deterministic | ★★☆☆☆ non-deterministic | ★★★★★ |
| Quantifies uncertainty (10%) | ★★★★★ full distribution + CI | ★★★☆☆ point answer | ★★☆☆☆ asserted, not derived | ★★☆☆☆ |
| Implementation effort (10%) | ★★★★☆ moderate | ★★☆☆☆ hard at scale | ★★★★★ trivial prompt | ★★★★★ |
| Explainability to users (5%) | ★★★★☆ "we played it 100k times" | ★★★☆☆ | ★★★★★ fluent prose | ★★★☆☆ |
| **Weighted total** | **≈ 4.7 / 5** | ≈ 3.1 / 5 | ≈ 2.5 / 5 | ≈ 1.9 / 5 |

---

## 9. Recommendation

**Adopt Monte Carlo simulation as the primary engine (Method A).**

- It models the actual rules exactly, propagates correlations for free, quantifies
  uncertainty, is fully reproducible with a seeded RNG, and runs in seconds on a laptop —
  the compute objection is decisively false at the relevant scale.
- Make the **Layer-A match model pluggable** so we can choose between (i) an Elo/Poisson
  statistical model and (ii) reuse of kickpool's existing Claude per-match predictor, and
  benchmark both against the coin-flip baseline.
- Keep **Generative AI for what it is good at**: narrative explanation and an optional
  secondary opinion — *outside* the simulation loop.
- Optionally use **exact analytical computation for the group stage only**, as a fast path
  and, more importantly, as a **test oracle** to validate the simulator's group-stage
  numbers.

This decision is what the rest of the planning documents assume.
