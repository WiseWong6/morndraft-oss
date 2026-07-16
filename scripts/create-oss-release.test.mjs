/* global process */
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createOssRelease } from './create-oss-release.mjs';

const SOURCE_SHA = '1234567890abcdef1234567890abcdef12345678';

async function withFixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'morndraft-oss-release-'));
  const distDir = path.join(root, 'dist');
  const outputDir = path.join(root, 'release');
  await mkdir(path.join(distDir, 'assets'), { recursive: true });
  await writeFile(path.join(distDir, 'index.html'), '<!doctype html><title>OSS</title>\n');
  await writeFile(path.join(distDir, 'assets', 'Build.js'), 'console.log("upper")\n');
  await writeFile(path.join(distDir, 'assets', 'app.js'), 'console.log("oss")\n');
  try {
    await run({ distDir, outputDir, root });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}

test('packages a static tree with exact file and archive digests', async () => {
  await withFixture(async ({ distDir, outputDir }) => {
    const result = await createOssRelease({
      distDir,
      outputDir,
      repository: 'WiseWong6/morndraft-oss',
      runId: '42',
      sourceSha: SOURCE_SHA,
    });
    assert.equal(result.manifest.sourceSha, SOURCE_SHA);
    assert.equal(result.manifest.workflowRunId, 42);
    assert.deepEqual(result.manifest.files.map(file => file.path), [
      'assets/Build.js',
      'assets/app.js',
      'index.html',
    ]);
    assert.equal(result.manifest.fileCount, 3);
    assert.match(result.manifest.archive.sha256, /^[0-9a-f]{64}$/u);
    const sums = await readFile(path.join(outputDir, 'SHA256SUMS'), 'utf8');
    assert.match(sums, new RegExp(`${result.manifest.archive.sha256} {2}morndraft-oss-${SOURCE_SHA}\\.tar\\.gz`, 'u'));
    assert.match(sums, /^[0-9a-f]{64} {2}.+\n[0-9a-f]{64} {2}release-manifest\.json\n$/u);
  });
});

test('fails closed on source maps and symbolic links', async (context) => {
  await withFixture(async ({ distDir, outputDir }) => {
    await writeFile(path.join(distDir, 'assets', 'app.js.map'), '{}');
    await assert.rejects(
      createOssRelease({
        distDir,
        outputDir,
        repository: 'WiseWong6/morndraft-oss',
        runId: '42',
        sourceSha: SOURCE_SHA,
      }),
      /source maps are forbidden/u,
    );
    await rm(path.join(distDir, 'assets', 'app.js.map'));
    if (process.platform === 'win32') {
      context.skip('Symbolic-link creation is not generally available to unprivileged Windows tests.');
      return;
    }
    await symlink('app.js', path.join(distDir, 'assets', 'linked.js'));
    await assert.rejects(
      createOssRelease({
        distDir,
        outputDir,
        repository: 'WiseWong6/morndraft-oss',
        runId: '42',
        sourceSha: SOURCE_SHA,
      }),
      /symbolic links are forbidden/u,
    );
  });
});
