# Infrastructure — Local machine or AWS?

## 1. The decision in one line
**v1 runs locally.** A full 100,000-simulation run takes ~10 seconds on a single laptop
core (see [method comparison](01-method-comparison.md) §4), needs no network during the
run, and stores nothing but a small JSON/CSV. There is no compute, storage, or
availability requirement that justifies cloud infrastructure for the core product. AWS
becomes worthwhile **only** when we want *scheduled, hands-off auto-refresh* and a
*publicly hosted* results page — both explicit non-goals for v1.

## 2. Why local is the right default

| Factor | Reality for this workload |
|--------|---------------------------|
| Compute | ~10 s on one core for 100k sims; parallelism optional, not needed. |
| Memory | A few MB (teams, fixtures, counters). Trivial. |
| Storage | A `ResultSet` JSON + optional CSV per run — kilobytes. |
| Network | **None during a run.** Data is snapshotted beforehand. |
| State | Stateless: pure function of `(snapshot, seed, N, model)`. |
| Availability | A CLI you run when you want an answer — no uptime requirement. |
| Cost | $0. |
| Reproducibility | Easiest locally with a committed snapshot + seed. |

Running this in the cloud for v1 would add deployment, IAM, and cost for **zero** capability
gain. That violates the simplicity the workload affords.

## 3. The one real dependency: getting the data

The simulator consumes kickpool's standings/fixtures. Two clean patterns, both local:

- **Snapshot-first (recommended, default):** fetch once via kickpool's `/api/standings` +
  `/api/fixtures`, write a hashed JSON snapshot, then simulate offline against it. Mirrors
  kickpool's `USE_FIXTURES=1` discipline; gives perfect reproducibility and works on a
  plane.
- **Live adapter:** the run fetches current data itself at startup, then simulates offline.
  Convenient, but the input isn't frozen unless you also persist the snapshot.

Either way, the **simulation core stays offline**. Two components touch the network, both at
the **edges** and never inside the loop: (1) the optional Claude strength model, at the
*precompute* step only; and (2) the **v1 Gen-AI narrator** (Q11/FR18), which runs *after* the
simulation to describe the finished `ResultSet`. Both need an Anthropic API key; neither
affects reproducibility, since the numeric run is complete before the narrator is called.
Running the narrator is still a local CLI step in v1 — no cloud required.

## 4. When AWS would be justified (later phases)

Trigger conditions, not v1:
- **Scheduled auto-refresh:** recompute odds after every matchday without anyone running a
  command.
- **Public/shared results page:** others view live odds without local tooling.
- **History/trend storage:** keep every run to chart how a team's odds moved over the
  tournament.
- **Embedding in kickpool's hosted UI** (kickpool already targets AWS Amplify per its
  `amplify.yml`).

## 5. Reference AWS design (deferred — for when the triggers above are met)

Keep it serverless and cheap; this is a periodic batch job, not a service.

```
  EventBridge (cron: after each matchday)
        │ triggers
        ▼
  Lambda "fetch+snapshot"  ──► S3 (immutable input snapshots, hashed)
        │ triggers
        ▼
  Lambda "simulate"  (100k sims, ~10s, well within Lambda limits)
        │ writes
        ▼
  S3 / DynamoDB (ResultSet + run metadata; DynamoDB if we want trend history —
                 reuses kickpool's existing DynamoDB familiarity)
        │ read by
        ▼
  Static results page (Amplify / S3+CloudFront) — or a widget embedded in kickpool
```

- **Compute:** a single Lambda comfortably runs 100k sims in its timeout; no Fargate/EC2
  needed. Shard across invocations only if we ever push N far higher.
- **Storage:** S3 for snapshots + results; DynamoDB only if we want queryable trend history
  (consistent with kickpool's stack).
- **Schedule:** EventBridge cron, or the harness `/schedule` mechanism for a Claude-driven
  refresh.
- **Secrets:** Anthropic API key in Secrets Manager / SSM, used only by the precompute step
  if the Claude model is selected.
- **Cost:** effectively free at this cadence (a handful of short Lambda runs per day during
  a ~month-long tournament).

## 6. Local environment specifics (v1)
- Single binary/CLI in the chosen stack (TypeScript/Node per the architecture doc), no
  daemon, no DB.
- Committed fixture snapshots for deterministic/offline test runs.
- Onboard to the SDLC harness with a `.claude/harness.json` (lint, typecheck, test, and a
  perf binding for the NFR1 timing gate), so quality gates run locally exactly as they do
  for kickpool.

## 7. Recommendation
Ship **v1 as a local CLI/library** with the snapshot-first data pattern. Treat AWS as a
**Phase 2** concern, adopted only if/when scheduled auto-refresh or a hosted/shared results
page is actually wanted — and design v1's output (`ResultSet` JSON + metadata) so that lift
is a packaging change, not a rewrite.
