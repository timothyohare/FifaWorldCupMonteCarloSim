// Runs the demo-style spikes and prints findings for docs/13-spike-findings.md.
import { runDemo as s1 } from "./s1-knockout-draw";
import { ratingsToOutcome } from "./s3-elo-poisson";
import { runDemo as s5 } from "./s5-perf-rng";
import { generateNarrative, type NarratorClient, type ResultRow } from "./s7-narrator";
import { runDemo as s8 } from "./s8-backtest";

const pct = (p: number) => `${(p * 100).toFixed(1)}%`;

console.log("=== S1 — knockout draw resolution (Δ=150 favourite) ===");
const a = s1();
console.log(`per-tie P(advance):  flat=${pct(a.perTie.flat)}  two-stage=${pct(a.perTie.twoStage)}  strength=${pct(a.perTie.strengthWeighted)}`);
console.log(`champion over 4 rounds: flat=${pct(a.champion4.flat)}  two-stage=${pct(a.champion4.twoStage)}  strength=${pct(a.champion4.strengthWeighted)}`);

console.log("\n=== S3 — Elo→Poisson win/draw/loss by rating gap (home adv on) ===");
for (const [rh, ra] of [[1800, 1800], [1900, 1750], [2100, 1800], [2200, 1700]] as const) {
  const o = ratingsToOutcome(rh, ra);
  console.log(`Δ=${rh - ra}: home=${pct(o.pHome)} draw=${pct(o.pDraw)} away=${pct(o.pAway)}  (λ ${o.expectedScore.home.toFixed(2)}-${o.expectedScore.away.toFixed(2)})`);
}

console.log("\n=== S5 — perf + RNG determinism ===");
const p = s5();
console.log(`${p.measuredDraws.toLocaleString()} Poisson draws in ${p.ms.toFixed(0)}ms → ${(p.drawsPerSec / 1e6).toFixed(1)}M draws/s`);
console.log(`projected 100k full-tournament sims: ${p.projected100kSeconds.toFixed(2)}s`);
console.log(`RNG deterministic=${p.rngDeterministic}  differs-across-seed=${p.rngDiffersAcrossSeed}`);

console.log("\n=== S7 — narrator (offline mock client) ===");
const before: ResultRow[] = [{ team: "Argentina", champion: 0.142 }, { team: "France", champion: 0.131 }];
const after: ResultRow[] = [{ team: "Argentina", champion: 0.22 }, { team: "France", champion: 0.06 }];
const mock: NarratorClient = { async complete() { return "Argentina jumped to 22.0% as France slid to 6.0%."; } };
const n = await generateNarrative(before, after, mock, 2);
console.log(`narrative: ${n.narrative}`);
console.log(`guardrail violations: ${n.violations.length === 0 ? "none" : n.violations.join(", ")}`);

console.log("\n=== S8 — backtest harness (synthetic) ===");
const b = s8();
console.log(`n=${b.n}  skilled logLoss=${b.skilled.logLoss.toFixed(3)}  baseline logLoss=${b.baseline.logLoss.toFixed(3)}  skilledBeatsBaseline=${b.skilledBeatsBaseline}`);
console.log(`skilled brier=${b.skilled.brier.toFixed(3)}  baseline brier=${b.baseline.brier.toFixed(3)}`);
