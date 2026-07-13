import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPublicAiGenerateResult,
  applyPublicAiModifyResult,
  PublicAiStaleSourceError,
} from './publicAiState';
import {
  copyPublicAiResultText,
  ensurePublicAiResponseText,
  getPublicAiRequestErrorMessage,
} from './PublicAiPanel';

test('AI modify applies only to an unchanged source and exact selection', () => {
  const source = '# Title\n\nOriginal paragraph.';
  const start = source.indexOf('Original');
  const selection = { start, end: source.length, text: 'Original paragraph.', source };
  assert.equal(applyPublicAiModifyResult(source, selection, 'Revised paragraph.'), '# Title\n\nRevised paragraph.');
  assert.throws(
    () => applyPublicAiModifyResult(`${source}\n`, selection, 'Unsafe replacement'),
    PublicAiStaleSourceError,
  );
});

test('AI generate adopts only after the slash source snapshot is unchanged', () => {
  const source = '# Title\n/AI';
  const snapshot = { source, range: { start: source.indexOf('/AI'), end: source.length } };
  assert.equal(applyPublicAiGenerateResult(source, snapshot, '\nGenerated\n'), '# Title\nGenerated');
  assert.throws(() => applyPublicAiGenerateResult('# Changed\n/AI', snapshot, 'Generated'), PublicAiStaleSourceError);
});

test('AI provider errors remain explicit without exposing request contents', () => {
  const labels = {
    failed: 'failed', missing: 'missing', unauthorized: 'unauthorized', notFound: 'not-found',
    rateLimited: 'rate-limited', server: 'server', network: 'network', invalid: 'invalid',
    timeout: 'timeout', cancelled: 'cancelled', tooLarge: 'too-large',
  } as Parameters<typeof getPublicAiRequestErrorMessage>[1];
  assert.equal(getPublicAiRequestErrorMessage({ code: 'missing_config' }, labels), 'missing');
  assert.equal(getPublicAiRequestErrorMessage({ code: 'unauthorized' }, labels), 'unauthorized');
  assert.equal(getPublicAiRequestErrorMessage({ code: 'model_not_found' }, labels), 'not-found');
  assert.equal(getPublicAiRequestErrorMessage({ code: 'rate_limited' }, labels), 'rate-limited');
  assert.equal(getPublicAiRequestErrorMessage({ code: 'server_error' }, labels), 'server');
  assert.equal(getPublicAiRequestErrorMessage({ code: 'network_error' }, labels), 'network');
  assert.equal(getPublicAiRequestErrorMessage({ code: 'invalid_response' }, labels), 'invalid');
  assert.equal(getPublicAiRequestErrorMessage({ code: 'empty_response' }, labels), 'invalid');
  assert.equal(getPublicAiRequestErrorMessage({ code: 'timeout' }, labels), 'timeout');
  assert.equal(getPublicAiRequestErrorMessage({ code: 'aborted' }, labels), 'cancelled');
  assert.equal(getPublicAiRequestErrorMessage({ code: 'input_too_large' }, labels), 'too-large');
});

test('AI panel maps a locally detected empty adapter result to the explicit invalid-response message', () => {
  const labels = {
    failed: 'failed', missing: 'missing', unauthorized: 'unauthorized', notFound: 'not-found',
    rateLimited: 'rate-limited', server: 'server', network: 'network', invalid: 'invalid',
    timeout: 'timeout', cancelled: 'cancelled', tooLarge: 'too-large',
  } as Parameters<typeof getPublicAiRequestErrorMessage>[1];
  assert.throws(
    () => ensurePublicAiResponseText('  '),
    (error: unknown) => getPublicAiRequestErrorMessage(error, labels) === 'invalid',
  );
});

test('AI result copy falls back when the Clipboard API exists but rejects', async () => {
  const calls: string[] = [];
  await copyPublicAiResultText('summary result', {
    writeClipboardText: async (value) => {
      calls.push(`clipboard:${value}`);
      throw new DOMException('Permission denied', 'NotAllowedError');
    },
    fallbackCopy: (value) => {
      calls.push(`fallback:${value}`);
      return true;
    },
  });
  assert.deepEqual(calls, ['clipboard:summary result', 'fallback:summary result']);
});

test('AI result copy reports its own failure only after both copy paths fail', async () => {
  await assert.rejects(
    copyPublicAiResultText('summary result', {
      writeClipboardText: async () => { throw new Error('clipboard blocked'); },
      fallbackCopy: () => false,
    }),
    /copy_failed/u,
  );
});
