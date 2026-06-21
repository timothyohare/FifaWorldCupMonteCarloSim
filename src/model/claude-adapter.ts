// ClaudeAdapterModel — reuse kickpool's PRECOMPUTED per-match Claude predictions as a
// strength model (PRD FR13). The LLM is never called inside the simulation loop: predictions
// are looked up by team pair. Pairings without a prediction (knockout ties, hypothetical group
// matchups) fall back to a base model, so the full tournament is always coverable.
import { samplePoisson, type Rng } from "../domain/rng";
import type { TeamId } from "../domain/types";
import type { Outcome, Score, StrengthModel } from "./strength-model";

export interface MatchPrediction {
  pHome: number;
  pDraw: number;
  pAway: number;
  predictedScore: { home: number; away: number };
}

/** Shape of kickpool's `Prediction` (the fields we use). */
export interface KickpoolPrediction {
  matchId: string;
  homeWinProbability: number;
  drawProbability: number;
  awayWinProbability: number;
  predictedScore: { home: number; away: number };
}

const MIN_LAMBDA = 0.3; // keep a floor so a 0-goal prediction still varies
const key = (home: TeamId, away: TeamId) => `${home} ${away}`;

/** Join kickpool predictions (keyed by matchId) to fixtures (matchId → teams) by team pair. */
export function buildPredictionIndex(
  predictions: KickpoolPrediction[],
  fixtures: { id: string; home: TeamId; away: TeamId }[],
): Map<string, MatchPrediction> {
  const teamsById = new Map(fixtures.map((f) => [f.id, f]));
  const index = new Map<string, MatchPrediction>();
  for (const p of predictions) {
    const fx = teamsById.get(p.matchId);
    if (!fx) continue;
    const sum = p.homeWinProbability + p.drawProbability + p.awayWinProbability || 1;
    index.set(key(fx.home, fx.away), {
      pHome: p.homeWinProbability / sum,
      pDraw: p.drawProbability / sum,
      pAway: p.awayWinProbability / sum,
      predictedScore: p.predictedScore,
    });
  }
  return index;
}

export class ClaudeAdapterModel implements StrengthModel {
  constructor(
    private readonly byPair: ReadonlyMap<string, MatchPrediction>,
    private readonly fallback: StrengthModel,
  ) {}

  matchOutcome(home: TeamId, away: TeamId): Outcome {
    const p = this.byPair.get(key(home, away));
    if (!p) return this.fallback.matchOutcome(home, away);
    return { pHome: p.pHome, pDraw: p.pDraw, pAway: p.pAway };
  }

  winProbability(home: TeamId, away: TeamId): number {
    const p = this.byPair.get(key(home, away));
    if (!p) return this.fallback.winProbability?.(home, away) ?? 0.5;
    const decisive = p.pHome + p.pAway;
    return decisive > 0 ? p.pHome / decisive : 0.5;
  }

  /**
   * Sample a scoreline that honours Claude's win/draw/loss split: draw the outcome from the
   * predicted probabilities, then a scoreline of the right shape with magnitudes anchored on
   * the predicted score. Unknown pairings defer entirely to the fallback model.
   */
  sampleScore(home: TeamId, away: TeamId, rng: Rng): Score {
    const p = this.byPair.get(key(home, away));
    if (!p) return this.fallback.sampleScore(home, away, rng);

    const lamH = Math.max(MIN_LAMBDA, p.predictedScore.home);
    const lamA = Math.max(MIN_LAMBDA, p.predictedScore.away);
    const u = rng();
    if (u < p.pHome) return decisive(lamH, lamA, rng, true);
    if (u < p.pHome + p.pDraw) {
      const g = samplePoisson((lamH + lamA) / 2, rng);
      return { home: g, away: g };
    }
    return decisive(lamH, lamA, rng, false);
  }
}

/** Sample a non-drawn scoreline, enforcing the chosen winner. */
function decisive(lamHome: number, lamAway: number, rng: Rng, homeWins: boolean): Score {
  let home = samplePoisson(lamHome, rng);
  let away = samplePoisson(lamAway, rng);
  if (homeWins && home <= away) home = away + 1;
  if (!homeWins && away <= home) away = home + 1;
  return { home, away };
}
