import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = (fileName: string) => readFile(new URL(fileName, import.meta.url), 'utf8');

test('public format toolbar exposes the complete local formatting surface', async () => {
  const source = await readSource('./PublicFormatToolbar.tsx');
  for (const blockFormat of [
    'paragraph', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'quote', 'bulletList', 'numberList',
  ]) {
    assert.match(source, new RegExp(`['"]${blockFormat}['"]`, 'u'));
  }
  for (const inlineFormat of ['bold', 'italic', 'underline', 'highlight']) {
    assert.match(source, new RegExp(`['"]${inlineFormat}['"]`, 'u'));
  }
  for (const size of ['12px', '14px', '15px', '16px', '18px', '20px', '24px']) {
    assert.match(source, new RegExp(size, 'u'));
  }
  for (const spacing of ['1.35', '1.5', '2', '0.02em', '0.05em', '0.08em']) {
    assert.match(source, new RegExp(spacing.replace('.', '\\.'), 'u'));
  }
  assert.match(source, /FONT_FAMILIES/u);
  assert.match(source, /COLORS/u);
  assert.match(source, /disabled=\{!canFormat\}/u);
  assert.equal((source.match(/<option value="">\{labels\.default\}<\/option>/gu) ?? []).length, 5);
  assert.match(source, /if \(value !== '__choose__'\) onCommand\(\{ kind: 'block'/u);
});

test('Final applies formatting only through the public core and records its origin', async () => {
  const source = await readSource('./PublicFinalPreview.tsx');
  const editableSource = await readSource('./PublicEditableMarkdown.tsx');
  assert.match(source, /getPublicFormatSelectionAvailability\(source, selection\)/u);
  assert.match(source, /applyPublicFormatCommand\(source, selection, command\)/u);
  assert.match(source, /onSourceChange\(result\.source, \{ origin: 'format' \}\)/u);
  assert.match(
    editableSource,
    /onSelectionChange\(resolved \? \{[\s\S]*?formatContext: \{[\s\S]*?visibleEnd: visibleStart \+ visibleSelection\.length/u,
  );
});

test('image paste stays available in Source but Final limits it to Markdown', async () => {
  const finalSource = await readSource('./PublicFinalPreview.tsx');
  const sourceEditor = await readSource('./PublicSourceEditor.tsx');
  assert.match(sourceEditor, /allowImagePaste = true/u);
  assert.match(sourceEditor, /if \(!allowImagePaste\) return;/u);
  assert.match(sourceEditor, /selectionEpochRef\.current !== requestSelectionEpoch/u);
  assert.match(finalSource, /!request\.isSelectionCurrent\(\)/u);
  assert.match(finalSource, /allowImagePaste=\{false\}/u);
  assert.match(finalSource, /onImagePaste=\{onImagePaste\}/u);
});
