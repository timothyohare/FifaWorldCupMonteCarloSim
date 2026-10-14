// StrykerJS mutation testing (gate-mutation, CHG-0034). Scoped to the pure,
// deterministically-tested core: domain RNG/types, the strength model, and the
// tournament engine. Excluded: annex-c.ts (generated FIFA lookup table — "re-run,
// don't hand-edit"; its literal-data mutants add no signal), and the I/O,
// network, Gen-AI, CLI and eval/report layers (side-effectful or reporting code
// with no deterministic unit oracle).
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const strykerConfig = {
  packageManager: 'npm',
  testRunner: 'vitest',
  coverageAnalysis: 'perTest',
  mutate: [
    'src/domain/**/*.ts',
    'src/model/elo-poisson.ts',
    'src/engine/**/*.ts',
    '!src/**/*.test.ts',
    '!src/engine/annex-c.ts',
  ],
  reporters: ['clear-text', 'progress', 'json'],
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  incremental: true,
  incrementalFile: 'reports/mutation/stryker-incremental.json',
  // break = measured baseline (2026-10-14: 79.38%, 150 survived + 10 no-coverage),
  // floored. Ratchet up as tests are strengthened; never lower it.
  thresholds: { high: 90, low: 79, break: 79 },
};
export default strykerConfig;
