import test from 'node:test';
import assert from 'node:assert/strict';
import {
  insertPublicFinalBlankLineSource,
  resolvePublicFinalBlankLineTarget,
  shouldHandlePublicFinalBlankLinePointer,
} from './publicFinalBlankLine';

const mouseInput = {
  altKey: false,
  button: 0,
  ctrlKey: false,
  isInteractiveTarget: false,
  metaKey: false,
  pointerType: 'mouse',
  shiftKey: false,
};

test('public Final blank-line pointer accepts only an unmodified primary mouse action', () => {
  assert.equal(shouldHandlePublicFinalBlankLinePointer(mouseInput), true);
  for (const input of [
    { ...mouseInput, altKey: true },
    { ...mouseInput, button: 1 },
    { ...mouseInput, ctrlKey: true },
    { ...mouseInput, isInteractiveTarget: true },
    { ...mouseInput, metaKey: true },
    { ...mouseInput, pointerType: 'pen' },
    { ...mouseInput, pointerType: 'touch' },
    { ...mouseInput, shiftKey: true },
  ]) assert.equal(shouldHandlePublicFinalBlankLinePointer(input), false);
});

test('public Final blank-line target ignores block interiors and resolves surrounding gaps', () => {
  const blocks = [
    { bottom: 80, id: 'first', sourceEnd: 8, sourceStart: 0, top: 40 },
    { bottom: 180, id: 'protected', sourceEnd: 30, sourceStart: 12, top: 120 },
    { bottom: 260, id: 'last', sourceEnd: 44, sourceStart: 34, top: 220 },
  ];
  assert.equal(resolvePublicFinalBlankLineTarget(60, blocks), null);
  assert.deepEqual(
    resolvePublicFinalBlankLineTarget(100, blocks),
    { id: 'protected', offset: 12, placement: 'before' },
  );
  assert.deepEqual(
    resolvePublicFinalBlankLineTarget(200, blocks),
    { id: 'last', offset: 34, placement: 'before' },
  );
  assert.deepEqual(
    resolvePublicFinalBlankLineTarget(300, blocks),
    { id: 'last', offset: 44, placement: 'after' },
  );
  assert.deepEqual(
    resolvePublicFinalBlankLineTarget(100, [], 0),
    { id: null, offset: 0, placement: 'append' },
  );
  assert.deepEqual(
    resolvePublicFinalBlankLineTarget(100, [], 12),
    { id: null, offset: 12, placement: 'append' },
  );
});

test('public Final blank-line target treats range-less artifacts as protected blockers', () => {
  const blocks = [
    { bottom: 80, id: 'first', sourceEnd: 8, sourceStart: 0, top: 40 },
    { bottom: 180, id: 'opaque', sourceEnd: null, sourceStart: null, top: 120 },
    { bottom: 260, id: 'last', sourceEnd: 44, sourceStart: 34, top: 220 },
  ];
  assert.equal(resolvePublicFinalBlankLineTarget(150, blocks), null);
  assert.deepEqual(
    resolvePublicFinalBlankLineTarget(100, blocks),
    { id: 'first', offset: 8, placement: 'after' },
  );
  assert.deepEqual(
    resolvePublicFinalBlankLineTarget(200, blocks),
    { id: 'last', offset: 34, placement: 'before' },
  );
  assert.equal(
    resolvePublicFinalBlankLineTarget(100, [
      { bottom: 180, id: 'opaque', sourceEnd: null, sourceStart: null, top: 120 },
    ]),
    null,
  );
});

test('public Final blank-line Source insertion preserves separators and CRLF', () => {
  assert.equal(
    insertPublicFinalBlankLineSource('Before\n\nAfter', 6, 'Inserted'),
    'Before\n\nInserted\n\nAfter',
  );
  assert.equal(
    insertPublicFinalBlankLineSource('Before\n\nAfter', 8, 'Inserted'),
    'Before\n\nInserted\n\nAfter',
  );
  assert.equal(
    insertPublicFinalBlankLineSource('Before\r\n\r\nAfter', 6, 'Inserted'),
    'Before\r\n\r\nInserted\r\n\r\nAfter',
  );
  assert.equal(insertPublicFinalBlankLineSource('', 0, 'Inserted'), 'Inserted');
  assert.equal(insertPublicFinalBlankLineSource('Before', 6, 'Inserted'), 'Before\n\nInserted');
  assert.equal(insertPublicFinalBlankLineSource('After', 0, 'Inserted'), 'Inserted\n\nAfter');
  assert.equal(insertPublicFinalBlankLineSource('Before', 99, 'Inserted'), null);
  assert.equal(insertPublicFinalBlankLineSource('Before', 6, '   '), 'Before');
});

test('public Final blank-line Source insertion keeps one logical paragraph', () => {
  assert.equal(
    insertPublicFinalBlankLineSource('Before\n\nAfter', 6, '  first\r\nsecond  '),
    'Before\n\nfirst second\n\nAfter',
  );
});
