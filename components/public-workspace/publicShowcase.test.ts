import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getPublicFlatInsertEntries,
  getPublicSyntaxEntries,
  PUBLIC_MORNDRAFT_INSERT_ENTRY_COUNT,
  PUBLIC_MORNDRAFT_SYNTAX_FIXTURE_COUNT,
} from './publicShowcase';

test('public workspace exposes the canonical 29-item Syntax sample', async () => {
  assert.equal(PUBLIC_MORNDRAFT_SYNTAX_FIXTURE_COUNT, 29);
  const entry = getPublicSyntaxEntries('zh').find((candidate) => candidate.id === 'morndraft');
  assert.ok(entry);
  const source = typeof entry.source === 'function' ? await entry.source() : entry.source;
  assert.equal((source.match(/^## \d{2}\. /gmu) ?? []).length, 29);
  assert.match(source, /<!-- morndraft:structure /u);
  assert.match(source, /data-morndraft-source="morndraft-flat"/u);
});

test('public workspace slash registry exposes 30 canonical flat entries plus Markdown table', () => {
  assert.equal(PUBLIC_MORNDRAFT_INSERT_ENTRY_COUNT, 30);
  const entries = getPublicFlatInsertEntries();
  assert.equal(entries.length, 30);
  assert.equal(new Set(entries.map((entry) => entry.id)).size, 30);
  for (const entry of entries) {
    assert.match(String(entry.source), /^```html\n/u);
    assert.match(String(entry.source), /<!-- morndraft:structure /u);
  }
});
