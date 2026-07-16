import assert from 'node:assert/strict';
import test from 'node:test';

import { analyzePublicDeterministicRepair } from '@morndraft/core/oss-public';

test('public repair completes only parseable trailing JSON containers', () => {
  const source = '```json\n{"literal":"}]","items":[{"ok":true\n```';
  const result = analyzePublicDeterministicRepair(source);

  assert.equal(result.diagnostics[0]?.code, 'json.trailing_closure');
  assert.equal(result.candidateSource, '```json\n{"literal":"}]","items":[{"ok":true}]}\n```');
  assert.deepEqual(analyzePublicDeterministicRepair(result.candidateSource!).diagnostics, []);
});

test('public repair preserves JSON5 comments and CRLF while closing containers', () => {
  const source = "```json5\r\n{items: [1, 2] // keep this comment\r\n```";
  const result = analyzePublicDeterministicRepair(source);

  assert.equal(result.diagnostics[0]?.code, 'json5.trailing_closure');
  assert.equal(result.candidateSource, "```json5\r\n{items: [1, 2] // keep this comment\r\n}\r\n```");
});

test('public repair preserves CR-only documents without mixing line endings', () => {
  const source = '```json5\r{items: [1, 2] // keep this comment\r```';
  const result = analyzePublicDeterministicRepair(source);

  assert.equal(result.candidateSource, '```json5\r{items: [1, 2] // keep this comment\r}\r```');
  assert.equal(result.candidateSource?.includes('\n'), false);
});

test('public repair supports explicitly typed standalone JSON and JSON5', () => {
  assert.equal(
    analyzePublicDeterministicRepair('{"items":[1,2', { format: 'json' }).candidateSource,
    '{"items":[1,2]}',
  );
  assert.equal(
    analyzePublicDeterministicRepair("{note:'ok', list:[1,2", { format: 'json5' }).candidateSource,
    "{note:'ok', list:[1,2]}",
  );
});

test('public repair appends the matching missing Markdown fence', () => {
  const source = '# Demo\n\n~~~~markdown\nEditable body';
  const result = analyzePublicDeterministicRepair(source);

  assert.equal(result.diagnostics[0]?.code, 'markdown.unclosed_fence');
  assert.equal(result.candidateSource, `${source}\n~~~~`);
});

test('public repair removes deterministic nested JSON fences without reformatting', () => {
  const source = '````json5\r\n~~~json5\r\n{ok:true, list:[1,],}\r\n~~~\r\n````';
  const result = analyzePublicDeterministicRepair(source);

  assert.equal(result.diagnostics[0]?.code, 'markdown.redundant_json_fence');
  assert.equal(result.candidateSource, '````json5\r\n{ok:true, list:[1,],}\r\n````');
});

test('public repair removes equal-length split redundant fences', () => {
  const source = '```json\n```json\n{"ok":true}\n```\n\n```';
  const result = analyzePublicDeterministicRepair(source);

  assert.equal(result.diagnostics[0]?.code, 'markdown.redundant_json_fence');
  assert.equal(result.candidateSource, '```json\n{"ok":true}\n```');
});

test('public repair refuses ambiguous syntax errors and unmatched empty markers', () => {
  const unsafe = [
    '```json\n{"a":1 "b":2\n```',
    '```json\n{"a":"unterminated\n```',
    '```json\n{"a":[1}\n```',
    '```json\n{"a":1 trailing\n```',
    '```json\n{"a":1 // strict JSON comment\n```',
    '```json\n```json5\n{ok:true}\n```\n```',
    '```json\nExplanation\n```json\n{"ok":true}\n```\n```',
    '# Complete block\n\n```json\n{"ok":true}\n```\n```',
  ];

  for (const source of unsafe) {
    assert.equal(analyzePublicDeterministicRepair(source).candidate, null, source);
  }
});
