import test from 'node:test';
import assert from 'node:assert/strict';

import {
  analyzeArtifactDocument,
  applyArtifactFix,
  applyArtifactFixes,
  recoverMarkdownFencesForPreview,
} from './artifact-document-analysis.js';

test('analyzeArtifactDocument returns a document fix for unclosed Markdown fences', () => {
  const source = '# Demo\n\n```json\n{ "ok": true }\n';
  const result = analyzeArtifactDocument(source);

  assert.equal(result.diagnostics[0].code, 'markdown.unclosed_fence');
  assert.equal(result.diagnostics[0].severity, 'warning');
  assert.equal(result.diagnostics[0].line, 3);
  assert.equal(result.fixes.length, 1);
  assert.match(applyArtifactFix(source, result.fixes[0]), /```\n$/);
});

test('analyzeArtifactDocument does not count valid JSON formatting as an editor issue', () => {
  const source = '```json5\n{ok:true, list:[1,],}\n```';
  const result = analyzeArtifactDocument(source);

  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.fixes, []);
});

test('analyzeArtifactDocument reports JSON parse errors without guessing a fix', () => {
  const result = analyzeArtifactDocument('```json\n{ok:}\n```');

  assert.equal(result.diagnostics[0].code, 'json.parse_error');
  assert.equal(result.diagnostics[0].severity, 'error');
  assert.equal(result.fixes.length, 0);
});

test('analyzeArtifactDocument reports non-standard JSON examples as parse errors', () => {
  const result = analyzeArtifactDocument(`\`\`\`json
// 示例2：未匹配到产品职业
{
  "产品ID": "345382",
  "是否可投保": false,
  "产品级拒保原因": [
    {"类型": "其他", "说明": "未匹配到产品职业"}
  ]
}
\`\`\`

\`\`\`json
"产品级拒保原因": [
  {"类型": "其他", "说明": "未匹配到产品职业"}
]
\`\`\`

\`\`\`json
// 错误1
{"类型": "区域限制", "说明": "客户所在区域符合要求，此项通过"}

// 错误2
{"类型": "其他", "说明": "满足、符合等字样"}
\`\`\``);

  const jsonDiagnostics = result.diagnostics.filter((item) => item.code.startsWith('json.'));
  assert.equal(jsonDiagnostics.length, 3);
  assert.deepEqual(jsonDiagnostics.map((item) => item.code), [
    'json.parse_error',
    'json.parse_error',
    'json.parse_error',
  ]);
});

test('analyzeArtifactDocument rejects JSON property snippets', () => {
  const valid = analyzeArtifactDocument('```json\n"产品级拒保原因": [{"类型": "其他"}]\n```');
  const invalid = analyzeArtifactDocument('```json\n"产品级拒保原因": [{"类型": }]\n```');

  assert.equal(valid.diagnostics[0].code, 'json.parse_error');
  assert.equal(invalid.diagnostics[0].code, 'json.parse_error');
});

test('analyzeArtifactDocument accepts raw newlines inside JSON strings by escaping them', () => {
  const result = analyzeArtifactDocument('```json\n{"说明":"第一行\n第二行"}\n```');

  assert.deepEqual(result.diagnostics, []);
});

test('analyzeArtifactDocument still reports true JSON punctuation errors', () => {
  const result = analyzeArtifactDocument('```json\n{"类型":"区域限制"，"说明":"x"}\n```');

  assert.equal(result.diagnostics[0].code, 'json.parse_error');
});

test('analyzeArtifactDocument maps incomplete JSON values to editor content line', () => {
  const result = analyzeArtifactDocument('```json\n{ "case": }\n```');

  assert.equal(result.diagnostics[0].code, 'json.parse_error');
  assert.equal(result.diagnostics[0].line, 2);
});

test('analyzeArtifactDocument maps missing JSON commas to the previous data line', () => {
  const result = analyzeArtifactDocument(`\`\`\`json
{
  "items": [
    { "name": "markdown", "status": "ready" }
    { "name": "html-preview", "status": "ready" }
  ]
}
\`\`\``);

  assert.equal(result.diagnostics[0].code, 'json.parse_error');
  assert.equal(result.diagnostics[0].line, 4);
});

test('analyzeArtifactDocument maps missing commas before quoted JSON keys to the previous line', () => {
  const result = analyzeArtifactDocument('```json\n{"a":1\n "b":2}\n```');

  assert.equal(result.diagnostics[0].code, 'json.parse_error');
  assert.equal(result.diagnostics[0].line, 2);
});

test('analyzeArtifactDocument maps invalid quoted JSON sample values to their source line', () => {
  const prefix = Array.from({ length: 255 }, (_value, index) => `source line ${index + 1}`).join('\n');
  const result = analyzeArtifactDocument(`${prefix}
\`\`\`json
{
  "审核组列表": [
    {
      "审核组名称": "心血管",
      "疾病标签": "心血管 -> 其他",
      "异常记录列表": [],
      "类型": "异常类型，即"门诊诊断"、"出院诊断"、"体检结果"、"检查结果"或"其他情况""
    }
  ]
}
\`\`\``);

  assert.equal(result.diagnostics[0].code, 'json.parse_error');
  assert.equal(result.diagnostics[0].line, 263);
});

test('analyzeArtifactDocument returns HTML wrapper and meta fixes', () => {
  const fragment = analyzeArtifactDocument('```html-preview\n<main><h1>MornDraft</h1></main>\n```');
  assert.equal(fragment.diagnostics[0].code, 'html.fragment_wrapped');
  assert.match(applyArtifactFix('```html-preview\n<main><h1>MornDraft</h1></main>\n```', fragment.fixes[0]), /<!doctype html>/);

  const full = analyzeArtifactDocument('```html\n<!doctype html><html><body><main>MornDraft</main></body></html>\n```');
  assert.equal(full.diagnostics[0].code, 'html.head_meta_added');
  const fixed = applyArtifactFix('```html\n<!doctype html><html><body><main>MornDraft</main></body></html>\n```', full.fixes[0]);
  assert.equal((fixed.match(/<!doctype html>/g) ?? []).length, 1);
  assert.match(fixed, /<meta charset="utf-8">/);
});

test('analyzeArtifactDocument reports unknown Mermaid diagrams without a fix', () => {
  const result = analyzeArtifactDocument('```mermaid\nunknownDiagram\nA --> B\n```');

  assert.equal(result.diagnostics[0].code, 'mermaid.unknown_diagram');
  assert.equal(result.diagnostics[0].severity, 'error');
  assert.equal(result.fixes.length, 0);
});

test('analyzeArtifactDocument maps incomplete Mermaid edges to editor line', () => {
  const result = analyzeArtifactDocument('```mermaid\ngraph TD<br> A -->\n```');

  assert.equal(result.diagnostics[0].code, 'mermaid.incomplete_edge');
  assert.equal(result.diagnostics[0].severity, 'error');
  assert.equal(result.diagnostics[0].line, 2);
});

test('analyzeArtifactDocument maps unclosed Mermaid labels to editor line', () => {
  const result = analyzeArtifactDocument('```mermaid\ngraph TD\nA[开始 --> B\n```');

  assert.equal(result.diagnostics[0].code, 'mermaid.unclosed_node_label');
  assert.equal(result.diagnostics[0].severity, 'error');
  assert.equal(result.diagnostics[0].line, 3);
});

test('analyzeArtifactDocument fixes unknown DocumentSpec layouts conservatively', () => {
  const source = '```swiss\n{ pages: [{ layout: "not-real-layout", slots: { title: "Broken" } }] }\n```';
  const result = analyzeArtifactDocument(source);

  assert.equal(result.diagnostics[0].code, 'document_spec.unknown_layout');
  assert.equal(result.diagnostics[0].messageZh.includes('未知的 DocumentSpec 布局'), true);
  assert.equal(result.fixes.length, 1);
  assert.match(applyArtifactFix(source, result.fixes[0]), /layout: "cover"/);
});

test('analyzeArtifactDocument treats legacy morndraft fences as ordinary code', () => {
  const valid = analyzeArtifactDocument('```morndraft\n{ layout: "flow", variant: "chain", items: [{ label: "Draft" }, { label: "Render" }] }\n```');
  assert.deepEqual(valid.diagnostics, []);
  assert.deepEqual(valid.fixes, []);

  const invalid = analyzeArtifactDocument('```morndraft\n{ layout: "unknown", themeColor: "blue" }\n```');
  assert.deepEqual(invalid.diagnostics, []);
  assert.deepEqual(invalid.fixes, []);

  const missingField = analyzeArtifactDocument('```morndraft\n{ layout: "flow", variant: "chain" }\n```');
  assert.deepEqual(missingField.diagnostics, []);
  assert.deepEqual(missingField.fixes, []);

  const reserved = analyzeArtifactDocument('```morndraft\n{ layout: "flow", variant: "chain", steps: ["Draft"] }\n```');
  assert.deepEqual(reserved.diagnostics, []);
  assert.deepEqual(reserved.fixes, []);
});

test('analyzeArtifactDocument fixes unclosed legacy morndraft fences as generic Markdown code', () => {
  const source = [
    '## Process',
    '',
    '```morndraft',
    '{',
    '  layout: "flow",',
    '  variant: "chain",',
    '  items: [{ label: "识别" }, { label: "分析" }, { label: "匹配" }, { label: "渲染" }]',
    '}',
    '',
    '## Next block',
  ].join('\n');
  const result = analyzeArtifactDocument(source);
  const unclosed = result.diagnostics.find((item) => item.code === 'markdown.unclosed_fence');

  assert.ok(unclosed?.fix);
  assert.equal(unclosed.line, 3);
  assert.match(unclosed.messageZh, /Markdown 代码块缺少结束标记/);

  const fixed = applyArtifactFix(source, unclosed.fix);
  assert.match(fixed, /## Next block\n```\n$/);
  assert.deepEqual(analyzeArtifactDocument(fixed).diagnostics, []);
});

test('recoverMarkdownFencesForPreview leaves legacy morndraft fences unchanged', () => {
  const source = [
    '## Broken MornDraft',
    '',
    '```morndraft',
    '{',
    '  "layout": "flow",',
    '  "variant": "chain",',
    '  "items": [',
    '    { "label": "识别" },',
    '    { "label": "分析" },',
    '    { "label": "规划" },',
    '    { "label": "匹配" },',
    '    { "label": "渲染" }',
    '  ]',
    '}',
    '',
    '## After block',
    '这行应该仍然是 Markdown。',
  ].join('\n');

  const recovered = recoverMarkdownFencesForPreview(source);

  assert.equal(recovered.source, source);
  assert.deepEqual(recovered.recoveries, []);
  assert.equal(recovered.lineMap[15], 16);
  assert.equal(recovered.source.split('\n')[15], '## After block');
});

test('applyArtifactFixes applies ranges from the end of the source', () => {
  const source = [
    '```json5',
    '{ok:true,}',
    '```',
    '',
    '```swiss',
    '{ pages: [{ layout: "not-real-layout" }] }',
    '```',
  ].join('\n');
  const result = analyzeArtifactDocument(source);
  const fixed = applyArtifactFixes(source, result.fixes);

  assert.match(fixed, /\{ok:true,\}/);
  assert.match(fixed, /layout: "cover"/);
});

test('deterministic B-case fixes keep remaining diagnostics after sequential applies', () => {
  const source = [
    '# B. Deterministic Fix',
    '',
    '```json5',
    '{ project: "MornDraft", enabled: true, features: ["Markdown", "HTML", "JSON5",], }',
    '```',
    '',
    '```html-preview',
    '<section><h2>MornDraft HTML Fragment</h2></section>',
    '```',
    '',
    '```html',
    '<!doctype html><html><head><title>MornDraft Missing Meta</title></head><body><main>MornDraft</main></body></html>',
    '```',
    '',
    '```md',
    'This fenced Markdown is intentionally unclosed.',
  ].join('\n');
  const applyCode = (input, code) => {
    const result = analyzeArtifactDocument(input);
    const diagnostic = result.diagnostics.find((item) => item.code === code);
    assert.ok(diagnostic?.fix, `expected fix for ${code}`);
    return applyArtifactFix(input, diagnostic.fix);
  };
  const getCodes = (input) => analyzeArtifactDocument(input).diagnostics.map((item) => item.code);

  const afterB2 = applyCode(source, 'html.fragment_wrapped');
  assert.deepEqual(getCodes(afterB2), ['html.head_meta_added', 'markdown.unclosed_fence']);
  const afterB3 = applyCode(afterB2, 'html.head_meta_added');
  assert.deepEqual(getCodes(afterB3), ['markdown.unclosed_fence']);
  const afterB4First = applyCode(source, 'markdown.unclosed_fence');
  assert.deepEqual(getCodes(afterB4First), ['html.fragment_wrapped', 'html.head_meta_added']);
});
