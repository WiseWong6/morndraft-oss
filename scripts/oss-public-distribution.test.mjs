import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  isDeclaredOssPath,
  normalizeExternalPackageSpecifier,
  readOssDistributionManifest,
  validateOssDistributionManifest,
} from './oss-public-distribution.mjs';

function createManifest(overrides = {}) {
  return {
    schemaVersion: 1,
    packageName: 'morndraft',
    profile: 'oss',
    buildPreset: 'oss-full',
    workspacePackages: ['@morndraft/core', '@morndraft/web-shell'],
    sourceEntrypoints: ['apps/web-oss/src/index.ts'],
    copyFiles: ['App.tsx', 'apps/web-oss/src/index.ts'],
    copyDirectories: ['packages/core'],
    testFiles: ['packages/core/example.test.js'],
    runtimeDependencies: ['react'],
    devDependencies: ['vite'],
    excludedPathSegments: ['api'],
    excludedFiles: ['private.ts'],
    sourceMarkerAllowances: {},
    requiredFiles: ['package.json'],
    ...overrides,
  };
}

test('validates positive OSS distribution roots', () => {
  const manifest = validateOssDistributionManifest(createManifest());
  assert.equal(isDeclaredOssPath(manifest, 'App.tsx'), true);
  assert.equal(isDeclaredOssPath(manifest, 'packages/core/src/index.js'), true);
  assert.equal(isDeclaredOssPath(manifest, 'apps/api/src/server.ts'), false);
});

test('rejects unsafe, duplicate, and overlapping manifest entries', () => {
  assert.throws(
    () => validateOssDistributionManifest(createManifest({ copyFiles: ['../secret'] })),
    /unsafe path/,
  );
  assert.throws(
    () => validateOssDistributionManifest(createManifest({ requiredFiles: ['package.json', 'package.json'] })),
    /duplicate/,
  );
  assert.throws(
    () => validateOssDistributionManifest(createManifest({ devDependencies: ['react'] })),
    /overlap/,
  );
  assert.throws(
    () => validateOssDistributionManifest(createManifest({ workspacePackages: ['../private'] })),
    /invalid package/,
  );
  assert.throws(
    () => validateOssDistributionManifest(createManifest({
      copyFiles: ['App.tsx'],
      sourceEntrypoints: ['apps/web-oss/src/index.ts'],
    })),
    /source entrypoint is outside positive copy roots/,
  );
  assert.throws(
    () => validateOssDistributionManifest(createManifest({ copyDirectories: ['.git'] })),
    /unsafe path/,
  );
  assert.throws(
    () => validateOssDistributionManifest(createManifest({ testFiles: ['packages/core/bad;command.test.js'] })),
    /unsafe path/,
  );
});

test('rejects declared source files and directories that do not exist', async () => {
  const projectDir = await mkdtemp(path.join(os.tmpdir(), 'morndraft-oss-manifest-'));
  try {
    await mkdir(path.join(projectDir, 'profiles'), { recursive: true });
    await writeFile(
      path.join(projectDir, 'profiles', 'oss-public-distribution.json'),
      JSON.stringify(createManifest()),
    );
    await assert.rejects(
      readOssDistributionManifest(projectDir),
      /declared file is missing/,
    );
  } finally {
    await rm(projectDir, { recursive: true, force: true });
  }
});

test('rejects symlinks anywhere inside declared public source roots', async () => {
  const projectDir = await mkdtemp(path.join(os.tmpdir(), 'morndraft-oss-manifest-'));
  const externalDir = await mkdtemp(path.join(os.tmpdir(), 'morndraft-oss-external-'));
  try {
    await mkdir(path.join(projectDir, 'profiles'), { recursive: true });
    await mkdir(path.join(projectDir, 'apps', 'web-oss', 'src'), { recursive: true });
    await mkdir(path.join(projectDir, 'packages', 'core'), { recursive: true });
    await writeFile(path.join(projectDir, 'App.tsx'), 'export {};');
    await writeFile(path.join(projectDir, 'apps', 'web-oss', 'src', 'index.ts'), 'export {};');
    await writeFile(path.join(projectDir, 'packages', 'core', 'example.test.js'), 'export {};');
    await writeFile(path.join(externalDir, 'secret.ts'), 'export const secret = true;');
    await symlink(
      path.join(externalDir, 'secret.ts'),
      path.join(projectDir, 'packages', 'core', 'linked-secret.ts'),
    );
    await writeFile(
      path.join(projectDir, 'profiles', 'oss-public-distribution.json'),
      JSON.stringify(createManifest()),
    );
    await assert.rejects(
      readOssDistributionManifest(projectDir),
      /declared source contains a symbolic link/,
    );
  } finally {
    await rm(projectDir, { recursive: true, force: true });
    await rm(externalDir, { recursive: true, force: true });
  }
});

test('normalizes external imports to direct package names', () => {
  assert.equal(normalizeExternalPackageSpecifier('react/jsx-runtime'), 'react');
  assert.equal(normalizeExternalPackageSpecifier('@scope/package/subpath'), '@scope/package');
  assert.equal(normalizeExternalPackageSpecifier('mermaid'), 'mermaid');
  assert.equal(normalizeExternalPackageSpecifier('./local-module.js'), null);
  assert.equal(normalizeExternalPackageSpecifier('node:fs'), null);
  assert.equal(normalizeExternalPackageSpecifier('https://example.com/module.js'), null);
});
