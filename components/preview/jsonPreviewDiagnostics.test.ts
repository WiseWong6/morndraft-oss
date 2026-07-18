import test from 'node:test';
import assert from 'node:assert/strict';

import { analyzeArtifactDocument } from '@morndraft/core';
import type { ArtifactDiagnostic } from './MarkdownCodeBlockRenderer';
import { getCanonicalJsonPreviewDiagnostic } from './jsonPreviewDiagnostics';

const getJsonDiagnostic = (source: string) => {
  const analysis = analyzeArtifactDocument(source) as { diagnostics?: ArtifactDiagnostic[] };
  return analysis.diagnostics?.find(diagnostic => diagnostic.code === 'json.parse_error') ?? null;
};

test('JSON preview preserves the full-source deterministic fix for multiline JSON5', () => {
  const code = [
    '{',
    "  unquoted: 'value',",
    '  items: [1, 2] // keep this comment',
  ].join('\n');
  const fullSource = `# JSON5\n\n\`\`\`json5\n${code}\n\`\`\``;
  const fullDiagnostic = getJsonDiagnostic(fullSource);
  assert.ok(fullDiagnostic?.fix);

  const canonical = getCanonicalJsonPreviewDiagnostic({
    code,
    diagnostic: fullDiagnostic,
    fullSource,
    sourceRange: { startLine: 4, startColumn: 1, endLine: 6, endColumn: 37 },
    sourceStartLine: 4,
  });

  assert.equal(canonical?.fixId, fullDiagnostic.fixId);
  assert.equal(canonical?.line, fullDiagnostic.line);
  assert.equal(canonical?.fix?.replacement, '\n}');
});

test('JSON preview keeps the existing strict-JSON diagnostic when no deterministic fix exists', () => {
  const code = ['{', '  "first": 1', '  "second": 2', '}'].join('\n');
  const fullSource = `# JSON\n\n\`\`\`json\n${code}\n\`\`\``;
  const canonical = getCanonicalJsonPreviewDiagnostic({
    code,
    diagnostic: getJsonDiagnostic(fullSource),
    fullSource,
    sourceRange: { startLine: 4, startColumn: 1, endLine: 7, endColumn: 2 },
    sourceStartLine: 4,
  });

  assert.equal(canonical?.code, 'json.parse_error');
  assert.equal(canonical?.line, 5);
  assert.equal(canonical?.fixId, undefined);
});

test('JSON preview never lets an out-of-range full-source fix replace the active block diagnostic', () => {
  const code = ['{', '  "first": 1', '  "second": 2', '}'].join('\n');
  const staleFullSource = '# Other block\n\n```json\n{"other":true\n```';
  const canonical = getCanonicalJsonPreviewDiagnostic({
    code,
    diagnostic: null,
    fullSource: staleFullSource,
    sourceRange: { startLine: 10, startColumn: 1, endLine: 13, endColumn: 2 },
    sourceStartLine: 10,
  });

  assert.equal(canonical?.code, 'json.parse_error');
  assert.equal(canonical?.line, 11);
  assert.equal(canonical?.fixId, undefined);
});

test('JSON preview uses the exact full-source EOF fix for LF and CRLF documents', () => {
  for (const lineEnding of ['\n', '\r\n']) {
    const validBody = JSON.stringify({ version: '4.8', action: { type: 'clarify' } });
    const code = validBody.slice(0, -1);
    const fullSource = ['# Intent result', '', '```json', code, '```'].join(lineEnding);
    const fullDiagnostic = getJsonDiagnostic(fullSource);
    assert.ok(fullDiagnostic?.fixId);

    const canonical = getCanonicalJsonPreviewDiagnostic({
      code,
      diagnostic: null,
      fullSource,
      sourceRange: { startLine: 4, startColumn: 1, endLine: 4, endColumn: code.length + 1 },
      sourceStartLine: 4,
    });

    assert.equal(canonical?.fixId, fullDiagnostic.fixId, JSON.stringify(lineEnding));
    assert.deepEqual(canonical?.fix?.range, fullDiagnostic.fix?.range, JSON.stringify(lineEnding));
  }
});
