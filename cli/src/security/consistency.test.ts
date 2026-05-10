// Build-time consistency gate: enforces that every rule mentioned in any
// stack appendix's securityRules has a corresponding scanner registered,
// and that every registered scanner appears in at least one appendix.
//
// Runs as part of `npm test`. If a developer adds a new H.x.x rule to an
// appendix without adding a scanner (or marking it documentation-only),
// this test fails. Same the other direction: a registered scanner that
// no appendix mentions fails.
//
// This replaces the standalone build-time check script proposed in the
// plan. The test framework already runs as part of CI / pre-commit; no
// extra tooling needed.

import { describe, it, expect } from 'vitest';
import './scanners.js'; // side-effect: registers all scanners
import { assertRegistryConsistency } from './registry.js';
import { STACKS } from '../stacks/index.js';

describe('registry consistency', () => {
  it('every appendix rule has a scanner (or is documentation-only); every scanner appears in at least one appendix', () => {
    expect(() => assertRegistryConsistency(STACKS)).not.toThrow();
  });
});
