// S6 — third-placed → Round-of-32 slot allocation MECHANISM (Q2).
// 8 of 12 third-placed teams advance; which R32 slots they fill depends on the *set* of
// groups they came from, via a fixed FIFA table (the "Annex"-style lookup). The real
// numeric table must be transcribed from the FIFA 2026 Regulations PDF — this spike proves
// the lookup + validation mechanism and ships a clearly-marked PLACEHOLDER entry.
export type Group = string; // "A".."L"

export interface ThirdAssignment {
  winnerGroup: Group; // the group winner who faces a third-placed team
  thirdFromGroup: Group; // which group's third-placed team they face
}

export type AllocationTable = Record<string, ThirdAssignment[]>;

/** Canonical key for a set of qualifying groups: sorted, concatenated. */
export function allocationKey(qualifyingGroups: Group[]): string {
  return [...qualifyingGroups].sort().join("");
}

export class BracketDataPending extends Error {}
export class BracketInvalid extends Error {}

/**
 * PLACEHOLDER allocation table. The single entry below is a structurally-valid stand-in
 * (cyclic-shift assignment) — NOT the official FIFA mapping. Replace with the transcribed
 * Annex table before this is anything but a mechanism test.
 */
export const PLACEHOLDER_TABLE: AllocationTable = {
  ABCDEFGH: [
    { winnerGroup: "A", thirdFromGroup: "C" },
    { winnerGroup: "B", thirdFromGroup: "D" },
    { winnerGroup: "C", thirdFromGroup: "E" },
    { winnerGroup: "D", thirdFromGroup: "F" },
    { winnerGroup: "E", thirdFromGroup: "G" },
    { winnerGroup: "F", thirdFromGroup: "H" },
    { winnerGroup: "G", thirdFromGroup: "A" },
    { winnerGroup: "H", thirdFromGroup: "B" },
  ],
};

/**
 * Resolve the R32 assignments for a set of 8 qualifying third-placed groups.
 * Throws BracketDataPending if the official table lacks the entry, BracketInvalid if the
 * entry violates the structural constraints.
 */
export function allocateThirds(
  qualifyingGroups: Group[],
  table: AllocationTable = PLACEHOLDER_TABLE,
): ThirdAssignment[] {
  if (qualifyingGroups.length !== 8) {
    throw new BracketInvalid(`expected 8 third-placed groups, got ${qualifyingGroups.length}`);
  }
  const key = allocationKey(qualifyingGroups);
  const entry = table[key];
  if (!entry) {
    throw new BracketDataPending(
      `no allocation for groups {${key}} — transcribe this row from the FIFA 2026 Regulations`,
    );
  }
  validateAssignment(entry, qualifyingGroups);
  return entry;
}

/** Structural rules every Annex row must satisfy. */
export function validateAssignment(entry: ThirdAssignment[], qualifyingGroups: Group[]): void {
  const wanted = new Set(qualifyingGroups);
  const thirds = entry.map((e) => e.thirdFromGroup);
  const winners = entry.map((e) => e.winnerGroup);

  if (new Set(thirds).size !== thirds.length) throw new BracketInvalid("duplicate third-placed group");
  if (new Set(winners).size !== winners.length) throw new BracketInvalid("duplicate winner slot");
  if (thirds.some((g) => !wanted.has(g))) throw new BracketInvalid("third from a non-qualifying group");
  if (thirds.length !== wanted.size) throw new BracketInvalid("not all qualifying thirds placed");
  for (const e of entry) {
    if (e.winnerGroup === e.thirdFromGroup) {
      throw new BracketInvalid(`group ${e.winnerGroup} would play its own third-placed team`);
    }
  }
}
