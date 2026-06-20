import { describe, it, expect } from "vitest";
import { runTournament } from "./tournament";
import { EloPoissonModel } from "../model/elo-poisson";
import type { TournamentInput } from "./simulate";
import type { GroupInput } from "./group-engine";

const ratings = new Map([
  ["BRA", 2080],
  ["SUI", 1820],
  ["SRB", 1790],
  ["CMR", 1660],
  ["ARG", 2060],
  ["MEX", 1810],
  ["POL", 1775],
  ["KSA", 1650],
]);
const model = new EloPoissonModel(ratings, { homeAdvantage: 0 });

const group = (g: string, teams: string[]): GroupInput => ({
  group: g,
  teams: teams.map((id) => ({ id })),
  played: [],
  remaining: [
    { home: teams[0], away: teams[1] },
    { home: teams[2], away: teams[3] },
    { home: teams[0], away: teams[2] },
    { home: teams[1], away: teams[3] },
    { home: teams[0], away: teams[3] },
    { home: teams[1], away: teams[2] },
  ],
});

// 2 groups, top-2 each → a 4-team knockout (bestThirds = 0).
const input: TournamentInput = {
  groups: [group("A", ["BRA", "SUI", "SRB", "CMR"]), group("B", ["ARG", "MEX", "POL", "KSA"])],
  bestThirds: 0,
};

describe("runTournament — full pipeline to champion probabilities", () => {
  it("is reproducible for a fixed seed", () => {
    const a = runTournament(input, model, { sims: 400, seed: 7 });
    const b = runTournament(input, model, { sims: 400, seed: 7 });
    expect(a).toEqual(b);
  });

  it("champion probabilities sum to 1 (exactly one winner per sim)", () => {
    const rs = runTournament(input, model, { sims: 1000, seed: 2 });
    const total = rs.teams.reduce((s, t) => s + t.champion, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it("stage probabilities are monotone: champion ≤ final ≤ semi ≤ escape", () => {
    const rs = runTournament(input, model, { sims: 1500, seed: 5 });
    for (const t of rs.teams) {
      expect(t.champion).toBeLessThanOrEqual(t.reachFinal + 1e-9);
      expect(t.reachFinal).toBeLessThanOrEqual(t.reachSemi + 1e-9);
      expect(t.reachSemi).toBeLessThanOrEqual(t.escapeGroup + 1e-9);
    }
  });

  it("ranks strong teams above weak ones on title odds", () => {
    const rs = runTournament(input, model, { sims: 4000, seed: 9 });
    const champ = (team: string) => rs.teams.find((t) => t.team === team)!.champion;
    expect(champ("BRA")).toBeGreaterThan(champ("CMR"));
    expect(champ("ARG")).toBeGreaterThan(champ("KSA"));
    // Output is sorted by title odds, strongest first.
    expect(["BRA", "ARG"]).toContain(rs.teams[0].team);
  });

  it("reports champion margin of error and run metadata", () => {
    const rs = runTournament(input, model, { sims: 500, seed: 1 });
    expect(rs.teams.every((t) => t.championMoE >= 0)).toBe(true);
    expect(rs.metadata).toMatchObject({ sims: 500, seed: 1, bestThirds: 0 });
  });
});
