import { describe, it, expect } from "vitest";
import { runGroupStage, type TournamentInput } from "./simulate";
import { EloPoissonModel } from "../model/elo-poisson";
import type { GroupInput } from "./group-engine";

const ratings = new Map([
  ["BRA", 2050],
  ["SUI", 1820],
  ["SRB", 1780],
  ["CMR", 1680],
  ["ARG", 2030],
  ["MEX", 1820],
  ["POL", 1770],
  ["KSA", 1660],
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

const input: TournamentInput = {
  groups: [group("A", ["BRA", "SUI", "SRB", "CMR"]), group("B", ["ARG", "MEX", "POL", "KSA"])],
  bestThirds: 1,
};

describe("runGroupStage — Monte Carlo aggregator", () => {
  it("is reproducible for a fixed seed", () => {
    const a = runGroupStage(input, model, { sims: 300, seed: 7 });
    const b = runGroupStage(input, model, { sims: 300, seed: 7 });
    expect(a).toEqual(b);
  });

  it("emits a probability per team for every stage, all in [0,1]", () => {
    const rs = runGroupStage(input, model, { sims: 500, seed: 1 });
    expect(rs.teams).toHaveLength(8);
    for (const t of rs.teams) {
      for (const p of [t.winGroup, t.runnerUp, t.bestThird, t.escapeGroup]) {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
      // Escaping the group is at least as likely as winning it.
      expect(t.escapeGroup).toBeGreaterThanOrEqual(t.winGroup - 1e-9);
    }
  });

  it("has exactly one group winner per group per sim (probabilities sum to 1)", () => {
    const rs = runGroupStage(input, model, { sims: 400, seed: 3 });
    const groupAWin = rs.teams
      .filter((t) => ["BRA", "SUI", "SRB", "CMR"].includes(t.team))
      .reduce((s, t) => s + t.winGroup, 0);
    expect(groupAWin).toBeCloseTo(1, 6);
  });

  it("ranks a strong team above a weak one on escape probability", () => {
    const rs = runGroupStage(input, model, { sims: 2000, seed: 9 });
    const bra = rs.teams.find((t) => t.team === "BRA")!;
    const cmr = rs.teams.find((t) => t.team === "CMR")!;
    expect(bra.escapeGroup).toBeGreaterThan(cmr.escapeGroup);
  });

  it("reports a Monte Carlo margin of error that shrinks as sims grow", () => {
    const few = runGroupStage(input, model, { sims: 200, seed: 5 });
    const many = runGroupStage(input, model, { sims: 5000, seed: 5 });
    const moe = (rs: typeof few, team: string) => rs.teams.find((t) => t.team === team)!.escapeMoE;
    expect(moe(many, "BRA")).toBeLessThan(moe(few, "BRA"));
    expect(few.metadata).toMatchObject({ sims: 200, seed: 5, bestThirds: 1 });
  });
});
