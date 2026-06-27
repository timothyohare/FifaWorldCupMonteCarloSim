// Monte Carlo runner + Aggregator for the group stage.
// Plays the remaining group matches N times under a strength model and counts how often each
// team wins its group, finishes runner-up, takes a best-third slot, and escapes the group.
// Pure given (input, model, seed, sims) → reproducible ResultSet (NFR2).
import { mulberry32 } from "../domain/rng";
import type { MatchResult, TeamId } from "../domain/types";
import { completeGroup, selectQualifiers, type GroupInput } from "./group-engine";
import type { StrengthModel } from "../model/strength-model";

export interface TournamentInput {
  groups: GroupInput[];
  /** How many third-placed teams advance (8 in the 2026 format). */
  bestThirds?: number;
  /**
   * Knockout ties already played, used to condition the simulation once the bracket is underway.
   * Keyed on the two teams; a recorded result fixes that tie instead of re-simulating it.
   */
  knockout?: MatchResult[];
}

export interface RunOptions {
  sims: number;
  seed: number;
}

export interface TeamStageProbs {
  team: TeamId;
  group: string;
  winGroup: number;
  runnerUp: number;
  bestThird: number;
  escapeGroup: number;
  /** 95% Monte Carlo margin of error on escapeGroup. */
  escapeMoE: number;
}

export interface RunMetadata {
  sims: number;
  seed: number;
  bestThirds: number;
}

export interface ResultSet {
  teams: TeamStageProbs[];
  metadata: RunMetadata;
}

interface Counts {
  group: string;
  winGroup: number;
  runnerUp: number;
  bestThird: number;
  escapeGroup: number;
}

const Z95 = 1.959964;

export function runGroupStage(input: TournamentInput, model: StrengthModel, opts: RunOptions): ResultSet {
  const bestThirds = input.bestThirds ?? 8;
  const rng = mulberry32(opts.seed);

  const counts = new Map<TeamId, Counts>();
  for (const g of input.groups) {
    for (const t of g.teams) {
      counts.set(t.id, { group: g.group, winGroup: 0, runnerUp: 0, bestThird: 0, escapeGroup: 0 });
    }
  }

  for (let s = 0; s < opts.sims; s++) {
    const results = input.groups.map((g) => completeGroup(g, model, rng));
    const q = selectQualifiers(results, { bestThirds });
    const winners = new Set(q.winners);
    const runners = new Set(q.runnersUp);
    const thirds = new Set(q.bestThirds);

    for (const team of counts.keys()) {
      const c = counts.get(team)!;
      if (winners.has(team)) {
        c.winGroup += 1;
        c.escapeGroup += 1;
      } else if (runners.has(team)) {
        c.runnerUp += 1;
        c.escapeGroup += 1;
      } else if (thirds.has(team)) {
        c.bestThird += 1;
        c.escapeGroup += 1;
      }
    }
  }

  const n = opts.sims;
  const moe = (count: number): number => {
    const p = count / n;
    return Z95 * Math.sqrt((p * (1 - p)) / n);
  };

  const teams: TeamStageProbs[] = [...counts.entries()]
    .map(([team, c]) => ({
      team,
      group: c.group,
      winGroup: c.winGroup / n,
      runnerUp: c.runnerUp / n,
      bestThird: c.bestThird / n,
      escapeGroup: c.escapeGroup / n,
      escapeMoE: moe(c.escapeGroup),
    }))
    .sort((a, b) => b.escapeGroup - a.escapeGroup || a.team.localeCompare(b.team));

  return { teams, metadata: { sims: n, seed: opts.seed, bestThirds } };
}
