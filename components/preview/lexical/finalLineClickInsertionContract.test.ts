import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const previewDir = resolve(import.meta.dirname, '..');

const readPreviewSource = (fileName: string) =>
  readFileSync(resolve(previewDir, fileName), 'utf8');

test('Final line click insertion is wired to force a full refresh after first input', () => {
  const islandSource = readPreviewSource('MarkdownLexicalIsland.tsx');
  const patchQueueSource = readPreviewSource('useMarkdownLexicalPatchQueue.ts');

  assert.match(islandSource, /const LexicalFinalLineClickPlugin: React\.FC/);
  assert.match(islandSource, /<LexicalFinalLineClickPlugin requestForceDocumentRefresh=\{requestForceDocumentRefresh\} \/>/);
  assert.match(islandSource, /if \(insertFinalLineClickParagraph\(target\)\) requestForceDocumentRefresh\(\);/);
  assert.match(islandSource, /if \(target\.placement === 'before' && \$isPreviewSourceAnchorNode\(adjacentNode\)\)/);
  assert.match(islandSource, /if \(isEmptyPreviewParagraphNode\(adjacentNode\)\) \{[\s\S]*?adjacentNode\.selectStart\(\);[\s\S]*?return false;/);
  assert.match(islandSource, /isInteractiveTarget: isFinalLineClickInteractiveTarget\(event\.target\)/);
  assert.match(islandSource, /PREVIEW_INTERACTIVE_ELEMENT_SELECTOR/);
  assert.match(patchQueueSource, /const forceDocumentRefreshRef = useRef\(false\);/);
  assert.match(patchQueueSource, /forceDocumentRefresh: forceDocumentRefresh \|\| undefined/);
});
