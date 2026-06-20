import { describe, it, expect } from "vitest";
import { EloTable } from "./elo-ratings";

describe("EloTable", () => {
  it("starts every team at the default rating", () => {
    const t = new EloTable();
    expect(t.get("NEW")).toBe(1500);
  });

  it("a win raises the winner and lowers the loser by equal amounts (neutral)", () => {
    const t = new EloTable({ k: 20, homeAdvantage: 0 });
    t.update("A", "B", 1, 0, { neutral: true });
    expect(t.get("A")).toBeGreaterThan(1500);
    expect(t.get("B")).toBeLessThan(1500);
    expect(t.get("A") - 1500).toBeCloseTo(1500 - t.get("B"), 6); // zero-sum at equal start
  });

  it("an expected win shifts ratings less than an upset", () => {
    const fav = new EloTable({ k: 20, homeAdvantage: 0 });
    fav.set("STR", 1900);
    fav.set("WEAK", 1500);
    const beforeGap = fav.get("STR") - fav.get("WEAK");
    fav.update("STR", "WEAK", 1, 0, { neutral: true }); // expected
    const expectedGain = fav.get("STR") - 1900;

    const ups = new EloTable({ k: 20, homeAdvantage: 0 });
    ups.set("STR", 1900);
    ups.set("WEAK", 1500);
    ups.update("WEAK", "STR", 1, 0, { neutral: true }); // upset
    const upsetGain = ups.get("WEAK") - 1500;

    expect(upsetGain).toBeGreaterThan(expectedGain);
    expect(beforeGap).toBe(400);
  });

  it("a bigger margin of victory moves ratings more", () => {
    const narrow = new EloTable({ k: 20, homeAdvantage: 0 });
    narrow.update("A", "B", 1, 0, { neutral: true });
    const big = new EloTable({ k: 20, homeAdvantage: 0 });
    big.update("A", "B", 5, 0, { neutral: true });
    expect(big.get("A")).toBeGreaterThan(narrow.get("A"));
  });
});
