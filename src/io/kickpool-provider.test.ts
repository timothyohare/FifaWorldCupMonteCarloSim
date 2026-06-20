import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fetchKickpoolSnapshot, fetchTournamentInput } from "./kickpool-provider";

// Real captured snapshot doubles as the mock payload.
const snap = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../fixtures/wc2026-snapshot.json", import.meta.url)), "utf8"),
);

function mockFetch(): typeof fetch {
  return vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    const body = u.endsWith("/api/standings") ? snap.standings : u.endsWith("/api/fixtures") ? snap.fixtures : null;
    if (!body) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
}

describe("KickpoolApiProvider", () => {
  it("fetches both endpoints and adapts to a 12-group TournamentInput", async () => {
    const input = await fetchTournamentInput({ baseUrl: "http://kp.test/", fetchImpl: mockFetch(), bestThirds: 8 });
    expect(input.groups).toHaveLength(12);
    expect(input.bestThirds).toBe(8);
    const totalTeams = input.groups.reduce((s, g) => s + g.teams.length, 0);
    expect(totalTeams).toBe(48);
  });

  it("hits the expected URLs (trailing slash normalised)", async () => {
    const f = mockFetch();
    await fetchKickpoolSnapshot({ baseUrl: "http://kp.test/", fetchImpl: f });
    const calls = (f as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => String(c[0]));
    expect(calls).toContain("http://kp.test/api/standings");
    expect(calls).toContain("http://kp.test/api/fixtures");
  });

  it("throws on a non-OK response", async () => {
    const f = vi.fn(async () => new Response("boom", { status: 503 })) as unknown as typeof fetch;
    await expect(fetchKickpoolSnapshot({ fetchImpl: f })).rejects.toThrow(/HTTP 503/);
  });
});
