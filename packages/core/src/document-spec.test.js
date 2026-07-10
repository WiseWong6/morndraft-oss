import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createDocumentSpecMarkdownFence,
  listDocumentSpecLayouts,
  renderDocumentSpecToHtml,
  validateDocumentSpec,
} from './document-spec.js';

const baseSpec = {
  version: 'v1',
  target: '3:4',
  theme: {
    scheme: 'K',
    family: 'editorial',
  },
  pages: [
    {
      layout: 'cover',
      slots: {
        eyebrow: 'Agent Authoring',
        title: 'Simple Input',
        subtitle: 'MornDraft renders stable output.',
      },
      items: [],
    },
  ],
};

test('listDocumentSpecLayouts exposes the Swiss catalog layout registry', () => {
  const layoutIds = listDocumentSpecLayouts().map((layout) => layout.id);
  assert.deepEqual(layoutIds, [
    'cover',
    'title-card',
    'before-after',
    'swot',
    'quadrant-axis',
    'impossible-triangle',
    'comparison-table',
    'process',
    'process-loop',
    'journey',
    'gantt',
    'timeline',
    'pyramid',
    'fishbone',
    'iceberg',
    'venn',
    'architecture',
    'arch-platform',
    'arch-platform-complex-v',
    'mind-map',
    'matrix',
    'radar',
    'radar-hex',
    'code-block',
    'vs',
    'stat-card',
    'concentric',
    'list-card',
    'toc-card',
    'form-card',
    'two-col',
    'three-col',
    'split-v',
    'quote',
    'alert-box',
    'terminal-box',
    'iframe-card',
  ]);
});

test('validateDocumentSpec accepts JSON5 input and applies defaults', () => {
  const result = validateDocumentSpec(`{
    pages: [
      { layout: 'process', items: ['Draft', 'Validate', 'Render'] }
    ]
  }`);

  assert.equal(result.ok, true);
  assert.equal(result.spec.version, 'v1');
  assert.equal(result.spec.target, '3:4');
  assert.equal(result.spec.theme.scheme, 'K');
  assert.deepEqual(result.spec.pages[0].items, [
    { label: 'Draft' },
    { label: 'Validate' },
    { label: 'Render' },
  ]);
});

test('validateDocumentSpec rejects unknown layouts', () => {
  const result = validateDocumentSpec({
    pages: [{ layout: 'made-up-layout' }],
  });

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, 'document_spec.unknown_layout');
  assert.equal(result.diagnostics[0].path, '$.pages[0].layout');
});

test('validateDocumentSpec rejects invalid slots and items shapes', () => {
  const result = validateDocumentSpec({
    pages: [
      {
        layout: 'cover',
        slots: 'not-a-map',
        items: { label: 'Lost' },
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.deepEqual(
    result.diagnostics.map((diagnostic) => diagnostic.code),
    ['document_spec.invalid_slots', 'document_spec.invalid_items'],
  );
});

test('renderDocumentSpecToHtml outputs self-contained HTML', () => {
  const result = renderDocumentSpecToHtml(baseSpec);

  assert.equal(result.ok, true);
  assert.match(result.html, /^<!doctype html>/);
  assert.match(result.html, /data-version="v1"/);
  assert.match(result.html, /Simple Input/);
  assert.match(result.html, /morndraft-docspec-layout-cover/);
});

test('createDocumentSpecMarkdownFence normalizes spec as a swiss code block', () => {
  const result = createDocumentSpecMarkdownFence(baseSpec);

  assert.equal(result.ok, true);
  assert.match(result.markdown, /^```swiss/);
  assert.match(result.markdown, /"layout": "cover"/);
});
