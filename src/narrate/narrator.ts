// Post-run Gen-AI narrator (PRD FR18, validated by spike S7). Runs AFTER the simulation and
// describes the finished numbers; it must never compute or change a probability. The prompt
// enforces this and a guardrail rejects any percentage not present in the inputs.
export interface ResultRow {
  team: string;
  champion: number; // probability 0..1
}

export interface Mover {
  team: string;
  before: number;
  after: number;
  delta: number;
}

export interface ChatMessage {
  role: "user";
  content: string;
}
export interface NarratorPrompt {
  system: string;
  messages: ChatMessage[];
}

/** Implemented by the Anthropic client in prod and a mock in tests. */
export interface NarratorClient {
  complete(prompt: NarratorPrompt): Promise<string>;
}

const SYSTEM = [
  "You are a football analyst writing a one-paragraph explanation of how World Cup title odds moved.",
  "STRICT RULES:",
  "- Describe ONLY the numbers provided. Do not compute, estimate, or invent any probability.",
  "- Never change, re-round, or contradict a provided number.",
  "- If a cause isn't given, describe the movement without inventing a reason.",
].join("\n");

const pct = (p: number) => `${(p * 100).toFixed(1)}%`;

/** Largest absolute champion-probability swings between two runs. */
export function computeMovers(before: ResultRow[], after: ResultRow[], k = 3): Mover[] {
  const beforeMap = new Map(before.map((r) => [r.team, r.champion]));
  return after
    .map((r) => {
      const b = beforeMap.get(r.team) ?? 0;
      return { team: r.team, before: b, after: r.champion, delta: r.champion - b };
    })
    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))
    .slice(0, k);
}

export function buildPrompt(movers: Mover[]): NarratorPrompt {
  const lines = movers.map(
    (m) => `- ${m.team}: ${pct(m.before)} → ${pct(m.after)} (${m.delta >= 0 ? "+" : ""}${pct(m.delta)})`,
  );
  return {
    system: SYSTEM,
    messages: [
      { role: "user", content: `World Cup title-odds changes since the last run:\n${lines.join("\n")}\n\nWrite one short paragraph for fans.` },
    ],
  };
}

/** Every percentage in the narrative must be one we supplied — catches fabricated numbers. */
export function findUnsanctionedNumbers(narrative: string, movers: Mover[]): string[] {
  const allowed = new Set<string>();
  for (const m of movers) for (const v of [m.before, m.after, Math.abs(m.delta)]) allowed.add(pct(v));
  return (narrative.match(/\d+\.\d+%/g) ?? []).filter((f) => !allowed.has(f));
}

export async function generateNarrative(
  before: ResultRow[],
  after: ResultRow[],
  client: NarratorClient,
  k = 3,
): Promise<{ movers: Mover[]; prompt: NarratorPrompt; narrative: string; violations: string[] }> {
  const movers = computeMovers(before, after, k);
  const prompt = buildPrompt(movers);
  const narrative = await client.complete(prompt);
  return { movers, prompt, narrative, violations: findUnsanctionedNumbers(narrative, movers) };
}
