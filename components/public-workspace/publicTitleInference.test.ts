import assert from 'node:assert/strict';
import test from 'node:test';

import {
  inferPublicDocumentTitle,
  sanitizePublicDocumentFileStem,
  splitPublicTitleGraphemes,
  truncatePublicTitle,
} from './publicTitleInference';

test('public title inference prefers a cleaned filename stem', () => {
  const result = inferPublicDocumentTitle({
    fileName: '../季度:复盘?.final.md',
    source: '# Source heading',
  });

  assert.deepEqual(result, {
    fileStem: '季度 复盘 .final',
    origin: 'filename',
    title: '季度 复盘 .final',
  });
});

test('public title inference falls back to the first valid body line', () => {
  const result = inferPublicDocumentTitle({
    source: [
      '---',
      'draft: true',
      '---',
      '',
      '```json',
      '{"internal":"sample"}',
      '```',
      '',
      '# 交付复盘报告 ##',
    ].join('\n'),
  });

  assert.equal(result.origin, 'content');
  assert.equal(result.title, '交付复盘报告');
  assert.equal(result.fileStem, '交付复盘报告');
});

test('public title inference ignores a filename that cleans to an empty stem', () => {
  const result = inferPublicDocumentTitle({ fileName: '???', source: '# Useful title' });

  assert.equal(result.origin, 'content');
  assert.equal(result.title, 'Useful title');
});

test('public title truncation keeps Unicode grapheme clusters intact', () => {
  const family = '👨‍👩‍👧‍👦';
  assert.equal(splitPublicTitleGraphemes(`${family}A`).length, 2);
  assert.equal(truncatePublicTitle(`${family}ABC`, 3), `${family}A…`);
  assert.equal(truncatePublicTitle('e\u0301clair', 3), 'éc…');
});

test('public filename cleanup removes unsafe characters and reserved stems', () => {
  assert.equal(sanitizePublicDocumentFileStem('  report<>:"/\\|?*...  '), 'report');
  assert.equal(sanitizePublicDocumentFileStem('CON'), '_CON');
  assert.equal(sanitizePublicDocumentFileStem('\u202ehidden.md'), 'hidden.md');
});

test('public title inference uses an explicit fallback when no body title exists', () => {
  assert.deepEqual(inferPublicDocumentTitle({
    fallbackTitle: '未命名文稿',
    source: '```json\n{"ok":true}\n```',
  }), {
    fileStem: '未命名文稿',
    origin: 'fallback',
    title: '未命名文稿',
  });
});
