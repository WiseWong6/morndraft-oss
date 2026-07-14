import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

import {
  createMornDraftHtmlMarkdownFence,
  createMornDraftHtmlSource,
  parseMornDraftHtmlSourceStructure,
  patchMornDraftHtmlSourceStyleVariables,
  readMornDraftHtmlSourceStructureMetadata,
  updateMornDraftHtmlSourceComponent,
} from './morndraft-html-source.js';

const readStructureMetadata = (html) => {
  const match = html.match(/<!-- morndraft:structure ([\s\S]*?) -->/);
  assert.ok(match, 'structure metadata comment should exist');
  return JSON.parse(match[1]);
};

test('createMornDraftHtmlSource renders flat components into fenced HTML Source', () => {
  const result = createMornDraftHtmlSource({
    layout: 'flow',
    variant: 'chain',
    items: [
      { label: 'Draft' },
      { label: 'Validate' },
      { label: 'Render' },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.fencedLanguage, 'html');
  assert.match(result.html, /^<!doctype html>\n<!-- morndraft:structure /i);
  assert.match(result.markdown, /^```html\n<!doctype html>/i);
  assert.match(result.html, /data-morndraft-source="morndraft-flat"/);
  assert.match(result.html, /data-morndraft-layout="flow"/);
  assert.match(result.html, /data-morndraft-variant="chain"/);
  assert.match(result.html, /data-morndraft-source-style/);
  assert.match(result.html, /--morndraft-accent:/);
  assert.doesNotMatch(result.html, /data-morndraft-inline-swiss-catalog/);
  assert.doesNotMatch(result.html, /Swiss Card 样式/);
  assert.doesNotMatch(result.html, /data-morndraft-edit-path/);

  const metadata = readStructureMetadata(result.html);
  assert.equal(metadata.source, 'morndraft-flat');
  assert.equal(metadata.renderer, 'swiss-catalog');
  assert.equal(metadata.layout, 'flow');
  assert.equal(metadata.variant, 'chain');
  assert.equal(metadata.pair, 'flow/chain');
  assert.equal(metadata.itemCount, 3);
  assert.deepEqual(metadata.items.map((item) => item.label), ['Draft', 'Validate', 'Render']);
  assert.deepEqual(metadata.component, {
    layout: 'flow',
    variant: 'chain',
    items: [
      { label: 'Draft' },
      { label: 'Validate' },
      { label: 'Render' },
    ],
  });
});

test('createMornDraftHtmlSource keeps inline CSS mode available for previews', () => {
  const result = createMornDraftHtmlSource({
    layout: 'flow',
    variant: 'chain',
    items: [
      { label: 'Draft' },
      { label: 'Validate' },
    ],
  }, { cssMode: 'inline' });

  assert.equal(result.ok, true);
  assert.match(result.html, /data-morndraft-inline-swiss-catalog/);
  assert.match(result.html, /Swiss Card 样式/);
  assert.match(result.html, /data-morndraft-source="morndraft-flat"/);
});

test('createMornDraftHtmlSource accepts JSON5 component source without leaking edit paths', () => {
  const result = createMornDraftHtmlSource(`{
    layout: 'compare',
    variant: 'vs',
    items: [
      { label: 'Before', value: 'JSON Source' },
      { label: 'After', value: 'HTML Source' },
    ],
  }`);

  assert.equal(result.ok, true);
  assert.equal(result.metadata.pair, 'compare/vs');
  assert.match(result.html, /data-morndraft-layout="compare"/);
  assert.match(result.html, /data-morndraft-variant="vs"/);
  assert.doesNotMatch(result.html, /__morndraftEditPaths|data-morndraft-edit-path/);
});

test('parseMornDraftHtmlSourceStructure reads full component metadata', () => {
  const result = createMornDraftHtmlSource({
    layout: 'cards',
    variant: 'two-column',
    items: [
      { label: 'Problem', value: 'Unclear source' },
      { label: 'Fix', value: 'HTML Source' },
    ],
  });

  assert.equal(result.ok, true);
  const parsed = parseMornDraftHtmlSourceStructure(result.html);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.metadata.layout, 'cards');
  assert.equal(parsed.component.layout, 'cards');
  assert.equal(parsed.component.variant, 'two-column');
  assert.deepEqual(parsed.component.items.map((item) => item.label), ['Problem', 'Fix']);
});

test('parseMornDraftHtmlSourceStructure safely handles legacy minimal metadata', () => {
  const legacyHtml = '<!doctype html>\n<!-- morndraft:structure {"schema":"morndraft-html-structure.v1","source":"morndraft-flat","renderer":"swiss-catalog","layout":"flow","variant":"chain","itemCount":2,"items":[{"index":0},{"index":1}]} -->\n<html><body><div class="component-shell" data-morndraft-source="morndraft-flat" data-morndraft-layout="flow" data-morndraft-variant="chain"></div></body></html>';
  const parsed = parseMornDraftHtmlSourceStructure(legacyHtml);

  assert.equal(parsed.ok, false);
  assert.equal(parsed.reason, 'missing-component-metadata');
  assert.equal(parsed.metadata.layout, 'flow');
  assert.equal(parsed.component, null);
});

test('readMornDraftHtmlSourceStructureMetadata scans flexible comments without regex backtracking', () => {
  const html = [
    '<!-- not-the-structure-comment -->',
    '<!-- MORNDRAFT:STRUCTURE\u3000 {"schema":"morndraft-html-structure.v1","component":{"layout":"flow"}} \u2028-->',
  ].join('\n');
  const result = readMornDraftHtmlSourceStructureMetadata(html);

  assert.equal(result.ok, true);
  assert.equal(result.metadata.schema, 'morndraft-html-structure.v1');
  assert.equal(result.metadata.component.layout, 'flow');
});

test('readMornDraftHtmlSourceStructureMetadata rejects a 2 MiB unterminated comment in linear time', () => {
  const html = `<!-- morndraft:structure ${' '.repeat(2 * 1024 * 1024)}`;
  const startedAt = performance.now();
  const result = readMornDraftHtmlSourceStructureMetadata(html);
  const elapsedMs = performance.now() - startedAt;

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing-structure-metadata');
  assert.ok(elapsedMs < 1500, `2 MiB structure comment scan took ${elapsedMs.toFixed(1)} ms`);
});

test('updateMornDraftHtmlSourceComponent regenerates compact HTML and preserves source style overrides', () => {
  const result = createMornDraftHtmlSource({
    layout: 'metrics',
    variant: 'radar-hex',
    items: [
      { label: 'A', value: '40%' },
      { label: 'B', value: '60%' },
      { label: 'C', value: '80%' },
    ],
  });

  assert.equal(result.ok, true);
  const customized = result.html.replace(
    '--morndraft-accent: #d95e00;',
    '--morndraft-accent: #0057ff;',
  );
  const patch = updateMornDraftHtmlSourceComponent(customized, (component) => {
    component.items.push({ label: 'D', value: '55%' });
  });

  assert.equal(patch.ok, true);
  assert.equal(patch.changed, true);
  assert.match(patch.html, /data-morndraft-variant="radar-hex"/);
  assert.match(patch.html, /--morndraft-accent: #0057ff;/);
  assert.doesNotMatch(patch.html, /data-morndraft-inline-swiss-catalog|Swiss Card 样式/);
  assert.doesNotMatch(patch.html, /data-morndraft-edit-path/);
  const metadata = readStructureMetadata(patch.html);
  assert.equal(metadata.component.variant, 'radar-hex');
  assert.equal(metadata.component.items.length, 4);
});

test('patchMornDraftHtmlSourceStyleVariables only patches the source style tag', () => {
  const result = createMornDraftHtmlSource({
    layout: 'flow',
    variant: 'timeline',
    items: [{ label: 'A' }, { label: 'B' }],
  });

  assert.equal(result.ok, true);
  const patch = patchMornDraftHtmlSourceStyleVariables(result.html, {
    '--morndraft-accent': '#0057ff',
    '--morndraft-card-shadow': '0 12px 32px rgba(0,0,0,.16)',
  });

  assert.equal(patch.ok, true);
  assert.match(patch.html, /--morndraft-accent: #0057ff;/);
  assert.match(patch.html, /--morndraft-card-shadow: 0 12px 32px rgba\(0,0,0,.16\);/);
  assert.match(patch.html, /<!-- morndraft:structure /);
  assert.doesNotMatch(patch.html, /data-morndraft-edit-path/);
});

test('createMornDraftHtmlSource returns diagnostics for invalid structures', () => {
  const result = createMornDraftHtmlSource({
    layout: 'flow',
    variant: 'chain',
  });

  assert.equal(result.ok, false);
  assert.equal(result.html, null);
  assert.equal(result.markdown, null);
  assert.equal(result.fencedLanguage, 'html');
  assert.equal(result.diagnostics[0].code, 'morndraft_flat.field_required');
});

test('createMornDraftHtmlMarkdownFence wraps HTML Source', () => {
  assert.equal(
    createMornDraftHtmlMarkdownFence('<!doctype html>\n<html></html>\n'),
    '```html\n<!doctype html>\n<html></html>\n```',
  );
  assert.equal(
    createMornDraftHtmlMarkdownFence('<!doctype html>\n<html></html>'),
    '```html\n<!doctype html>\n<html></html>\n```',
  );
});
