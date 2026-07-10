import test from 'node:test';
import assert from 'node:assert/strict';

import { ARTIFACT_MAP_NAVIGATION_FIXTURE } from '../fixtures/artifact-map-navigation-fixture.js';
import { buildArtifactMap, findArtifactMapEntryForLine } from './artifact-map.js';
import { parsePreviewMarkdownDocument } from './markdown-lexical-edit.js';

test('buildArtifactMap extracts headings, fenced artifacts, and images', () => {
  const entries = buildArtifactMap(`# Plan

Intro

\`\`\`mermaid
graph TD
A --> B
\`\`\`

## Data

\`\`\`json
{ "ok": true }
\`\`\`

![Chart](https://example.com/chart.png)
`);

  assert.deepEqual(
    entries.map(({ kind, line, level, title }) => ({ kind, line, level, title })),
    [
      { kind: 'heading', line: 1, level: 1, title: 'Plan' },
      { kind: 'mermaid', line: 5, level: 2, title: 'Mermaid' },
      { kind: 'heading', line: 10, level: 2, title: 'Data' },
      { kind: 'json', line: 12, level: 3, title: 'JSON' },
      { kind: 'image', line: 16, level: 3, title: 'Chart' },
    ],
  );
  assert.equal(entries[0].id, 'artifact-1-1-heading-plan');
});

test('buildArtifactMap ignores headings inside fenced code and normalizes language aliases', () => {
  const entries = buildArtifactMap(`\`\`\`MARKDOWN
# nested
\`\`\`

\`\`\`Html-Iframe
https://example.com
\`\`\`

\`\`\`JSON5
{ok:true}
\`\`\`

\`\`\`swiss
{"version":"v1","pages":[{"layout":"cover"}]}
\`\`\`

\`\`\`morndraft
{"layout":"flow","variant":"chain","items":[{"label":"Draft"},{"label":"Render"}]}
\`\`\`

\`\`\`morndraft-component
{"type":"comparison"}
\`\`\`
`);

  assert.deepEqual(
    entries.map(({ kind, line, title }) => ({ kind, line, title })),
    [
      { kind: 'markdown', line: 1, title: 'Markdown' },
      { kind: 'code', line: 5, title: 'html-iframe code' },
      { kind: 'json', line: 9, title: 'JSON' },
      { kind: 'documentSpec', line: 13, title: 'DocumentSpec' },
      { kind: 'code', line: 17, title: 'morndraft code' },
      { kind: 'code', line: 21, title: 'morndraft-component code' },
    ],
  );
});

test('buildArtifactMap nests fenced artifacts under the nearest Markdown heading level', () => {
  const entries = buildArtifactMap(`\`\`\`txt
top
\`\`\`

# One

\`\`\`json
{"a":1}
\`\`\`

## Two

\`\`\`mermaid
graph TD
A --> B
\`\`\`

### Three

\`\`\`ts
const x = 1;
\`\`\`

## Reset

\`\`\`html-preview
<section></section>
\`\`\`

![Reset image](https://example.com/reset.png)
`.trimEnd());

  assert.deepEqual(
    entries.map(({ kind, title, level, parentId }) => ({ kind, title, level, parentId })),
    [
      { kind: 'code', title: 'txt code', level: 1, parentId: undefined },
      { kind: 'heading', title: 'One', level: 1, parentId: undefined },
      { kind: 'json', title: 'JSON', level: 2, parentId: entries[1].id },
      { kind: 'heading', title: 'Two', level: 2, parentId: entries[1].id },
      { kind: 'mermaid', title: 'Mermaid', level: 3, parentId: entries[3].id },
      { kind: 'heading', title: 'Three', level: 3, parentId: entries[3].id },
      { kind: 'code', title: 'typescript code', level: 4, parentId: entries[5].id },
      { kind: 'heading', title: 'Reset', level: 2, parentId: entries[1].id },
      { kind: 'html', title: 'HTML', level: 3, parentId: entries[7].id },
      { kind: 'image', title: 'Reset image', level: 3, parentId: entries[7].id },
    ],
  );
});

test('buildArtifactMap nests images under the nearest Markdown heading level', () => {
  const entries = buildArtifactMap(`![Top image](https://example.com/top.png)

# One

![H1 image](https://example.com/h1.png)

## Two

![H2 image](https://example.com/h2.png)

### Three

![H3 image](https://example.com/h3.png)

## Reset

![Reset image](https://example.com/reset.png)
`.trimEnd());

  assert.deepEqual(
    entries.map(({ kind, title, level, parentId }) => ({ kind, title, level, parentId })),
    [
      { kind: 'image', title: 'Top image', level: 1, parentId: undefined },
      { kind: 'heading', title: 'One', level: 1, parentId: undefined },
      { kind: 'image', title: 'H1 image', level: 2, parentId: entries[1].id },
      { kind: 'heading', title: 'Two', level: 2, parentId: entries[1].id },
      { kind: 'image', title: 'H2 image', level: 3, parentId: entries[3].id },
      { kind: 'heading', title: 'Three', level: 3, parentId: entries[3].id },
      { kind: 'image', title: 'H3 image', level: 4, parentId: entries[5].id },
      { kind: 'heading', title: 'Reset', level: 2, parentId: entries[1].id },
      { kind: 'image', title: 'Reset image', level: 3, parentId: entries[7].id },
    ],
  );
});

test('buildArtifactMap annotates heading sections for nested collapse', () => {
  const entries = buildArtifactMap(`# Root

## Section

Intro

\`\`\`json
{"ok":true}
\`\`\`

### Detail

Text

## Next
`.trimEnd());

  assert.deepEqual(
    entries.map(({ title, line, parentId, sectionEndLine, hasChildren }) => ({
      title,
      line,
      parentId,
      sectionEndLine,
      hasChildren,
    })),
    [
      { title: 'Root', line: 1, parentId: undefined, sectionEndLine: 15, hasChildren: true },
      { title: 'Section', line: 3, parentId: entries[0].id, sectionEndLine: 14, hasChildren: true },
      { title: 'JSON', line: 7, parentId: entries[1].id, sectionEndLine: 10, hasChildren: false },
      { title: 'Detail', line: 11, parentId: entries[1].id, sectionEndLine: 14, hasChildren: false },
      { title: 'Next', line: 15, parentId: entries[0].id, sectionEndLine: 15, hasChildren: false },
    ],
  );
});

test('buildArtifactMap annotates dense same-level headings without changing hierarchy semantics', () => {
  const source = Array.from({ length: 2000 }, (_, index) => `# Heading ${index + 1}`).join('\n');
  const entries = buildArtifactMap(source);

  assert.equal(entries.length, 2000);
  assert.deepEqual(
    entries.slice(0, 3).map(({ title, line, level, parentId, sectionEndLine, hasChildren }) => ({
      title,
      line,
      level,
      parentId,
      sectionEndLine,
      hasChildren,
    })),
    [
      { title: 'Heading 1', line: 1, level: 1, parentId: undefined, sectionEndLine: 1, hasChildren: false },
      { title: 'Heading 2', line: 2, level: 1, parentId: undefined, sectionEndLine: 2, hasChildren: false },
      { title: 'Heading 3', line: 3, level: 1, parentId: undefined, sectionEndLine: 3, hasChildren: false },
    ],
  );
  assert.deepEqual(
    entries.slice(-2).map(({ title, line, level, parentId, sectionEndLine, hasChildren }) => ({
      title,
      line,
      level,
      parentId,
      sectionEndLine,
      hasChildren,
    })),
    [
      { title: 'Heading 1999', line: 1999, level: 1, parentId: undefined, sectionEndLine: 1999, hasChildren: false },
      { title: 'Heading 2000', line: 2000, level: 1, parentId: undefined, sectionEndLine: 2000, hasChildren: false },
    ],
  );
});

test('buildArtifactMap returns a single standalone entry for unfenced source', () => {
  assert.deepEqual(
    buildArtifactMap('{ "ok": true }').map(({ kind, line, title }) => ({ kind, line, title })),
    [{ kind: 'json', line: 1, title: 'JSON' }],
  );

  assert.deepEqual(
    buildArtifactMap('graph TD\nA --> B').map(({ kind, line, title }) => ({ kind, line, title })),
    [{ kind: 'mermaid', line: 1, title: 'Mermaid' }],
  );
});

test('findArtifactMapEntryForLine returns the nearest preceding artifact entry', () => {
  const entries = buildArtifactMap(`# Plan

Intro

\`\`\`mermaid
graph TD
A --> B
\`\`\`

## Data

\`\`\`json
{ "ok": true }
\`\`\`
`);

  assert.equal(findArtifactMapEntryForLine(entries, 1)?.title, 'Plan');
  assert.equal(findArtifactMapEntryForLine(entries, 6)?.title, 'Mermaid');
  assert.equal(findArtifactMapEntryForLine(entries, 11)?.title, 'Data');
  assert.equal(findArtifactMapEntryForLine(entries, 13)?.title, 'JSON');
  assert.equal(findArtifactMapEntryForLine(entries, 0), null);
});

test('artifact map navigation fixture aligns map entries with editable document targets', () => {
  const entries = buildArtifactMap(ARTIFACT_MAP_NAVIGATION_FIXTURE);
  const parsed = parsePreviewMarkdownDocument(ARTIFACT_MAP_NAVIGATION_FIXTURE);
  assert.equal(parsed.ok, true);

  const targetRanges = parsed.blocks.flatMap((block) => {
    if (block.type === 'markdown-island') {
      return block.blocks
        .map((child) => child.sourceRange)
        .filter(Boolean);
    }
    return block.sourceRange ? [block.sourceRange] : [];
  });

  assert.equal(entries.length, 15);
  assert.deepEqual(
    entries.map(({ kind, line, title }) => ({ kind, line, title })),
    [
      { kind: 'heading', line: 1, title: 'Trace 过程日志标准化方案' },
      { kind: 'heading', line: 3, title: '更新记录' },
      { kind: 'heading', line: 10, title: '需求背景' },
      { kind: 'heading', line: 15, title: '需求范围' },
      { kind: 'heading', line: 17, title: '整体设计方案' },
      { kind: 'heading', line: 23, title: '逻辑描述' },
      { kind: 'json', line: 25, title: 'JSON' },
      { kind: 'heading', line: 55, title: '需求详情' },
      { kind: 'heading', line: 57, title: '模块 1：标准化事件类型定义' },
      { kind: 'heading', line: 59, title: '前置条件' },
      { kind: 'heading', line: 64, title: '重复标题' },
      { kind: 'heading', line: 68, title: '重复标题' },
      { kind: 'heading', line: 72, title: '模块 2：Infra 自动采集能力需求' },
      { kind: 'code', line: 74, title: 'code code' },
      { kind: 'heading', line: 81, title: '验收标准' },
    ],
  );
  assert.deepEqual(
    entries.filter((entry) => !targetRanges.some((range) => (
      entry.line >= range.startLine &&
      entry.line <= range.endLine
    ))),
    [],
  );
});
