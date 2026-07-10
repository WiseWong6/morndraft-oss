import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyJsonFenceContent } from './json-fence-content.js';

test('classifyJsonFenceContent accepts one complete strict JSON value', () => {
  const objectResult = classifyJsonFenceContent('{"ok":true}');
  const arrayResult = classifyJsonFenceContent('[{"ok":true},{"ok":false}]');

  assert.equal(objectResult.kind, 'single');
  assert.equal(objectResult.formatted, '{\n  "ok": true\n}');
  assert.equal(arrayResult.kind, 'single');
  assert.match(arrayResult.formatted, /"ok": false/);
});

test('classifyJsonFenceContent rejects multiple top-level JSON values', () => {
  const result = classifyJsonFenceContent('{"a":1}\n{"b":2}');

  assert.equal(result.kind, 'invalid');
});

test('classifyJsonFenceContent rejects JSON comments and property snippets in strict mode', () => {
  const commented = classifyJsonFenceContent('// 示例\n{"ok":true}');
  const snippet = classifyJsonFenceContent('"items": [{"ok": true}]');

  assert.equal(commented.kind, 'invalid');
  assert.equal(snippet.kind, 'invalid');
});

test('classifyJsonFenceContent escapes raw newlines inside JSON strings before strict parsing', () => {
  const result = classifyJsonFenceContent('{"说明":"第一行\n第二行"}');

  assert.equal(result.kind, 'single');
  assert.equal(result.formatted, '{\n  "说明": "第一行\\n第二行"\n}');
});

test('classifyJsonFenceContent keeps explicit JSON5 mode separate from strict JSON', () => {
  const strictResult = classifyJsonFenceContent('{ok:true, list:[1,],}');
  const json5Result = classifyJsonFenceContent('{ok:true, list:[1,],}', { parseMode: 'json5' });

  assert.equal(strictResult.kind, 'invalid');
  assert.equal(json5Result.kind, 'single');
  assert.equal(json5Result.formatted, '{\n  "ok": true,\n  "list": [\n    1\n  ]\n}');
});
