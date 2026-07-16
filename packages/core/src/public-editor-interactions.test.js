import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getPublicSourceLineSelectionRange,
  getPublicSourcePhysicalLineBounds,
  insertPublicMarkdownParagraph,
  resolvePublicBlankLineInsertionTarget,
  shouldHandlePublicPlainMouseGesture,
} from './public-editor-interactions.js';
import {
  applyPublicFormatCommand,
  getPublicFormatSelectionAvailability,
} from './public-formatting.js';
import { parseMarkdownRichInline } from './markdown-lexical-edit.js';

const mappedSelection = (source, start, end, visibleText = source.slice(start, end), visibleStart = start) => ({
  end,
  formatContext: {
    blockEnd: source.length,
    blockStart: 0,
    visibleEnd: visibleStart + visibleText.length,
    visibleStart,
  },
  source,
  sourceText: source.slice(start, end),
  start,
  visibleText,
});

test('public source line selection excludes CRLF and handles blank lines', () => {
  const source = 'first\r\n\r\nthird';
  assert.deepEqual(getPublicSourceLineSelectionRange(source, 2), { start: 0, end: 5 });
  assert.deepEqual(getPublicSourceLineSelectionRange(source, 7), { start: 7, end: 7 });
  assert.deepEqual(getPublicSourceLineSelectionRange(source, source.length), { start: 9, end: 14 });
  assert.deepEqual(getPublicSourceLineSelectionRange('first\r\rthird', 6), { start: 6, end: 6 });
  assert.deepEqual(getPublicSourcePhysicalLineBounds('first\rsecond', 7, 9), { start: 6, end: 12 });
});

test('public plain mouse gestures reject touch, modifiers and secondary buttons', () => {
  const input = {
    altKey: false,
    button: 0,
    ctrlKey: false,
    detail: 2,
    metaKey: false,
    pointerType: 'mouse',
    shiftKey: false,
  };
  assert.equal(shouldHandlePublicPlainMouseGesture(input), true);
  assert.equal(shouldHandlePublicPlainMouseGesture({ ...input, ctrlKey: true }), false);
  assert.equal(shouldHandlePublicPlainMouseGesture({ ...input, pointerType: 'touch' }), false);
  assert.equal(shouldHandlePublicPlainMouseGesture({ ...input, button: 1 }), false);
  assert.equal(shouldHandlePublicPlainMouseGesture({ ...input, detail: 1 }), false);
});

test('blank line target resolves before, between and after visible blocks', () => {
  const blocks = [
    { top: 100, bottom: 130, sourceStart: 0, sourceEnd: 5 },
    { top: 180, bottom: 220, sourceStart: 7, sourceEnd: 13 },
  ];
  assert.equal(resolvePublicBlankLineInsertionTarget(110, blocks), null);
  assert.deepEqual(resolvePublicBlankLineInsertionTarget(60, blocks), {
    placement: 'before', sourceOffset: 0, visualTop: 100,
  });
  assert.deepEqual(resolvePublicBlankLineInsertionTarget(150, blocks), {
    placement: 'before', sourceOffset: 7, visualTop: 180,
  });
  assert.deepEqual(resolvePublicBlankLineInsertionTarget(250, blocks), {
    placement: 'after', sourceOffset: 13, visualTop: 220,
  });
});

test('paragraph insertion preserves the document line ending and spacing', () => {
  assert.equal(insertPublicMarkdownParagraph('first\n\nthird', 7, 'second'), 'first\n\nsecond\n\nthird');
  assert.equal(insertPublicMarkdownParagraph('first\r\nthird', 7, 'second'), 'first\r\n\r\nsecond\r\n\r\nthird');
  assert.equal(insertPublicMarkdownParagraph('first', 5, '  second  '), 'first\n\nsecond');
  assert.equal(insertPublicMarkdownParagraph('first', 5, '   '), 'first');
});

test('public formatting rejects stale, Source-only and unsupported selections', () => {
  const source = 'Alpha beta';
  assert.equal(getPublicFormatSelectionAvailability(source, {
    ...mappedSelection(source, 0, 5),
    source: 'stale',
  }).canFormat, false);
  assert.equal(getPublicFormatSelectionAvailability(source, {
    ...mappedSelection(source, 0, 5),
    visibleText: undefined,
  }).canFormat, false);
  const fenced = '```json\n{"ok": true}\n```';
  assert.equal(getPublicFormatSelectionAvailability(fenced, mappedSelection(fenced, 8, 12)).reason, 'unsupported-region');
  const table = '| A | B |\n|---|---|\n| 1 | 2 |';
  assert.equal(getPublicFormatSelectionAvailability(table, mappedSelection(table, 2, 3)).reason, 'unsupported-region');
  const crossBlock = 'First\n\nSecond';
  assert.equal(getPublicFormatSelectionAvailability(
    crossBlock,
    mappedSelection(crossBlock, 0, crossBlock.length),
  ).reason, 'unsupported-region');
  const jsonArray = '[1, 2]';
  assert.equal(
    getPublicFormatSelectionAvailability(jsonArray, mappedSelection(jsonArray, 1, 2)).reason,
    'unsupported-region',
  );
  for (const nested of [
    '- > nested', '> - nested', '> > nested', '- - nested',
    '>  > nested', '>   - nested', '> \t- nested',
  ]) {
    const start = nested.indexOf('nested');
    const selection = mappedSelection(nested, start, start + 'nested'.length, 'nested', 0);
    assert.equal(
      getPublicFormatSelectionAvailability(nested, selection).reason,
      'unsupported-region',
      nested,
    );
    assert.deepEqual(
      applyPublicFormatCommand(nested, selection, { kind: 'block', format: 'h2' }),
      { ok: false, reason: 'unsupported-region' },
      nested,
    );
  }
  const headingWithLiteralMarker = '# > nested';
  const headingStart = headingWithLiteralMarker.indexOf('nested');
  const headingSelection = mappedSelection(
    headingWithLiteralMarker,
    headingStart,
    headingStart + 'nested'.length,
    'nested',
    2,
  );
  assert.equal(
    getPublicFormatSelectionAvailability(headingWithLiteralMarker, headingSelection).canApplyBlockFormat,
    true,
  );
  assert.deepEqual(
    applyPublicFormatCommand(headingWithLiteralMarker, headingSelection, { kind: 'block', format: 'h2' }),
    {
      ok: true,
      selection: { start: 0, end: '## > nested'.length },
      source: '## > nested',
    },
  );
});

test('public formatting disables only inline controls for unsupported reversible markup', () => {
  for (const fixture of [
    { source: '_Alpha_', start: 1, end: 6 },
    { source: '__Alpha__', start: 2, end: 7 },
    { source: '[Alpha](https://example.com)', start: 1, end: 6 },
  ]) {
    const selection = mappedSelection(fixture.source, fixture.start, fixture.end, 'Alpha', 0);
    const availability = getPublicFormatSelectionAvailability(fixture.source, selection);
    assert.deepEqual(availability, {
      canApplyBlockFormat: true,
      canFormat: false,
      reason: 'unserializable-selection',
    });
    const inline = applyPublicFormatCommand(fixture.source, selection, {
      kind: 'inline', format: 'bold',
    });
    assert.equal(inline.ok, false);
    assert.equal(inline.reason, 'unserializable-selection');
    const block = applyPublicFormatCommand(fixture.source, selection, {
      kind: 'block', format: 'quote',
    });
    assert.equal(block.ok, true);
    assert.equal(block.source, `> ${fixture.source}`);
  }
});

test('public inline formats serialize reversibly and toggle on a full selected fragment', () => {
  const source = 'Alpha beta';
  const strong = applyPublicFormatCommand(source, mappedSelection(source, 0, 5), {
    kind: 'inline', format: 'bold',
  });
  assert.equal(strong.ok, true);
  assert.equal(strong.source, '**Alpha** beta');
  const selectedStrong = mappedSelection(strong.source, 2, 7, 'Alpha', 0);
  const plain = applyPublicFormatCommand(strong.source, selectedStrong, {
    kind: 'inline', format: 'bold',
  });
  assert.equal(plain.ok, true);
  assert.equal(plain.source, 'Alpha beta');
  const underlined = applyPublicFormatCommand(source, mappedSelection(source, 6, 10), {
    kind: 'inline', format: 'underline',
  });
  assert.equal(underlined.source, 'Alpha <u>beta</u>');
});

test('public style commands keep the complete safe palette and clear defaults', () => {
  const source = 'Alpha';
  const styled = applyPublicFormatCommand(source, mappedSelection(source, 0, 5), {
    kind: 'style', style: { color: '#244E3A' },
  });
  assert.equal(styled.ok, true);
  assert.match(styled.source, /^<span style="color: #244E3A">Alpha<\/span>$/u);
  const spanOpenEnd = styled.source.indexOf('>') + 1;
  const cleared = applyPublicFormatCommand(styled.source, mappedSelection(styled.source, spanOpenEnd, spanOpenEnd + 5, 'Alpha', 0), {
    kind: 'style', style: { color: '' },
  });
  assert.equal(cleared.source, 'Alpha');
  const invalid = applyPublicFormatCommand(source, mappedSelection(source, 0, 5), {
    kind: 'style', style: { fontSize: '13px' },
  });
  assert.equal(invalid.ok, false);
});

test('public formatting safely splits a partial selection inside nested formats', () => {
  const source = '**Alpha beta**';
  const betaStart = source.indexOf('beta');
  const styled = applyPublicFormatCommand(
    source,
    mappedSelection(source, betaStart, betaStart + 4, 'beta', 6),
    { kind: 'style', style: { color: '#244E3A' } },
  );
  assert.equal(styled.ok, true);
  const parsedStyled = parseMarkdownRichInline(styled.source);
  assert.equal(parsedStyled.ok, true);
  assert.equal(parsedStyled.text, 'Alpha beta');
  assert.deepEqual(parsedStyled.segments.map((segment) => ({
    color: segment.style.color ?? '',
    strong: segment.strong,
    text: segment.text,
  })), [
    { color: '', strong: true, text: 'Alpha ' },
    { color: '#244E3A', strong: true, text: 'beta' },
  ]);

  const alphaStart = styled.source.indexOf('Alpha');
  const unbold = applyPublicFormatCommand(
    styled.source,
    mappedSelection(styled.source, alphaStart, alphaStart + 5, 'Alpha', 0),
    { kind: 'inline', format: 'bold' },
  );
  assert.equal(unbold.ok, true);
  const parsedUnbold = parseMarkdownRichInline(unbold.source);
  assert.equal(parsedUnbold.ok, true);
  assert.deepEqual(parsedUnbold.segments.map((segment) => ({
    strong: segment.strong,
    text: segment.text,
  })), [
    { strong: false, text: 'Alpha' },
    { strong: true, text: ' ' },
    { strong: true, text: 'beta' },
  ]);
});

test('public block commands transform one reversible Markdown block', () => {
  const source = 'First';
  const heading = applyPublicFormatCommand(source, mappedSelection(source, 0, source.length), {
    kind: 'block', format: 'h2',
  });
  assert.equal(heading.ok, true);
  assert.equal(heading.source, '## First');
  const numbered = applyPublicFormatCommand(heading.source, mappedSelection(heading.source, 0, heading.source.length), {
    kind: 'block', format: 'numberList',
  });
  assert.equal(numbered.source, '1. First');
});
