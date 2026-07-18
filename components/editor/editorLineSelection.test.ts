import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getExplicitSelectionRange,
  getLineSelectionRange,
  getSelectionTextRange,
  getSourceLineSelectionRange,
  shouldHandleSourceLineDoubleClick,
} from './editorLineSelection';

test('getLineSelectionRange returns the full extent of the target line', () => {
  const value = 'first line\nsecond line\nthird line';
  assert.deepEqual(getLineSelectionRange(value, 2), { line: 2, start: 11, end: 22 });
});

test('getSourceLineSelectionRange selects first, middle, and last Markdown source lines', () => {
  const value = '# Heading\n- **middle** item\nlast line';
  assert.deepEqual(getSourceLineSelectionRange(value, 0), { start: 0, end: 9 });
  assert.deepEqual(getSourceLineSelectionRange(value, 17), { start: 10, end: 27 });
  assert.deepEqual(getSourceLineSelectionRange(value, value.length), { start: 28, end: 37 });
  assert.equal(value.slice(10, 27), '- **middle** item');
});

test('getSourceLineSelectionRange treats LF as the previous line boundary and the following offset as the next line', () => {
  const value = 'first\nsecond';
  assert.deepEqual(getSourceLineSelectionRange(value, 5), { start: 0, end: 5 });
  assert.deepEqual(getSourceLineSelectionRange(value, 6), { start: 6, end: 12 });
});

test('getSourceLineSelectionRange excludes both characters in CRLF terminators', () => {
  const value = 'first\r\nsecond\r\nthird';
  assert.deepEqual(getSourceLineSelectionRange(value, 5), { start: 0, end: 5 });
  assert.deepEqual(getSourceLineSelectionRange(value, 6), { start: 0, end: 5 });
  assert.deepEqual(getSourceLineSelectionRange(value, 7), { start: 7, end: 13 });
  assert.deepEqual(getSourceLineSelectionRange(value, 14), { start: 7, end: 13 });
  assert.deepEqual(getSourceLineSelectionRange(value, 15), { start: 15, end: 20 });
});

test('getSourceLineSelectionRange keeps empty source lines collapsed without consuming a newline', () => {
  assert.deepEqual(getSourceLineSelectionRange('\nfirst', 0), { start: 0, end: 0 });
  assert.deepEqual(getSourceLineSelectionRange('first\n\nthird', 6), { start: 6, end: 6 });
  assert.deepEqual(getSourceLineSelectionRange('first\n', 6), { start: 6, end: 6 });
});

test('getSourceLineSelectionRange clamps invalid and out-of-range offsets safely', () => {
  const value = 'first\nsecond';
  assert.deepEqual(getSourceLineSelectionRange(value, -20), { start: 0, end: 5 });
  assert.deepEqual(getSourceLineSelectionRange(value, 8.9), { start: 6, end: 12 });
  assert.deepEqual(getSourceLineSelectionRange(value, 999), { start: 6, end: 12 });
  assert.deepEqual(getSourceLineSelectionRange(value, Number.NaN), { start: 0, end: 5 });
  assert.deepEqual(getSourceLineSelectionRange(value, Number.POSITIVE_INFINITY), { start: 0, end: 5 });
});

test('shouldHandleSourceLineDoubleClick accepts only an unmodified primary mouse double click', () => {
  const input = {
    pointerType: 'mouse',
    button: 0,
    detail: 2,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
  };

  assert.equal(shouldHandleSourceLineDoubleClick(input), true);
  assert.equal(shouldHandleSourceLineDoubleClick({ ...input, pointerType: 'touch' }), false);
  assert.equal(shouldHandleSourceLineDoubleClick({ ...input, pointerType: 'pen' }), false);
  assert.equal(shouldHandleSourceLineDoubleClick({ ...input, pointerType: null }), false);
  assert.equal(shouldHandleSourceLineDoubleClick({ ...input, button: 1 }), false);
  assert.equal(shouldHandleSourceLineDoubleClick({ ...input, detail: 1 }), false);
  assert.equal(shouldHandleSourceLineDoubleClick({ ...input, altKey: true }), false);
  assert.equal(shouldHandleSourceLineDoubleClick({ ...input, ctrlKey: true }), false);
  assert.equal(shouldHandleSourceLineDoubleClick({ ...input, metaKey: true }), false);
  assert.equal(shouldHandleSourceLineDoubleClick({ ...input, shiftKey: true }), false);
});

test('getSelectionTextRange locates exact characters for a plain text match', () => {
  const value = 'first line\nsecond line\nthird line';
  const result = getSelectionTextRange(value, 'second line', 0);
  assert.ok(result, 'should resolve a range');
  assert.equal(value.slice(result!.start, result!.end), 'second line');
  assert.equal(result!.line, 2);
});

test('getSelectionTextRange collapses whitespace when matching', () => {
  const value = 'hello   world\nnext';
  // Selection text "hello world" (single space) should still match a source
  // span with multiple spaces.
  const result = getSelectionTextRange(value, 'hello world', 0);
  assert.ok(result, 'should match despite whitespace difference');
  assert.equal(value.slice(result!.start, result!.end), 'hello   world');
});

test('getSelectionTextRange picks the nth occurrence to disambiguate repeats', () => {
  const value = '状态 正常\n说明 正常\n备注 正常';
  // "正常" appears on lines 1, 2 and 3. The 2nd occurrence (index 1) is on
  // line 2, the 3rd (index 2) on line 3.
  const first = getSelectionTextRange(value, '正常', 0);
  const second = getSelectionTextRange(value, '正常', 1);
  const third = getSelectionTextRange(value, '正常', 2);
  assert.equal(first!.line, 1);
  assert.equal(second!.line, 2);
  assert.equal(third!.line, 3);
});

test('getSelectionTextRange can scope matches to a source line range', () => {
  const value = [
    '# Body',
    '```html',
    '<h1>HTML</h1>',
    '<p>Body</p>',
    '```',
  ].join('\n');
  const result = getSelectionTextRange(value, 'Body', 0, { startLine: 2, endLine: 5 });
  assert.ok(result, 'should resolve scoped HTML text');
  assert.equal(result!.line, 4);
  assert.equal(value.slice(result!.start, result!.end), 'Body');
});

test('getExplicitSelectionRange selects an absolute source range', () => {
  const value = 'first line\nsecond line';
  assert.deepEqual(getExplicitSelectionRange(value, { start: 11, end: 17 }), {
    line: 2,
    start: 11,
    end: 17,
  });
});

test('getSelectionTextRange returns null when the text is absent', () => {
  const value = 'first line\nsecond line';
  assert.equal(getSelectionTextRange(value, 'missing text', 0), null);
});

test('getSelectionTextRange accepts single-character needles and rejects empty needles', () => {
  const value = 'first line\nsecond line';
  const result = getSelectionTextRange(value, 's', 0);
  assert.ok(result);
  assert.equal(value.slice(result!.start, result!.end), 's');
  assert.equal(getSelectionTextRange(value, '', 0), null);
});
