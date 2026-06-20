// Walk-forward backtest: evolve Elo over history; for each match in the eval window, predict
// W/D/L from the *pre-match* ratings via the Elo→Poisson mapping, then score vs the
// coin-flip baseline. This is the C3 calibration gate (docs/04-verification.md, spike S8).
import { EloTable } from "./elo-ratings";
import { eloLambdas, poissonWdl, type EloPoissonParams } from "../model/elo-poisson";
import { baselineLogLoss, brier, logLoss, type Outcome, type Sample } from "./scoring";

export interface HistMatch {
  date: string;
  home: string;
  away: string;
  hg: number;
  ag: number;
  neutral: boolean;
  tournament: string;
}

export interface BacktestOptions {
  /** Score matches on/after this ISO date (earlier matches only warm up the ratings). */
  evalFrom: string;
  /** Optional filter on the eval set (e.g. only "FIFA World Cup"). */
  evalTournament?: string;
  eloHomeAdvantage?: number;
  eloK?: number;
  maxGoals?: number;
}

export interface BacktestResult {
  n: number;
  logLoss: number;
  baseline: number;
  brier: number;
  /** Fractional log-loss improvement over the coin-flip baseline (>0 means better). */
  improvement: number;
}

export function backtest(
  matches: HistMatch[],
  params: EloPoissonParams,
  opts: BacktestOptions,
): BacktestResult {
  const elo = new EloTable({ homeAdvantage: opts.eloHomeAdvantage ?? 65, k: opts.eloK ?? 20 });
  const sorted = [...matches].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const maxGoals = opts.maxGoals ?? 8;

  const samples: Sample[] = [];
  const outcomes: Outcome[] = [];
  for (const mt of sorted) {
    const inWindow = mt.date >= opts.evalFrom && (!opts.evalTournament || mt.tournament === opts.evalTournament);
    if (inWindow) {
      const homeAdvantage = mt.neutral ? 0 : params.homeAdvantage;
      const lam = eloLambdas(elo.get(mt.home), elo.get(mt.away), { ...params, homeAdvantage });
      const wdl = poissonWdl(lam.home, lam.away, maxGoals);
      const outcome: Outcome = mt.hg > mt.ag ? 0 : mt.hg === mt.ag ? 1 : 2;
      samples.push({ probs: [wdl.pHome, wdl.pDraw, wdl.pAway], outcome });
      outcomes.push(outcome);
    }
    elo.update(mt.home, mt.away, mt.hg, mt.ag, { neutral: mt.neutral });
  }

  const ll = logLoss(samples);
  const base = baselineLogLoss(outcomes);
  return { n: samples.length, logLoss: ll, baseline: base, brier: brier(samples), improvement: (base - ll) / base };
}
