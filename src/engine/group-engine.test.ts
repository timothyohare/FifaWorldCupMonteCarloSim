import { describe, it, expect } from "vitest";
import { completeGroup, selectQualifiers, type GroupInput } from "./group-engine";
import { EloPoissonModel } from "../model/elo-poisson";
import { mulberry32 } from "../domain/rng";
import type { MatchResult } from "../domain/types";

const m = (home: string, hg: number, ag: number, away: string): MatchResult => ({
  home,
  away,
  homeGoals: hg,
  awayGoals: ag,
});

const ratings = new Map([
  ["BRA", 2050],
  ["SUI", 1820],
  ["SRB", 1780],
  ["CMR", 1700],
]);
const model = new EloPoissonModel(ratings, { homeAdvantage: 0 });

const groupA: GroupInput = {
  group: "A",
  teams: [{ id: "BRA" }, { id: "SUI" }, { id: "SRB" }, { id: "CMR" }],
  played: [m("BRA", 2, 0, "SRB"), m("BRA", 1, 0, "SUI"), m("SUI", 2, 1, "CMR")],
  remaining: [
    { home: "BRA", away: "CMR" },
    { home: "SRB", away: "SUI" },
    { home: "SRB", away: "CMR" },
  ],
};

describe("GroupEngine — completeGroup", () => {
  it("plays out remaining fixtures and returns a full 4-team table", () => {
    const res = completeGroup(groupA, model, mulberry32(1));
    expect(res.group).toBe("A");
    expect(res.table).toHaveLength(4);
    // Every team has played all 3 matches once the group is completed.
    expect(res.table.every((r) => r.played === 3)).toBe(true);
    expect(res.table.map((r) => r.position)).toEqual([1, 2, 3, 4]);
  });

  it("is deterministic for a given seed", () => {
    const a = completeGroup(groupA, model, mulberry32(42));
    const b = completeGroup(groupA, model, mulberry32(42));
    expect(a.table).toEqual(b.table);
  });

  it("a fully-played group ignores the RNG entirely", () => {
    const done: GroupInput = {
      group: "B",
      teams: [{ id: "X" }, { id: "Y" }, { id: "Z" }, { id: "W" }],
      played: [
        m("X", 1, 0, "Y"),
        m("X", 1, 0, "Z"),
        m("X", 1, 0, "W"),
        m("Y", 1, 0, "Z"),
        m("Y", 1, 0, "W"),
        m("Z", 1, 0, "W"),
      ],
      remaining: [],
    };
    expect(completeGroup(done, model, mulberry32(1)).table.map((r) => r.team)).toEqual([
      "X",
      "Y",
      "Z",
      "W",
    ]);
  });
});

describe("GroupEngine — selectQualifiers", () => {
  const table = (group: string, ranked: string[]) => ({
    group,
    table: ranked.map((team, i) => ({
      team,
      position: i + 1,
      played: 3,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      // Give thirds (position 3) distinct points so the ranking is well-defined.
      points: i === 2 ? { G1: 4, G2: 3, G3: 5 }[group] ?? 3 : 9 - i * 3,
    })),
  });

  it("takes winners, runners-up, and the N best third-placed teams", () => {
    const results = [
      table("G1", ["a1", "a2", "a3", "a4"]),
      table("G2", ["b1", "b2", "b3", "b4"]),
      table("G3", ["c1", "c2", "c3", "c4"]),
    ];
    const q = selectQualifiers(results, { bestThirds: 2 });
    expect(q.winners).toEqual(["a1", "b1", "c1"]);
    expect(q.runnersUp).toEqual(["a2", "b2", "c2"]);
    // Thirds ranked by points: c3 (5) > a3 (4) > b3 (3); best 2 advance.
    expect(q.bestThirds).toEqual(["c3", "a3"]);
  });
});
