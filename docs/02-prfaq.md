# PRFAQ — FIFA World Cup Monte Carlo Simulator

*Amazon-style "working backwards" document. The press release is written as if the
product has already launched. Dates and figures are illustrative.*

---

## PRESS RELEASE

### New Monte Carlo simulator turns live World Cup standings into live trophy odds — and updates them after every match

**[City], 2026** — Today we are launching the **World Cup Monte Carlo Simulator**, a
repeatable tool that reads the *current* tournament standings and tells you, for every
team still in it, the probability that they will win the whole thing — not a pundit's
hunch, but the result of replaying the rest of the tournament one hundred thousand times.

Football fans, office-pool organisers, and the friends who run the kickpool predictions
app have always argued about who is "really" favourite once the group stage gets messy:
goal difference, who-plays-who in the bracket, the team that is top of the table but has
the brutal knockout draw. Those arguments are hard because a tournament is a chain of
contingent events — the answer to "what are Brazil's chances?" depends on results in three
other groups they have nothing to do with.

The simulator settles it. Each time it runs, it pulls the latest group tables and
remaining fixtures (from the same ESPN-backed data the kickpool app already uses), then
plays out *every* unplayed match according to a chosen strength model, applies FIFA's
exact tiebreakers, builds the knockout bracket, and runs the penalties — and it does this
100,000 times in about ten seconds on a laptop. The output is a clean, ordered board:
*"Team X: 14.2% to win the cup, 31% to reach the final, 92% to escape the group,"* each
with a margin of error.

"The thing people don't realise is that the hard part was never the maths of one match —
it's the bookkeeping of how one result changes who you play next," said the project lead.
"Monte Carlo does that bookkeeping for free. We just play the tournament out, over and
over, and count."

Because every run is seeded and reproducible, the numbers are auditable — you can ask *why*
a team is at 14.2% and get the same answer twice. Run it before the tournament, run it
again at half-time of the last group game; it is the same one-command process every time.

The simulator ships with two interchangeable "strength models": a transparent
Elo/Poisson statistical model, and an option to reuse the kickpool app's existing Claude
per-match predictor. A plain-language narrative — *"Argentina's odds jumped because
France's defeat moved them to the weaker side of the bracket"* — is generated separately,
so the storytelling never contaminates the numbers.

It is available now as a command-line tool and a simple results page. To get the latest
odds, you run one command.

> *"I stopped arguing with my brother-in-law about whether Spain were really favourites.
> I just sent him the percentages." — early user*

---

## FREQUENTLY ASKED QUESTIONS

### Customer / external FAQ

**Q: What does it actually do?**
A: It estimates the probability that each remaining team wins the World Cup (and reaches
the final, makes the knockouts, wins their group), computed from the standings *as they
are right now*.

**Q: Where does the data come from?**
A: Current group standings and remaining fixtures come from the existing **kickpool**
project, which retrieves them from the ESPN `fifa.world` API. We do not re-scrape; we
consume the data kickpool already structures (`GroupStanding`, `Match`).

**Q: How is this different from just asking an AI, or reading a bookmaker's odds?**
A: An AI answer isn't reproducible or guaranteed to obey the tournament rules; bookmaker
odds carry a margin and aren't broken down by scenario. Our numbers come from explicitly
replaying the tournament under its real rules, with a seeded random generator, so they are
consistent, auditable, and decomposable ("here's the chance for each *stage*").

**Q: Is it accurate?**
A: Accuracy depends on the strength model feeding it. We benchmark every model against
historical tournaments and against a coin-flip baseline using calibration and log-loss
(see the verification doc), and we publish margins of error. The simulator faithfully
propagates whatever the strength model says — it doesn't invent certainty.

**Q: How often can I run it?**
A: As often as you like. It's the same one-command, ~10-second process. Many users run it
after every match day.

**Q: Can it be wrong?**
A: Of course — it's a probability, not a prophecy. A 14% favourite losing is not a bug;
it's the 86% showing up. We measure correctness by *calibration over many predictions*,
not by any single result.

### Internal / stakeholder FAQ

**Q: Why Monte Carlo and not analytics or a pure AI prediction?**
A: See [`01-method-comparison.md`](01-method-comparison.md). In short: it models the rules
exactly, handles bracket correlations for free, quantifies uncertainty, is reproducible,
and is computationally trivial (~10s for 100k sims). The alternatives are either infeasible
at full bracket scale (exact analytics) or non-reproducible and rule-violating (one-shot
AI).

**Q: Isn't simulating a whole tournament 100,000 times expensive?**
A: No. ~100 match samples per simulation × 100k sims ≈ 10M cheap operations — about ten
seconds on one core, and embarrassingly parallel. The *only* expensive design would be
calling an LLM inside the loop, which we explicitly avoid by precomputing the strength
model once per run.

**Q: What's the riskiest part?**
A: The **strength model and its calibration** (Layer A), not the simulation engine. Garbage
probabilities in → confident garbage out. That's why verification focuses on calibration,
and why the model source is pluggable and benchmarked.

**Q: Do we need AWS?**
A: Not for v1. It runs locally in seconds. AWS is justified only if we want scheduled
auto-refresh and a hosted public results page. See [`07-infrastructure.md`](07-infrastructure.md).

**Q: How does this relate to kickpool — is it a feature or a separate product?**
A: Separate tool, shared data. kickpool answers "how are my friends' teams doing?"; this
answers "what are the title odds?". v1 is a standalone CLI/library that *consumes* kickpool
data; a later phase could surface the odds inside kickpool's UI.

**Q: What is explicitly out of scope for v1?**
A: Live in-play minute-by-minute odds, betting/odds-comparison features, player-level
injury modelling, and a polished consumer web app. v1 = correct, reproducible,
well-calibrated probabilities from current standings, via CLI + a basic results view.

**Q: What would make us kill or pivot this?**
A: If no available strength model can beat the coin-flip baseline on historical
calibration, the engine is pointless and we stop. That gate is in the verification plan.
