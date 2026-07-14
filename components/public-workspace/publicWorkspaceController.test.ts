import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  createFinalWorkspaceSnapshot,
  isFinalWorkspaceSnapshotCurrent,
  resolveFinalWorkspaceSnapshot,
} from './publicWorkspaceController';

const readProjectFile = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('public controller keeps Final stable while Source is still settling', () => {
  const initial = createFinalWorkspaceSnapshot('draft:a', 'settled');
  const pending = resolveFinalWorkspaceSnapshot(initial, {
    code: 'live edit',
    debouncedCode: 'settled',
    documentKey: 'draft:a',
    workspaceMode: 'final',
  });
  const settled = resolveFinalWorkspaceSnapshot(pending, {
    code: 'live edit',
    debouncedCode: 'live edit',
    documentKey: 'draft:a',
    workspaceMode: 'final',
  });

  assert.equal(pending, initial);
  assert.deepEqual(settled, { documentKey: 'draft:a', source: 'live edit' });
  assert.equal(isFinalWorkspaceSnapshotCurrent(settled, 'draft:a', 'live edit'), true);
});

test('document identity changes never reuse another document Final snapshot', () => {
  const previous = createFinalWorkspaceSnapshot('draft:a', 'same source');
  const next = resolveFinalWorkspaceSnapshot(previous, {
    code: 'same source',
    debouncedCode: 'same source',
    documentKey: 'draft:b',
    workspaceMode: 'final',
  });

  assert.notEqual(next, previous);
  assert.deepEqual(next, { documentKey: 'draft:b', source: 'same source' });
});

test('OSS workspace uses the public Source Final controller', () => {
  const publicWorkspace = readProjectFile('components/public-workspace/PublicWorkspace.tsx');
  const controller = readProjectFile('components/public-workspace/publicWorkspaceController.ts');

  assert.match(publicWorkspace, /usePublicWorkspaceController<SourceChangeMeta>/u);
  assert.match(publicWorkspace, /documentRevision: documentEpoch/u);
  assert.match(publicWorkspace, /commitAsyncSourceReplacement/u);
  assert.match(publicWorkspace, /source=\{finalWorkspaceSnapshot\.source\}/u);

  assert.match(controller, /const mode = controlledMode \?\? uncontrolledMode;/u);
  assert.match(controller, /documentRevision: current\.document\.revision/u);
  assert.match(controller, /current\.source === token\.source/u);
  assert.doesNotMatch(controller, /account|entitlement|quota|draft|hosted|billing|telemetry/iu);
});
