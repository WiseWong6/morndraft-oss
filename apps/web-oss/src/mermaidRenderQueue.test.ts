import assert from 'node:assert/strict';
import test from 'node:test';

import {
  OSS_MERMAID_RENDER_DEBOUNCE_MS,
  OSS_MERMAID_MAX_SOURCE_LENGTH,
  assertOssMermaidSourceBudget,
  createLatestOnlyMermaidRenderer,
} from './mermaidRenderQueue';

const wait = (durationMs: number) => new Promise(resolve => setTimeout(resolve, durationMs));

test('Mermaid renderer debounces rapid changes to the latest source', async () => {
  assert.equal(OSS_MERMAID_RENDER_DEBOUNCE_MS, 250);
  const started: number[] = [];
  const completed: number[] = [];
  const renderer = createLatestOnlyMermaidRenderer({
    debounceMs: 10,
    render: async (input: number) => {
      started.push(input);
      return input;
    },
    onResult: output => completed.push(output),
    onError: error => { throw error; },
  });

  for (let value = 0; value < 20; value += 1) renderer.schedule(value);
  await wait(40);
  renderer.dispose();

  assert.deepEqual(started, [19]);
  assert.deepEqual(completed, [19]);
});

test('Mermaid renderers share a serial queue with concurrency capped at one', async () => {
  let active = 0;
  let peak = 0;
  const completed: string[] = [];
  const createRenderer = () => createLatestOnlyMermaidRenderer({
    debounceMs: 0,
    render: async (input: string) => {
      active += 1;
      peak = Math.max(peak, active);
      await wait(15);
      active -= 1;
      return input;
    },
    onResult: output => completed.push(output),
    onError: error => { throw error; },
  });
  const first = createRenderer();
  const second = createRenderer();

  first.schedule('first');
  second.schedule('second');
  await wait(60);
  first.dispose();
  second.dispose();

  assert.equal(peak, 1);
  assert.deepEqual(completed.sort(), ['first', 'second']);
});

test('Mermaid source budget rejects oversized text before rendering', () => {
  assert.doesNotThrow(() => assertOssMermaidSourceBudget('x'.repeat(OSS_MERMAID_MAX_SOURCE_LENGTH)));
  assert.throws(
    () => assertOssMermaidSourceBudget('x'.repeat(OSS_MERMAID_MAX_SOURCE_LENGTH + 1)),
    /50000-character limit/,
  );
});
