import { describe, expect, it } from "vitest";
import { buildReport, qualifiersFromSnapshot } from "./forecast-report";
import { parseOddsCsv, type OutcomesFixture } from "./forecast-verify";

describe("qualifiersFromSnapshot (real committed snapshot)", () => {
  it("derives the 32 realised qualifiers via the engine's own tiebreakers", () => {
    const q = qualifiersFromSnapshot("fixtures/wc2026-snapshot.json");
    expect(q).toHaveLength(32);
    expect(new Set(q).size).toBe(32);
    // Spot-checks against the played tournament: DR Congo squeezed in on the
    // best-thirds tiebreak, Iran (third on 3 points, goal difference 0) missed out.
    expect(q).toContain("ARG");
    expect(q).toContain("COD");
    expect(q).not.toContain("IRN");
  });
});

describe("buildReport", () => {
  const csv = [
    "date,team,group,champion,runnerUp,reachFinal,reachSemi,escapeGroup",
    "2026-06-21,AAA,A,0.60,0.20,0.80,0.90,0.99",
    "2026-06-21,BBB,A,0.30,0.40,0.60,0.70,0.95",
    "2026-06-21,CCC,B,0.08,0.30,0.40,0.50,0.90",
    "2026-06-21,DDD,B,0.02,0.10,0.20,0.30,0.10",
  ].join("\n");
  const history = parseOddsCsv(csv);
  const outcomes: OutcomesFixture = {
    asOf: "2026-07-14",
    quarterFinalists: ["AAA", "BBB", "CCC"],
    semiFinalists: ["AAA", "BBB"],
    finalists: null,
    champion: null,
    runnerUp: null,
  };

  it("reports resolved markets and lists the still-pending ones", () => {
    const report = buildReport(history, outcomes, ["AAA", "BBB", "CCC"], 200);
    expect(report).toContain("## Escape the group");
    expect(report).toContain("## Reach the semi-finals");
    expect(report).not.toContain("## Champion\n");
    expect(report).toContain("Not yet resolvable: champion, runner-up, reach the final");
    // DDD is the only non-qualifier, so it is the escape-group market's
    // highest-priced miss (10%) by default.
    expect(report).toContain("**DDD** at 10.0%");
  });

  it("scores every market once the tournament is complete", () => {
    const done: OutcomesFixture = {
      ...outcomes,
      finalists: ["AAA", "BBB"],
      champion: "AAA",
      runnerUp: "BBB",
    };
    const report = buildReport(history, done, ["AAA", "BBB", "CCC"], 200);
    expect(report).toContain("## Champion");
    expect(report).toContain("## Runner-up");
    expect(report).toContain("## Reach the final");
    expect(report).not.toContain("Not yet resolvable");
  });

  it("is deterministic for a fixed seed and permutation count", () => {
    const a = buildReport(history, outcomes, ["AAA", "BBB", "CCC"], 500);
    const b = buildReport(history, outcomes, ["AAA", "BBB", "CCC"], 500);
    expect(a).toBe(b);
  });
});
