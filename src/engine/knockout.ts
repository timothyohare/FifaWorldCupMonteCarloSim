// KnockoutEngine — single-elimination bracket with the S1 two-stage draw resolver.
//
// SEEDING CAVEAT: the official 2026 bracket slot tree (and the 495-scenario third-place
// allocation) come from the FIFA Regulations PDF — not yet transcribed. `seedBracket` uses a
// documented PLACEHOLDER seeding that only guarantees a structurally valid bracket with no
// first-round same-group clashes. Champion probabilities are directionally correct but not
// the official bracket until the real tables land (see docs/13-spike-findings.md, S6).
import type { Rng } from "../domain/rng";
import type { TeamId } from "../domain/types";
import type { StrengthModel } from "../model/strength-model";

const SHOOTOUT_TILT = 0.2; // penalties compress skill toward a coin flip (spike S1)

/** Play one knockout tie: regulation via the model; a drawn game goes to a tilted shootout. */
export function resolveMatch(model: StrengthModel, home: TeamId, away: TeamId, rng: Rng): TeamId {
  const score = model.sampleScore(home, away, rng);
  if (score.home > score.away) return home;
  if (score.away > score.home) return away;
  const pHome = model.winProbability?.(home, away) ?? 0.5;
  const shootout = 0.5 + SHOOTOUT_TILT * (pHome - 0.5);
  return rng() < shootout ? home : away;
}

export interface Qualifiers {
  winners: TeamId[];
  runnersUp: TeamId[];
  bestThirds: TeamId[];
}

function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

/**
 * Order qualifiers into a single-elim seed list (match i = seeds[2i] vs seeds[2i+1]).
 * Placeholder seeding: winners interleaved with runners-up + best-thirds, then a repair pass
 * removes any first-round same-group pairing.
 */
export function seedBracket(q: Qualifiers, groupOf: ReadonlyMap<TeamId, string>): TeamId[] {
  const total = q.winners.length + q.runnersUp.length + q.bestThirds.length;
  if (!isPowerOfTwo(total)) {
    throw new Error(`knockout field must be a power of two, got ${total}`);
  }
  // Interleave winners with the rest so strong sides (group winners) start apart.
  const rest = [...q.runnersUp, ...q.bestThirds];
  const seeds: TeamId[] = [];
  const maxLen = Math.max(q.winners.length, rest.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < q.winners.length) seeds.push(q.winners[i]);
    if (i < rest.length) seeds.push(rest[i]);
  }
  repairSameGroup(seeds, groupOf);
  return seeds;
}

/** Swap teams so no first-round pair (2i, 2i+1) shares a group, when avoidable. */
function repairSameGroup(seeds: TeamId[], groupOf: ReadonlyMap<TeamId, string>): void {
  for (let i = 0; i < seeds.length; i += 2) {
    if (groupOf.get(seeds[i]) !== groupOf.get(seeds[i + 1])) continue;
    for (let j = 0; j < seeds.length; j++) {
      if (j === i || j === i + 1) continue;
      const partner = j % 2 === 0 ? j + 1 : j - 1;
      const okHere = groupOf.get(seeds[i]) !== groupOf.get(seeds[j]);
      const okThere = groupOf.get(seeds[partner]) !== groupOf.get(seeds[i + 1]);
      if (okHere && okThere) {
        [seeds[i + 1], seeds[j]] = [seeds[j], seeds[i + 1]];
        break;
      }
    }
  }
}

export interface KnockoutResult {
  champion: TeamId;
  rounds: number;
  /** Round number each team reached (0 = lost round 1; `rounds` = champion). */
  reached: Map<TeamId, number>;
}

/** Play the full single-elimination bracket from a seed list. */
export function playKnockout(seeds: TeamId[], model: StrengthModel, rng: Rng): KnockoutResult {
  if (!isPowerOfTwo(seeds.length)) {
    throw new Error(`bracket must be a power of two, got ${seeds.length}`);
  }
  const reached = new Map<TeamId, number>(seeds.map((t) => [t, 0]));
  let alive = seeds;
  let round = 0;
  while (alive.length > 1) {
    round += 1;
    const next: TeamId[] = [];
    for (let i = 0; i < alive.length; i += 2) {
      const winner = resolveMatch(model, alive[i], alive[i + 1], rng);
      reached.set(winner, round);
      next.push(winner);
    }
    alive = next;
  }
  return { champion: alive[0], rounds: round, reached };
}
