// Anthropic-backed NarratorClient. Reads ANTHROPIC_API_KEY from the environment (SDK default).
// Haiku is plenty for one-paragraph narration. Low temperature to keep it factual.
import Anthropic from "@anthropic-ai/sdk";
import type { NarratorClient, NarratorPrompt } from "./narrator";

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

export class AnthropicNarratorClient implements NarratorClient {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(opts: { apiKey?: string; model?: string } = {}) {
    this.client = new Anthropic(opts.apiKey ? { apiKey: opts.apiKey } : {});
    this.model = opts.model ?? DEFAULT_MODEL;
  }

  async complete(prompt: NarratorPrompt): Promise<string> {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: 300,
      temperature: 0.4,
      system: prompt.system,
      messages: prompt.messages.map((m) => ({ role: m.role, content: m.content })),
    });
    return res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
  }
}
