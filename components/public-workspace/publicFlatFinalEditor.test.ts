import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMornDraftFlatSourceEditMap,
  getPublicMornDraftInsertEntries,
} from '@morndraft/core/oss-public';
import {
  isPublicMornDraftFlatHtml,
  patchPublicMornDraftFlatHtml,
  updatePublicFlatDraftValue,
} from './PublicFlatFinalEditor';
import { parsePublicMornDraftFlatHtml } from './publicMornDraftFlat';

test('flat field changes use a captured value instead of a deferred DOM event', () => {
  const previous = { '$.title': 'Before', '$.items[0].label': 'Keep' };
  const next = updatePublicFlatDraftValue(previous, '$.title', 'After');
  assert.deepEqual(next, { '$.title': 'After', '$.items[0].label': 'Keep' });
  assert.notEqual(next, previous);
});

test('Final structured flat edit writes through the canonical source patch and renderer', () => {
  const source = getPublicMornDraftInsertEntries('showcase')[0].source;
  const html = source.replace(/^```html\n/u, '').replace(/\n```$/u, '');
  assert.equal(isPublicMornDraftFlatHtml(html), true);
  const next = patchPublicMornDraftFlatHtml(html, '$.items[0].label', '验收完成');
  assert.ok(next);
  assert.match(next, /data-morndraft-source="morndraft-flat"/u);
  assert.match(next, /<!-- morndraft:structure /u);
  assert.match(next, />验收完成</u);
  assert.doesNotMatch(next, />识别</u);
});

test('all 30 canonical public flat entries keep structured Final editing', () => {
  const entries = getPublicMornDraftInsertEntries('showcase');
  assert.equal(entries.length, 30);
  for (const entry of entries) {
    const html = entry.source.replace(/^```html\n/u, '').replace(/\n```$/u, '');
    assert.equal(isPublicMornDraftFlatHtml(html), true, entry.id);
    const structure = parsePublicMornDraftFlatHtml(html);
    assert.ok(structure?.component && typeof structure.component === 'object', entry.id);
    const sourceMap = createMornDraftFlatSourceEditMap(
      JSON.stringify(structure.component, null, 2),
    ) as Record<string, { value?: unknown }>;
    const editablePath = Object.entries(sourceMap).find(([path, item]) => (
      typeof item.value === 'string' && path !== '$.layout' && path !== '$.variant'
    ))?.[0];
    assert.ok(editablePath, `${entry.id} has no editable string field`);
    const patched = patchPublicMornDraftFlatHtml(html, editablePath, `edited-${entry.id}`);
    assert.ok(patched, `${entry.id} did not write its field back`);
    assert.match(patched, new RegExp(`edited-${entry.id}`, 'u'), entry.id);
  }
});

test('ordinary HTML is not misclassified as a flat component', () => {
  assert.equal(isPublicMornDraftFlatHtml('<!doctype html><h1>Plain</h1>'), false);
  assert.equal(patchPublicMornDraftFlatHtml('<h1>Plain</h1>', '$.title', 'Changed'), null);
});

test('structured Final rejects noncanonical documents instead of rebuilding away their content', () => {
  const source = getPublicMornDraftInsertEntries('showcase')[0].source;
  const canonicalHtml = source.replace(/^```html\n/u, '').replace(/\n```$/u, '');
  const forgedBodies = [
    '<body><script>const marker = \'data-morndraft-source="morndraft-flat"\';</script><p>Keep script HTML</p></body>',
    '<body><template><div data-morndraft-source="morndraft-flat"></div></template><p>Keep template HTML</p></body>',
    '<body><!-- <div data-morndraft-source="morndraft-flat"></div> --><p>Keep comment HTML</p></body>',
    '<body><div class="component-shell" data-morndraft-source="morndraft-flat" data-morndraft-layout="flow" data-morndraft-variant="chain" data-renderer="swiss-catalog"><p>Keep arbitrary HTML</p></div></body>',
  ];

  for (const body of forgedBodies) {
    const forgedHtml = canonicalHtml.replace(/<body>[\s\S]*?<\/body>/u, body);
    assert.equal(isPublicMornDraftFlatHtml(forgedHtml), false);
    assert.equal(patchPublicMornDraftFlatHtml(forgedHtml, '$.items[0].label', 'Must not replace'), null);
    assert.match(forgedHtml, /Keep (?:script|template|comment|arbitrary) HTML/u);
  }
});

test('canonical source-style overrides remain structured and survive Final edits', () => {
  const source = getPublicMornDraftInsertEntries('showcase')[0].source;
  const html = source
    .replace(/^```html\n/u, '')
    .replace(/\n```$/u, '')
    .replace('--morndraft-accent: #d95e00;', '--morndraft-accent: #0057ff;');
  assert.equal(isPublicMornDraftFlatHtml(html), true);
  const next = patchPublicMornDraftFlatHtml(html, '$.items[0].label', '已安全更新');
  assert.ok(next);
  assert.match(next, /--morndraft-accent: #0057ff;/u);
  assert.match(next, />已安全更新</u);
});
