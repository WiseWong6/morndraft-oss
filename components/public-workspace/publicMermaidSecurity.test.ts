import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPublicMermaidSandboxDocument,
  extractPublicMermaidSandboxSvg,
  getPublicMermaidConfig,
  PUBLIC_MERMAID_MAX_SVG_LENGTH,
  sanitizePublicMermaidSvg,
} from './publicMermaidSecurity';
import {
  assertPublicMermaidSourceBudget,
  createLatestOnlyPublicMermaidRenderer,
  PUBLIC_MERMAID_MAX_SOURCE_LENGTH,
} from './publicMermaidQueue';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test('Mermaid output is sanitized and wrapped in a scriptless sandbox document', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path id="safe" d="M0 0L10 10"/></svg>';
  assert.equal(sanitizePublicMermaidSvg(svg), svg);
  const document = createPublicMermaidSandboxDocument(svg, 'dark');
  assert.match(document, /default-src 'none'/u);
  assert.match(document, /img-src data: blob:/u);
  assert.match(document, /color-scheme:dark/u);
  assert.doesNotMatch(document, /<script/u);
  assert.doesNotMatch(document, /allow-same-origin/u);
  assert.throws(() => sanitizePublicMermaidSvg('<svg><script>alert(1)</script></svg>'), /forbidden script/u);
  assert.throws(() => sanitizePublicMermaidSvg('<svg onload="alert(1)"></svg>'), /forbidden onload/u);
  assert.equal(extractPublicMermaidSandboxSvg(svg), svg);
  assert.equal(getPublicMermaidConfig('light').securityLevel, 'strict');
});

test('Mermaid source and SVG budgets fail closed', () => {
  assert.doesNotThrow(() => assertPublicMermaidSourceBudget('x'.repeat(PUBLIC_MERMAID_MAX_SOURCE_LENGTH)));
  assert.throws(() => assertPublicMermaidSourceBudget('x'.repeat(PUBLIC_MERMAID_MAX_SOURCE_LENGTH + 1)), /50000/u);
  assert.throws(() => sanitizePublicMermaidSvg(`<svg>${'x'.repeat(PUBLIC_MERMAID_MAX_SVG_LENGTH)}</svg>`), /render budget/u);
});

test('Mermaid render queue publishes only the latest scheduled result', async () => {
  const started: number[] = [];
  const completed: number[] = [];
  const renderer = createLatestOnlyPublicMermaidRenderer({
    debounceMs: 5,
    render: async (input: number) => { started.push(input); return input; },
    onResult: (result) => completed.push(result),
    onError: (error) => { throw error; },
  });
  for (let value = 0; value < 12; value += 1) renderer.schedule(value);
  await wait(30);
  renderer.dispose();
  assert.deepEqual(started, [11]);
  assert.deepEqual(completed, [11]);
});
