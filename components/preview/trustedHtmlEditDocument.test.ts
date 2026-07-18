import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTrustedHtmlEditSrcDoc,
  createTrustedHtmlEditRequestId,
  isTrustedHtmlEditRequest,
} from './trustedHtmlEditDocument';

test('trusted HTML edit source removes scripts and installs a deny-by-default CSP', () => {
  const source = '<!doctype html><html><head><style>p{color:red}</style></head><body><p>safe</p><script>globalThis.pwned=true</script></body></html>';
  const result = buildTrustedHtmlEditSrcDoc(source);

  assert.doesNotMatch(result, /<script\b/i);
  assert.match(result, /Content-Security-Policy/);
  assert.match(result, /script-src 'none'/);
  assert.match(result, /connect-src 'none'/);
  assert.match(result, /<p>safe<\/p>/);
});

test('trusted HTML edit request ids are parent-generated, non-empty, and exact-match only', () => {
  const requestId = createTrustedHtmlEditRequestId('frame/1', 3, 1234);

  assert.equal(requestId, 'html-edit:frame%2F1:1234:3');
  assert.equal(isTrustedHtmlEditRequest(requestId, requestId), true);
  assert.equal(isTrustedHtmlEditRequest(requestId, ''), false);
  assert.equal(isTrustedHtmlEditRequest(requestId, 'forged'), false);
  assert.equal(isTrustedHtmlEditRequest(null, requestId), false);
});
