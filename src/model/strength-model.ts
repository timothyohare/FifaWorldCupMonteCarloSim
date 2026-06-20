// The one seam between the simulation engine (rules) and the football (strength).
// Any model — Elo/Poisson, the kickpool Claude adapter, the baseline — implements this.
import type { Rng } from "../domain/rng";
import type { TeamId } from "../domain/types";

export interface Outcome {
  pHome: number;
  pDraw: number;
  pAway: number;
}

export interface Score {
  home: number;
  away: number;
}

export interface StrengthModel {
  /** Win/draw/loss probabilities for a single match. */
  matchOutcome(home: TeamId, away: TeamId): Outcome;
  /** Sample a concrete scoreline (needed for goal-difference tiebreakers). */
  sampleScore(home: TeamId, away: TeamId, rng: Rng): Score;
}
