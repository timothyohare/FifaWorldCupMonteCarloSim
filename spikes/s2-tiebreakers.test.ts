import { describe, it, expect } from "vitest";
import { rankGroup, rankThirdPlaced, type TeamMeta } from "./s2-tiebreakers";
import type { MatchResult } from "./domain";

const m = (home: string, hg: number, ag: number, away: string): MatchResult => ({
  home,
  away,
  homeGoals: hg,
  awayGoals: ag,
});
const ids = (r: { id: string }[]) => r.map((x) => x.id);

describe("S2 — FIFA Article 13 group tiebreakers", () => {
  it("orders by points when there are no ties", () => {
    const teams: TeamMeta[] = [{ id: "A" }, { id: "B" }, { id: "C" }, { id: "D" }];
    const matches = [
      m("A", 2, 0, "B"),
      m("A", 2, 0, "C"),
      m("A", 2, 0, "D"),
      m("B", 1, 0, "C"),
      m("B", 1, 0, "D"),
      m("C", 1, 0, "D"),
    ];
    expect(ids(rankGroup(teams, matches))).toEqual(["A", "B", "C", "D"]);
  });

  it("applies head-to-head BEFORE overall goal difference (the 2026 reversal)", () => {
    // A and B both finish on 6 pts. A has a far better overall GD (+9 vs +1),
    // but B beat A head-to-head, so B must rank above A.
    const teams: TeamMeta[] = [{ id: "A" }, { id: "B" }, { id: "C" }, { id: "D" }];
    const matches = [
      m("A", 5, 0, "C"),
      m("A", 5, 0, "D"),
      m("B", 1, 0, "A"), // head-to-head: B over A
      m("B", 1, 0, "C"),
      m("D", 1, 0, "B"),
      m("C", 1, 0, "D"),
    ];
    const order = ids(rankGroup(teams, matches));
    expect(order.indexOf("B")).toBeLessThan(order.indexOf("A")); // H2H wins
    expect(order).toEqual(["B", "A", "C", "D"]);
  });

  it("real oracle — 2018 World Cup Group H (Japan over Senegal on fair play)", () => {
    // Japan & Senegal: level on points(4), GD(0), GF(4) and drew head-to-head 2-2.
    // Separated only by conduct/fair-play: Japan -4, Senegal -6 → Japan advances.
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
    expect(ids(rankGroup(teams, matches))).toEqual(["COL", "JPN", "SEN", "POL"]);
  });

  it("3-way tie: re-applies head-to-head among the shrunken subset, over FIFA ranking", () => {
    // A,B,C form a perfect 1-0 cycle and all beat D, so all three sit on 6 pts and are
    // identical on H2H. A's big win over D (5-0) lifts it out on overall GD. The remaining
    // {B,C} are level on overall GD/GF — but B beat C head-to-head, so re-applied H2H must
    // rank B above C, EVEN THOUGH C has the better FIFA ranking.
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
    expect(ids(rankGroup(teams, matches))).toEqual(["A", "B", "C", "D"]);
  });

  it("falls back to drawing of lots deterministically and flags it", () => {
    // Two fully-identical teams (mirror 1-0 cycle, identical vs D, no meta) → lots.
    const teams: TeamMeta[] = [{ id: "X" }, { id: "Y" }];
    const matches = [m("X", 1, 1, "Y")];
    const ranked = rankGroup(teams, matches);
    expect(ranked.map((r) => r.id).sort()).toEqual(["X", "Y"]);
    expect(ranked.some((r) => r.byLots)).toBe(true);
  });

  it("ranks third-placed teams without head-to-head (points → GD → GF → conduct → rank)", () => {
    const order = rankThirdPlaced([
      { team: { id: "G1" }, tally: { points: 3, gd: 0, gf: 2 } },
      { team: { id: "G2" }, tally: { points: 4, gd: 1, gf: 3 } },
      { team: { id: "G3" }, tally: { points: 3, gd: 0, gf: 4 } },
    ]);
    expect(order).toEqual(["G2", "G3", "G1"]); // G2 most points; G3 beats G1 on goals scored
  });
});
