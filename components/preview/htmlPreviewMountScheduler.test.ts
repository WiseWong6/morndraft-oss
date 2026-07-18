import test from 'node:test';
import assert from 'node:assert/strict';

import { createHtmlPreviewMountSchedulerStore } from './htmlPreviewMountScheduler';

const registerFrames = (
  store: ReturnType<typeof createHtmlPreviewMountSchedulerStore>,
  frameIds: readonly string[],
) => {
  frameIds.forEach((frameId, index) => {
    store.registerFrame({
      frameId,
      shouldRequestMount: true,
      top: index * 100,
    });
  });
};

const subscribeCounters = (
  store: ReturnType<typeof createHtmlPreviewMountSchedulerStore>,
  frameIds: readonly string[],
) => {
  const counters = new Map(frameIds.map((frameId) => [frameId, 0]));
  const unsubscribers = frameIds.map((frameId) => store.subscribeFrame(frameId, () => {
    counters.set(frameId, (counters.get(frameId) ?? 0) + 1);
  }));
  return {
    counters,
    unsubscribe: () => unsubscribers.forEach((unsubscribe) => unsubscribe()),
  };
};

test('frame readiness only notifies frame ids whose mount grant changed', () => {
  const store = createHtmlPreviewMountSchedulerStore(1);
  const frameIds = ['frame-1', 'frame-2', 'frame-3'];
  registerFrames(store, frameIds);
  const subscriptions = subscribeCounters(store, frameIds);

  assert.equal(store.getFrameGrantSnapshot('frame-1'), true);
  assert.equal(store.getFrameGrantSnapshot('frame-2'), false);
  assert.equal(store.getFrameGrantSnapshot('frame-3'), false);

  store.setFrameReady('frame-1', true);

  assert.deepEqual(Object.fromEntries(subscriptions.counters), {
    'frame-1': 0,
    'frame-2': 1,
    'frame-3': 0,
  });
  assert.equal(store.getFrameGrantSnapshot('frame-1'), true);
  assert.equal(store.getFrameGrantSnapshot('frame-2'), true);
  assert.equal(store.getFrameGrantSnapshot('frame-3'), false);

  subscriptions.unsubscribe();
});

test('a loaded target frame refresh does not notify any of seven mounted frames', () => {
  const store = createHtmlPreviewMountSchedulerStore(2);
  const frameIds = [
    'frame-1',
    'frame-2',
    'frame-3',
    'frame-4',
    'frame-5',
    'frame-6',
    'frame-7',
  ];
  registerFrames(store, frameIds);
  store.setForceMountAll(true);
  frameIds.forEach((frameId) => store.setFrameReady(frameId, true));
  store.reset();
  const subscriptions = subscribeCounters(store, frameIds);

  store.setFrameReady('frame-4', false);
  store.setFrameReady('frame-4', true);

  assert.deepEqual(
    Object.fromEntries(subscriptions.counters),
    Object.fromEntries(frameIds.map((frameId) => [frameId, 0])),
  );
  frameIds.forEach((frameId) => {
    assert.equal(store.getFrameGrantSnapshot(frameId), true);
  });

  subscriptions.unsubscribe();
});

test('reset releases force-mount without clearing existing frame registrations', () => {
  const store = createHtmlPreviewMountSchedulerStore(1);
  const frameIds = ['frame-1', 'frame-2', 'frame-3'];
  registerFrames(store, frameIds);

  store.setForceMountAll(true);
  assert.equal(store.getFrameGrantSnapshot('frame-1'), true);
  assert.equal(store.getFrameGrantSnapshot('frame-2'), true);
  assert.equal(store.getFrameGrantSnapshot('frame-3'), true);

  store.reset();
  assert.equal(store.getFrameGrantSnapshot('frame-1'), true);
  assert.equal(store.getFrameGrantSnapshot('frame-2'), false);
  assert.equal(store.getFrameGrantSnapshot('frame-3'), false);

  store.setFrameReady('frame-1', true);
  assert.equal(store.getFrameGrantSnapshot('frame-1'), true);
  assert.equal(store.getFrameGrantSnapshot('frame-2'), true);
  assert.equal(store.getFrameGrantSnapshot('frame-3'), false);
});
