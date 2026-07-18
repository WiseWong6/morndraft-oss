import test from 'node:test';
import assert from 'node:assert/strict';
import { extractStandaloneHtmlPreviewFence } from '@morndraft/core';

import {
  preserveHtmlFenceDocumentOuterWhitespace,
  resolveHtmlFenceOuterWhitespaceSource,
  resolvePreviewEditingResetSource,
  resolvePreviewEditingSourceChannels,
  serializePreviewEditingSourcePatch,
  wrapStandaloneHtmlDocumentForEditing,
} from './standaloneHtmlFenceEditing';

test('standalone HTML fence keeps the exact editable source while rendering only inner HTML', () => {
  const code = [
    '',
    '~~~html-preview',
    '<!doctype html>',
    '<html><body><button>Ready</button></body></html>',
    '~~~~',
    '',
  ].join('\n');

  assert.deepEqual(resolvePreviewEditingSourceChannels({ code, latestSource: code }), {
    editableSource: code,
    latestEditableSource: code,
    renderSource: '<!doctype html>\n<html><body><button>Ready</button></body></html>',
    sourceKind: 'standalone-html-fence',
  });
  const channels = resolvePreviewEditingSourceChannels({ code, latestSource: code });
  assert.equal(resolvePreviewEditingResetSource(channels, channels.renderSource), code);
});

test('standalone raw HTML uses a synthetic editable fence without changing its render source', () => {
  const code = '\n<!doctype html>\n<html><body><button>Ready</button></body></html>\n';
  const editableSource = wrapStandaloneHtmlDocumentForEditing(code);
  const channels = resolvePreviewEditingSourceChannels({ code, latestSource: code });

  assert.deepEqual(channels, {
    editableSource,
    latestEditableSource: editableSource,
    renderSource: code,
    sourceKind: 'standalone-html-document',
  });
  assert.equal(resolvePreviewEditingResetSource(channels, code), editableSource);
  assert.equal(serializePreviewEditingSourcePatch({
    nextSource: editableSource,
    originalSource: code,
    sourceKind: channels.sourceKind,
  }), code);
});

test('standalone raw HTML unwraps an atomic edit but preserves a Markdown tail', () => {
  const code = '<!doctype html>\n<html><body>Ready</body></html>';
  const editableSource = wrapStandaloneHtmlDocumentForEditing(code);
  const editedFence = editableSource.replace('Ready', 'Updated');

  assert.equal(serializePreviewEditingSourcePatch({
    nextSource: editedFence,
    originalSource: code,
    sourceKind: 'standalone-html-document',
  }), '<!doctype html>\n<html><body>Updated</body></html>');
  assert.equal(serializePreviewEditingSourcePatch({
    nextSource: `${editedFence}\n\nBelow`,
    originalSource: code,
    sourceKind: 'standalone-html-document',
  }), `${editedFence}\n\nBelow`);
  assert.equal(serializePreviewEditingSourcePatch({
    nextSource: '',
    originalSource: code,
    sourceKind: 'standalone-html-document',
  }), '');
});

test('standalone raw HTML synthetic fence is longer than fence-like HTML content', () => {
  const code = '<!doctype html>\n<html><body>\n~~~\n~~~~~\n</body></html>';
  const editableSource = wrapStandaloneHtmlDocumentForEditing(code);
  const standaloneFence = extractStandaloneHtmlPreviewFence(editableSource);

  assert.match(editableSource, /^~~~~~~html-preview\n/);
  assert.equal(standaloneFence?.html, code);
});

test('standalone HTML fence document keeps outer whitespace when text is inserted below', () => {
  const fence = '~~~html\n<!doctype html>\n<html><body>Ready</body></html>\n~~~~';
  const currentSource = `\n\n${fence}\n \n`;
  const nextSource = `${fence}\n\nBelow`;
  assert.equal(
    preserveHtmlFenceDocumentOuterWhitespace(currentSource, nextSource),
    `\n\n${fence}\n\nBelow\n \n`,
  );
  assert.equal(preserveHtmlFenceDocumentOuterWhitespace(currentSource, ''), '');
});

test('standalone HTML fence keeps outer whitespace across delete, undo, and redo source states', () => {
  const fence = '```html-preview\n<!doctype html>\n<html><body>Ready</body></html>\n```';
  const original = `\n\n${fence}\n \n`;
  const whitespaceSource = resolveHtmlFenceOuterWhitespaceSource(original);
  assert.equal(whitespaceSource, original);

  const deleted = preserveHtmlFenceDocumentOuterWhitespace(original, '', whitespaceSource);
  assert.equal(deleted, '');
  const restored = preserveHtmlFenceDocumentOuterWhitespace(deleted, fence, whitespaceSource);
  assert.equal(restored, original);
  assert.equal(
    preserveHtmlFenceDocumentOuterWhitespace(restored, 'Paragraph after redo', whitespaceSource),
    '\n\nParagraph after redo\n \n',
  );
});

test('mixed HTML fence documents never opt into standalone outer whitespace preservation', () => {
  const mixed = '\n~~~html\n<!doctype html>\n<html><body>Ready</body></html>\n~~~\n\nOutside Markdown\n';
  assert.equal(resolveHtmlFenceOuterWhitespaceSource(mixed), null);
});

test('only a complete full HTML document or single html/html-preview fence enters standalone HTML editing', () => {
  const cases = [
    ['bare document', '<!doctype html>\n<html></html>', 'standalone-html-document'],
    ['fragment fence', '```html\n<div>fragment</div>\n```', 'document'],
    ['unfinished fence', '```html\n<!doctype html>\n<html></html>', 'document'],
    ['mixed document', '# Before\n\n```html\n<!doctype html>\n<html></html>\n```', 'document'],
    ['multiple fences', '```html\n<!doctype html>\n<html></html>\n```\n\n```html\n<!doctype html>\n<html></html>\n```', 'document'],
    ['legacy alias', '```html-iframe\n<!doctype html>\n<html></html>\n```', 'document'],
  ] as const;

  for (const [label, code, expectedKind] of cases) {
    assert.equal(
      resolvePreviewEditingSourceChannels({ code, latestSource: code }).sourceKind,
      expectedKind,
      label,
    );
  }
});
