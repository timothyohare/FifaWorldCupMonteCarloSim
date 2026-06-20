// Forecast scoring for calibration/backtests (promoted from spike S8).
export type Outcome = 0 | 1 | 2; // home win / draw / away win
export type Probs = [number, number, number];

export interface Sample {
  probs: Probs;
  outcome: Outcome;
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
    for (let k = 0; k < 3; k++) s += (probs[k] - (outcome === k ? 1 : 0)) ** 2;
  }
  return s / samples.length;
}

export const UNIFORM: Probs = [1 / 3, 1 / 3, 1 / 3];

/** Log loss of the coin-flip baseline over the same outcomes — exactly ln 3. */
export function baselineLogLoss(outcomes: Outcome[]): number {
  return logLoss(outcomes.map((outcome) => ({ probs: UNIFORM, outcome })));
}
