import assert from 'node:assert/strict';
import test from 'node:test';

import { validateWorkflowActionPins } from './check-workflow-action-pins.mjs';

test('accepts SHA-pinned actions with least-privilege workflow guards', () => {
  const findings = validateWorkflowActionPins({
    relativePath: '.github/workflows/check.yml',
    content: [
      'name: check',
      'permissions:',
      '  contents: read',
      'jobs:',
      '  check:',
      '    runs-on: ubuntu-latest',
      '    timeout-minutes: 10',
      '    steps:',
      '      - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5',
      '        with:',
      '          persist-credentials: false',
    ].join('\n'),
  });
  assert.deepEqual(findings, []);
});

test('accepts an explicit top-level read-all permission baseline', () => {
  const findings = validateWorkflowActionPins({
    relativePath: '.github/workflows/scorecard.yml',
    content: [
      'name: scorecard',
      'permissions: read-all',
      'jobs:',
      '  scorecard:',
      '    runs-on: ubuntu-latest',
      '    timeout-minutes: 10',
      '    permissions:',
      '      contents: read',
      '      security-events: write',
      '      id-token: write',
      '    steps:',
      '      - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5',
      '        with:',
      '          persist-credentials: false',
    ].join('\n'),
  });
  assert.deepEqual(findings, []);
});

test('rejects mutable actions, missing timeouts, and persisted checkout credentials', () => {
  const findings = validateWorkflowActionPins({
    relativePath: '.github/workflows/check.yml',
    content: [
      'name: check',
      'permissions:',
      '  contents: read',
      'jobs:',
      '  check:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
    ].join('\n'),
  });
  assert.equal(findings.length, 3);
  assert.match(findings.join('\n'), /full commit SHA/);
  assert.match(findings.join('\n'), /timeout-minutes/);
  assert.match(findings.join('\n'), /persist-credentials/);
});
