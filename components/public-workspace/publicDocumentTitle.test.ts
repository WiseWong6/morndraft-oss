import assert from 'node:assert/strict';
import test from 'node:test';
import { derivePublicImportedDocumentTitle } from './publicDocumentTitle';

test('public import title prefers the local filename over document content', () => {
  assert.equal(
    derivePublicImportedDocumentTitle('# Content heading', 'zh', 'reviewed-release'),
    'reviewed-release',
  );
});

test('public import title falls back to the first non-empty content line', () => {
  assert.equal(
    derivePublicImportedDocumentTitle('\n\n# First content heading\nBody', 'en'),
    'First content heading',
  );
  assert.equal(
    derivePublicImportedDocumentTitle('\n  - [x] Ship the public build\nLater', 'en', ' \n '),
    'Ship the public build',
  );
});

test('public import title is grapheme-safe, bounded, and control-free', () => {
  const title = derivePublicImportedDocumentTitle(
    'Fallback',
    'zh',
    `验收\u0000${'完成'.repeat(20)}👨‍👩‍👧‍👦`,
  );
  assert.doesNotMatch(title, /\p{Cc}/u);
  assert.match(title, /…$/u);
  assert.doesNotMatch(title, /\uFFFD/u);
});

test('public import title has a localized empty fallback', () => {
  assert.equal(derivePublicImportedDocumentTitle('\n\t', 'zh'), '未命名文档');
  assert.equal(derivePublicImportedDocumentTitle('', 'en'), 'Untitled document');
});
