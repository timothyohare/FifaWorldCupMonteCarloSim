import { describe, it, expect } from "vitest";
import { eliminatedFromGroup, eliminatedTeams } from "./elimination";
import type { GroupInput } from "./group-engine";

const beat = (home: string, away: string) => ({ home, away, homeGoals: 1, awayGoals: 0 });

// A 4-team group where AAA/BBB/CCC have each already beaten DDD, and only the matches *among*
// the top three remain. DDD has played all three and sits on 0 points, with three teams
// guaranteed above it in every outcome → mathematically out (cannot even finish 3rd).
const dddOut: GroupInput = {
  group: "A",
  teams: [{ id: "AAA" }, { id: "BBB" }, { id: "CCC" }, { id: "DDD" }],
  played: [beat("AAA", "DDD"), beat("BBB", "DDD"), beat("CCC", "DDD")],
  remaining: [
    { home: "AAA", away: "BBB" },
    { home: "AAA", away: "CCC" },
    { home: "BBB", away: "CCC" },
  ],
};

describe("eliminatedFromGroup", () => {
  it("flags a team that cannot finish in the top three under any remaining result", () => {
    expect(eliminatedFromGroup(dddOut)).toEqual(["DDD"]);
  });

  it("does not flag teams that still have a path to the top three", () => {
    const out = new Set(eliminatedFromGroup(dddOut));
    expect(out.has("AAA")).toBe(false);
    expect(out.has("BBB")).toBe(false);
    expect(out.has("CCC")).toBe(false);
  });

  it("eliminates the bottom team once every match is played", () => {
    const finished: GroupInput = {
      group: "B",
      teams: [{ id: "W" }, { id: "X" }, { id: "Y" }, { id: "Z" }],
      // W beats all; X beats Y,Z; Y beats Z; Z loses everything → Z is 4th, out.
      played: [
        beat("W", "X"), beat("W", "Y"), beat("W", "Z"),
        beat("X", "Y"), beat("X", "Z"), beat("Y", "Z"),
      ],
      remaining: [],
    };
    expect(eliminatedFromGroup(finished)).toEqual(["Z"]);
  });

  it("flags nobody when the group is wide open (no matches played yet)", () => {
    const fresh: GroupInput = {
      group: "C",
      teams: [{ id: "P" }, { id: "Q" }, { id: "R" }, { id: "S" }],
      played: [],
      remaining: [
        { home: "P", away: "Q" }, { home: "R", away: "S" },
        { home: "P", away: "R" }, { home: "Q", away: "S" },
        { home: "P", away: "S" }, { home: "Q", away: "R" },
      ],
    };
    expect(eliminatedFromGroup(fresh)).toEqual([]);
  });
});

describe("eliminatedTeams", () => {
  it("aggregates eliminations across every group", () => {
    const out = eliminatedTeams({ groups: [dddOut], bestThirds: 8 });
    expect(out).toEqual(new Set(["DDD"]));
  });
});
