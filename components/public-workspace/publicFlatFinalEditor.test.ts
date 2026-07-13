import test from 'node:test';
import assert from 'node:assert/strict';
import { getPublicMornDraftInsertEntries } from '@morndraft/core/oss-public';
import {
  isPublicMornDraftFlatHtml,
  patchPublicMornDraftFlatHtml,
  updatePublicFlatDraftValue,
} from './PublicFlatFinalEditor';

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

test('ordinary HTML is not misclassified as a flat component', () => {
  assert.equal(isPublicMornDraftFlatHtml('<!doctype html><h1>Plain</h1>'), false);
  assert.equal(patchPublicMornDraftFlatHtml('<h1>Plain</h1>', '$.title', 'Changed'), null);
});
