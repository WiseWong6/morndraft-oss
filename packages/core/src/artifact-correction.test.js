import test from 'node:test';
import assert from 'node:assert/strict';

import { correctArtifact } from './artifact-correction.js';

test('correctArtifact closes unterminated Markdown fences', () => {
  const result = correctArtifact({
    format: 'md',
    source: '# Demo\n\n```json\n{ "ok": true }\n',
  });

  assert.equal(result.ok, true);
  assert.equal(result.format, 'markdown');
  assert.match(result.corrected, /```\n$/);
  assert.equal(result.diagnostics[0].code, 'markdown.unclosed_fence');
});

test('correctArtifact formats JSON5 as strict JSON', () => {
  const result = correctArtifact({
    format: 'json5',
    source: "{ok:true, list:['a',],}",
  });

  assert.equal(result.ok, true);
  assert.equal(result.corrected, '{\n  "ok": true,\n  "list": [\n    "a"\n  ]\n}\n');
});

test('correctArtifact returns JSON parse diagnostics with location', () => {
  const result = correctArtifact({
    format: 'json',
    source: '{ok:}',
  });

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, 'json.parse_error');
  assert.equal(result.diagnostics[0].severity, 'error');
});

test('correctArtifact points incomplete JSON values to the parser line', () => {
  const result = correctArtifact({
    format: 'json',
    source: '{ "case": }',
  });

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].line, 1);
  assert.equal(result.diagnostics[0].column, 11);
});

test('correctArtifact points missing JSON commas to the editable previous line', () => {
  const result = correctArtifact({
    format: 'json',
    source: `{
  "items": [
    { "name": "markdown", "status": "ready" }
    { "name": "html-preview", "status": "ready" }
  ]
}`,
  });

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].line, 3);
  assert.equal(result.diagnostics[0].column, 46);
});

test('correctArtifact points missing commas before quoted JSON keys to the previous line', () => {
  const result = correctArtifact({
    format: 'json',
    source: '{"a":1\n "b":2}',
  });

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, 'json.parse_error');
  assert.equal(result.diagnostics[0].line, 1);
});

test('correctArtifact wraps HTML fragments in a complete document shell', () => {
  const result = correctArtifact({
    format: 'html-preview',
    source: '<main><h1>MornDraft</h1></main>',
  });

  assert.equal(result.ok, true);
  assert.match(result.corrected, /^<!doctype html>/);
  assert.match(result.corrected, /<meta charset="utf-8">/);
  assert.match(result.corrected, /<meta name="viewport"/);
  assert.equal(result.diagnostics[0].code, 'html.fragment_wrapped');
});

test('correctArtifact normalizes doctype documents that omit html and head tags', () => {
  const result = correctArtifact({
    format: 'html',
    source: '<!doctype html><body><main><h1>MornDraft</h1></main></body>',
  });

  assert.equal(result.ok, true);
  assert.match(result.corrected, /^<!doctype html>\n<html lang="zh-CN">/);
  assert.match(result.corrected, /<head>\n<meta charset="utf-8">/);
  assert.match(result.corrected, /<body>\n<main><h1>MornDraft<\/h1><\/main>\n<\/body>/);
  assert.equal((result.corrected.match(/<!doctype html>/g) ?? []).length, 1);
  assert.equal((result.corrected.match(/<body>/g) ?? []).length, 1);
});

test('correctArtifact validates Mermaid diagram keywords without changing semantics', () => {
  const valid = correctArtifact({
    format: 'mermaid',
    source: 'flowchart LR\nA --> B',
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.diagnostics[0].code, 'mermaid.diagram_detected');

  const invalid = correctArtifact({
    format: 'mermaid',
    source: 'unknownDiagram\nA --> B',
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.diagnostics[0].code, 'mermaid.unknown_diagram');
});

test('correctArtifact reports incomplete Mermaid edges before render', () => {
  for (const edge of ['-->', '---', '==>', '-.->', '--o', '--X']) {
    const result = correctArtifact({
      format: 'mermaid',
      source: `graph TD<br> A ${edge}`,
    });

    assert.equal(result.ok, false, edge);
    assert.equal(result.diagnostics[0].code, 'mermaid.incomplete_edge', edge);
    assert.equal(result.diagnostics[0].line, 1, edge);
  }
});

test('correctArtifact allows single arrows inside Mermaid labels only', () => {
  const quotedLabel = correctArtifact({
    format: 'mermaid',
    source: 'flowchart TD\nA["输入 -> 输出"]\nA --> B',
  });
  const plainLabel = correctArtifact({
    format: 'mermaid',
    source: 'flowchart TD\nA[输入 -> 输出]\nA --> B',
  });
  const edgeLabel = correctArtifact({
    format: 'mermaid',
    source: 'flowchart TD\nA -->|输入 -> 输出| B',
  });
  const invalidEdge = correctArtifact({
    format: 'mermaid',
    source: 'flowchart TD\nA[输入] -> B',
  });

  assert.equal(quotedLabel.ok, true);
  assert.equal(plainLabel.ok, true);
  assert.equal(edgeLabel.ok, true);
  assert.equal(invalidEdge.ok, false);
  assert.equal(invalidEdge.diagnostics[0].code, 'mermaid.single_arrow_flow_edge');
});

test('correctArtifact reports unclosed Mermaid node labels before render', () => {
  const result = correctArtifact({
    format: 'mermaid',
    source: 'graph TD\nA[开始 --> B',
  });

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, 'mermaid.unclosed_node_label');
  assert.equal(result.diagnostics[0].line, 2);
});
