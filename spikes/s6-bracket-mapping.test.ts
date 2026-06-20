import { describe, it, expect } from "vitest";
import {
  allocateThirds,
  allocationKey,
  validateAssignment,
  PLACEHOLDER_TABLE,
  BracketDataPending,
  BracketInvalid,
  type ThirdAssignment,
} from "./s6-bracket-mapping";

describe("S6 — third-placed bracket allocation mechanism", () => {
  it("builds an order-independent key for a set of groups", () => {
    expect(allocationKey(["H", "A", "C", "B", "G", "F", "E", "D"])).toBe("ABCDEFGH");
  });

  it("allocates a known (placeholder) combination into a valid assignment", () => {
    const out = allocateThirds(["A", "B", "C", "D", "E", "F", "G", "H"]);
    expect(out).toHaveLength(8);
    // No winner faces its own group; all qualifying thirds placed exactly once.
    expect(out.every((e) => e.winnerGroup !== e.thirdFromGroup)).toBe(true);
  });

  it("flags missing official data distinctly from invalid data", () => {
    // A combination the placeholder table doesn't contain → data pending, not a bug.
    expect(() => allocateThirds(["A", "B", "C", "D", "E", "F", "G", "I"])).toThrow(BracketDataPending);
  });

  it("rejects a structurally invalid row (self-group clash)", () => {
    // Swap two thirds so the assignment stays a valid permutation but row 0 becomes A-vs-A,
    // isolating the self-group rule from the duplicate checks.
    const bad: ThirdAssignment[] = PLACEHOLDER_TABLE.ABCDEFGH.map((e) => ({ ...e }));
    const t0 = bad[0].thirdFromGroup; // "C"
    bad[0].thirdFromGroup = bad[6].thirdFromGroup; // "A" → clashes with winner A
    bad[6].thirdFromGroup = t0; // "C"
    expect(() => validateAssignment(bad, ["A", "B", "C", "D", "E", "F", "G", "H"])).toThrow(
      /play its own third-placed team/,
    );
  });

  it("rejects the wrong number of qualifying groups", () => {
    expect(() => allocateThirds(["A", "B", "C"])).toThrow(BracketInvalid);
  });
});
