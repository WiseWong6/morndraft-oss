import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { CAPABILITY_DEFINITIONS } from './packages/core/src/oss-capabilities.js';
import { resolveBuildConfig } from './scripts/build-config.mjs';
import { createOssBundleBudgetPlugin, resolveOssManualChunk } from './scripts/oss-bundle-budget.mjs';

const buildConfig = resolveBuildConfig({ projectDir: __dirname, env: process.env });
const buildProfileArtifact = {
  schemaVersion: 1,
  buildPreset: buildConfig.buildPreset,
  profile: buildConfig.buildProfile,
  appEntry: {
    path: buildConfig.buildProfile.appEntry,
    script: buildConfig.appEntryScript,
    marker: buildConfig.appEntryMarker,
  },
  capabilities: buildConfig.selectedCapabilities.map((id) => CAPABILITY_DEFINITIONS[id]),
  releaseOptions: {},
  featureModules: [],
};

export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      name: 'morndraft-oss-app-entry',
      transformIndexHtml: (html) => html.replace('src="/index.tsx"', `src="${buildConfig.appEntryScript}"`),
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'morndraft-build-profile.json',
          source: `${JSON.stringify(buildProfileArtifact, null, 2)}\n`,
        });
      },
    },
    createOssBundleBudgetPlugin(),
  ],
  build: {
    outDir: buildConfig.outDir,
    target: 'esnext',
    sourcemap: false,
    modulePreload: false,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: { manualChunks: resolveOssManualChunk },
    },
  },
  resolve: { alias: {
    '@morndraft/release-app': path.resolve(__dirname, 'apps/web-oss/src/PublicAppImpl.tsx'),
    '@morndraft/core/oss-public': path.resolve(__dirname, 'packages/core/src/oss-public.ts'),
    '@morndraft/features-personal/ai': path.resolve(__dirname, 'packages/features-personal/src/ai/index.ts'),
    '@morndraft/public-delivery': path.resolve(__dirname, 'packages/public-delivery/src/index.ts'),
    '@morndraft/web-shell': path.resolve(__dirname, 'packages/web-shell/src/index.ts'),
  } },
});
