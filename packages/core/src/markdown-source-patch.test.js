import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createMarkdownSourcePatchContext,
  getEditableMarkdownBlock,
  getMarkdownPlainText,
  lineColumnToOffset,
  patchMarkdownBlockPlainText,
  patchMarkdownBlockText,
  patchArtifactCodeSource,
  patchSourceRange,
  rejectRecoveredVirtualLine,
  toggleItalic,
  toggleStrong,
  validateSourceRange,
} from './markdown-source-patch.js';

test('lineColumnToOffset converts one-based line and column to source offsets', () => {
  const source = 'Alpha\nBeta\r\nGamma';

  assert.equal(lineColumnToOffset(source, 1, 1), 0);
  assert.equal(lineColumnToOffset(source, 1, 6), 5);
  assert.equal(lineColumnToOffset(source, 2, 1), 6);
  assert.equal(lineColumnToOffset(source, 3, 3), 14);
  assert.equal(lineColumnToOffset(source, 4, 1), null);
});

test('validateSourceRange rejects invalid and reversed ranges', () => {
  const source = 'Alpha\nBeta';

  assert.deepEqual(validateSourceRange(source, {
    startLine: 1,
    startColumn: 1,
    endLine: 1,
    endColumn: 6,
  }), { ok: true, startOffset: 0, endOffset: 5 });
  assert.equal(validateSourceRange(source, {
    startLine: 2,
    startColumn: 5,
    endLine: 1,
    endColumn: 1,
  }).ok, false);
  assert.equal(validateSourceRange(source, {
    startLine: 1,
    startColumn: 99,
    endLine: 1,
    endColumn: 100,
  }).ok, false);
});

test('patchSourceRange replaces only a verified source range', () => {
  const source = 'One\nTwo\nThree';
  const result = patchSourceRange(source, {
    startLine: 2,
    startColumn: 1,
    endLine: 2,
    endColumn: 4,
  }, 'Deux');

  assert.deepEqual(result, { ok: true, source: 'One\nDeux\nThree' });
});

test('patchArtifactCodeSource replaces a pure HTML artifact as the whole source', () => {
  assert.deepEqual(patchArtifactCodeSource('<h1>Hello HTML</h1>', {
    patchWholeSource: true,
    replacement: '<h1>Edited HTML</h1>',
  }), {
    ok: true,
    source: '<h1>Edited HTML</h1>',
  });
});

test('patchArtifactCodeSource patches only a fenced HTML preview code block', () => {
  const source = [
    'Intro',
    '```html-preview',
    '<h1>Hello HTML</h1>',
    '```',
    'Outro',
  ].join('\n');
  const result = patchArtifactCodeSource(source, {
    contentRange: {
      startLine: 3,
      startColumn: 1,
      endLine: 3,
      endColumn: '<h1>Hello HTML</h1>'.length + 1,
    },
    replacement: '<h1>Edited HTML</h1>',
  });

  assert.deepEqual(result, {
    ok: true,
    source: [
      'Intro',
      '```html-preview',
      '<h1>Edited HTML</h1>',
      '```',
      'Outro',
    ].join('\n'),
  });
});

test('source patch context reuses line lookups for editable block patching', () => {
  const source = 'Intro\n# Old title\n| Name | Status |\n| --- | --- |\n| Draft | Ready |';
  const context = createMarkdownSourcePatchContext(source);
  const headingRange = {
    startLine: 2,
    startColumn: 1,
    endLine: 2,
    endColumn: 12,
  };
  const tableRange = {
    startLine: 5,
    startColumn: 9,
    endLine: 5,
    endColumn: 17,
  };

  assert.equal(lineColumnToOffset(context, 5, 11), lineColumnToOffset(source, 5, 11));
  assert.deepEqual(validateSourceRange(context, headingRange), validateSourceRange(source, headingRange));
  assert.deepEqual(patchSourceRange(context, headingRange, '# New title'), {
    ok: true,
    source: 'Intro\n# New title\n| Name | Status |\n| --- | --- |\n| Draft | Ready |',
  });

  const tableBlock = getEditableMarkdownBlock(context, tableRange, 'tableCell');
  assert.equal(tableBlock.editable, true);
  assert.equal(tableBlock.text, 'Ready');
  assert.deepEqual(patchMarkdownBlockText(context, tableBlock, 'Done'), {
    ok: true,
    source: 'Intro\n# Old title\n| Name | Status |\n| --- | --- |\n| Draft | Done |',
  });
});

test('rejectRecoveredVirtualLine rejects ranges that include inserted recovery lines', () => {
  const lineMap = [1, 2, 3, 4, 3, 5, 6];

  assert.equal(rejectRecoveredVirtualLine({
    startLine: 4,
    startColumn: 1,
    endLine: 5,
    endColumn: 4,
  }, lineMap).ok, false);
  assert.equal(rejectRecoveredVirtualLine({
    startLine: 6,
    startColumn: 1,
    endLine: 6,
    endColumn: 3,
  }, lineMap).ok, true);
});

test('getEditableMarkdownBlock returns heading text range while preserving marker', () => {
  const source = '  ##  Launch Plan';
  const block = getEditableMarkdownBlock(source, {
    startLine: 1,
    startColumn: 1,
    endLine: 1,
    endColumn: source.length + 1,
  }, 'heading');

  assert.equal(block.editable, true);
  assert.equal(block.text, 'Launch Plan');
  assert.deepEqual(block.textRange, {
    startLine: 1,
    startColumn: 7,
    endLine: 1,
    endColumn: 18,
  });
});

test('patchMarkdownBlockText preserves list markers and checkboxes', () => {
  const source = '  - [x] Ship draft';
  const block = getEditableMarkdownBlock(source, {
    startLine: 1,
    startColumn: 1,
    endLine: 1,
    endColumn: source.length + 1,
  }, 'listItem');

  const result = patchMarkdownBlockText(source, block, 'Review draft');

  assert.deepEqual(result, { ok: true, source: '  - [x] Review draft' });
});

test('patchMarkdownBlockText preserves quote prefixes on multiline quotes', () => {
  const source = '> First line\n> second line';
  const block = getEditableMarkdownBlock(source, {
    startLine: 1,
    startColumn: 1,
    endLine: 2,
    endColumn: 14,
  }, 'blockquote');

  const result = patchMarkdownBlockText(source, block, 'Alpha\nBeta');

  assert.deepEqual(result, { ok: true, source: '> Alpha\n> Beta' });
});

test('patchMarkdownBlockPlainText preserves simple strong markup around unchanged text', () => {
  const source = 'Alpha **beta** gamma';
  const block = getEditableMarkdownBlock(source, {
    startLine: 1,
    startColumn: 1,
    endLine: 1,
    endColumn: source.length + 1,
  }, 'paragraph');

  assert.equal(block.editable, true);
  assert.equal(block.text, 'Alpha **beta** gamma');

  const appended = patchMarkdownBlockPlainText(source, block, 'Alpha beta gamma!');
  assert.deepEqual(appended, {
    ok: true,
    source: 'Alpha **beta** gamma!',
  });

  const replacedInsideStrong = patchMarkdownBlockPlainText(source, block, 'Alpha done gamma');
  assert.deepEqual(replacedInsideStrong, {
    ok: true,
    source: 'Alpha **done** gamma',
  });
});

test('patchMarkdownBlockPlainText keeps text typed into an empty strong placeholder bold', () => {
  const source = 'Alpha ****beta';
  const block = getEditableMarkdownBlock(source, {
    startLine: 1,
    startColumn: 1,
    endLine: 1,
    endColumn: source.length + 1,
  }, 'paragraph');

  const result = patchMarkdownBlockPlainText(source, block, 'Alpha xbeta');

  assert.deepEqual(result, {
    ok: true,
    source: 'Alpha **x**beta',
  });
});

test('patchMarkdownBlockPlainText preserves simple italic markup around unchanged text', () => {
  const source = 'Lead *draft* copy';
  const block = getEditableMarkdownBlock(source, {
    startLine: 1,
    startColumn: 1,
    endLine: 1,
    endColumn: source.length + 1,
  }, 'paragraph');

  assert.equal(block.editable, true);
  assert.equal(block.text, source);
  assert.equal(getMarkdownPlainText(block.text), 'Lead draft copy');

  const result = patchMarkdownBlockPlainText(source, block, 'Lead final copy');
  assert.deepEqual(result, {
    ok: true,
    source: 'Lead *final* copy',
  });
});

test('getEditableMarkdownBlock marks complex inline Markdown as read-only', () => {
  const source = 'Read [docs](https://example.com) and `code`.';
  const block = getEditableMarkdownBlock(source, {
    startLine: 1,
    startColumn: 1,
    endLine: 1,
    endColumn: source.length + 1,
  }, 'paragraph');

  assert.equal(block.editable, false);
  assert.equal(block.reason, 'complex_inline');
});

test('patchMarkdownBlockText replaces a simple table cell without touching pipes', () => {
  const source = '| Name | Status |\n| --- | --- |\n| Draft | Ready |';
  const block = getEditableMarkdownBlock(source, {
    startLine: 3,
    startColumn: 11,
    endLine: 3,
    endColumn: 16,
  }, 'tableCell');

  const result = patchMarkdownBlockText(source, block, 'Done');

  assert.deepEqual(result, {
    ok: true,
    source: '| Name | Status |\n| --- | --- |\n| Draft | Done |',
  });
});

test('patchMarkdownBlockText rejects replacements that would break block structure', () => {
  const heading = '# Old title';
  const headingBlock = getEditableMarkdownBlock(heading, {
    startLine: 1,
    startColumn: 1,
    endLine: 1,
    endColumn: heading.length + 1,
  }, 'heading');
  const table = '| A | B |\n| - | - |\n| old | keep |';
  const tableBlock = getEditableMarkdownBlock(table, {
    startLine: 3,
    startColumn: 3,
    endLine: 3,
    endColumn: 6,
  }, 'tableCell');

  assert.deepEqual(
    patchMarkdownBlockText(heading, headingBlock, 'New\ntitle'),
    { ok: false, reason: 'invalid_replacement' },
  );
  assert.deepEqual(
    patchMarkdownBlockText(table, tableBlock, 'new | extra'),
    { ok: false, reason: 'invalid_replacement' },
  );
  assert.deepEqual(
    patchMarkdownBlockText(table, tableBlock, 'new\nextra'),
    { ok: false, reason: 'invalid_replacement' },
  );
});

test('patchMarkdownBlockPlainText splits list item newlines into sibling items', () => {
  const source = '* Alpha\n* Gamma';
  const block = getEditableMarkdownBlock(source, {
    startLine: 1,
    startColumn: 1,
    endLine: 1,
    endColumn: 8,
  }, 'listItem');

  const result = patchMarkdownBlockPlainText(source, block, 'Alpha\nBeta');

  assert.deepEqual(result, {
    ok: true,
    source: '* Alpha\n* Beta\n* Gamma',
  });
});

test('patchMarkdownBlockPlainText keeps paragraph blank lines for structural splits', () => {
  const source = 'Alpha beta';
  const block = getEditableMarkdownBlock(source, {
    startLine: 1,
    startColumn: 1,
    endLine: 1,
    endColumn: source.length + 1,
  }, 'paragraph');

  const result = patchMarkdownBlockPlainText(source, block, 'Alpha\n\nbeta');

  assert.deepEqual(result, {
    ok: true,
    source: 'Alpha\n\nbeta',
  });
});

test('patchMarkdownBlockPlainText structural split with full line range avoids retained prefix duplication', () => {
  const source = '成本上升，最终影响用户体验与业务效率。';
  const block = getEditableMarkdownBlock(source, {
    startLine: 1,
    startColumn: 1,
    endLine: 1,
    endColumn: source.length + 1,
  }, 'paragraph');

  const result = patchMarkdownBlockPlainText(source, block, '成本上升，最终\n\n影响用户体验与业务效率。');

  assert.deepEqual(result, {
    ok: true,
    source: '成本上升，最终\n\n影响用户体验与业务效率。',
  });
});

test('paragraph blocks inside list items edit rendered text without leaking continuation indentation', () => {
  const source = '2. **准确找到产品**\n   通过重构产品检索链路';
  const block = getEditableMarkdownBlock(source, {
    startLine: 1,
    startColumn: 4,
    endLine: 2,
    endColumn: 14,
  }, 'paragraph');

  assert.equal(block.editable, true);
  assert.equal(block.text, '**准确找到产品**\n通过重构产品检索链路');
  assert.equal(getMarkdownPlainText(block.text), '准确找到产品\n通过重构产品检索链路');

  const edited = patchMarkdownBlockPlainText(source, block, '准确找到产品\n通过重构产品检索链路!');
  assert.deepEqual(edited, {
    ok: true,
    source: '2. **准确找到产品**\n   通过重构产品检索链路!',
  });

  const split = patchMarkdownBlockPlainText(source, block, '准确找到产品\n\n通过重构产品检索链路');
  assert.deepEqual(split, {
    ok: true,
    source: '2. **准确找到产品**\n   \n   通过重构产品检索链路',
  });
});

test('table cell patch narrows broad parser ranges to the cell content boundaries', () => {
  const source = '| Name | Status |\n| --- | --- |\n| Draft | Ready |';
  const block = getEditableMarkdownBlock(source, {
    startLine: 3,
    startColumn: 9,
    endLine: 3,
    endColumn: 17,
  }, 'tableCell');

  const result = patchMarkdownBlockText(source, block, 'Done');

  assert.equal(block.text, 'Ready');
  assert.deepEqual(result, {
    ok: true,
    source: '| Name | Status |\n| --- | --- |\n| Draft | Done |',
  });
});

test('toggleStrong wraps and unwraps the selected source text with Markdown strong markers', () => {
  const source = 'Alpha beta';
  const wrapped = toggleStrong(source, {
    startLine: 1,
    startColumn: 1,
    endLine: 1,
    endColumn: source.length + 1,
  }, { start: 6, end: 10 });

  assert.deepEqual(wrapped, { ok: true, source: 'Alpha **beta**', selection: { start: 8, end: 12 } });

  const unwrapped = toggleStrong(wrapped.source, {
    startLine: 1,
    startColumn: 1,
    endLine: 1,
    endColumn: wrapped.source.length + 1,
  }, { start: 8, end: 12 });

  assert.deepEqual(unwrapped, { ok: true, source: 'Alpha beta', selection: { start: 6, end: 10 } });
});

test('toggleStrong unwraps when the selected range includes Markdown strong markers', () => {
  const source = 'Alpha **beta**';
  const result = toggleStrong(source, {
    startLine: 1,
    startColumn: 1,
    endLine: 1,
    endColumn: source.length + 1,
  }, { start: 6, end: 14 });

  assert.deepEqual(result, {
    ok: true,
    source: 'Alpha beta',
    selection: { start: 6, end: 10 },
  });
});

test('toggleStrong inserts an empty strong placeholder for a collapsed selection', () => {
  const source = 'Alpha beta';
  const result = toggleStrong(source, {
    startLine: 1,
    startColumn: 1,
    endLine: 1,
    endColumn: source.length + 1,
  }, { start: 6, end: 6 });

  assert.deepEqual(result, {
    ok: true,
    source: 'Alpha ****beta',
    selection: { start: 8, end: 8 },
  });
});

test('toggleStrong removes an empty strong placeholder instead of leaving duplicate markers', () => {
  const source = 'Alpha ****beta';
  const result = toggleStrong(source, {
    startLine: 1,
    startColumn: 1,
    endLine: 1,
    endColumn: source.length + 1,
  }, { start: 8, end: 8 });

  assert.deepEqual(result, {
    ok: true,
    source: 'Alpha beta',
    selection: { start: 6, end: 6 },
  });
  assert.equal(result.source.includes('****'), false);
});

test('toggleItalic wraps and unwraps the selected source text with Markdown emphasis markers', () => {
  const source = 'Alpha beta';
  const wrapped = toggleItalic(source, {
    startLine: 1,
    startColumn: 1,
    endLine: 1,
    endColumn: source.length + 1,
  }, { start: 6, end: 10 });

  assert.deepEqual(wrapped, { ok: true, source: 'Alpha *beta*', selection: { start: 7, end: 11 } });

  const unwrapped = toggleItalic(wrapped.source, {
    startLine: 1,
    startColumn: 1,
    endLine: 1,
    endColumn: wrapped.source.length + 1,
  }, { start: 7, end: 11 });

  assert.deepEqual(unwrapped, { ok: true, source: 'Alpha beta', selection: { start: 6, end: 10 } });
});

test('toggleItalic inserts and removes an empty italic placeholder for collapsed selections', () => {
  const source = 'Alpha beta';
  const inserted = toggleItalic(source, {
    startLine: 1,
    startColumn: 1,
    endLine: 1,
    endColumn: source.length + 1,
  }, { start: 6, end: 6 });

  assert.deepEqual(inserted, {
    ok: true,
    source: 'Alpha **beta',
    selection: { start: 7, end: 7 },
  });

  const removed = toggleItalic(inserted.source, {
    startLine: 1,
    startColumn: 1,
    endLine: 1,
    endColumn: inserted.source.length + 1,
  }, { start: 7, end: 7 });

  assert.deepEqual(removed, {
    ok: true,
    source: 'Alpha beta',
    selection: { start: 6, end: 6 },
  });
});

test('toggleItalic nests with strong markers without stripping bold formatting', () => {
  const source = 'Alpha **beta**';
  const italicized = toggleItalic(source, {
    startLine: 1,
    startColumn: 1,
    endLine: 1,
    endColumn: source.length + 1,
  }, { start: 8, end: 12 });

  assert.deepEqual(italicized, {
    ok: true,
    source: 'Alpha ***beta***',
    selection: { start: 9, end: 13 },
  });

  const unitalicized = toggleItalic(italicized.source, {
    startLine: 1,
    startColumn: 1,
    endLine: 1,
    endColumn: italicized.source.length + 1,
  }, { start: 9, end: 13 });

  assert.deepEqual(unitalicized, {
    ok: true,
    source: 'Alpha **beta**',
    selection: { start: 8, end: 12 },
  });
});
