// Full-tournament Monte Carlo: group stage → qualifiers → knockout → champion & runner-up.
// Uses the real FIFA 2026 bracket (Annex C + fixed tree) when given the 12 groups A–L;
// falls back to a generic power-of-two bracket otherwise (e.g. small test tournaments).
// Pure given (input, model, seed, sims) → reproducible (NFR2).
import { mulberry32 } from "../domain/rng";
import type { TeamId } from "../domain/types";
import { completeGroup, selectQualifiers } from "./group-engine";
import { playKnockout, seedBracket } from "./knockout";
import { ANNEX_C } from "./annex-c";
import { buildWorldCupBracket, playWorldCupKnockout } from "./bracket-2026";
import type { RunMetadata, RunOptions, TournamentInput } from "./simulate";
import type { StrengthModel } from "../model/strength-model";

export interface TeamFullProbs {
  team: TeamId;
  group: string;
  champion: number;
  runnerUp: number;
  reachFinal: number;
  reachSemi: number;
  escapeGroup: number;
  championMoE: number;
  runnerUpMoE: number;
}

export interface FullResultSet {
  teams: TeamFullProbs[];
  metadata: RunMetadata & { bracket: "fifa-2026" | "generic" };
}

interface Counts {
  group: string;
  champion: number;
  runnerUp: number;
  reachFinal: number;
  reachSemi: number;
  escapeGroup: number;
}

const Z95 = 1.959964;
const WC_GROUPS = "ABCDEFGHIJKL";

function isWorldCup(input: TournamentInput): boolean {
  const labels = input.groups.map((g) => g.group).sort().join("");
  return labels === WC_GROUPS && (input.bestThirds ?? 8) === 8;
}

interface SimOutcome {
  champion: TeamId;
  finalists: TeamId[];
  semifinalists: TeamId[];
  escaped: TeamId[];
}

export function runTournament(input: TournamentInput, model: StrengthModel, opts: RunOptions): FullResultSet {
  const bestThirds = input.bestThirds ?? 8;
  const useFifa = isWorldCup(input);
  const rng = mulberry32(opts.seed);

  const groupOf = new Map<TeamId, string>();
  const counts = new Map<TeamId, Counts>();
  for (const g of input.groups) {
    for (const t of g.teams) {
      groupOf.set(t.id, g.group);
      counts.set(t.id, { group: g.group, champion: 0, runnerUp: 0, reachFinal: 0, reachSemi: 0, escapeGroup: 0 });
    }
  }

  for (let s = 0; s < opts.sims; s++) {
    const out = simulateOnce(input, model, rng, bestThirds, useFifa, groupOf);
    for (const team of out.escaped) counts.get(team)!.escapeGroup += 1;
    for (const team of out.semifinalists) counts.get(team)!.reachSemi += 1;
    for (const team of out.finalists) {
      counts.get(team)!.reachFinal += 1;
      if (team !== out.champion) counts.get(team)!.runnerUp += 1;
    }
    counts.get(out.champion)!.champion += 1;
  }

  const n = opts.sims;
  const moe = (count: number): number => {
    const p = count / n;
    return Z95 * Math.sqrt((p * (1 - p)) / n);
  };

  const teams: TeamFullProbs[] = [...counts.entries()]
    .map(([team, c]) => ({
      team,
      group: c.group,
      champion: c.champion / n,
      runnerUp: c.runnerUp / n,
      reachFinal: c.reachFinal / n,
      reachSemi: c.reachSemi / n,
      escapeGroup: c.escapeGroup / n,
      championMoE: moe(c.champion),
      runnerUpMoE: moe(c.runnerUp),
    }))
    .sort((a, b) => b.champion - a.champion || b.reachFinal - a.reachFinal || a.team.localeCompare(b.team));

  return { teams, metadata: { sims: n, seed: opts.seed, bestThirds, bracket: useFifa ? "fifa-2026" : "generic" } };
}

function simulateOnce(
  input: TournamentInput,
  model: StrengthModel,
  rng: () => number,
  bestThirds: number,
  useFifa: boolean,
  groupOf: ReadonlyMap<TeamId, string>,
): SimOutcome {
  const results = input.groups.map((g) => completeGroup(g, model, rng));
  const q = selectQualifiers(results, { bestThirds });
  const escaped = [...q.winners, ...q.runnersUp, ...q.bestThirds];

  if (useFifa) {
    const ko = playWorldCupKnockout(buildWorldCupBracket(results, ANNEX_C), model, rng);
    return { champion: ko.champion, finalists: ko.finalists, semifinalists: ko.semifinalists, escaped };
  }

  const ko = playKnockout(seedBracket(q, groupOf), model, rng);
  const atLeast = (level: number) => [...ko.reached].filter(([, r]) => r >= level).map(([t]) => t);
  return {
    champion: ko.champion,
    finalists: atLeast(ko.rounds - 1),
    semifinalists: atLeast(ko.rounds - 2),
    escaped,
  };
}
