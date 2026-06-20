import { describe, it, expect } from "vitest";
import {
  computeMovers,
  buildPrompt,
  generateNarrative,
  findUnsanctionedNumbers,
  type NarratorClient,
  type ResultRow,
} from "./s7-narrator";

const before: ResultRow[] = [
  { team: "Argentina", champion: 0.142 },
  { team: "France", champion: 0.131 },
  { team: "Brazil", champion: 0.12 },
  { team: "Spain", champion: 0.09 },
];
const after: ResultRow[] = [
  { team: "Argentina", champion: 0.22 }, // jumped +7.8pp (biggest swing)
  { team: "France", champion: 0.06 }, // collapsed -7.1pp
  { team: "Brazil", champion: 0.122 },
  { team: "Spain", champion: 0.095 },
];

// Faithful mock: echoes only sanctioned numbers.
const goodClient: NarratorClient = {
  async complete(prompt) {
    const top = prompt.messages[0].content.split("\n")[1];
    return `Argentina are the big movers this round (${top.includes("22.0%") ? "22.0%" : ""}), while France slid to 6.0%.`;
  },
};
// Misbehaving mock: invents a number not in the inputs.
const badClient: NarratorClient = {
  async complete() {
    return "Argentina now sit at a commanding 88.8% to lift the trophy.";
  },
};

describe("S7 — post-run narrator", () => {
  it("ranks movers by absolute swing", () => {
    const movers = computeMovers(before, after, 3);
    expect(movers[0].team).toBe("Argentina"); // +7.8pp, the largest |delta|
    expect(movers[1].team).toBe("France"); // -7.1pp
    expect(Math.abs(movers[0].delta)).toBeGreaterThan(Math.abs(movers[1].delta));
  });

  it("builds a prompt that forbids altering numbers and lists the movers", () => {
    const movers = computeMovers(before, after, 3);
    const p = buildPrompt(movers);
    expect(p.system).toMatch(/Do not compute|Never change/i);
    expect(p.messages[0].content).toMatch(/Argentina/);
  });

  it("passes a faithful narrative through the guardrail with no violations", async () => {
    const res = await generateNarrative(before, after, goodClient, 3);
    expect(res.narrative).toMatch(/Argentina/);
    expect(res.violations).toEqual([]);
  });

  it("guardrail catches a fabricated number", async () => {
    const res = await generateNarrative(before, after, badClient, 3);
    expect(res.violations).toContain("88.8%");
  });

  it("findUnsanctionedNumbers only flags numbers absent from the inputs", () => {
    const movers = computeMovers(before, after, 3);
    expect(findUnsanctionedNumbers("Argentina rose to 22.0%.", movers)).toEqual([]);
    expect(findUnsanctionedNumbers("Argentina rose to 99.9%.", movers)).toEqual(["99.9%"]);
  });
});
