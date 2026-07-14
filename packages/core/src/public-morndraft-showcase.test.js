import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPublicMornDraftSampleSource,
  getPublicMornDraftInsertEntries,
  getPublicMornDraftShowcaseCount,
} from './public-morndraft-showcase.js';

test('public showcase keeps 29 Syntax examples and 30 Final insert entries', () => {
  assert.equal(getPublicMornDraftShowcaseCount('syntax'), 29);
  assert.equal(getPublicMornDraftShowcaseCount('insert'), 30);
  assert.equal(getPublicMornDraftInsertEntries().length, 30);
});

test('public showcase emits canonical fenced HTML MornDraft sources', () => {
  const syntax = buildPublicMornDraftSampleSource();
  assert.equal((syntax.match(/^## \d{2}\./gm) ?? []).length, 29);
  assert.match(syntax, /```html\n/);
  assert.match(syntax, /morndraft:structure/);
  assert.match(syntax, /data-morndraft-source="morndraft-flat"/);
  assert.doesNotMatch(syntax, /```morndraft\b/);

  for (const entry of getPublicMornDraftInsertEntries()) {
    assert.match(entry.source, /^```html\n/);
    assert.match(entry.source, /morndraft:structure/);
  }
});
