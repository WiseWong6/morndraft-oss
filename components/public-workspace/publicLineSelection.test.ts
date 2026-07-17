import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getPublicSourceLineSelectionRange,
  shouldHandlePublicLineDoubleClick,
} from './publicLineSelection';

test('public Source line selection excludes LF and CRLF terminators', () => {
  const value = '# Heading\r\n- **middle** item\r\nlast line';
  assert.deepEqual(getPublicSourceLineSelectionRange(value, 0), { start: 0, end: 9 });
  assert.deepEqual(getPublicSourceLineSelectionRange(value, 11), { start: 11, end: 28 });
  assert.deepEqual(getPublicSourceLineSelectionRange(value, value.length), { start: 30, end: 39 });
  assert.equal(value.slice(11, 28), '- **middle** item');
});

test('public Source line selection keeps empty lines collapsed', () => {
  assert.deepEqual(getPublicSourceLineSelectionRange('\nfirst', 0), { start: 0, end: 0 });
  assert.deepEqual(getPublicSourceLineSelectionRange('first\n\nthird', 6), { start: 6, end: 6 });
  assert.deepEqual(getPublicSourceLineSelectionRange('first\n', 6), { start: 6, end: 6 });
});

test('public Source line selection clamps invalid offsets', () => {
  const value = 'first\nsecond';
  assert.deepEqual(getPublicSourceLineSelectionRange(value, -10), { start: 0, end: 5 });
  assert.deepEqual(getPublicSourceLineSelectionRange(value, 8.9), { start: 6, end: 12 });
  assert.deepEqual(getPublicSourceLineSelectionRange(value, 999), { start: 6, end: 12 });
  assert.deepEqual(getPublicSourceLineSelectionRange(value, Number.NaN), { start: 0, end: 5 });
});

test('public line double click accepts only a plain primary mouse gesture', () => {
  const input = {
    altKey: false,
    button: 0,
    ctrlKey: false,
    detail: 2,
    metaKey: false,
    pointerType: 'mouse',
    shiftKey: false,
  };
  assert.equal(shouldHandlePublicLineDoubleClick(input), true);
  assert.equal(shouldHandlePublicLineDoubleClick({ ...input, pointerType: 'touch' }), false);
  assert.equal(shouldHandlePublicLineDoubleClick({ ...input, pointerType: 'pen' }), false);
  assert.equal(shouldHandlePublicLineDoubleClick({ ...input, pointerType: null }), false);
  assert.equal(shouldHandlePublicLineDoubleClick({ ...input, button: 1 }), false);
  assert.equal(shouldHandlePublicLineDoubleClick({ ...input, detail: 1 }), false);
  assert.equal(shouldHandlePublicLineDoubleClick({ ...input, altKey: true }), false);
  assert.equal(shouldHandlePublicLineDoubleClick({ ...input, ctrlKey: true }), false);
  assert.equal(shouldHandlePublicLineDoubleClick({ ...input, metaKey: true }), false);
  assert.equal(shouldHandlePublicLineDoubleClick({ ...input, shiftKey: true }), false);
});
