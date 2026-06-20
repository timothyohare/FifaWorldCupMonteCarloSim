// S1 — knockout draw-resolution models (Q5).
// A knockout tie must yield a single advancing team. Three candidate resolvers, and a look
// at how much the choice moves *deep-run* (champion) probabilities once it compounds over
// rounds. Neutral venue ⇒ no home advantage.
import { eloExpectation, eloToLambdas, matchOutcome } from "./s3-elo-poisson";

export type Resolver = (rA: number, rB: number) => number; // P(A advances)

/** (1) Flat coin flip — ignores strength entirely. */
export const flat: Resolver = () => 0.5;

/** (2) Strength-weighted — Elo expected score used directly as an advance probability. */
export const strengthWeighted: Resolver = (rA, rB) => eloExpectation(rA, rB);

/**
 * (3) Two-stage — play regulation (can draw) via the Poisson model; if drawn, go to a
 * shootout that is near-coin-flip but slightly tilted by strength (penalties compress skill).
 */
export function twoStage(rA: number, rB: number, shootoutTilt = 0.2): number {
  const o = matchOutcome(eloToLambdas(rA, rB, { homeAdv: 0 }));
  const eA = eloExpectation(rA, rB);
  const shootout = 0.5 + shootoutTilt * (eA - 0.5);
  return o.pHome + o.pDraw * shootout;
}

export interface S1Finding {
  delta: number;
  perTie: { flat: number; twoStage: number; strengthWeighted: number };
  // Champion probability if a team faces the same-Δ opponent every round for `rounds` rounds.
  champion4: { flat: number; twoStage: number; strengthWeighted: number };
}

export function runDemo(rStrong = 1900, rWeak = 1750, rounds = 4): S1Finding {
  const delta = rStrong - rWeak;
  const perTie = {
    flat: flat(rStrong, rWeak),
    twoStage: twoStage(rStrong, rWeak),
    strengthWeighted: strengthWeighted(rStrong, rWeak),
  };
  const pow = (p: number) => p ** rounds;
  return {
    delta,
    perTie,
    champion4: {
      flat: pow(perTie.flat),
      twoStage: pow(perTie.twoStage),
      strengthWeighted: pow(perTie.strengthWeighted),
    },
  };
}
