import test from 'node:test';
import assert from 'node:assert/strict';

import { findTextSearchMatches } from './text-search.js';

test('findTextSearchMatches finds literal matches with line and column metadata', () => {
  const matches = findTextSearchMatches('Alpha\nbeta alpha\nALPHA', 'alpha');

  assert.deepEqual(
    matches.map(({ line, column, lineText }) => ({ line, column, lineText })),
    [
      { line: 1, column: 1, lineText: 'Alpha' },
      { line: 2, column: 6, lineText: 'beta alpha' },
      { line: 3, column: 1, lineText: 'ALPHA' },
    ],
  );
});

test('findTextSearchMatches supports case-sensitive search and max limits', () => {
  assert.deepEqual(
    findTextSearchMatches('Alpha alpha ALPHA', 'alpha', { caseSensitive: true }).map(({ column }) => column),
    [7],
  );
  assert.equal(findTextSearchMatches('a a a', 'a', { maxMatches: 2 }).length, 2);
});

test('findTextSearchMatches ignores empty queries', () => {
  assert.deepEqual(findTextSearchMatches('abc', '   '), []);
});
