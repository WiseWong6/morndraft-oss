import assert from 'node:assert/strict';
import test from 'node:test';
import { createPreviewAiSourceVersion, resolvePreviewAiSelection } from './usePreviewMarkdownEditing';
import {
  assertPreviewAiSourceSnapshotCurrent,
  buildPreviewOssAiSelectionRequest,
  requestPreviewOssAiSelection,
} from './previewOssAiPrivacy';
import { requestPreviewAiFinalRepair } from './previewAiFinalRepairSelection';

const baseInput = {
  changedMessage: 'selection changed',
  instruction: 'Improve it.',
  sourceKind: 'markdown' as const,
  sourceSnapshot: '# Before\n\nSelected text',
  visibleText: 'Selected text',
};

test('preview OSS AI builds source-backed requests from one immutable snapshot', () => {
  assert.deepEqual(buildPreviewOssAiSelectionRequest({
    ...baseInput,
    action: 'modify',
    range: { start: 12, end: baseInput.sourceSnapshot.length },
  }), {
    action: 'modify',
    instruction: 'Improve it.',
    patchRange: { start: 12, end: baseInput.sourceSnapshot.length },
    range: { start: 12, end: baseInput.sourceSnapshot.length },
    source: baseInput.sourceSnapshot,
    sourceKind: 'markdown',
  });
  assert.throws(() => buildPreviewOssAiSelectionRequest({
    ...baseInput,
    action: 'modify',
  }), /selection changed/u);
});

test('preview OSS AI raw HTML summaries carry trusted visible text only', () => {
  const sourceSnapshot = '<script>SECRET</script><p>Visible</p>';
  const start = sourceSnapshot.indexOf('Visible');
  assert.deepEqual(buildPreviewOssAiSelectionRequest({
    action: 'summarize',
    changedMessage: 'selection changed',
    instruction: '',
    range: { start, end: start + 'Visible'.length },
    sourceKind: 'html',
    sourceSnapshot,
    visibleText: 'Visible',
  }), {
    action: 'summarize',
    instruction: '',
    visibleText: 'Visible',
  });
});

test('non-patchable exact image and cross-resource selections fail privacy inspection before request', async () => {
  const localImage = '![private](data:image/png;base64,QUJD)';
  const sourceSnapshot = `Before\n${localImage}\nAfter`;
  const exactRanges = [
    {
      endColumn: localImage.length + 1,
      endLine: 2,
      startColumn: 1,
      startLine: 2,
    },
    {
      endColumn: localImage.indexOf('QUJD') + 3,
      endLine: 2,
      startColumn: localImage.indexOf('QUJD') + 2,
      startLine: 2,
    },
    {
      endColumn: 6,
      endLine: 3,
      startColumn: 1,
      startLine: 1,
    },
  ];
  let requestCount = 0;
  for (const sourceRange of exactRanges) {
    const selection = resolvePreviewAiSelection({
      source: sourceSnapshot,
      candidate: {
        capturedAt: 1,
        contentKind: 'image',
        image: { alt: 'private', markdown: localImage, url: 'data:image/png;base64,QUJD' },
        islandId: 'artifact:image',
        patchable: false,
        rect: { height: 40, left: 0, top: 0, width: 80 },
        selectedText: 'private image',
        sourceLine: sourceRange.startLine,
        sourceLineRange: { startLine: sourceRange.startLine, endLine: sourceRange.endLine },
        sourceRange,
      },
      sourceKind: 'markdown',
    });
    assert.ok(selection?.sourceRange);
    assert.equal(selection?.patchTarget, undefined);
    await assert.rejects(requestPreviewOssAiSelection({
      action: 'summarize',
      changedMessage: 'selection changed',
      getLatestSource: () => sourceSnapshot,
      range: selection?.sourceRange,
      requestInstruction: '',
      requestText: async () => {
        requestCount += 1;
        return 'must not run';
      },
      signal: new AbortController().signal,
      sourceKind: 'markdown',
      sourceSnapshot,
      visibleText: selection?.visibleText ?? '',
    }), (error: unknown) => (
      error instanceof Error && 'code' in error && error.code === 'privacy_unsafe_input'
    ));
  }
  assert.equal(requestCount, 0);
});

test('declared but invalid source authority never downgrades to a visible-only image summary', () => {
  const sourceSnapshot = '![private](data:image/png;base64,QUJD)';
  let requestCount = 0;
  const selection = resolvePreviewAiSelection({
    source: sourceSnapshot,
    candidate: {
      capturedAt: 1,
      contentKind: 'image',
      image: { alt: 'private', url: 'data:image/png;base64,QUJD' },
      islandId: 'artifact:image',
      patchable: false,
      rect: { height: 40, left: 0, top: 0, width: 80 },
      selectedText: 'data:image/png;base64,QUJD',
      sourceLine: 1,
      sourceRange: {
        startLine: 1,
        startColumn: 1,
        endLine: 1,
        endColumn: sourceSnapshot.length + 2,
      },
    },
    sourceKind: 'markdown',
  });
  if (selection) requestCount += 1;
  assert.equal(selection, null);
  assert.equal(requestCount, 0);
});

test('readonly table source authority that covers local data fails before request', async () => {
  const sourceSnapshot = '| Col |\n| --- |\n| ![private](data:image/png;base64,QUJD) |';
  const lastLine = '| ![private](data:image/png;base64,QUJD) |';
  const selection = resolvePreviewAiSelection({
    source: sourceSnapshot,
    candidate: {
      capturedAt: 1,
      contentKind: 'table',
      islandId: 'document:preview-markdown',
      patchable: false,
      rect: { height: 20, left: 0, top: 0, width: 120 },
      selectedText: 'private',
      sourceLine: 3,
      sourceLineRange: { startLine: 1, endLine: 3 },
      sourceRange: {
        startLine: 1,
        startColumn: 1,
        endLine: 3,
        endColumn: lastLine.length + 1,
      },
    },
    sourceKind: 'markdown',
  });
  assert.ok(selection?.sourceRange);
  let requestCount = 0;
  await assert.rejects(requestPreviewOssAiSelection({
    action: 'summarize',
    changedMessage: 'selection changed',
    getLatestSource: () => sourceSnapshot,
    range: selection?.sourceRange,
    requestInstruction: '',
    requestText: async () => {
      requestCount += 1;
      return 'must not run';
    },
    signal: new AbortController().signal,
    sourceKind: 'markdown',
    sourceSnapshot,
    visibleText: selection?.visibleText ?? '',
  }), (error: unknown) => (
    error instanceof Error && 'code' in error && error.code === 'privacy_unsafe_input'
  ));
  assert.equal(requestCount, 0);
});

test('readonly exact table summarizes from source while an unmappable final selection stays visible-only', async () => {
  const tableSource = '| Col |\n| --- |\n| exact table text |';
  const tableSelection = resolvePreviewAiSelection({
    source: tableSource,
    candidate: {
      capturedAt: 1,
      contentKind: 'table',
      islandId: 'document:preview-markdown',
      patchable: false,
      rect: { height: 20, left: 0, top: 0, width: 120 },
      selectedText: 'exact table text',
      sourceLine: 1,
      sourceLineRange: { startLine: 1, endLine: 3 },
      sourceRange: {
        startLine: 1,
        startColumn: 1,
        endLine: 3,
        endColumn: '| exact table text |'.length + 1,
      },
    },
    sourceKind: 'markdown',
  });
  assert.ok(tableSelection?.sourceRange);
  assert.equal(tableSelection?.patchTarget, undefined);
  const requests: Array<Record<string, unknown>> = [];
  await requestPreviewOssAiSelection({
    action: 'summarize',
    changedMessage: 'selection changed',
    getLatestSource: () => tableSource,
    range: tableSelection?.sourceRange,
    requestInstruction: '',
    requestText: async (request) => {
      requests.push(request as unknown as Record<string, unknown>);
      return 'table summary';
    },
    signal: new AbortController().signal,
    sourceKind: 'markdown',
    sourceSnapshot: tableSource,
    visibleText: tableSelection?.visibleText ?? '',
  });

  const unmapped = resolvePreviewAiSelection({
    source: '# Source',
    candidate: {
      capturedAt: 1,
      islandId: 'final:unmapped',
      patchable: false,
      rect: { height: 20, left: 0, top: 0, width: 120 },
      selectedText: 'Rendered only',
      sourceLine: 1,
    },
  });
  assert.equal(unmapped?.sourceRange, undefined);
  await requestPreviewOssAiSelection({
    action: 'summarize',
    changedMessage: 'selection changed',
    getLatestSource: () => '# Source',
    requestInstruction: '',
    requestText: async (request) => {
      requests.push(request as unknown as Record<string, unknown>);
      return 'visible summary';
    },
    signal: new AbortController().signal,
    sourceKind: 'markdown',
    sourceSnapshot: '# Source',
    visibleText: unmapped?.visibleText ?? '',
  });
  assert.equal(requests[0]?.source, tableSource);
  assert.deepEqual(requests[0]?.range, { start: 0, end: tableSource.length });
  assert.equal(requests[1]?.source, undefined);
  assert.equal(requests[1]?.visibleText, 'Rendered only');
});

test('resolved request range stays independent from a broader patch target', async () => {
  const resource = 'data:;base64,QUJD)';
  const sourceSnapshot = `Safe title\n${resource}`;
  const selection = resolvePreviewAiSelection({
    source: sourceSnapshot,
    candidate: {
      capturedAt: 1,
      islandId: 'artifact:source-backed',
      patchTarget: {
        kind: 'artifact-source',
        selectedText: sourceSnapshot,
        sourceRange: {
          startLine: 1,
          startColumn: 1,
          endLine: 2,
          endColumn: resource.length + 1,
        },
      },
      rect: { height: 20, left: 0, top: 0, width: 120 },
      selectedText: 'Safe title',
      sourceLine: 1,
      sourceRange: {
        startLine: 1,
        startColumn: 1,
        endLine: 1,
        endColumn: 'Safe title'.length + 1,
      },
    },
    sourceKind: 'text',
  });
  assert.deepEqual(selection?.sourceRange, {
    start: 0,
    end: 'Safe title'.length,
    startLine: 1,
    endLine: 1,
  });
  assert.deepEqual(selection?.patchTarget?.sourceRange, {
    start: 0,
    end: sourceSnapshot.length,
    startLine: 1,
    endLine: 2,
  });

  let seenRequest: Record<string, unknown> | null = null;
  await requestPreviewOssAiSelection({
    action: 'summarize',
    changedMessage: 'selection changed',
    getLatestSource: () => sourceSnapshot,
    range: selection?.sourceRange,
    requestInstruction: '',
    requestText: async (request) => {
      seenRequest = request as unknown as Record<string, unknown>;
      return 'summary';
    },
    signal: new AbortController().signal,
    sourceKind: 'text',
    sourceSnapshot,
    visibleText: selection?.visibleText ?? '',
  });
  assert.deepEqual(seenRequest?.range, { start: 0, end: 'Safe title'.length });

  let modifyRequestCount = 0;
  await assert.rejects(requestPreviewOssAiSelection({
    action: 'modify',
    changedMessage: 'selection changed',
    getLatestSource: () => sourceSnapshot,
    patchRange: selection?.patchTarget?.sourceRange,
    range: selection?.sourceRange,
    requestInstruction: 'Rewrite all.',
    requestText: async () => {
      modifyRequestCount += 1;
      return 'must not run';
    },
    signal: new AbortController().signal,
    sourceKind: 'text',
    sourceSnapshot,
    visibleText: selection?.visibleText ?? '',
  }), (error: unknown) => (
    error instanceof Error && 'code' in error && error.code === 'privacy_unsafe_input'
  ));
  assert.equal(modifyRequestCount, 0);
});

test('modify validates a sensitive authoritative selection even when its patch target is safe', async () => {
  const resource = 'data:;base64,QUJD)';
  const sourceSnapshot = `SAFE ${resource} tail`;
  const payloadStart = sourceSnapshot.indexOf('QUJD');
  let requestCount = 0;
  for (const range of [
    { start: sourceSnapshot.indexOf('data:'), end: sourceSnapshot.indexOf('data:') + resource.length },
    { start: payloadStart + 1, end: payloadStart + 2 },
    { start: payloadStart + 2, end: payloadStart + 2 },
  ]) {
    await assert.rejects(requestPreviewOssAiSelection({
      action: 'modify',
      changedMessage: 'selection changed',
      getLatestSource: () => sourceSnapshot,
      patchRange: { start: 0, end: 4 },
      range,
      requestInstruction: 'Rewrite SAFE.',
      requestText: async () => {
        requestCount += 1;
        return 'must not run';
      },
      signal: new AbortController().signal,
      sourceKind: 'text',
      sourceSnapshot,
      visibleText: 'private selection',
    }), (error: unknown) => (
      error instanceof Error && 'code' in error && error.code === 'privacy_unsafe_input'
    ));
  }
  assert.equal(requestCount, 0);
});

test('raw HTML visible summary performs source-range privacy inspection before visible-only downgrade', async () => {
  const sourceSnapshot = '<script>const url = "da" + "ta:";</script><p>Visible</p>';
  const start = sourceSnapshot.indexOf('Visible');
  let seenRequest: Record<string, unknown> | null = null;
  await requestPreviewOssAiSelection({
    action: 'summarize',
    changedMessage: 'selection changed',
    getLatestSource: () => sourceSnapshot,
    range: { start, end: start + 'Visible'.length },
    requestInstruction: '',
    requestText: async (request) => {
      seenRequest = request as unknown as Record<string, unknown>;
      return 'summary';
    },
    signal: new AbortController().signal,
    sourceKind: 'html',
    sourceSnapshot,
    visibleText: 'Visible',
  });
  assert.deepEqual(seenRequest, {
    action: 'summarize',
    instruction: '',
    signal: seenRequest?.signal,
    visibleText: 'Visible',
  });

  const resourceSource = '<img alt="private" src="data:image/png;base64,QUJD">';
  const payloadStart = resourceSource.indexOf('QUJD');
  let unsafeRequestCount = 0;
  await assert.rejects(requestPreviewOssAiSelection({
    action: 'summarize',
    changedMessage: 'selection changed',
    getLatestSource: () => resourceSource,
    range: { start: payloadStart + 1, end: payloadStart + 2 },
    requestInstruction: '',
    requestText: async () => {
      unsafeRequestCount += 1;
      return 'must not run';
    },
    signal: new AbortController().signal,
    sourceKind: 'html',
    sourceSnapshot: resourceSource,
    visibleText: 'private',
  }), (error: unknown) => (
    error instanceof Error && 'code' in error && error.code === 'privacy_unsafe_input'
  ));
  assert.equal(unsafeRequestCount, 0);
});

test('exact snapshot guard rejects known equal-length FNV32 collisions before the adapter', async () => {
  const sourceSnapshot = 'rUX!tm,3';
  const collidedSource = '.YR7pIrI';
  assert.equal(sourceSnapshot.length, collidedSource.length);
  assert.equal(
    createPreviewAiSourceVersion(sourceSnapshot),
    createPreviewAiSourceVersion(collidedSource),
    'fixture must retain the known FNV32 collision',
  );
  let requestCount = 0;
  await assert.rejects(requestPreviewOssAiSelection({
    action: 'modify',
    changedMessage: 'selection changed',
    getLatestSource: () => collidedSource,
    range: { start: 0, end: sourceSnapshot.length },
    requestInstruction: 'Improve it.',
    requestText: async () => {
      requestCount += 1;
      return 'replacement';
    },
    signal: new AbortController().signal,
    sourceKind: 'text',
    sourceSnapshot,
    visibleText: sourceSnapshot,
  }), /selection changed/u);
  assert.equal(requestCount, 0);
});

test('exact snapshot guard rejects normalized-equivalent and outside-selection changes', async () => {
  for (const [sourceSnapshot, changedSource] of [
    ['A  B', 'A B '],
    ['prefix SELECT suffix', 'PREFIX SELECT suffix'],
  ] as const) {
    assert.throws(
      () => assertPreviewAiSourceSnapshotCurrent(changedSource, sourceSnapshot, 'selection changed'),
      /selection changed/u,
    );
  }

  let latestSource = '# Before\n\nSelected text';
  let resolveRequest!: (value: string) => void;
  const pending = requestPreviewOssAiSelection({
    action: 'modify',
    changedMessage: 'selection changed',
    getLatestSource: () => latestSource,
    range: { start: 12, end: latestSource.length },
    requestInstruction: 'Improve it.',
    requestText: () => new Promise<string>((resolve) => { resolveRequest = resolve; }),
    signal: new AbortController().signal,
    sourceKind: 'markdown',
    sourceSnapshot: latestSource,
    visibleText: 'Selected text',
  });
  latestSource = '# CHANGED\n\nSelected text';
  resolveRequest('replacement');
  await assert.rejects(pending, /selection changed/u);
});

test('stale final repair click stays in the handled error path and issues zero requests', async () => {
  let requestCount = 0;
  await assert.rejects(requestPreviewAiFinalRepair({
    changedMessage: 'selection changed',
    getLatestSource: () => '# Changed after selection',
    request: async () => {
      requestCount += 1;
      return null;
    },
    sourceSnapshot: '# Selected snapshot',
  }), /selection changed/u);
  assert.equal(requestCount, 0);
});

test('unchanged snapshot allows exactly one adapter request and response', async () => {
  let requestCount = 0;
  const result = await requestPreviewOssAiSelection({
    action: 'modify',
    changedMessage: 'selection changed',
    getLatestSource: () => baseInput.sourceSnapshot,
    range: { start: 12, end: baseInput.sourceSnapshot.length },
    requestInstruction: 'Improve it.',
    requestText: async () => {
      requestCount += 1;
      return 'replacement';
    },
    signal: new AbortController().signal,
    sourceKind: 'markdown',
    sourceSnapshot: baseInput.sourceSnapshot,
    visibleText: baseInput.visibleText,
  });
  assert.equal(result, 'replacement');
  assert.equal(requestCount, 1);
});
