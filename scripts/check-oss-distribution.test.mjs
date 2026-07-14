import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  PUBLIC_DELIVERY_RUNTIME_DEPENDENCIES,
  SOURCE_MARKER_PATTERNS,
  collectDistributionFiles,
  findSensitiveText,
  validateNestedPackageDependencies,
  validateCodeqlWorkflow,
  validateCandidateScriptImportClosure,
  validatePublicPackageContract,
  validatePublicModuleSourceBoundary,
  validatePublicDeliveryPackageBoundary,
  validateResolvedSourceClosure,
  validateScorecardWorkflow,
  validateTsconfigPathTargets,
} from './check-oss-distribution.mjs';
import { resolveOssSourceClosure } from './oss-public-source-closure.mjs';

const manifest = {
  packageName: 'morndraft',
  profile: 'oss',
  buildPreset: 'oss-full',
  workspacePackages: ['@morndraft/core'],
  runtimeDependencies: ['react'],
  devDependencies: ['vite'],
  copyFiles: ['scripts/test-oss-e2e.mjs'],
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
      'test:e2e:oss': 'node scripts/test-oss-e2e.mjs --candidate .',
      typecheck: 'tsc --noEmit',
      'build:oss': 'MORNDRAFT_BUILD_PRESET=oss-full vite build',
      'test:e2e:oss:editing': 'node scripts/test-oss-editing-layout.mjs',
      prepublishOnly: "node -e \"throw new Error('not as an npm package')\"",
    },
    dependencies: { react: '^19.0.0' },
    devDependencies: { vite: '^6.0.0' },
  };
}

test('accepts the fail-closed public package contract', () => {
  assert.deepEqual(validatePublicPackageContract({
    filePaths: new Set(manifest.copyFiles),
    packageJson: validPackage(),
    manifest,
  }), []);
});

test('requires OpenSSF write permissions to stay job-scoped', () => {
  const validWorkflow = `permissions: read-all
jobs:
  scorecard:
    permissions:
      contents: read
      security-events: write
      id-token: write
    steps:
      - uses: ossf/scorecard-action@4eaacf0543bb3f2c246792bd56e8cdeffafb205a
      - uses: github/codeql-action/upload-sarif@02c5e83432fe5497fd85b873b6c9f16a8578e1d9
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
  assert.match(validateScorecardWorkflow(invalidWorkflow).join('\n'), /verified v2\.4\.3 commit/);
  assert.match(validateScorecardWorkflow(invalidWorkflow).join('\n'), /verified CodeQL v3\.37\.0 commit/);
});

test('requires CodeQL actions to use the verified commit behind the release tag', () => {
  const validWorkflow = `
steps:
  - uses: github/codeql-action/init@02c5e83432fe5497fd85b873b6c9f16a8578e1d9
  - uses: github/codeql-action/analyze@02c5e83432fe5497fd85b873b6c9f16a8578e1d9
`;
  assert.deepEqual(validateCodeqlWorkflow(validWorkflow), []);
  assert.match(validateCodeqlWorkflow(validWorkflow.replaceAll('02c5e83432fe5497fd85b873b6c9f16a8578e1d9', 'e5d2f324924c57b6cabef9bdd7a1c85d62a89be2')).join('\n'), /verified v3\.37\.0 commit/);
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

test('requires the exact candidate-local OSS E2E command and its declared script file', () => {
  const packageJson = validPackage();
  packageJson.scripts['test:e2e:oss'] = 'node scripts/test-oss-e2e.mjs';
  const findings = validatePublicPackageContract({
    filePaths: new Set(),
    packageJson,
    manifest: { ...manifest, copyFiles: [] },
  });
  assert.match(findings.join('\n'), /test:e2e:oss must be exactly node scripts\/test-oss-e2e\.mjs --candidate \./u);
  assert.match(findings.join('\n'), /must be declared in the positive OSS manifest/u);
  assert.match(findings.join('\n'), /is missing from the OSS candidate/u);
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

test('detects production filesystem, storage credentials, and asset mutation scripts', () => {
  for (const [label, marker] of [
    ['production filesystem or storage credential marker', '/etc/morndraft/prod.env'],
    ['production filesystem or storage credential marker', 'VOLCENGINE_TOS_ACCESS_KEY_SECRET'],
    ['production filesystem or storage credential marker', 'AWS4-HMAC-SHA256'],
    ['production asset mutation marker', 'uploadCommand'],
    ['production asset mutation marker', 'deleteTosObjects'],
  ]) {
    const pattern = SOURCE_MARKER_PATTERNS[label];
    pattern.lastIndex = 0;
    assert.equal(pattern.test(marker), true, marker);
  }
});

test('candidate non-test scripts cannot import missing files or undeclared packages', () => {
  const findings = validateCandidateScriptImportClosure({
    filePaths: new Set([
      'scripts/check-public.mjs',
      'scripts/present.mjs',
    ]),
    manifest,
    scriptSources: {
      'scripts/check-public.mjs': [
        "import './present.mjs';",
        "import './missing-production-helper.mjs';",
        "import { build } from 'esbuild';",
      ].join('\n'),
    },
  });

  assert.match(findings.join('\n'), /missing-production-helper\.mjs/u);
  assert.match(findings.join('\n'), /undeclared OSS dependency esbuild/u);
  assert.doesNotMatch(findings.join('\n'), /present\.mjs/u);
});

test('candidate script closure ignores import-like text inside strings and comments', () => {
  const findings = validateCandidateScriptImportClosure({
    filePaths: new Set(['scripts/test-oss-e2e.mjs']),
    manifest,
    scriptSources: {
      'scripts/test-oss-e2e.mjs': [
        "const css = '@import \"./oss-e2e-nested.css\";'",
        "const fixture = 'export { privateThing } from \"./missing-private.mjs\"';",
        "// import './missing-comment.mjs';",
      ].join('\n'),
    },
  });

  assert.deepEqual(findings, []);
});

test('rejects private application and subsystem imports from the unified public source closure', () => {
  for (const [relativePath, content, expected] of [
    ['apps/web-oss/src/OssShell.tsx', "fetch('/api/delivery/export')", 'private MornDraft API'],
    ['apps/web-oss/src/OssShell.tsx', "import { AuthClient } from '../../../components/auth/client';", 'private subsystem import'],
    ['components/public-workspace/example.ts', "import AppImpl from '../AppImpl';", 'private application component'],
    ['components/public-workspace/billing.ts', "import { createBillingClient } from '../billing/client';", 'private subsystem import'],
    ['components/public-workspace/mcp.ts', 'const client = new MCPClient();', 'private subsystem symbol'],
    ['components/public-workspace/share.ts', 'const client = new HostedLinkClient();', 'private subsystem symbol'],
    ['components/public-workspace/api.ts', "fetch('/api/delivery/export')", 'private MornDraft API'],
    ['packages/web-shell/src/index.ts', "import { DraftStore } from '../../../components/drafts/store';", 'private subsystem import'],
  ]) {
    assert.match(validatePublicModuleSourceBoundary(relativePath, content).join('\n'), new RegExp(expected));
  }
  assert.deepEqual(
    validatePublicModuleSourceBoundary('components/public-workspace/editor.ts', 'const draft = nextSource;'),
    [],
  );
  assert.deepEqual(
    validatePublicModuleSourceBoundary(
      'packages/core/fixtures/public-showcase.js',
      "export const items = ['MCP接入'];",
    ),
    [],
  );
  assert.deepEqual(
    validatePublicModuleSourceBoundary('components/public-workspace/editor.test.ts', 'AppImpl DraftSidebar BillingClient'),
    [],
  );
  assert.match(
    validatePublicModuleSourceBoundary(
      'packages/features-personal/src/ai/unsafe.ts',
      "import { createBillingClient } from '../../../billing/client';",
    ).join('\n'),
    /private subsystem import/u,
  );
  assert.match(
    validatePublicModuleSourceBoundary(
      'packages/public-delivery/src/unsafe.ts',
      "import { createHostedLink } from '../../../components/hosted/client';",
    ).join('\n'),
    /private subsystem import/u,
  );
  assert.match(
    validatePublicModuleSourceBoundary(
      'components/public-workspace/unsafe-core.ts',
      "import { parseDocument } from '@morndraft/core';",
    ).join('\n'),
    /broad @morndraft\/core import/u,
  );
  assert.deepEqual(
    validatePublicModuleSourceBoundary(
      'packages/public-delivery/src/safe.ts',
      "import { capturePreview } from './capture';",
    ),
    [],
  );
  assert.match(
    validatePublicModuleSourceBoundary(
      'utils/resolved-public-helper.ts',
      "fetch('/api/private-helper')",
      { resolvedSource: true },
    ).join('\n'),
    /private MornDraft API/u,
  );
});

test('candidate checker rejects a stale exporter-resolved source closure', () => {
  const closureManifest = {
    copyDirectories: [],
    copyFiles: ['apps/web-oss/src/index.ts', 'components/public-workspace/side-effect.ts'],
    testFiles: [],
  };
  const findings = validateResolvedSourceClosure({
    actualFiles: ['apps/web-oss/src/index.ts', 'components/public-workspace/side-effect.ts'],
    manifest: closureManifest,
    recordedFiles: ['apps/web-oss/src/index.ts'],
  });
  assert.match(findings.join('\n'), /source closure is stale/u);
  assert.match(findings.join('\n'), /components\/public-workspace\/side-effect\.ts/u);
});

test('candidate source closure is recomputed from the checked-out source graph', async () => {
  const projectDir = await mkdtemp(path.join(os.tmpdir(), 'morndraft-oss-source-closure-'));
  try {
    const entryPath = path.join(projectDir, 'apps', 'web-oss', 'src', 'index.ts');
    const sideEffectPath = path.join(projectDir, 'components', 'public-workspace', 'side-effect.ts');
    await mkdir(path.dirname(entryPath), { recursive: true });
    await mkdir(path.dirname(sideEffectPath), { recursive: true });
    await writeFile(entryPath, "import '../../../components/public-workspace/side-effect';\n");
    await writeFile(sideEffectPath, 'globalThis.__ossSideEffect = true;\n');
    await writeFile(path.join(projectDir, 'tsconfig.json'), `${JSON.stringify({
      compilerOptions: { moduleResolution: 'bundler' },
    })}\n`);
    const closureManifest = {
      copyFiles: [
        'apps/web-oss/src/index.ts',
        'components/public-workspace/side-effect.ts',
      ],
      sourceEntrypoints: ['apps/web-oss/src/index.ts'],
    };
    const resolved = await resolveOssSourceClosure({ manifest: closureManifest, projectDir });
    assert.deepEqual(resolved.files, [
      'apps/web-oss/src/index.ts',
      'components/public-workspace/side-effect.ts',
    ]);
  } finally {
    await rm(projectDir, { force: true, recursive: true });
  }
});

test('candidate checker keeps public-delivery framework-agnostic after export', async () => {
  const projectDir = await mkdtemp(path.join(os.tmpdir(), 'morndraft-public-delivery-boundary-'));
  const packageDir = path.join(projectDir, 'packages', 'public-delivery');
  const sourcePath = path.join(packageDir, 'src', 'index.ts');
  try {
    await mkdir(path.dirname(sourcePath), { recursive: true });
    await writeFile(sourcePath, "import type { FC } from 'react';\nexport const value: FC | null = null;\n");
    await writeFile(path.join(packageDir, 'package.json'), `${JSON.stringify({
      dependencies: Object.fromEntries([
        ...PUBLIC_DELIVERY_RUNTIME_DEPENDENCIES.map(name => [name, '1.0.0']),
        ['react', '19.0.0'],
      ]),
    })}\n`);
    const findings = await validatePublicDeliveryPackageBoundary({
      projectDir,
      files: [{
        path: sourcePath,
        relativePath: 'packages/public-delivery/src/index.ts',
      }],
    });
    assert.match(findings.join('\n'), /dependencies must be exactly/u);
    assert.match(findings.join('\n'), /unsupported external packages: react/u);
  } finally {
    await rm(projectDir, { force: true, recursive: true });
  }
});

test('allows only the public personal AI entrance while keeping broad personal imports private', () => {
  const pattern = SOURCE_MARKER_PATTERNS['private workspace package marker'];
  for (const safeMarker of [
    '@morndraft/features-personal/ai',
    'packages/features-personal/src/ai/index.ts',
  ]) {
    pattern.lastIndex = 0;
    assert.equal(pattern.test(safeMarker), false, safeMarker);
  }
  for (const privateMarker of [
    '@morndraft/features-personal',
    '@morndraft/features-personal/editor/TextSearchControl',
    'packages/features-personal/src/index.ts',
    '@morndraft/features-pro',
  ]) {
    pattern.lastIndex = 0;
    assert.equal(pattern.test(privateMarker), true, privateMarker);
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
