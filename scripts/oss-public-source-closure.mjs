import path from 'node:path';
import { build as buildEsbuild } from 'esbuild';

import { normalizeExternalPackageSpecifier } from './oss-public-distribution.mjs';

export const OSS_PUBLIC_WORKSPACE_ALIASES = Object.freeze(new Map([
  ['@morndraft/release-app', 'apps/web-oss/src/PublicAppImpl.tsx'],
  ['@morndraft/core/oss-json-repair', 'packages/core/src/artifact-document-analysis.js'],
  ['@morndraft/core/oss-public', 'packages/core/src/oss-public.ts'],
  ['@morndraft/features-personal/ai', 'packages/features-personal/src/ai/index.ts'],
  ['@morndraft/public-delivery', 'packages/public-delivery/src/index.ts'],
  ['@morndraft/web-shell', 'packages/web-shell/src/index.ts'],
]));

const toRepoPath = (projectDir, filePath) => (
  path.relative(projectDir, filePath).split(path.sep).join('/')
);

const copiedBrowserSourceEntrypoints = (manifest) => manifest.copyFiles.filter(relativePath => (
  /^(?:apps|packages)\//u.test(relativePath)
  && /\.[cm]?[jt]sx?$/u.test(relativePath)
  && !/\.test\.[cm]?[jt]sx?$/u.test(relativePath)
));

export async function resolveOssSourceClosure({ manifest, projectDir }) {
  const result = await buildEsbuild({
    absWorkingDir: projectDir,
    bundle: true,
    entryPoints: [...new Set([
      ...manifest.sourceEntrypoints,
      ...copiedBrowserSourceEntrypoints(manifest),
    ])],
    format: 'esm',
    define: {
      __MORNDRAFT_PRIVATE_SURFACE__: 'false',
      __MORNDRAFT_PUBLIC_RELEASE_SURFACE__: 'true',
    },
    jsx: 'automatic',
    loader: {
      '.css': 'css',
      '.jpeg': 'file',
      '.jpg': 'file',
      '.png': 'file',
      '.svg': 'file',
      '.webp': 'file',
      '.woff': 'file',
      '.woff2': 'file',
    },
    logLevel: 'silent',
    metafile: true,
    outdir: path.join(projectDir, '.vite', 'oss-public-source-closure'),
    packages: 'external',
    platform: 'browser',
    plugins: [{
      name: 'morndraft-oss-public-workspace-aliases',
      setup(build) {
        build.onResolve({ filter: /^@morndraft\// }, (args) => {
          const relativePath = OSS_PUBLIC_WORKSPACE_ALIASES.get(args.path);
          if (!relativePath) {
            return { errors: [{ text: `OSS source imports an undeclared workspace package: ${args.path}` }] };
          }
          return { path: path.join(projectDir, relativePath) };
        });
      },
    }],
    tsconfig: path.join(projectDir, 'tsconfig.json'),
    write: false,
  });

  const files = [];
  for (const input of Object.keys(result.metafile?.inputs ?? {})) {
    if (input.startsWith('<') || input.split('/').includes('node_modules')) continue;
    const absolutePath = path.resolve(projectDir, input);
    const relativePath = toRepoPath(projectDir, absolutePath);
    if (relativePath === '..' || relativePath.startsWith('../')) {
      throw new Error(`OSS source closure escaped the repository: ${input}`);
    }
    files.push(relativePath);
  }

  const externalPackages = new Set();
  for (const output of Object.values(result.metafile?.outputs ?? {})) {
    for (const imported of output.imports ?? []) {
      if (!imported.external) continue;
      const packageName = normalizeExternalPackageSpecifier(imported.path);
      if (packageName) externalPackages.add(packageName);
    }
  }

  return {
    externalPackages: [...externalPackages].sort(),
    files: [...new Set(files)].sort(),
  };
}
