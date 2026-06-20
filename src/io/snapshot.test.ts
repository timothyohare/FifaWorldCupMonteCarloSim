import { describe, it, expect } from "vitest";
import { fromKickpoolSnapshot, type KickpoolSnapshot } from "./snapshot";
import type { KpMatch } from "./kickpool-types";

const team = (abbr: string) => ({
  abbr,
  name: abbr,
  logo: "",
  friendId: "f",
  friendName: "f",
  friendColour: "#000",
});
const match = (id: string, group: string, h: string, a: string, hg: number | null, ag: number | null): KpMatch => ({
  id,
  stage: "GROUP_STAGE",
  group,
  utcDate: "2026-06-12T16:00Z",
  status: hg === null ? "STATUS_SCHEDULED" : "STATUS_FINAL",
  homeTeam: team(h),
  awayTeam: team(a),
  score: { home: hg, away: ag },
  venue: "",
  city: "",
});

const snapshot: KickpoolSnapshot = {
  standings: {
    lastUpdated: "",
    groups: [{ group: "A", table: [{ team: team("BRA") }, { team: team("SUI") }, { team: team("SRB") }, { team: team("CMR") }] }],
  },
  fixtures: {
    lastUpdated: "",
    matches: [
      match("A1", "A", "BRA", "SRB", 2, 0),
      match("A2", "A", "BRA", "SUI", 1, 0),
      match("A3", "A", "BRA", "CMR", null, null),
      match("A4", "A", "SRB", "SUI", null, null),
      match("A5", "A", "SRB", "CMR", null, null),
      match("A6", "A", "SUI", "CMR", null, null),
    ],
  },
};

describe("fromKickpoolSnapshot", () => {
  it("splits played and remaining fixtures into a TournamentInput", () => {
    const input = fromKickpoolSnapshot(snapshot);
    expect(input.groups).toHaveLength(1);
    const a = input.groups[0];
    expect(a.group).toBe("A");
    expect(a.teams.map((t) => t.id)).toEqual(["BRA", "SUI", "SRB", "CMR"]);
    expect(a.played).toHaveLength(2);
    expect(a.played[0]).toMatchObject({ home: "BRA", away: "SRB", homeGoals: 2, awayGoals: 0 });
    expect(a.remaining).toHaveLength(4);
    expect(a.remaining).toContainEqual({ home: "BRA", away: "CMR" });
  });

  it("fails loudly on a FINAL match missing a score", () => {
    const bad = structuredClone(snapshot);
    bad.fixtures.matches[0].status = "STATUS_FINAL";
    bad.fixtures.matches[0].score = { home: null, away: null };
    expect(() => fromKickpoolSnapshot(bad)).toThrow();
  });
});
