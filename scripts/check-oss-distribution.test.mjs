import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  SOURCE_MARKER_PATTERNS,
  collectDistributionFiles,
  findSensitiveText,
  validateNestedPackageDependencies,
  validatePublicPackageContract,
  validateScorecardWorkflow,
  validateTsconfigPathTargets,
} from './check-oss-distribution.mjs';

const manifest = {
  packageName: 'morndraft',
  profile: 'oss',
  buildPreset: 'oss-full',
  workspacePackages: ['@morndraft/core'],
  runtimeDependencies: ['react'],
  devDependencies: ['vite'],
  testFiles: ['example.test.js'],
};

function validPackage() {
  return {
    name: 'morndraft',
    version: '1.0.0',
    private: true,
    license: 'Apache-2.0',
    engines: { node: '>=22' },
    morndraftDistribution: 'oss',
    scripts: {
      test: 'node --test example.test.js',
      typecheck: 'tsc --noEmit',
      'build:oss': 'MORNDRAFT_BUILD_PRESET=oss-full vite build',
      prepublishOnly: "node -e \"throw new Error('not as an npm package')\"",
    },
    dependencies: { react: '^19.0.0' },
    devDependencies: { vite: '^6.0.0' },
  };
}

test('accepts the fail-closed public package contract', () => {
  assert.deepEqual(validatePublicPackageContract({ packageJson: validPackage(), manifest }), []);
});

test('requires OpenSSF write permissions to stay job-scoped', () => {
  const validWorkflow = `permissions: read-all
jobs:
  scorecard:
    permissions:
      contents: read
      security-events: write
      id-token: write
    steps: []
`;
  assert.deepEqual(validateScorecardWorkflow(validWorkflow), []);

  const invalidWorkflow = `permissions:
  contents: read
  security-events: write
  id-token: write
jobs:
  scorecard:
    steps: []
`;
  assert.match(validateScorecardWorkflow(invalidWorkflow).join('\n'), /global permissions read-only/);
  assert.match(validateScorecardWorkflow(invalidWorkflow).join('\n'), /scoped to the scorecard job/);
});

test('rejects publishable packages and implicit zero/glob test sets', () => {
  const packageJson = validPackage();
  packageJson.private = false;
  packageJson.scripts.test = 'node --test **/*.test.js';
  packageJson.scripts.typecheck = 'tsc --pretty';
  const findings = validatePublicPackageContract({ packageJson, manifest });
  assert.match(findings.join('\n'), /private: true/);
  assert.match(findings.join('\n'), /without globs/);
  assert.match(findings.join('\n'), /typecheck gate/);
});

test('rejects external dependencies hidden in copied nested package manifests', () => {
  assert.deepEqual(validateNestedPackageDependencies({
    relativePath: 'packages/example/package.json',
    manifest,
    packageJson: {
      dependencies: {
        '@morndraft/core': 'file:../core',
        react: '^19.0.0',
        'lucide-react': '^0.561.0',
      },
    },
  }), [
    'packages/example/package.json: dependencies contains undeclared OSS dependency lucide-react',
  ]);
});

test('rejects undeclared workspace package links in nested package manifests', () => {
  assert.deepEqual(validateNestedPackageDependencies({
    relativePath: 'packages/example/package.json',
    manifest,
    packageJson: {
      dependencies: {
        '@morndraft/features-personal': 'file:../features-personal',
      },
    },
  }), [
    'packages/example/package.json: dependencies contains undeclared OSS dependency @morndraft/features-personal',
  ]);
});

test('requires every OSS tsconfig alias to resolve to a copied literal file', () => {
  const filePaths = new Set([
    'packages/core/src/oss-public.ts',
    'packages/web-shell/src/index.ts',
  ]);
  assert.deepEqual(validateTsconfigPathTargets({
    filePaths,
    tsconfig: {
      compilerOptions: {
        paths: {
          '@morndraft/core/oss-public': ['./packages/core/src/oss-public.ts'],
          '@morndraft/features-personal': ['./packages/features-personal/src/index.ts'],
          '@/*': ['./*'],
        },
      },
    },
  }), [
    'tsconfig.json path @morndraft/features-personal points to missing target ./packages/features-personal/src/index.ts',
    'tsconfig.json path @/* must use a literal file target',
  ]);
});

test('detects representative embedded credentials without flagging placeholders', () => {
  const accessKey = ['AKIA', '1234567890ABCDEF'].join('');
  assert.match(findSensitiveText('unsafe.ts', accessKey).join('\n'), /AWS access key/);
  assert.deepEqual(findSensitiveText('safe.ts', 'MORNDRAFT_TOKEN=${MORNDRAFT_TOKEN}'), []);
});

test('detects private entitlement, quota, account-plan, and MCP mock surfaces', () => {
  const pattern = SOURCE_MARKER_PATTERNS['private entitlement or account-plan implementation marker'];
  for (const marker of [
    'MORNDRAFT_ACCOUNT_PLANS',
    'MORNDRAFT_ENTITLEMENTS',
    'MORNDRAFT_QUOTA_METERS',
    'FREE_MORNDRAFT_FLAT_LAYOUT_STYLES',
    'resolveMornDraftFlatLayoutTier',
    'token_pro_mcp',
  ]) {
    pattern.lastIndex = 0;
    assert.equal(pattern.test(marker), true, marker);
  }
});

test('ignores the candidate root workspace directories but rejects nested reserved directories', async () => {
  const projectDir = await mkdtemp(path.join(os.tmpdir(), 'morndraft-oss-distribution-'));
  try {
    await mkdir(path.join(projectDir, 'node_modules'), { recursive: true });
    await mkdir(path.join(projectDir, 'src', '.git'), { recursive: true });

    const result = await collectDistributionFiles(projectDir);

    assert.deepEqual(result.nestedReservedDirectories, ['src/.git']);
  } finally {
    await rm(projectDir, { force: true, recursive: true });
  }
});
