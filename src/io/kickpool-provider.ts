// Live data provider: fetches current standings + fixtures from a running kickpool instance
// (its /api/standings and /api/fixtures routes) and adapts them to a TournamentInput.
// The production path for current-standings runs; mirrors the offline SnapshotProvider.
import { fromKickpoolSnapshot, type KickpoolSnapshot } from "./snapshot";
import type { TournamentInput } from "../engine/simulate";

export interface KickpoolProviderOptions {
  /** kickpool base URL (default http://localhost:3000). */
  baseUrl?: string;
  bestThirds?: number;
  /** Injectable fetch (for testing / non-global-fetch runtimes). */
  fetchImpl?: typeof fetch;
}

async function getJson(fetchImpl: typeof fetch, url: string): Promise<unknown> {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`kickpool ${url} → HTTP ${res.status}`);
  return res.json();
}

/** Fetch a frozen snapshot from kickpool's API (both endpoints in parallel). */
export async function fetchKickpoolSnapshot(opts: KickpoolProviderOptions = {}): Promise<KickpoolSnapshot> {
  const base = (opts.baseUrl ?? "http://localhost:3000").replace(/\/+$/, "");
  const f = opts.fetchImpl ?? fetch;
  const [standings, fixtures] = await Promise.all([
    getJson(f, `${base}/api/standings`),
    getJson(f, `${base}/api/fixtures`),
  ]);
  return { standings, fixtures } as KickpoolSnapshot;
}

/** Fetch from kickpool and adapt straight into a TournamentInput. */
export async function fetchTournamentInput(opts: KickpoolProviderOptions = {}): Promise<TournamentInput> {
  const snapshot = await fetchKickpoolSnapshot(opts);
  return fromKickpoolSnapshot(snapshot, { bestThirds: opts.bestThirds });
}
