import { describe, it, expect } from "vitest";
import { buildWorldCupBracket, playWorldCupKnockout } from "./bracket-2026";
import { ANNEX_C } from "./annex-c";
import { EloPoissonModel } from "../model/elo-poisson";
import { mulberry32 } from "../domain/rng";
import type { GroupResult } from "./group-engine";
import type { TableRow } from "../domain/types";

const GROUPS = "ABCDEFGHIJKL".split("");

// Build a deterministic 12-group result set: team ids like "A1".."A4"; finishing order is the
// number suffix. `thirdPoints[group]` lets tests control which third-placed teams advance.
function results(thirdPoints: Record<string, number>): GroupResult[] {
  return GROUPS.map((g) => ({
    group: g,
    table: [1, 2, 3, 4].map((pos): TableRow => ({
      team: `${g}${pos}`,
      position: pos,
      played: 3,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: pos === 3 ? thirdPoints[g] ?? 3 : 9 - pos,
    })),
  }));
}

// Ratings: everyone equal except a clear favourite, so the title should usually be theirs.
function ratings(favourite: string): Map<string, number> {
  const r = new Map<string, number>();
  for (const g of GROUPS) for (const p of [1, 2, 3, 4]) r.set(`${g}${p}`, 1700);
  r.set(favourite, 2200);
  return r;
}

describe("buildWorldCupBracket", () => {
  it("produces 16 round-of-32 matches with the 8 best thirds slotted via Annex C", () => {
    // Make thirds of A,B,C,D,E,F,G,H the best (highest points) → known combination.
    const tp: Record<string, number> = {};
    "ABCDEFGH".split("").forEach((g) => (tp[g] = 6));
    "IJKL".split("").forEach((g) => (tp[g] = 1));
    const { matchups } = buildWorldCupBracket(results(tp), ANNEX_C);
    expect(matchups).toHaveLength(16);

    const key = "ABCDEFGH";
    const asn = ANNEX_C[key];
    // Winner E (match M74) must face the third from group asn.E.
    const m74 = matchups.find((m) => m.match === 74)!;
    expect(m74.home).toBe("E1");
    expect(m74.away).toBe(`${asn.E}3`);
    // A pure winner-vs-runner slot is unaffected by Annex C: M75 = 1F v 2C.
    const m75 = matchups.find((m) => m.match === 75)!;
    expect(m75.home).toBe("F1");
    expect(m75.away).toBe("C2");
  });

  it("never pairs a team against another from its own group in the round of 32", () => {
    const tp: Record<string, number> = {};
    "ABCDEFGH".split("").forEach((g) => (tp[g] = 6));
    const { matchups } = buildWorldCupBracket(results(tp), ANNEX_C);
    for (const m of matchups) {
      expect(m.home[0]).not.toBe(m.away[0]); // first char is the group letter
    }
  });

  it("throws if the qualifying-thirds combination is not in Annex C", () => {
    const bad = results({});
    // Force an impossible set by corrupting Annex lookup with an empty table.
    expect(() => buildWorldCupBracket(bad, {})).toThrow();
  });
});

describe("playWorldCupKnockout", () => {
  const tp: Record<string, number> = {};
  "ABCDEFGH".split("").forEach((g) => (tp[g] = 6));
  const res = results(tp);

  it("returns one champion, two finalists, four semifinalists; deterministic by seed", () => {
    const model = new EloPoissonModel(ratings("A1"), { homeAdvantage: 0 });
    const a = playWorldCupKnockout(buildWorldCupBracket(res, ANNEX_C), model, mulberry32(3));
    const b = playWorldCupKnockout(buildWorldCupBracket(res, ANNEX_C), model, mulberry32(3));
    expect(a.finalists).toHaveLength(2);
    expect(a.semifinalists).toHaveLength(4);
    expect(a.finalists).toContain(a.champion);
    expect(a.champion).toBe(b.champion);
  });

  it("a dominant favourite wins the title most often", () => {
    const model = new EloPoissonModel(ratings("A1"), { homeAdvantage: 0 });
    const rng = mulberry32(7);
    let favTitles = 0;
    const N = 1500;
    for (let i = 0; i < N; i++) {
      if (playWorldCupKnockout(buildWorldCupBracket(res, ANNEX_C), model, rng).champion === "A1") favTitles += 1;
    }
    expect(favTitles / N).toBeGreaterThan(0.3); // far above the 1/32 a random team would get
  });
});
