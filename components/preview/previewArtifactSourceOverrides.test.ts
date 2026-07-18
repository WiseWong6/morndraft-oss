import assert from 'node:assert/strict';
import test from 'node:test';

import {
  replaceArtifactSourceOverrides,
  resolveArtifactSourceOverride,
  writeArtifactSourceOverride,
  type ArtifactSourceOverrideMap,
} from './previewArtifactSourceOverrides';

const range = (startLine: number, endLine = startLine + 2) => ({
  startLine,
  startColumn: 1,
  endLine,
  endColumn: 4,
});

test('node identity keeps a local fence source override valid after earlier fences add lines', () => {
  const overrides: ArtifactSourceOverrideMap = new Map();

  writeArtifactSourceOverride(
    overrides,
    'stable-third-node',
    range(9),
    '```html\nTHIRD UPDATED\n```',
  );

  assert.equal(
    resolveArtifactSourceOverride(
      overrides,
      'stable-third-node',
      range(13),
      '```html\nSTALE THIRD\n```',
    ),
    '```html\nTHIRD UPDATED\n```',
  );
  assert.equal(
    resolveArtifactSourceOverride(overrides, 'sibling-node', range(9), 'SIBLING'),
    'SIBLING',
    'a shifted sibling must not inherit the target node override',
  );
});

test('parsed range overrides remain a fallback for artifacts without a stable node key', () => {
  const overrides: ArtifactSourceOverrideMap = new Map();
  replaceArtifactSourceOverrides(overrides, [
    { source: 'TEXT', sourceRange: range(1), type: 'markdown' },
    { source: '```html\nTARGET\n```', sourceRange: range(5), type: 'artifact' },
  ]);

  assert.equal(
    resolveArtifactSourceOverride(overrides, undefined, range(5), 'STALE'),
    '```html\nTARGET\n```',
  );
  assert.equal(resolveArtifactSourceOverride(overrides, undefined, range(8), 'FALLBACK'), 'FALLBACK');
});
