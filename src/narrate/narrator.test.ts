import { describe, it, expect } from "vitest";
import { computeMovers, buildPrompt, generateNarrative, findUnsanctionedNumbers, type NarratorClient, type ResultRow } from "./narrator";

const before: ResultRow[] = [
  { team: "Argentina", champion: 0.142 },
  { team: "France", champion: 0.131 },
  { team: "Brazil", champion: 0.12 },
];
const after: ResultRow[] = [
  { team: "Argentina", champion: 0.22 },
  { team: "France", champion: 0.06 },
  { team: "Brazil", champion: 0.122 },
];

const faithful: NarratorClient = { async complete() { return "Argentina surged to 22.0% while France fell to 6.0%."; } };
const liar: NarratorClient = { async complete() { return "Argentina are now a runaway 88.8% favourite."; } };

describe("narrator", () => {
  it("ranks movers by absolute swing", () => {
    const m = computeMovers(before, after, 3);
    expect(m[0].team).toBe("Argentina"); // +7.8pp
    expect(m[1].team).toBe("France"); // -7.1pp
  });

  it("prompt forbids altering numbers and lists movers", () => {
    const p = buildPrompt(computeMovers(before, after, 3));
    expect(p.system).toMatch(/Do not compute|Never change/i);
    expect(p.messages[0].content).toMatch(/Argentina/);
  });

  it("a faithful narrative passes the guardrail", async () => {
    const r = await generateNarrative(before, after, faithful, 3);
    expect(r.violations).toEqual([]);
  });

  it("a fabricated number is caught", async () => {
    const r = await generateNarrative(before, after, liar, 3);
    expect(r.violations).toContain("88.8%");
  });

  it("findUnsanctionedNumbers only flags absent numbers", () => {
    const m = computeMovers(before, after, 3);
    expect(findUnsanctionedNumbers("up to 22.0%", m)).toEqual([]);
    expect(findUnsanctionedNumbers("up to 99.9%", m)).toEqual(["99.9%"]);
  });
});
