import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPublicAiBoundedRequest,
  PUBLIC_AI_MAX_INSTRUCTION_CHARS,
  PUBLIC_AI_MAX_SELECTED_TEXT_CHARS,
  PUBLIC_AI_MAX_SOURCE_CONTEXT_CHARS,
  PublicAiInputTooLargeError,
} from './publicAiContext';

test('generate and modify send bounded nearby context without local image data', () => {
  const image = `data:image/png;base64,${'A'.repeat(100_000)}`;
  const source = `${'before '.repeat(6_000)}\n![local](${image})\nTARGET\n${'after '.repeat(6_000)}`;
  const start = source.indexOf('TARGET');
  const request = buildPublicAiBoundedRequest({
    action: 'modify',
    instruction: 'Improve this.',
    selectedText: 'TARGET',
    source,
    range: { start, end: start + 'TARGET'.length },
  });

  assert.equal(request.action, 'modify');
  assert.equal(request.selectedText, 'TARGET');
  assert.ok((request.source?.length ?? Infinity) <= PUBLIC_AI_MAX_SOURCE_CONTEXT_CHARS + 160);
  assert.doesNotMatch(request.source ?? '', /data:image|AAAAAA/u);
  assert.match(request.source ?? '', /local image data omitted/u);
  assert.match(request.source ?? '', /source omitted/u);
});

test('summarize sends only the selected text', () => {
  assert.deepEqual(buildPublicAiBoundedRequest({
    action: 'summarize',
    selectedText: 'Selected paragraph',
    source: 'must not be sent',
  }), {
    action: 'summarize',
    selectedText: 'Selected paragraph',
  });
});

test('oversized instructions and selections fail before reaching an adapter', () => {
  assert.throws(() => buildPublicAiBoundedRequest({
    action: 'generate',
    instruction: 'x'.repeat(PUBLIC_AI_MAX_INSTRUCTION_CHARS + 1),
    source: '/AI',
    range: { start: 0, end: 3 },
  }), PublicAiInputTooLargeError);
  assert.throws(() => buildPublicAiBoundedRequest({
    action: 'summarize',
    selectedText: 'x'.repeat(PUBLIC_AI_MAX_SELECTED_TEXT_CHARS + 1),
  }), PublicAiInputTooLargeError);
});
