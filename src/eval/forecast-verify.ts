// Forecast verification for the daily odds history: scores each day's binary market
// (escape group, reach semi, …) against the realised outcome with proper scoring rules.
// Pure functions — the runnable report lives in forecast-report.ts.
import type { Rng } from "../domain/rng";
import type { TeamId } from "../domain/types";

export type MarketName = "champion" | "runnerUp" | "reachFinal" | "reachSemi" | "escapeGroup";

export const MARKETS: MarketName[] = ["champion", "runnerUp", "reachFinal", "reachSemi", "escapeGroup"];

export type MarketProbs = Record<MarketName, number>;

export interface OddsHistory {
  dates: string[];
  teams: TeamId[];
  /** date → team → market probabilities */
  rows: Record<string, Record<TeamId, MarketProbs>>;
}

const HEADER = "date,team,group,champion,runnerUp,reachFinal,reachSemi,escapeGroup";

/** Parse history/champion-odds.csv. Validates the header loudly (same stance as SnapshotError). */
export function parseOddsCsv(csv: string): OddsHistory {
  const lines = csv.trim().split("\n");
  if (lines[0]?.trim() !== HEADER) {
    throw new Error(`unexpected odds CSV header: "${lines[0]}" (expected "${HEADER}")`);
  }
  const rows: OddsHistory["rows"] = {};
  const teams = new Set<TeamId>();
  for (const line of lines.slice(1)) {
    const f = line.split(",");
    if (f.length !== 8) throw new Error(`odds CSV row has ${f.length} fields: "${line}"`);
    const [date, team, , champion, runnerUp, reachFinal, reachSemi, escapeGroup] = f;
    const probs: MarketProbs = {
      champion: Number(champion),
      runnerUp: Number(runnerUp),
      reachFinal: Number(reachFinal),
      reachSemi: Number(reachSemi),
      escapeGroup: Number(escapeGroup),
    };
    for (const m of MARKETS) {
      if (!Number.isFinite(probs[m]) || probs[m] < 0 || probs[m] > 1) {
        throw new Error(`odds CSV row has a bad ${m} probability: "${line}"`);
      }
    }
    (rows[date] ??= {})[team] = probs;
    teams.add(team);
  }
  return { dates: Object.keys(rows).sort(), teams: [...teams].sort(), rows };
}

/** Committed record of the realised knockout outcomes (fixtures/wc2026-outcomes.json). */
export interface OutcomesFixture {
  asOf: string;
  quarterFinalists: TeamId[];
  semiFinalists: TeamId[];
  finalists: TeamId[] | null;
  champion: TeamId | null;
  runnerUp: TeamId | null;
}

/**
 * The set of teams that achieved each market's outcome, for every market that has
 * resolved. Markets still in play (e.g. champion before the final) are absent, so the
 * report scores exactly what is knowable and upgrades itself as outcomes land.
 */
export function resolveMarkets(
  outcomes: OutcomesFixture,
  qualifiers: TeamId[],
): Partial<Record<MarketName, Set<TeamId>>> {
  const markets: Partial<Record<MarketName, Set<TeamId>>> = {
    escapeGroup: new Set(qualifiers),
    reachSemi: new Set(outcomes.semiFinalists),
  };
  if (outcomes.finalists) markets.reachFinal = new Set(outcomes.finalists);
  if (outcomes.champion) markets.champion = new Set([outcomes.champion]);
  if (outcomes.runnerUp) markets.runnerUp = new Set([outcomes.runnerUp]);
  return markets;
}

/** Mean squared error of binary probability forecasts (proper; lower is better). */
export function brierBinary(ps: number[], ys: number[]): number {
  if (ps.length !== ys.length || ps.length === 0) throw new Error("brierBinary: length mismatch or empty");
  return ps.reduce((s, p, i) => s + (p - ys[i]) ** 2, 0) / ps.length;
}

/** Skill vs always forecasting the base rate: 0 = no better, 1 = perfect, <0 = worse. */
export function brierSkillScore(ps: number[], ys: number[]): number {
  const base = ys.reduce((a, b) => a + b, 0) / ys.length;
  const ref = brierBinary(ys.map(() => base), ys);
  return 1 - brierBinary(ps, ys) / ref;
}

/** P(random positive is priced above a random negative); ties count half. */
export function auc(ps: number[], ys: number[]): number {
  let wins = 0;
  let pairs = 0;
  for (let i = 0; i < ps.length; i++) {
    if (ys[i] !== 1) continue;
    for (let j = 0; j < ps.length; j++) {
      if (ys[j] !== 0) continue;
      pairs++;
      if (ps[i] > ps[j]) wins++;
      else if (ps[i] === ps[j]) wins += 0.5;
    }
  }
  if (pairs === 0) throw new Error("auc: needs at least one positive and one negative");
  return wins / pairs;
}

export interface PermutationOptions {
  permutations: number;
  rng: Rng;
}

/**
 * One-sided permutation test on the Brier score. The null keeps the forecasts fixed and
 * shuffles which k teams achieved the outcome, preserving the exactly-k-of-n structure
 * (outcomes are contested slots, so a binomial test would be invalid). Returns
 * (#permutations with Brier ≤ observed + 1) / (N + 1) — the add-one keeps it a valid
 * p-value and makes 1/(N+1) the smallest resolvable result.
 */
export function permutationPValue(ps: number[], ys: number[], opts: PermutationOptions): number {
  const observed = brierBinary(ps, ys);
  const perm = [...ys];
  let atLeastAsGood = 0;
  for (let t = 0; t < opts.permutations; t++) {
    for (let i = perm.length - 1; i > 0; i--) {
      const j = Math.floor(opts.rng() * (i + 1));
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    if (brierBinary(ps, perm) <= observed) atLeastAsGood++;
  }
  return (atLeastAsGood + 1) / (opts.permutations + 1);
}

export interface CalibrationBin {
  lo: number;
  hi: number;
  n: number;
  meanPredicted: number;
  observed: number;
}

/** Equal-width reliability bins; empty bins report n=0 with NaN means. */
export function calibrationBins(ps: number[], ys: number[], bins: number): CalibrationBin[] {
  if (ps.length !== ys.length) throw new Error("calibrationBins: length mismatch");
  const out: CalibrationBin[] = Array.from({ length: bins }, (_, b) => ({
    lo: b / bins,
    hi: (b + 1) / bins,
    n: 0,
    meanPredicted: 0,
    observed: 0,
  }));
  for (let i = 0; i < ps.length; i++) {
    const b = Math.min(bins - 1, Math.floor(ps[i] * bins));
    out[b].n++;
    out[b].meanPredicted += ps[i];
    out[b].observed += ys[i];
  }
  for (const bin of out) {
    bin.meanPredicted = bin.n ? bin.meanPredicted / bin.n : NaN;
    bin.observed = bin.n ? bin.observed / bin.n : NaN;
  }
  return out;
}
