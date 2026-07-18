import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveFinalLineClickInsertionTarget,
  shouldHandleFinalLineClickPointer,
} from './finalLineClickInsertion';

const blocks = [
  { nodeKey: 'first', top: 100, bottom: 132 },
  { nodeKey: 'second', top: 180, bottom: 240 },
] as const;

test('Final line click keeps clicks inside visible content under native handling', () => {
  assert.equal(resolveFinalLineClickInsertionTarget(116, blocks), null);
  assert.equal(resolveFinalLineClickInsertionTarget(240, blocks), null);
});

test('Final line click resolves before, between, and after visible content blocks', () => {
  assert.deepEqual(resolveFinalLineClickInsertionTarget(64, blocks), {
    nodeKey: 'first',
    placement: 'before',
  });
  assert.deepEqual(resolveFinalLineClickInsertionTarget(156, blocks), {
    nodeKey: 'second',
    placement: 'before',
  });
  assert.deepEqual(resolveFinalLineClickInsertionTarget(288, blocks), {
    nodeKey: 'second',
    placement: 'after',
  });
});

test('Final line click ignores malformed geometry and empty block lists', () => {
  assert.equal(resolveFinalLineClickInsertionTarget(100, []), null);
  assert.equal(resolveFinalLineClickInsertionTarget(Number.NaN, blocks), null);
  assert.deepEqual(resolveFinalLineClickInsertionTarget(40, [
    { nodeKey: 'ignored', top: Number.NaN, bottom: 10 },
    { nodeKey: 'valid', top: 60, bottom: 90 },
  ]), {
    nodeKey: 'valid',
    placement: 'before',
  });
});

test('Final line click leaves protected controls and modified gestures alone', () => {
  const input = {
    altKey: false,
    button: 0,
    ctrlKey: false,
    isInteractiveTarget: false,
    metaKey: false,
    pointerType: 'mouse',
    shiftKey: false,
  } as const;
  assert.equal(shouldHandleFinalLineClickPointer(input), true);
  assert.equal(shouldHandleFinalLineClickPointer({ ...input, isInteractiveTarget: true }), false);
  assert.equal(shouldHandleFinalLineClickPointer({ ...input, button: 2 }), false);
  assert.equal(shouldHandleFinalLineClickPointer({ ...input, ctrlKey: true }), false);
  assert.equal(shouldHandleFinalLineClickPointer({ ...input, pointerType: 'touch' }), false);
});
