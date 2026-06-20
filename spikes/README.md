# Spikes — throwaway exploratory prototypes

These are **time-boxed spikes**, not production code. Each answers one de-risking question
from [`../docs/12-rules-sources.md`](../docs/12-rules-sources.md#spike-register) and produces
a written finding in [`../docs/13-spike-findings.md`](../docs/13-spike-findings.md). They are
intentionally small, self-contained, and may be deleted or rewritten when the real engine is
built. They are **not** the architecture — they validate assumptions cheaply.

## Running

```bash
npm install
npm run typecheck     # tsc --noEmit over all spikes
npm test              # vitest — correctness/oracle assertions (S2, S3, S4, S6, S7, S8)
npm run report        # prints the demo findings (S1, S3, S5, S7, S8) captured in the doc
```

## Map

| File | Spike | What it proves |
|------|-------|----------------|
| `s1-knockout-draw.ts` | S1 | How draw-resolution choice shifts deep-run probabilities. |
| `s2-tiebreakers.ts` (+`.test.ts`) | S2 | FIFA Art. 13 chain, H2H-first, 3+-way recursion. |
| `s3-elo-poisson.ts` (+`.test.ts`) | S3 | Elo→λ→Poisson mapping is sane and monotone. |
| `s4-kickpool-adapter.ts` (+`.test.ts`) | S4 | kickpool standings/fixtures → sim `TournamentState`. |
| `s5-perf-rng.ts` | S5 | 100k-sim throughput budget + seeded-RNG determinism. |
| `s6-bracket-mapping.ts` (+`.test.ts`) | S6 | Third-place→R32 slot allocation *mechanism*. |
| `s7-narrator.ts` (+`.test.ts`) | S7 | Post-run narrator prompt + read-only guardrail (offline mock). |
| `s8-backtest.ts` (+`.test.ts`) | S8 | log-loss / Brier / calibration vs coin-flip baseline. |
| `domain.ts` | — | Tiny shared types + deterministic RNG. |
| `report.ts` | — | Runs the demo summaries for the findings doc. |
