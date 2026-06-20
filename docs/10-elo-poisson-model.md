# The Elo/Poisson Strength Model

*A deep-dive on the reference per-match outcome model. This document explains the
`EloPoissonModel` named in [`06-architecture.md`](06-architecture.md) and required by
**FR12** in [`03-prd.md`](03-prd.md). It is explanatory — it defines the model the engine
samples from, not the simulation engine itself.*

---

## 1. The job this model has to do

The simulator replays each unplayed match many times (100,000 full-tournament runs). For
every match it must **sample a plausible scoreline** (e.g. 2–1) from the two teams'
strengths. A "strength model" is the pluggable component that turns *who is playing* into
*a probability distribution over outcomes* the engine can sample.

The project ships three interchangeable strength models
([`06-architecture.md`](06-architecture.md)):

- `EloPoissonModel` — the subject of this document: transparent, offline, no LLM.
- `ClaudeAdapterModel` — reuses kickpool's **precomputed** per-match predictions.
- `BaselineModel` — coin-flip / seed-weighted, the calibration benchmark.

The Elo/Poisson model is the *reference* model because it is pure arithmetic on a ratings
table: fast, reproducible, fully inspectable, and dependency-free (no API, no credentials —
see [`03-prd.md`](03-prd.md) §6). It works in three stages:

```
Elo rating  ──►  expected goals (λ)  ──►  Poisson scoreline distribution
```

---

## 2. Stage 1 — Elo: one number for team strength

Elo (originally a chess rating system) assigns every team a single rating, e.g. 1900 vs
1750. Only the **difference** between two teams matters, and it maps to a win expectation:

```
E_home = 1 / (1 + 10^(-(R_home - R_away) / 400))
```

- Equal ratings → `E = 0.5` (toss-up).
- A 400-point edge → the stronger side is ~10× more likely to win.

Ratings update after each result so the model tracks current form:

```
R_new = R_old + K · (actual - expected)
```

Beating a team you were expected to beat gains little; upsetting a stronger team gains a
lot. Football-specific variants (e.g. *World Football Elo*) extend this with a
margin-of-victory multiplier and a home-advantage term. The property that matters for this
project: it is **transparent and offline** — just arithmetic over a ratings table.

---

## 3. Stage 2 — Elo → expected goals (λ)

Elo yields a *win probability*, but Poisson needs an *expected goal count* — conventionally
called **λ** (lambda) — for each side. So we convert the rating difference into how many
goals each team is expected to score:

```
λ_home = base_goals · f(R_home - R_away)   // stronger team → higher λ
λ_away = base_goals · f(R_away - R_home)
```

where `base_goals` is calibrated to real scoring rates (international matches average
~1.3 goals/team). The stronger team gets a higher λ, the weaker team a lower one.

> **This conversion is the riskiest part of the whole system.** It is where strength
> becomes goals, and it must be **calibrated against historical data**.
> [`02-prfaq.md`](02-prfaq.md) flags exactly this: *"Garbage probabilities in → confident
> garbage out."* The calibration gate in [`04-verification.md`](04-verification.md) exists
> to catch a miscalibrated λ mapping.

---

## 4. Stage 3 — Poisson: λ → an actual scoreline

The **Poisson distribution** models "how many independent, rare-ish events occur in a fixed
window" — a textbook fit for goals in a match. Given an expected count λ, the probability of
exactly *k* goals is:

```
P(k goals) = (λ^k · e^(-λ)) / k!
```

So with `λ_home = 1.8`, the model produces a full distribution:

| Goals *k* | 0 | 1 | 2 | 3 | 4 |
|-----------|------|------|------|------|------|
| P(k)      | 0.17 | 0.30 | 0.27 | 0.16 | 0.07 |

Treat home and away goals as two independent Poisson draws and you get a **joint
distribution over every scoreline** (0–0, 1–0, 2–1, …). The simulator's seeded RNG samples
one scoreline from it per match.

That single distribution gives the engine everything it needs:

- **Win / draw / loss** — sum the scoreline probabilities where home > away, home = away,
  home < away.
- **Exact scores** — required because FIFA group tiebreakers use goal difference and goals
  scored ([`02-prfaq.md`](02-prfaq.md)).
- **Knockout draws** — sample a winner; if the sampled scoreline is a tie, the engine runs
  extra time / penalties.

---

## 5. Why the pairing works

| Piece | Gives you | Limitation on its own |
|-------|-----------|------------------------|
| **Elo** | Relative team strength as one auto-updating number | Only a win probability — no scores |
| **Poisson** | A realistic scoreline distribution from an expected-goals rate | Needs someone to *supply* λ |

Elo provides the strength signal; Poisson turns it into the **scorelines** the tournament
rules actually operate on. The combination is fast (fits the "~10s for 100k sims" budget in
[`02-prfaq.md`](02-prfaq.md)), reproducible under a seeded RNG, and fully inspectable —
which is why it is the reference model rather than the Claude predictor.

---

## 6. Worked example

Two teams: `R_home = 1900`, `R_away = 1750`, `base_goals = 1.3`.

1. **Elo win expectation:** `E_home = 1 / (1 + 10^(-150/400)) ≈ 0.70`.
2. **Expected goals:** the 150-point edge skews λ, e.g. `λ_home ≈ 1.8`, `λ_away ≈ 1.0`
   (exact mapping is the calibrated step).
3. **Scoreline distribution:** independent Poisson draws with those λ values give, for
   example, P(1–0) ≈ 11%, P(2–1) ≈ 9%, P(0–0) ≈ 5%, … Summing across all scorelines
   recovers roughly a 70% / 18% / 12% win/draw/loss split — consistent with step 1.

The engine then draws one scoreline per simulated match and moves on.

---

## 7. Known limitations (what calibration must watch)

- **Independence assumption.** Basic Poisson treats home and away goals as independent;
  real matches show mild correlation.
- **Under-prediction of draws.** Plain double-Poisson tends to assign too little mass to
  draws.
- **Refinements exist if needed.** A *Dixon–Coles* low-score adjustment or a *bivariate
  Poisson* model corrects both effects. v1 starts simple and only adds complexity if the
  calibration benchmark in [`04-verification.md`](04-verification.md) demands it.

This is why the model source is **pluggable and benchmarked**: if no configuration of
Elo/Poisson beats the coin-flip baseline on historical calibration, that is a kill/pivot
signal ([`02-prfaq.md`](02-prfaq.md), [`03-prd.md`](03-prd.md) §7).
