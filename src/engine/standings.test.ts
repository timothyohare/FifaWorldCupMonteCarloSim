import { describe, it, expect } from "vitest";
import { rankGroup } from "./standings";
import type { MatchResult, TeamMeta } from "../domain/types";

const m = (home: string, hg: number, ag: number, away: string): MatchResult => ({
  home,
  away,
  homeGoals: hg,
  awayGoals: ag,
});
const order = (rows: { team: string }[]) => rows.map((r) => r.team);

describe("rankGroup — standings + FIFA Article 13 tiebreakers", () => {
  it("computes per-team W/D/L, goals and points correctly", () => {
    const teams: TeamMeta[] = [{ id: "A" }, { id: "B" }, { id: "C" }, { id: "D" }];
    const matches = [
      m("A", 2, 0, "B"),
      m("A", 1, 1, "C"),
      m("A", 3, 1, "D"),
      m("B", 0, 0, "C"),
      m("B", 2, 1, "D"),
      m("C", 1, 0, "D"),
    ];
    const rows = rankGroup(teams, matches);
    const a = rows.find((r) => r.team === "A")!;
    expect(a).toMatchObject({
      played: 3,
      won: 2,
      drawn: 1,
      lost: 0,
      goalsFor: 6,
      goalsAgainst: 2,
      goalDifference: 4,
      points: 7,
    });
    expect(rows.map((r) => r.position)).toEqual([1, 2, 3, 4]);
    expect(rows[0].team).toBe("A");
  });

  it("orders purely by points when there are no ties", () => {
    const teams: TeamMeta[] = [{ id: "A" }, { id: "B" }, { id: "C" }, { id: "D" }];
    const matches = [
      m("A", 2, 0, "B"),
      m("A", 2, 0, "C"),
      m("A", 2, 0, "D"),
      m("B", 1, 0, "C"),
      m("B", 1, 0, "D"),
      m("C", 1, 0, "D"),
    ];
    expect(order(rankGroup(teams, matches))).toEqual(["A", "B", "C", "D"]);
  });

  it("applies head-to-head BEFORE overall goal difference (the 2026 reversal)", () => {
    const teams: TeamMeta[] = [{ id: "A" }, { id: "B" }, { id: "C" }, { id: "D" }];
    const matches = [
      m("A", 5, 0, "C"),
      m("A", 5, 0, "D"),
      m("B", 1, 0, "A"), // B beats A head-to-head despite A's huge GD
      m("B", 1, 0, "C"),
      m("D", 1, 0, "B"),
      m("C", 1, 0, "D"),
    ];
    expect(order(rankGroup(teams, matches))).toEqual(["B", "A", "C", "D"]);
  });

  it("real oracle — 2018 World Cup Group H (Japan over Senegal on fair play)", () => {
    const teams: TeamMeta[] = [
      { id: "COL" },
      { id: "JPN", conduct: -4 },
      { id: "SEN", conduct: -6 },
      { id: "POL" },
    ];
    const matches = [
      m("COL", 1, 2, "JPN"),
      m("POL", 1, 2, "SEN"),
      m("JPN", 2, 2, "SEN"),
      m("POL", 0, 3, "COL"),
      m("JPN", 0, 1, "POL"),
      m("SEN", 0, 1, "COL"),
    ];
    expect(order(rankGroup(teams, matches))).toEqual(["COL", "JPN", "SEN", "POL"]);
  });

  it("re-applies head-to-head among a shrunken tie, over FIFA ranking", () => {
    const teams: TeamMeta[] = [
      { id: "A" },
      { id: "B", fifaRank: 20 },
      { id: "C", fifaRank: 1 },
      { id: "D" },
    ];
    const matches = [
      m("A", 1, 0, "B"),
      m("B", 1, 0, "C"),
      m("C", 1, 0, "A"),
      m("A", 5, 0, "D"),
      m("B", 1, 0, "D"),
      m("C", 1, 0, "D"),
    ];
    expect(order(rankGroup(teams, matches))).toEqual(["A", "B", "C", "D"]);
  });

  it("flags drawing-of-lots when teams are genuinely identical", () => {
    const teams: TeamMeta[] = [{ id: "X" }, { id: "Y" }];
    const rows = rankGroup(teams, [m("X", 1, 1, "Y")]);
    expect(rows.some((r) => r.rankedByLots)).toBe(true);
  });
});
