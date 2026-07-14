import { describe, expect, it } from "vitest";
import { mulberry32 } from "../domain/rng";
import {
  auc,
  brierBinary,
  brierSkillScore,
  calibrationBins,
  parseOddsCsv,
  permutationPValue,
  resolveMarkets,
  type OutcomesFixture,
} from "./forecast-verify";

const CSV = [
  "date,team,group,champion,runnerUp,reachFinal,reachSemi,escapeGroup",
  "2026-06-21,ARG,J,0.1972,0.0986,0.2958,0.4334,0.9977",
  "2026-06-21,ALG,J,0.0051,0.0111,0.0161,0.0443,0.6214",
  "2026-06-22,ARG,J,0.2193,0.1000,0.3000,0.4500,0.9999",
  "2026-06-22,ALG,J,0.0050,0.0100,0.0150,0.0400,0.6000",
].join("\n");

describe("parseOddsCsv", () => {
  it("parses rows into per-date, per-team market probabilities", () => {
    const parsed = parseOddsCsv(CSV);
    expect(parsed.dates).toEqual(["2026-06-21", "2026-06-22"]);
    expect(parsed.teams).toEqual(["ALG", "ARG"]);
    expect(parsed.rows["2026-06-21"]["ARG"].reachSemi).toBeCloseTo(0.4334);
    expect(parsed.rows["2026-06-22"]["ALG"].escapeGroup).toBeCloseTo(0.6);
  });

  it("rejects a malformed header loudly", () => {
    expect(() => parseOddsCsv("date,team,nope\n2026-06-21,ARG,1")).toThrow(/header/i);
  });
});

describe("brierBinary", () => {
  it("is 0 for perfect confident forecasts and 1 for perfectly wrong ones", () => {
    expect(brierBinary([1, 0], [1, 0])).toBe(0);
    expect(brierBinary([0, 1], [1, 0])).toBe(1);
  });

  it("matches the hand-computed mean squared error", () => {
    // (0.8-1)^2 + (0.3-0)^2 = 0.04 + 0.09 → mean 0.065
    expect(brierBinary([0.8, 0.3], [1, 0])).toBeCloseTo(0.065);
  });
});

describe("brierSkillScore", () => {
  it("is 0 when the forecast is exactly the base rate", () => {
    const ys = [1, 1, 0, 0];
    expect(brierSkillScore([0.5, 0.5, 0.5, 0.5], ys)).toBeCloseTo(0);
  });

  it("is 1 for a perfect forecast and negative for a worse-than-base one", () => {
    const ys = [1, 0];
    expect(brierSkillScore([1, 0], ys)).toBe(1);
    expect(brierSkillScore([0, 1], ys)).toBeLessThan(0);
  });
});

describe("auc", () => {
  it("is 1 when every positive outranks every negative, 0.5 for all-ties", () => {
    expect(auc([0.9, 0.8, 0.2, 0.1], [1, 1, 0, 0])).toBe(1);
    expect(auc([0.5, 0.5, 0.5, 0.5], [1, 1, 0, 0])).toBe(0.5);
  });

  it("counts a reversed pair against the score", () => {
    expect(auc([0.9, 0.2], [1, 0])).toBe(1);
    expect(auc([0.2, 0.9, 0.8], [1, 0, 0])).toBe(0); // the positive is priced lowest
  });
});

describe("permutationPValue", () => {
  it("is reproducible for the same seed", () => {
    const ps = [0.9, 0.8, 0.7, 0.3, 0.2, 0.1];
    const ys = [1, 1, 1, 0, 0, 0];
    const a = permutationPValue(ps, ys, { permutations: 500, rng: mulberry32(7) });
    const b = permutationPValue(ps, ys, { permutations: 500, rng: mulberry32(7) });
    expect(a).toBe(b);
  });

  it("gives a skilled forecast a small p and an anti-skilled one a large p", () => {
    const ys = [1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const skilled = ys.map((y) => (y ? 0.9 : 0.05));
    const anti = ys.map((y) => (y ? 0.05 : 0.9));
    const pGood = permutationPValue(skilled, ys, { permutations: 2000, rng: mulberry32(1) });
    const pBad = permutationPValue(anti, ys, { permutations: 2000, rng: mulberry32(1) });
    expect(pGood).toBeLessThan(0.05);
    expect(pBad).toBeGreaterThan(0.5);
  });
});

describe("calibrationBins", () => {
  it("pools forecasts into bins with mean prediction and observed rate", () => {
    const bins = calibrationBins([0.1, 0.15, 0.9, 0.95], [0, 0, 1, 1], 5);
    expect(bins).toHaveLength(5);
    expect(bins[0].n).toBe(2);
    expect(bins[0].meanPredicted).toBeCloseTo(0.125);
    expect(bins[0].observed).toBe(0);
    expect(bins[4].n).toBe(2);
    expect(bins[4].observed).toBe(1);
    expect(bins[1].n + bins[2].n + bins[3].n).toBe(0);
  });
});

describe("resolveMarkets", () => {
  const outcomes: OutcomesFixture = {
    asOf: "2026-07-14",
    quarterFinalists: ["FRA", "ESP", "ENG", "ARG", "MAR", "BEL", "NOR", "SUI"],
    semiFinalists: ["FRA", "ESP", "ENG", "ARG"],
    finalists: null,
    champion: null,
    runnerUp: null,
  };

  it("scores only the markets whose outcome is known", () => {
    const markets = resolveMarkets(outcomes, ["MEX", "RSA", "ARG", "FRA"]);
    expect(markets.escapeGroup).toEqual(new Set(["MEX", "RSA", "ARG", "FRA"]));
    expect(markets.reachSemi).toEqual(new Set(["FRA", "ESP", "ENG", "ARG"]));
    expect(markets.reachFinal).toBeUndefined();
    expect(markets.champion).toBeUndefined();
    expect(markets.runnerUp).toBeUndefined();
  });

  it("upgrades once the later rounds are recorded", () => {
    const done: OutcomesFixture = {
      ...outcomes,
      finalists: ["ARG", "ESP"],
      champion: "ARG",
      runnerUp: "ESP",
    };
    const markets = resolveMarkets(done, ["ARG", "ESP"]);
    expect(markets.reachFinal).toEqual(new Set(["ARG", "ESP"]));
    expect(markets.champion).toEqual(new Set(["ARG"]));
    expect(markets.runnerUp).toEqual(new Set(["ESP"]));
  });
});
