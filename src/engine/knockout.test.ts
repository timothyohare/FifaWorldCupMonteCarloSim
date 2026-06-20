import { describe, it, expect } from "vitest";
import { resolveMatch, seedBracket, playKnockout } from "./knockout";
import { EloPoissonModel } from "../model/elo-poisson";
import { mulberry32 } from "../domain/rng";

const ratings = new Map([
  ["STR", 2100],
  ["GOOD", 1950],
  ["OK", 1820],
  ["WEAK", 1650],
]);
const model = new EloPoissonModel(ratings, { homeAdvantage: 0 });

describe("resolveMatch — two-stage knockout resolution", () => {
  it("returns one of the two teams and is deterministic by seed", () => {
    const a = resolveMatch(model, "STR", "WEAK", mulberry32(1));
    const b = resolveMatch(model, "STR", "WEAK", mulberry32(1));
    expect(a).toBe(b);
    expect(["STR", "WEAK"]).toContain(a);
  });

  it("favours the stronger team over many draws", () => {
    const rng = mulberry32(4);
    let strWins = 0;
    const N = 5000;
    for (let i = 0; i < N; i++) if (resolveMatch(model, "STR", "WEAK", rng) === "STR") strWins += 1;
    expect(strWins / N).toBeGreaterThan(0.6);
  });
});

describe("seedBracket", () => {
  const groupOf = new Map([
    ["W_A", "A"],
    ["W_B", "B"],
    ["R_A", "A"],
    ["R_B", "B"],
  ]);

  it("requires a power-of-two field", () => {
    expect(() => seedBracket({ winners: ["W_A", "W_B"], runnersUp: ["R_A"], bestThirds: [] }, groupOf)).toThrow();
  });

  it("avoids first-round same-group clashes", () => {
    const seeds = seedBracket(
      { winners: ["W_A", "W_B"], runnersUp: ["R_A", "R_B"], bestThirds: [] },
      groupOf,
    );
    expect(seeds).toHaveLength(4);
    for (let i = 0; i < seeds.length; i += 2) {
      expect(groupOf.get(seeds[i])).not.toBe(groupOf.get(seeds[i + 1]));
    }
  });
});

describe("playKnockout", () => {
  const seeds = ["STR", "WEAK", "OK", "GOOD"]; // 2-round bracket → champion

  it("produces a single champion who survived every round", () => {
    const out = playKnockout(seeds, model, mulberry32(2));
    expect(seeds).toContain(out.champion);
    expect(out.rounds).toBe(2);
    expect(out.reached.get(out.champion)).toBe(2);
  });

  it("is deterministic for a fixed seed", () => {
    const a = playKnockout(seeds, model, mulberry32(9));
    const b = playKnockout(seeds, model, mulberry32(9));
    expect(a.champion).toBe(b.champion);
    expect([...a.reached]).toEqual([...b.reached]);
  });

  it("the strongest team wins most often", () => {
    const counts = new Map<string, number>();
    const rng = mulberry32(11);
    const N = 3000;
    for (let i = 0; i < N; i++) {
      const c = playKnockout(seeds, model, rng).champion;
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    expect(top).toBe("STR");
  });
});
