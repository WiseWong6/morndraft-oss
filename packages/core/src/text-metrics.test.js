import test from 'node:test';
import assert from 'node:assert/strict';

import {
  estimateTokenCount,
  formatCompactCount,
  getEditorTextMetrics,
} from './text-metrics.js';

test('getEditorTextMetrics returns zero counts for empty text', () => {
  assert.deepEqual(getEditorTextMetrics(''), {
    characters: 0,
    estimatedTokens: 0,
  });
});

test('getEditorTextMetrics counts visible unicode characters and estimates English tokens', () => {
  assert.deepEqual(getEditorTextMetrics('Hello world!'), {
    characters: 12,
    estimatedTokens: 3,
  });
});

test('getEditorTextMetrics counts Chinese and mixed text with higher token weight', () => {
  assert.deepEqual(getEditorTextMetrics('你好 MornDraft 👋'), {
    characters: 14,
    estimatedTokens: 8,
  });
});

test('getEditorTextMetrics handles Markdown, JSON, and HTML source snippets', () => {
  const source = '# 标题\n\n{"ok": true}\n\n<section>Hi</section>';

  assert.deepEqual(getEditorTextMetrics(source), {
    characters: 41,
    estimatedTokens: 12,
  });
});

test('estimateTokenCount ignores whitespace-only input', () => {
  assert.equal(estimateTokenCount(' \n\t'), 0);
});

test('formatCompactCount shortens large values for mobile toolbars', () => {
  assert.equal(formatCompactCount(999), '999');
  assert.equal(formatCompactCount(1234), '1.2k');
  assert.equal(formatCompactCount(12000), '12k');
  assert.equal(formatCompactCount(1_240_000), '1.2m');
  assert.equal(formatCompactCount(12_400_000), '12m');
  assert.equal(formatCompactCount(1_240_000_000), '1.2b');
});
