# Proposed Architecture — World Cup Monte Carlo Simulator

## 1. Design principles
1. **Separate the engine from the model.** The Monte Carlo engine (Layer B) knows the
   tournament rules; the strength model (Layer A) knows the football. They meet at one
   small interface. (See [method comparison](01-method-comparison.md) §1.)
2. **Pure, deterministic core.** Given `(inputs, seed, N, model)` the core is a pure
   function → reproducibility and testability fall out for free.
3. **I/O at the edges.** Data fetching and result rendering never touch the simulation
   core. The core does **zero network I/O** during a run.
4. **Pluggable everything that varies:** the strength model, the input source, the output
   format.
5. **Reuse kickpool, don't duplicate it.** Standings/fixtures come from kickpool's existing
   ESPN integration via a thin adapter.

## 2. Component diagram

```
   ┌──────────────────────────────────────────────────────────────────────┐
   │                         INPUT / DATA EDGE                              │
   │  kickpool (Next.js) ──ESPN fifa.world──► GroupStanding[] + Match[]     │
   │           │                                                            │
   │           ▼  (adapter)                                                 │
   │   ┌───────────────┐     snapshot (JSON, hashed, committed for tests)   │
   │   │ DataProvider  │────────────────────────────────────────────┐      │
   │   └───────────────┘                                             │      │
   └────────────────────────────────────────────────────────────────┼──────┘
                                                                      ▼
   ┌──────────────────────────── SIMULATION CORE (pure) ───────────────────┐
   │                                                                        │
   │   ┌──────────────┐   for each of N sims (seeded RNG):                  │
   │   │ StrengthModel│◄──────────────┐                                     │
   │   │  (Layer A)   │               │ P(w/d/l)+scoreline                  │
   │   │  • Elo/Poisson│              │                                     │
   │   │  • Claude adpt│   ┌──────────┴───────┐   ┌──────────────────────┐  │
   │   │  • Baseline   │   │  GroupEngine     │──►│  KnockoutEngine      │  │
   │   └──────────────┘    │ sample matches,  │   │ bracket build,       │  │
   │                       │ FIFA tiebreakers,│   │ single-elim,         │  │
   │                       │ pick qualifiers  │   │ shootout resolver    │  │
   │                       └──────────────────┘   └──────────┬───────────┘  │
   │                                                         │ champion,     │
   │                                                         ▼ finalists…    │
   │                                              ┌────────────────────────┐ │
   │                                              │  Aggregator            │ │
   │                                              │  counts → probs + MoE  │ │
   │                                              └──────────┬─────────────┘ │
   └─────────────────────────────────────────────────────────┼─────────────┘
                                                              ▼
   ┌──────────────────────────── OUTPUT EDGE ──────────────────────────────┐
   │  ResultSet (per-team, per-stage probs + CI + run metadata)             │
   │     ├──► JSON / CSV writer        ├──► CLI table renderer              │
   │     ├──► (Phase 2) results view   └──► Gen-AI narrator (v1, post-run)      │
   └────────────────────────────────────────────────────────────────────────┘
```

## 3. Key modules & contracts

### DataProvider (input edge)
- `getCurrentState(): TournamentState` → groups, played + remaining matches, current stage.
- Implementations: `KickpoolApiProvider` (calls kickpool's `/api/standings` +
  `/api/fixtures`), `SnapshotProvider` (committed JSON for offline/test, mirroring
  `USE_FIXTURES`).
- Produces a hashed **snapshot** so a run is reproducible and auditable.

### StrengthModel (Layer A interface — the one seam that matters)
```
interface StrengthModel {
  matchOutcome(home: TeamRef, away: TeamRef, ctx: MatchContext):
    { pHome: number; pDraw: number; pAway: number };
  sampleScore(home, away, ctx, rng): { home: number; away: number }; // for tiebreakers
  knockoutResolve?(home, away, ctx, rng): TeamRef;                    // optional ET/pens
}
```
- `EloPoissonModel` — ratings → expected goals → Poisson scoreline; transparent, offline.
- `ClaudeAdapterModel` — wraps **precomputed** kickpool `Prediction` objects; **never calls
  the LLM inside the loop** (precompute once, look up per fixture).
- `BaselineModel` — coin-flip / seed-weighted; the calibration benchmark.

### GroupEngine
- Samples remaining group matches via the model, updates tables, applies the **exact FIFA
  tiebreaker chain**, returns final group order + qualifiers (12+12+8 for 2026).
- The tiebreaker chain is isolated, table-driven, and unit-tested so a rule change is a
  localised edit.

### KnockoutEngine
- Seeds qualifiers into the bracket, plays single-elimination rounds, resolves draws via
  `knockoutResolve` (or a default shootout ≈ near-coin-flip / strength-weighted).
- Records the stage each team reached.

### Aggregator
- Accumulates per-stage hit counts across N sims; converts to probabilities with a
  binomial-proportion margin of error.

### Orchestrator / CLI
- Wires provider → model → engine → aggregator → writer; owns the seed, N, model selection,
  and run metadata (version, snapshot hash, timestamp).

## 4. Data flow (one run)
1. Provider yields a hashed snapshot of the current `TournamentState`.
2. Strength model is initialised once (Elo ratings loaded, or Claude predictions precomputed
   for all remaining fixtures).
3. Loop N times with a seeded RNG: GroupEngine → KnockoutEngine → record outcome.
4. Aggregator → `ResultSet` with probabilities + CIs + metadata.
5. Output edge renders JSON/CSV/table; the **v1 Gen-AI narrator** (Q11/FR18) adds prose
   **after** the numbers — read-only over the `ResultSet`, never feeding back into the run.
   It is the one component that touches the network (Anthropic SDK); the core stays offline.

## 5. Reproducibility & determinism
- Single seeded RNG, sub-streamed per simulation, platform-stable.
- The core is pure; all nondeterminism (clock, network, LLM) is pushed to the edges and
  captured into the immutable snapshot before the run starts.
- Run metadata (seed, N, model, snapshot hash, code version) is emitted with every result
  so any number is re-derivable.

## 6. Technology choice (recommendation, to confirm)
Two viable stacks:

| Option | Pros | Cons |
|--------|------|------|
| **TypeScript/Node** (recommended) | Shares types & data contracts with kickpool; can import its adapters and the Claude predictor directly; one language across both projects; Vitest reuse. | Slightly slower hot loop than a native lang (irrelevant at this scale). |
| **Python** | Rich stats/plotting ecosystem (numpy, pandas, matplotlib) for backtests & viz. | Re-implements kickpool's types/adapters; a second toolchain to maintain. |

**Recommendation:** TypeScript for the engine (maximal reuse of kickpool's data layer and
the existing Claude predictor; one-language story), with the heavier **backtest/calibration
analysis** allowed to live in a Python notebook if that proves more convenient — it's
offline and off the critical path. Final call deferred to open questions.

## 7. Extensibility hooks
- New strength model = implement one interface; no engine change.
- New tournament format = swap the qualifier/bracket config (kept as data, not code paths).
- New output (web widget, kickpool embed) = new consumer of the same `ResultSet` JSON.
- Parallelism = shard N across workers/cores; trivially additive because sims are
  independent.

## 8. Implementation status (2026-06-20)

The core architecture above is now implemented in `src/`, test-first (83 tests, `gate-ci`
green):

| Component | Module | Status |
|-----------|--------|--------|
| StrengthModel seam | [`src/model/strength-model.ts`](../src/model/strength-model.ts) | ✅ |
| EloPoissonModel (calibrated) | [`src/model/elo-poisson.ts`](../src/model/elo-poisson.ts) | ✅ beats baseline 18.6% |
| GroupEngine + tiebreakers | [`src/engine/standings.ts`](../src/engine/standings.ts), [`group-engine.ts`](../src/engine/group-engine.ts) | ✅ |
| KnockoutEngine | [`knockout.ts`](../src/engine/knockout.ts) (resolver) · [`bracket-2026.ts`](../src/engine/bracket-2026.ts) + [`annex-c.ts`](../src/engine/annex-c.ts) | ✅ **official 2026 bracket** (§12.6–12.11 + Annex C 495 rows) |
| Aggregator / full run | [`simulate.ts`](../src/engine/simulate.ts), [`tournament.ts`](../src/engine/tournament.ts) | ✅ champion/runner-up/final/semi/escape + MoE |
| DataProvider | [`snapshot.ts`](../src/io/snapshot.ts) · [`kickpool-provider.ts`](../src/io/kickpool-provider.ts) | ✅ SnapshotProvider + **live KickpoolApiProvider** |
| Calibration backtest | [`src/eval/`](../src/eval/) | ✅ C3 gate passes |
| Gen-AI narrator | [`src/narrate/`](../src/narrate/) | ✅ live (Anthropic) + number guardrail |
| CLI | [`src/cli.ts`](../src/cli.ts) | ✅ shows winner + runner-up |
| ClaudeAdapterModel (precomputed kickpool predictions) | — | ⏳ not yet built |

The bracket now follows the official Regulations exactly. The generic placeholder seeding in
`knockout.ts` remains only for non-12-group test tournaments. The live provider has been run
end-to-end against kickpool's own server (Node ≥20.9): `KickpoolApiProvider` →
`fromKickpoolSnapshot` → full sim → champion & runner-up odds. (kickpool labels every fixture
`GROUP_STAGE` and includes knockout placeholders like `2A`/`W73`, so the adapter selects group
matches by team-membership, not the stage label.) Remaining nice-to-have: the Claude strength
adapter as a selectable model.
