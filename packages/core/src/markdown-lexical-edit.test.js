import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

import {
  CODE_FENCE_LANGUAGE_KINDS,
  getCodeFenceLanguageKind,
} from './code-fence-language.js';

import {
  parseMarkdownImage,
  parseMarkdownIsland,
  parsePreviewMarkdownDocument,
  parseMarkdownPipeTable,
  parseMarkdownRichInline,
  parseMarkdownRichPipeTable,
  patchMarkdownImage,
  patchMarkdownIslandSource,
  patchMarkdownPipeTable,
  patchMarkdownRichInlineRange,
  serializeMarkdownImage,
  serializeMarkdownIsland,
  serializePreviewMarkdownDocument,
  serializeMarkdownRichInline,
  serializeMarkdownPipeTable,
  splitPreviewMarkdownSegments,
} from './markdown-lexical-edit.js';

test('parseMarkdownPipeTable reads GFM cells and converts br to editable line breaks', () => {
  const source = [
    '# Intro',
    '',
    '| Name | Notes |',
    '| --- | :---: |',
    '| Draft | First<br>Second |',
  ].join('\n');
  const table = parseMarkdownPipeTable(source, {
    startLine: 3,
    startColumn: 1,
    endLine: 5,
    endColumn: 28,
  });

  assert.equal(table.ok, true);
  assert.equal(table.columnCount, 2);
  assert.deepEqual(table.alignments, ['none', 'center']);
  assert.deepEqual(
    table.rows.map((row) => row.cells),
    [
      ['Name', 'Notes'],
      ['Draft', 'First\nSecond'],
    ],
  );
});

test('serializeMarkdownPipeTable writes cell line breaks as br tags', () => {
  const markdown = serializeMarkdownPipeTable({
    alignments: ['none', 'right'],
    columnCount: 2,
    rows: [
      { header: true, cells: ['Name', 'Notes'] },
      { header: false, cells: ['Draft', 'First\nSecond'] },
    ],
  });

  assert.equal(
    markdown,
    ['| Name | Notes |', '| --- | ---: |', '| Draft | First<br>Second |'].join('\n'),
  );
});

test('parse and serialize rich inline Markdown with controlled span styles', () => {
  const source = 'Alpha <strong><span style="color: #294D7A; font-size: 15px; line-height: 1.5; letter-spacing: 0.02em">beta</span></strong> *gamma*';
  const parsed = parseMarkdownRichInline(source);

  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.segments, [
    { italic: false, strong: false, style: {}, text: 'Alpha ' },
    {
      italic: false,
      strong: true,
      style: { color: '#294D7A', fontSize: '15px', letterSpacing: '0.02em', lineHeight: '1.5' },
      text: 'beta',
    },
    { italic: false, strong: false, style: {}, text: ' ' },
    { italic: true, strong: false, style: {}, text: 'gamma' },
  ]);
  assert.equal(
    serializeMarkdownRichInline(parsed.segments),
    'Alpha <strong><span style="color: #294D7A; font-size: 15px; line-height: 1.5; letter-spacing: 0.02em">beta</span></strong> *gamma*',
  );
});

test('parseMarkdownRichInline accepts serialized font family attributes', () => {
  const fontFamily = '"MornDraft Serif SC", "Noto Serif SC", "Source Han Serif SC", "Songti SC", "SimSun", serif';
  const serialized = serializeMarkdownRichInline([
    { italic: false, strong: true, style: { fontFamily }, text: 'Alpha beta' },
  ]);

  assert.equal(
    serialized,
    '<strong><span style="font-family: &quot;MornDraft Serif SC&quot;, &quot;Noto Serif SC&quot;, &quot;Source Han Serif SC&quot;, &quot;Songti SC&quot;, &quot;SimSun&quot;, serif">Alpha beta</span></strong>',
  );

  const parsed = parseMarkdownRichInline(serialized);

  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.segments, [
    { italic: false, strong: true, style: { fontFamily }, text: 'Alpha beta' },
  ]);
});

test('parseMarkdownRichInline downgrades removed legacy font spans to MornDraft sans', () => {
  const legacyFontFamily = [
    `"${['Ali', 'baba Pu', 'HuiTi'].join('')}"`,
    `"${['Ali', 'baba Pu', 'HuiTi 3.0'].join('')}"`,
    'sans-serif',
  ].join(', ');
  const source = `<span style="font-family: ${legacyFontFamily.replace(/"/g, '&quot;')}">Alpha beta</span>`;
  const fontFamily = '"MornDraft Sans SC", "Noto Sans SC", "Source Han Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';
  const parsed = parseMarkdownRichInline(source);

  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.segments, [
    { italic: false, strong: false, style: { fontFamily }, text: 'Alpha beta' },
  ]);
  assert.equal(
    serializeMarkdownRichInline(parsed.segments),
    '<span style="font-family: &quot;MornDraft Sans SC&quot;, &quot;Noto Sans SC&quot;, &quot;Source Han Sans SC&quot;, &quot;PingFang SC&quot;, &quot;Microsoft YaHei&quot;, sans-serif">Alpha beta</span>',
  );
});

test('parsePreviewMarkdownDocument keeps styled table header cells as GFM tables', () => {
  const fontFamily = '"MornDraft Serif SC", "Noto Serif SC", "Source Han Serif SC", "Songti SC", "SimSun", serif';
  const source = [
    'Alpha beta',
    '',
    `| <span style="font-family: &quot;MornDraft Serif SC&quot;, &quot;Noto Serif SC&quot;, &quot;Source Han Serif SC&quot;, &quot;Songti SC&quot;, &quot;SimSun&quot;, serif">A你好啊</span> | B |`,
    '| --- | --- |',
    '| one | two |',
  ].join('\n');
  const parsed = parsePreviewMarkdownDocument(source);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.blocks.length, 1);
  assert.equal(parsed.blocks[0].type, 'markdown-island');
  assert.equal(parsed.blocks[0].blocks[1].type, 'table');
  assert.deepEqual(parsed.blocks[0].blocks[1].rows[0].cells[0], [
    { italic: false, strong: false, style: { fontFamily }, text: 'A你好啊' },
  ]);
  assert.equal(serializePreviewMarkdownDocument(parsed.blocks), source);
});

test('parsePreviewMarkdownDocument locally falls back unsupported HTML and MDX blocks', () => {
  const source = [
    '# Loop',
    '',
    'Intro **bold**',
    '',
    '<h2 id="the-loop-at-a-glance">',
    'The Loop at a Glance',
    '</h2>',
    '',
    '<img src="https://example.com/loop.svg" alt="Loop" />',
    '',
    '<Accordion title="Details">',
    '',
    'Inside text stays editable',
    '',
    '</Accordion>',
    '',
    '- Keep list editable',
    '',
    '```json',
    '{"ok":true}',
    '```',
    '',
    'Tail paragraph',
  ].join('\n');
  const parsed = parsePreviewMarkdownDocument(source);

  assert.equal(parsed.ok, true);
  assert.deepEqual(
    parsed.blocks.map((block) => [
      block.type,
      block.artifactKind ?? block.language ?? '',
      block.sourceFormat ?? '',
      block.sourceRange.startLine,
      block.sourceRange.endLine,
    ]),
    [
      ['markdown-island', '', '', 1, 1],
      ['markdown-island', '', '', 3, 3],
      ['code-block', 'html', 'raw', 5, 7],
      ['code-block', 'html', 'raw', 9, 9],
      ['code-block', 'html', 'raw', 11, 11],
      ['markdown-island', '', '', 13, 13],
      ['code-block', 'html', 'raw', 15, 15],
      ['markdown-island', '', '', 17, 17],
      ['code-block', 'json', '', 19, 21],
      ['markdown-island', '', '', 23, 23],
    ],
  );
  assert.equal(parsed.blocks[2].source, [
    '<h2 id="the-loop-at-a-glance">',
    'The Loop at a Glance',
    '</h2>',
  ].join('\n'));
  assert.equal(parsed.blocks[4].source, '<Accordion title="Details">');
  assert.equal(parsed.blocks[8].source, ['```json', '{"ok":true}', '```'].join('\n'));
  assert.equal(serializePreviewMarkdownDocument(parsed.blocks), source);
});

test('parsePreviewMarkdownDocument normalizes legacy styled table cells without losing GFM table shape', () => {
  const fontFamily = '"MornDraft Serif SC", "Noto Serif SC", "Source Han Serif SC", "Songti SC", "SimSun", serif';
  const legacySource = [
    'Alpha beta',
    '',
    '| <span style="font-family: &quot;Source Han Serif SC&quot;, &quot;Noto Serif SC&quot;, &quot;Songti SC&quot;, serif">A你好啊</span> | B |',
    '| --- | --- |',
    '| one | two |',
  ].join('\n');
  const expectedSource = [
    'Alpha beta',
    '',
    '| <span style="font-family: &quot;MornDraft Serif SC&quot;, &quot;Noto Serif SC&quot;, &quot;Source Han Serif SC&quot;, &quot;Songti SC&quot;, &quot;SimSun&quot;, serif">A你好啊</span> | B |',
    '| --- | --- |',
    '| one | two |',
  ].join('\n');
  const parsed = parsePreviewMarkdownDocument(legacySource);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.blocks[0].blocks[1].type, 'table');
  assert.deepEqual(parsed.blocks[0].blocks[1].rows[0].cells[0], [
    { italic: false, strong: false, style: { fontFamily }, text: 'A你好啊' },
  ]);
  assert.equal(serializePreviewMarkdownDocument(parsed.blocks), expectedSource);
});

test('parse and serialize Lexical-supported rich inline formats', () => {
  const source = 'Alpha <u>under</u> ~~gone~~ `code` <mark>hi</mark> <sub>2</sub> <sup>x</sup>';
  const parsed = parseMarkdownRichInline(source);

  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.segments, [
    { italic: false, strong: false, style: {}, text: 'Alpha ' },
    { italic: false, strong: false, style: {}, text: 'under', underline: true },
    { italic: false, strong: false, style: {}, text: ' ' },
    { italic: false, strong: false, style: {}, text: 'gone', strikethrough: true },
    { italic: false, strong: false, style: {}, text: ' ' },
    { italic: false, strong: false, style: {}, text: 'code', code: true },
    { italic: false, strong: false, style: {}, text: ' ' },
    { italic: false, strong: false, style: {}, text: 'hi', highlight: true },
    { italic: false, strong: false, style: {}, text: ' ' },
    { italic: false, strong: false, style: {}, text: '2', subscript: true },
    { italic: false, strong: false, style: {}, text: ' ' },
    { italic: false, strong: false, style: {}, text: 'x', superscript: true },
  ]);
  assert.equal(serializeMarkdownRichInline(parsed.segments), source);
});

test('parseMarkdownRichInline rejects attributes on format tags', () => {
  assert.deepEqual(
    parseMarkdownRichInline('<u class="unsafe">bad</u>'),
    { ok: false, reason: 'unsupported_inline_html' },
  );
  assert.deepEqual(
    parseMarkdownRichInline('<mark style="background:url(javascript:alert(1))">bad</mark>'),
    { ok: false, reason: 'unsupported_inline_html' },
  );
});

test('parseMarkdownRichInline rejects unsupported inline style properties', () => {
  const parsed = parseMarkdownRichInline('<span style="background: url(javascript:alert(1))">bad</span>');

  assert.deepEqual(parsed, { ok: false, reason: 'unsafe_inline_style' });
  assert.deepEqual(
    parseMarkdownRichInline('<span style="font-weight: 700">bad</span>'),
    { ok: false, reason: 'unsafe_inline_style' },
  );
  assert.deepEqual(
    parseMarkdownRichInline('<span style="font-size: 13px">bad</span>'),
    { ok: false, reason: 'unsafe_inline_style' },
  );
  assert.deepEqual(
    parseMarkdownRichInline('<span style="line-height: 1.6">bad</span>'),
    { ok: false, reason: 'unsafe_inline_style' },
  );
  assert.deepEqual(
    parseMarkdownRichInline('<span style="letter-spacing: -0.02em">bad</span>'),
    { ok: false, reason: 'unsafe_inline_style' },
  );
});

test('patchMarkdownRichInlineRange writes a safe styled span inside the source range', () => {
  const result = patchMarkdownRichInlineRange(
    'Before\nAlpha beta\nAfter',
    { startLine: 2, startColumn: 1, endLine: 2, endColumn: 11 },
    { start: 6, end: 10 },
    { color: '#244e3a', fontSize: '12px' },
  );

  assert.deepEqual(result, {
    ok: true,
    source: 'Before\nAlpha <span style="color: #244E3A; font-size: 12px">beta</span>\nAfter',
  });
});

test('parse and serialize rich Markdown table cells', () => {
  const source = [
    '| Name | Notes |',
    '| --- | --- |',
    '| Draft | <strong><span style="font-size: 18px">Ready</span></strong> and <u>under</u> / ~~gone~~ / `code` |',
  ].join('\n');
  const table = parseMarkdownRichPipeTable(source, {
    startLine: 1,
    startColumn: 1,
    endLine: 3,
    endColumn: source.split('\n')[2].length + 1,
  });

  assert.equal(table.ok, true);
  assert.deepEqual(
    table.rows[1].cells[1],
    [
      { italic: false, strong: true, style: { fontSize: '18px' }, text: 'Ready' },
      { italic: false, strong: false, style: {}, text: ' and ' },
      { italic: false, strong: false, style: {}, text: 'under', underline: true },
      { italic: false, strong: false, style: {}, text: ' / ' },
      { italic: false, strong: false, style: {}, text: 'gone', strikethrough: true },
      { italic: false, strong: false, style: {}, text: ' / ' },
      { italic: false, strong: false, style: {}, text: 'code', code: true },
    ],
  );
  assert.equal(serializeMarkdownPipeTable(table), source);
});

test('patchMarkdownPipeTable only replaces the table source range', () => {
  const source = [
    '# Intro',
    '',
    '| Name | Notes |',
    '| --- | --- |',
    '| Draft | Ready |',
    '',
    'After',
  ].join('\n');
  const result = patchMarkdownPipeTable(
    source,
    {
      startLine: 3,
      startColumn: 1,
      endLine: 5,
      endColumn: 18,
    },
    {
      alignments: ['none', 'none'],
      columnCount: 2,
      rows: [
        { header: true, cells: ['Name', 'Notes'] },
        { header: false, cells: ['Draft', 'Done'] },
        { header: false, cells: ['Next', 'Queued'] },
      ],
    },
  );

  assert.deepEqual(result, {
    ok: true,
    source: [
      '# Intro',
      '',
      '| Name | Notes |',
      '| --- | --- |',
      '| Draft | Done |',
      '| Next | Queued |',
      '',
      'After',
    ].join('\n'),
  });
});

test('parseMarkdownPipeTable rejects non-table ranges', () => {
  const table = parseMarkdownPipeTable('Paragraph only', {
    startLine: 1,
    startColumn: 1,
    endLine: 1,
    endColumn: 15,
  });

  assert.equal(table.ok, false);
});

test('parse and serialize Markdown image metadata', () => {
  const source = '![Chart](https://example.com/chart.png "Quarterly plan")';
  const image = parseMarkdownImage(source, {
    startLine: 1,
    startColumn: 1,
    endLine: 1,
    endColumn: source.length + 1,
  });

  assert.deepEqual(image, {
    ok: true,
    alt: 'Chart',
    range: {
      startLine: 1,
      startColumn: 1,
      endLine: 1,
      endColumn: source.length + 1,
    },
    source,
    title: 'Quarterly plan',
    url: 'https://example.com/chart.png',
  });
  assert.equal(serializeMarkdownImage(image), source);
});

test('Markdown table and image serialization preserves literal escape characters', () => {
  const table = {
    alignments: ['none'],
    columnCount: 1,
    rows: [
      { header: true, cells: ['Path'] },
      { header: false, cells: ['C:\\drafts\\alpha|beta\\'] },
    ],
  };
  const tableSource = serializeMarkdownPipeTable(table);
  const parsedTable = parseMarkdownPipeTable(tableSource, {
    startLine: 1,
    startColumn: 1,
    endLine: 3,
    endColumn: tableSource.split('\n')[2].length + 1,
  });
  assert.equal(parsedTable.ok, true);
  assert.equal(parsedTable.rows[1].cells[0], 'C:\\drafts\\alpha|beta\\');

  const image = {
    alt: 'Chart \\ draft ] result',
    title: 'Quarterly \\ "plan"',
    url: 'https://example.com/chart.png',
  };
  const imageSource = serializeMarkdownImage(image);
  const parsedImage = parseMarkdownImage(imageSource, {
    startLine: 1,
    startColumn: 1,
    endLine: 1,
    endColumn: imageSource.length + 1,
  });
  assert.equal(parsedImage.ok, true);
  assert.equal(parsedImage.alt, image.alt);
  assert.equal(parsedImage.title, image.title);
  assert.equal(serializeMarkdownImage(parsedImage), imageSource);
});

test('Markdown table parsing distinguishes escaped trailing pipes from row frames', () => {
  const source = [
    'Name',
    '---',
    'escaped \\|',
    'framed \\\\|',
  ].join('\n');
  const parsed = parseMarkdownPipeTable(source, {
    startLine: 1,
    startColumn: 1,
    endLine: 4,
    endColumn: source.split('\n')[3].length + 1,
  });

  assert.equal(parsed.ok, true);
  assert.equal(parsed.rows[1].cells[0], 'escaped |');
  assert.equal(parsed.rows[2].cells[0], 'framed \\');

  const framedSource = ['| Name |', '| --- |', '| escaped \\| inside |'].join('\n');
  const framed = parseMarkdownPipeTable(framedSource, {
    startLine: 1,
    startColumn: 1,
    endLine: 3,
    endColumn: framedSource.split('\n')[2].length + 1,
  });
  assert.equal(framed.ok, true);
  assert.equal(framed.rows[1].cells[0], 'escaped | inside');
});

test('Markdown image parsing rejects escaped and unescaped line terminators', () => {
  for (const lineTerminator of ['\n', '\r', '\u2028', '\u2029']) {
    for (const imageSource of [
      `![a${lineTerminator}b](https://example.com/a.png)`,
      `![a\\${lineTerminator}b](https://example.com/a.png)`,
      `![a](https://example.com/a.png${lineTerminator}"title")`,
      `![a](https://example.com/a.png "t${lineTerminator}itle")`,
      `![a](https://example.com/a.png "t\\${lineTerminator}itle")`,
    ]) {
      const sourceLines = imageSource.split(/\r\n|\r|\n/);
      const parsed = parseMarkdownImage(imageSource, {
        startLine: 1,
        startColumn: 1,
        endLine: sourceLines.length,
        endColumn: sourceLines[sourceLines.length - 1].length + 1,
      });
      assert.equal(parsed.ok, false, JSON.stringify(imageSource));
      assert.equal(parsed.reason, 'invalid_image', JSON.stringify(imageSource));
    }
  }
});

test('patchMarkdownImage updates only the image source range', () => {
  const imageLine = '![Old](https://example.com/old.png)';
  const source = `Before\n${imageLine}\nAfter`;
  const result = patchMarkdownImage(
    source,
    {
      startLine: 2,
      startColumn: 1,
      endLine: 2,
      endColumn: imageLine.length + 1,
    },
    {
      alt: 'New',
      title: 'Updated',
      url: 'https://example.com/new.png',
    },
  );

  assert.deepEqual(result, {
    ok: true,
    source: 'Before\n![New](https://example.com/new.png "Updated")\nAfter',
  });
});

test('splitPreviewMarkdownSegments keeps editable islands around readonly artifact blocks', () => {
  const source = [
    'Intro paragraph',
    '',
    '| A | B |',
    '| --- | --- |',
    '| 1 | 2 |',
    '',
    '```mermaid',
    'graph TD; A-->B',
    '```',
    '',
    '```html-preview',
    '<section>Readonly</section>',
    '```',
    '',
    'After paragraph',
  ].join('\n');
  const segments = splitPreviewMarkdownSegments(source);

  assert.deepEqual(
    segments.map((segment) => [segment.kind, segment.artifactKind, segment.sourceRange.startLine]),
    [
      ['markdown-island', '', 1],
      ['readonly-artifact', 'mermaid', 7],
      ['readonly-artifact', 'html-preview', 11],
      ['markdown-island', '', 15],
    ],
  );
  assert.equal(segments[1].source, ['```mermaid', 'graph TD; A-->B', '```'].join('\n'));
  assert.equal(
    segments[2].source,
    ['```html-preview', '<section>Readonly</section>', '```'].join('\n'),
  );
});

test('Markdown block scanners preserve fence, list, and heading marker semantics', () => {
  const fenced = splitPreviewMarkdownSegments([
    '   ~~~~JSON extra metadata',
    '{"ok":true}',
    `   ~~~~~\u00a0`,
  ].join('\n'));

  assert.equal(fenced.length, 1);
  assert.equal(fenced[0].kind, 'editable-code');
  assert.equal(fenced[0].artifactKind, 'json');
  assert.equal(splitPreviewMarkdownSegments('```json\u2028not a fence')[0].kind, 'markdown-island');

  const list = parseMarkdownIsland(`${'1234567890'.repeat(4)}. ordered item`);
  assert.equal(list.ok, true);
  assert.equal(list.blocks[0].type, 'list');
  assert.equal(list.blocks[0].ordered, true);
  assert.equal(list.blocks[0].items[0].segments[0].text, 'ordered item');

  const heading = parseMarkdownIsland('\u00a0###### Heading text ###  ');
  assert.equal(heading.ok, true);
  assert.equal(heading.blocks[0].type, 'heading');
  assert.equal(heading.blocks[0].depth, 6);
  assert.equal(heading.blocks[0].segments[0].text, 'Heading text');

  const tooDeep = parseMarkdownIsland('####### remains a paragraph');
  assert.equal(tooDeep.ok, true);
  assert.equal(tooDeep.blocks[0].type, 'paragraph');

  for (const separator of ['\u2028', '\u2029']) {
    const separatedList = parseMarkdownIsland(`- item${separator}tail`);
    assert.equal(separatedList.ok, true);
    assert.equal(separatedList.blocks[0].type, 'paragraph');

    const separatedHeading = parseMarkdownIsland(`# title${separator}tail`);
    assert.equal(separatedHeading.ok, true);
    assert.equal(separatedHeading.blocks[0].type, 'paragraph');

    const separatedHeadingBoundary = parseMarkdownIsland(`before\n# title${separator}tail`);
    assert.equal(separatedHeadingBoundary.ok, true);
    assert.deepEqual(
      separatedHeadingBoundary.blocks.map((block) => [block.type, block.lines?.length ?? 0]),
      [['paragraph', 1], ['paragraph', 1]],
    );
  }
});

test('Markdown block scanners stay bounded on multi-megabyte adversarial markers', () => {
  const markerSize = 700_000;
  const startedAt = performance.now();

  const fenced = splitPreviewMarkdownSegments(
    `\`\`\`json${' '.repeat(markerSize)}\u2028not a fence`,
  );
  assert.equal(fenced[0].kind, 'markdown-island');

  const list = parseMarkdownIsland(`${'1'.repeat(markerSize)}x`);
  assert.equal(list.ok, true);
  assert.equal(list.blocks[0].type, 'paragraph');

  const heading = parseMarkdownIsland(`# item ${'#'.repeat(markerSize)}        `);
  assert.equal(heading.ok, true);
  assert.equal(heading.blocks[0].segments[0].text, 'item');

  assert.ok(
    performance.now() - startedAt < 1_500,
    'More than 2 MiB of adversarial Markdown markers should be scanned within 1.5 seconds',
  );
});

test('Markdown island paragraph scanning stays linear across many short lines', () => {
  const line = `plain ${'x'.repeat(56)}`;
  const lineCount = Math.ceil((2 * 1024 * 1024) / (line.length + 1));
  const source = Array.from({ length: lineCount }, () => line).join('\n');
  const startedAt = performance.now();
  const parsed = parseMarkdownIsland(source);
  const elapsedMs = performance.now() - startedAt;

  assert.equal(parsed.ok, true);
  assert.equal(parsed.blocks.length, 1);
  assert.equal(parsed.blocks[0].type, 'paragraph');
  assert.equal(parsed.blocks[0].lines.length, lineCount);
  assert.ok(elapsedMs < 1_500, `2 MiB short-line paragraph scan took ${elapsedMs.toFixed(1)} ms`);
});

test('Markdown preview segmentation slices many artifacts without rebuilding the source', () => {
  const fence = '```js\nx\n```';
  const fenceCount = Math.ceil((2 * 1024 * 1024) / (fence.length + 1));
  const source = Array.from({ length: fenceCount }, () => fence).join('\n');
  const startedAt = performance.now();
  const segments = splitPreviewMarkdownSegments(source);
  const elapsedMs = performance.now() - startedAt;

  assert.equal(segments.length, fenceCount);
  assert.ok(segments.every(segment => segment.source === fence));
  assert.ok(elapsedMs < 1_500, `2 MiB multi-fence segmentation took ${elapsedMs.toFixed(1)} ms`);
});

test('parsePreviewMarkdownDocument keeps artifacts atomic in source round trip', () => {
  const source = [
    '# Before',
    '',
    '```mermaid',
    'graph TD; A-->B',
    '```',
    '',
    '## Between',
    '',
    '```html-preview',
    '<section>Readonly</section>',
    '```',
    '',
    '![Alt](https://example.com/a.png "Title")',
    '',
    'After **bold**',
  ].join('\n');
  const parsed = parsePreviewMarkdownDocument(source);

  assert.equal(parsed.ok, true);
  assert.deepEqual(
    parsed.blocks.map((block) => [block.type, block.artifactKind ?? '', block.sourceRange.startLine]),
    [
      ['markdown-island', '', 1],
      ['artifact', 'mermaid', 3],
      ['markdown-island', '', 7],
      ['artifact', 'html-preview', 9],
      ['artifact', 'image', 13],
      ['markdown-island', '', 15],
    ],
  );
  assert.deepEqual(
    parsed.blocks
      .filter((block) => block.type === 'markdown-island')
      .flatMap((block) => block.blocks.filter((child) => child.type === 'heading'))
      .map((heading) => [heading.depth, heading.sourceRange.startLine]),
    [
      [1, 1],
      [2, 7],
    ],
  );
  assert.equal(serializePreviewMarkdownDocument(parsed.blocks), source);
});

test('parse and serialize Markdown island with GFM table rich cells', () => {
  const source = [
    'Intro **bold**',
    '',
    '| A | B |',
    '| --- | :---: |',
    '| escaped\\|pipe | first<br><span style="color: #294D7A">second</span> |',
  ].join('\n');
  const parsed = parseMarkdownIsland(source);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.blocks.length, 2);
  assert.equal(parsed.blocks[1].type, 'table');
  assert.deepEqual(parsed.blocks[1].rows[1].cells[0], [
    { italic: false, strong: false, style: {}, text: 'escaped|pipe' },
  ]);
  assert.equal(serializeMarkdownIsland(parsed.blocks), source);
});

test('parse and serialize Markdown island with styled nested lists', () => {
  const fontFamily = '"MornDraft Serif SC", "Noto Serif SC", "Source Han Serif SC", "Songti SC", "SimSun", serif';
  const styledItem = '<span style="font-family: &quot;MornDraft Serif SC&quot;, &quot;Noto Serif SC&quot;, &quot;Source Han Serif SC&quot;, &quot;Songti SC&quot;, &quot;SimSun&quot;, serif">Item one</span>';
  const source = [
    `- ${styledItem}`,
    '- Item two',
    '  - Nested item',
    '  - Another nested',
    '',
    '1. First',
    '2. Second',
    '3. Third',
  ].join('\n');
  const parsed = parseMarkdownIsland(source);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.blocks.length, 2);
  assert.deepEqual(parsed.blocks[0], {
    type: 'list',
    indent: 0,
    ordered: false,
    items: [
      {
        children: [],
        segments: [
          { italic: false, strong: false, style: { fontFamily }, text: 'Item one' },
        ],
      },
      {
        children: [
          {
            type: 'list',
            indent: 2,
            ordered: false,
            items: [
              {
                children: [],
                segments: [
                  { italic: false, strong: false, style: {}, text: 'Nested item' },
                ],
              },
              {
                children: [],
                segments: [
                  { italic: false, strong: false, style: {}, text: 'Another nested' },
                ],
              },
            ],
          },
        ],
        segments: [
          { italic: false, strong: false, style: {}, text: 'Item two' },
        ],
      },
    ],
  });
  assert.equal(serializeMarkdownIsland(parsed.blocks), source);
  assert.equal(
    serializeMarkdownIsland([
      {
        type: 'list',
        ordered: false,
        items: [[{ italic: false, strong: false, style: {}, text: 'Compat' }]],
      },
    ]),
    '- Compat',
  );
});

test('serializeMarkdownIsland drops whitespace-only blocks so the final editor can show its placeholder', () => {
  assert.equal(
    serializeMarkdownIsland([
      { type: 'paragraph', lines: [[{ italic: false, strong: false, style: {}, text: ' ' }]] },
    ]),
    '',
  );
  assert.equal(
    serializeMarkdownIsland([
      { type: 'paragraph', lines: [[{ italic: false, strong: false, style: {}, text: '   ' }]] },
      { type: 'paragraph', lines: [[{ italic: false, strong: false, style: {}, text: 'kept' }]] },
    ]),
    'kept',
  );
});

test('parsePreviewMarkdownDocument keeps legacy morndraft fences as ordinary code blocks', () => {
  const source = [
    'Intro',
    '',
    '```morndraft',
    '{ title: "Original" }',
    '```',
    '',
    'Tail',
  ].join('\n');
  const parsed = parsePreviewMarkdownDocument(source);

  assert.equal(parsed.ok, true);
  assert.deepEqual(
    parsed.blocks.map((block) => [block.type, block.artifactKind ?? '', block.sourceRange.startLine]),
    [
      ['markdown-island', '', 1],
      ['code-block', '', 3],
      ['markdown-island', '', 7],
    ],
  );
  assert.equal(parsed.blocks[1].type === 'code-block' ? parsed.blocks[1].language : '', 'morndraft');
  assert.equal(parsed.blocks[1].source, ['```morndraft', '{ title: "Original" }', '```'].join('\n'));
  assert.equal(serializePreviewMarkdownDocument(parsed.blocks), source);
});

test('parsePreviewMarkdownDocument keeps renderable mermaid and html fences atomic', () => {
  const source = [
    '```mermaid',
    'graph TD',
    '  A[开始] --> B{判断}',
    '  B -- 是 --> C[完成]',
    '```',
    '',
    '```html',
    '<div class="card"><h1>标题</h1></div>',
    '```',
    '',
    '```html-preview',
    '<main><p>Ready</p></main>',
    '```',
  ].join('\n');
  const parsed = parsePreviewMarkdownDocument(source);

  assert.equal(parsed.ok, true);
  assert.deepEqual(
    parsed.blocks.map((block) => [block.type, block.artifactKind ?? '', block.sourceRange.startLine]),
    [
      ['artifact', 'mermaid', 1],
      ['artifact', 'html', 7],
      ['artifact', 'html-preview', 11],
    ],
  );
  assert.equal(getCodeFenceLanguageKind(parsed.blocks[0].artifactKind), CODE_FENCE_LANGUAGE_KINDS.MERMAID);
  assert.equal(getCodeFenceLanguageKind(parsed.blocks[1].artifactKind), CODE_FENCE_LANGUAGE_KINDS.HTML_PREVIEW);
  assert.equal(getCodeFenceLanguageKind(parsed.blocks[2].artifactKind), CODE_FENCE_LANGUAGE_KINDS.HTML_PREVIEW);
  assert.equal(serializePreviewMarkdownDocument(parsed.blocks), source);
});

test('standalone HTML artifact serializes a trailing paragraph and deletes independently', () => {
  const artifactSource = [
    '```html-preview',
    '<!doctype html>',
    '<html><body><button>Ready</button></body></html>',
    '```',
  ].join('\n');
  const sourceWithTail = `${artifactSource}\n\nAfter the HTML block`;
  const parsed = parsePreviewMarkdownDocument(sourceWithTail);

  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.blocks.map((block) => block.type), ['artifact', 'markdown-island']);
  assert.equal(serializePreviewMarkdownDocument(parsed.blocks), sourceWithTail);
  assert.equal(
    serializePreviewMarkdownDocument(parsed.blocks.filter((block) => block.type !== 'artifact')),
    'After the HTML block',
  );
});

test('parsePreviewMarkdownDocument keeps tilde fenced source atomic', () => {
  const source = [
    '~~~mermaid',
    'graph TD',
    '  A[开始] --> B[完成]',
    '~~~~',
    '',
    '~~~html',
    '<div class="card"><h1>标题</h1></div>',
    '~~~',
    '',
    '~~~json',
    '{ "title": "ok" }',
    '~~~',
  ].join('\n');
  const parsed = parsePreviewMarkdownDocument(source);

  assert.equal(parsed.ok, true);
  assert.deepEqual(
    parsed.blocks.map((block) => [block.type, block.artifactKind ?? block.language ?? '', block.sourceRange.startLine, block.sourceRange.endLine]),
    [
      ['artifact', 'mermaid', 1, 4],
      ['artifact', 'html', 6, 8],
      ['code-block', 'json', 10, 12],
    ],
  );
  assert.equal(getCodeFenceLanguageKind(parsed.blocks[0].artifactKind), CODE_FENCE_LANGUAGE_KINDS.MERMAID);
  assert.equal(getCodeFenceLanguageKind(parsed.blocks[1].artifactKind), CODE_FENCE_LANGUAGE_KINDS.HTML_PREVIEW);
  assert.equal(parsed.blocks[0].source, source.split('\n').slice(0, 4).join('\n'));
  assert.equal(parsed.blocks[2].source, source.split('\n').slice(9).join('\n'));
});

test('parsePreviewMarkdownDocument keeps pasted legacy MornDraft syntax as code blocks', () => {
  const source = [
    '# MornDraft 语法',
    '',
    '## 01. 封面',
    '',
    '```morndraft',
    '{',
    '  "layout": "cards",',
    '  "variant": "cover",',
    '  "items": [',
    '    {',
    '      "badge": "Protocol",',
    '      "label": "MornDraft flat schema"',
    '    }',
    '  ]',
    '}',
    '```',
  ].join('\n');
  const parsed = parsePreviewMarkdownDocument(source);

  assert.equal(parsed.ok, true);
  assert.deepEqual(
    parsed.blocks.map((block) => [block.type, block.artifactKind ?? '', block.sourceRange.startLine]),
    [
      ['markdown-island', '', 1],
      ['code-block', '', 5],
    ],
  );
  assert.equal(parsed.blocks[1].type === 'code-block' ? parsed.blocks[1].language : '', 'morndraft');
  assert.deepEqual(
    parsed.blocks[0].blocks.map((block) => [block.type, block.depth, block.sourceRange.startLine]),
    [
      ['heading', 1, 1],
      ['heading', 2, 3],
    ],
  );
  assert.equal(parsed.blocks[1].source, source.split('\n').slice(4).join('\n'));
  assert.equal(serializePreviewMarkdownDocument(parsed.blocks), source);
});

test('parsePreviewMarkdownDocument preserves malformed fenced paste sample as blocks', () => {
  const source = [
    '下面这些都是故意写错的，可以直接拿去验证 final 语法修复。',
    '',
    '```js',
    'const data = {',
    '  title: "未闭合代码块",',
    '  items: [1, 2, 3]',
    '````',
    '',
    '```json',
    '{',
    '  "title": "缺少逗号"',
    '  "items": [1, 2, 3,]',
    '}',
    '```',
    '',
    '```mermaid',
    'graph TD',
    '  A[开始 --> B{判断}',
    '  B -- 是 --> C[完成',
    '```',
    '',
    '```html',
    '<div class="card>',
    '  <h1>标题</h2>',
    '  <img src="test.png">',
    '</section>',
    '```',
    '',
    '```markdown',
    '| 名称 | 状态 |',
    '| --- |',
    '| A | done | extra |',
    '```',
    '',
    '```tsx',
    'export function Demo() {',
    '  return <div className="box">',
    '    <span>hello</div>',
    '}',
    '```',
  ].join('\n');
  const parsed = parsePreviewMarkdownDocument(source);

  assert.equal(parsed.ok, true);
  assert.deepEqual(
    parsed.blocks.map((block) => [block.type, block.artifactKind ?? block.language ?? '', block.sourceRange.startLine, block.sourceRange.endLine]),
    [
      ['markdown-island', '', 1, 1],
      ['code-block', 'js', 3, 7],
      ['code-block', 'json', 9, 14],
      ['artifact', 'mermaid', 16, 20],
      ['artifact', 'html', 22, 27],
      ['code-block', 'markdown', 29, 33],
      ['code-block', 'tsx', 35, 40],
    ],
  );
  assert.equal(parsed.blocks[1].source.startsWith('```js\n'), true);
  assert.equal(parsed.blocks[2].source.endsWith('\n```'), true);
  assert.equal(parsed.blocks[3].source.includes('A[开始 --> B{判断}'), true);
  assert.equal(parsed.blocks[5].source.includes('| A | done | extra |'), true);
});

test('patchMarkdownIslandSource replaces only the island source range', () => {
  const source = [
    'Intro',
    '',
    '```mermaid',
    'graph TD; A-->B',
    '```',
    '',
    'After',
  ].join('\n');
  const [island, artifact, after] = splitPreviewMarkdownSegments(source);
  const result = patchMarkdownIslandSource(source, island, 'Intro updated');

  assert.equal(artifact.kind, 'readonly-artifact');
  assert.equal(after.source.trim(), 'After');
  assert.deepEqual(result, {
    ok: true,
    source: [
      'Intro updated',
      '',
      '```mermaid',
      'graph TD; A-->B',
      '```',
      '',
      'After',
    ].join('\n'),
  });
});
