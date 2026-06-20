// S8 — calibration / log-loss backtest harness (Q7, the C3 kill-pivot gate).
// Implements the scoring machinery and a coin-flip baseline, and proves it on a synthetic
// dataset (a calibrated predictor must beat uniform). The REAL backtest feeds this the
// martj42 historical results (CC0) replayed from past tournaments — see docs/12-rules-sources.md.
import { mulberry32 } from "./domain";

export type Outcome = 0 | 1 | 2; // home win / draw / away win
export type Probs = [number, number, number];

export interface Sample {
  probs: Probs; // a predictor's forecast
  outcome: Outcome; // what actually happened
}

const EPS = 1e-15;
const clamp01 = (p: number) => Math.min(1 - EPS, Math.max(EPS, p));

/** Multiclass log loss (lower is better). */
export function logLoss(samples: Sample[]): number {
  let s = 0;
  for (const { probs, outcome } of samples) s += -Math.log(clamp01(probs[outcome]));
  return s / samples.length;
}

/** Multiclass Brier score (lower is better). */
export function brier(samples: Sample[]): number {
  let s = 0;
  for (const { probs, outcome } of samples) {
    for (let k = 0; k < 3; k++) {
      const y = outcome === k ? 1 : 0;
      s += (probs[k] - y) ** 2;
    }
  }
  return s / samples.length;
}

export interface ReliabilityBin {
  lo: number;
  hi: number;
  count: number;
  meanPredicted: number;
  empiricalFreq: number;
}

/** Reliability of the predicted probability assigned to the realised outcome. */
export function reliability(samples: Sample[], bins = 10): ReliabilityBin[] {
  const out: ReliabilityBin[] = Array.from({ length: bins }, (_, i) => ({
    lo: i / bins,
    hi: (i + 1) / bins,
    count: 0,
    meanPredicted: 0,
    empiricalFreq: 0,
  }));
  for (const { probs, outcome } of samples) {
    const p = probs[outcome];
    const hit = 1; // by construction this is the realised outcome
    const idx = Math.min(bins - 1, Math.floor(p * bins));
    out[idx].count += 1;
    out[idx].meanPredicted += p;
    out[idx].empiricalFreq += hit;
  }
  for (const b of out) {
    if (b.count > 0) {
      b.meanPredicted /= b.count;
      b.empiricalFreq /= b.count;
    }
  }
  return out;
}

export const UNIFORM: Probs = [1 / 3, 1 / 3, 1 / 3];

/** Re-score an outcome set under the coin-flip/uniform baseline. */
export function asUniform(outcomes: Outcome[]): Sample[] {
  return outcomes.map((outcome) => ({ probs: UNIFORM, outcome }));
}

export interface S8Finding {
  n: number;
  skilled: { logLoss: number; brier: number };
  baseline: { logLoss: number; brier: number };
  skilledBeatsBaseline: boolean;
}

/**
 * Synthetic demo: draw outcomes from known "true" probabilities; a calibrated predictor
 * (which knows them) should beat the uniform baseline on both metrics.
 */
export function runDemo(n = 4000): S8Finding {
  const rng = mulberry32(2026);
  const skilled: Sample[] = [];
  const outcomes: Outcome[] = [];
  for (let i = 0; i < n; i++) {
    // A spread of realistic match shapes.
    const favHome = 0.45 + 0.3 * rng();
    const draw = 0.2 + 0.1 * rng();
    const away = Math.max(0.05, 1 - favHome - draw);
    const norm = favHome + draw + away;
    const probs: Probs = [favHome / norm, draw / norm, away / norm];
    const r = rng();
    const outcome: Outcome = r < probs[0] ? 0 : r < probs[0] + probs[1] ? 1 : 2;
    skilled.push({ probs, outcome });
    outcomes.push(outcome);
  }
  const baseline = asUniform(outcomes);
  const skilledLL = logLoss(skilled);
  const baselineLL = logLoss(baseline);
  return {
    n,
    skilled: { logLoss: skilledLL, brier: brier(skilled) },
    baseline: { logLoss: baselineLL, brier: brier(baseline) },
    skilledBeatsBaseline: skilledLL < baselineLL,
  };
}
