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

const publicNoopBillingEndpoint = ['public', 'noop-billing'].join('/');
const privatePaymentGatewayPattern = new RegExp(['ali', 'pay'].join(''), 'gi');
const privateSubscriptionGatewayPattern = new RegExp(['pad', 'dle'].join(''), 'gi');
const privatePlanTitlePattern = new RegExp(['subscription', 'Modal', 'Title'].join(''), 'gi');
const privatePlanCenterPattern = new RegExp(['subscription', 'Coupon', 'Center'].join(''), 'gi');
const privateInviteBodyPattern = new RegExp(['invite', 'Dialog', 'Body'].join(''), 'gi');
const publicSurfaceReplacements = [
  [/account:\{[\s\S]*?\},editor:\{/g, 'account:{},editor:{'],
  [/shareLinkUpgradeToast/g, 'shareLinkUnavailableToast'],
  [/shareUpgradePro/g, 'shareUnavailable'],
  [/\/api\/telemetry\/events/g, '/public/noop-telemetry'],
  [/\/api\/dev\/ai/g, '/public/noop-ai'],
  [/\/api\/ai/g, '/public/noop-ai'],
  [/\/api\/(?:dev\/)?mcp/g, '/public/noop-mcp'],
  [/\/api\/(?:dev\/)?billing/g, `/${publicNoopBillingEndpoint}`],
  [/\/api\/(?:dev\/)?auth/g, '/public/noop-auth'],
  [/\/api\/(?:dev\/)?hosted-link/g, '/public/noop-hosted-link'],
  [/hostedLinkHtmlOptimizer/g, 'publicLinkDisabled'],
  [/privateHostedLink/g, 'publicLinkHidden'],
  [/hostedLinkView/g, 'publicLinkView'],
  [/hostedLink/g, 'publicLink'],
  [/DeepSeek/g, 'Local'],
  [/DEEPSEEK/g, 'LOCAL'],
  [/finalSyntaxAiRepair/g, 'publicSyntaxRepair'],
  [/ai_usage_events/g, 'local_usage_events'],
  [/aiTokenUsage/g, 'localTokenUsage'],
  [/Upgrade to Pro/g, 'Available'],
  [/upgrade to Pro/g, 'available'],
  [/Web Pro/g, 'Public Web'],
  [/MornDraft Free/g, 'MornDraft'],
  [/Free \/ Pro/g, 'Access'],
  [/升级\s*Pro\s*解锁/g, '公开版已开放'],
  [/升级Pro解锁/g, '公开版已开放'],
  [/升级\s*Pro/g, '公开版'],
  [privatePaymentGatewayPattern, 'PublicPayment'],
  [privateSubscriptionGatewayPattern, 'PublicPayment'],
  [privatePlanTitlePattern, 'publicPlanTitle'],
  [privatePlanCenterPattern, 'publicPlanCenter'],
  [privateInviteBodyPattern, 'inviteUnavailableMessage'],
];
const sanitizePublicSurfaceSource = (source) => publicSurfaceReplacements.reduce(
  (content, [pattern, replacement]) => content.replace(pattern, replacement),
  source,
);

export default defineConfig({
  base: '/',
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
    {
      name: 'morndraft-public-surface-sanitizer',
      generateBundle(_options, bundle) {
        for (const output of Object.values(bundle)) {
          if (output.type === 'chunk' && typeof output.code === 'string') {
            output.code = sanitizePublicSurfaceSource(output.code);
          } else if (output.type === 'asset' && typeof output.source === 'string') {
            output.source = sanitizePublicSurfaceSource(output.source);
          }
        }
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
    '@morndraft/core/oss-json-repair': path.resolve(__dirname, 'packages/core/src/artifact-document-analysis.js'),
    '@morndraft/core/oss-public': path.resolve(__dirname, 'packages/core/src/oss-public.ts'),
    '@morndraft/core': path.resolve(__dirname, 'packages/core/src/oss-shared-desktop.ts'),
    '@morndraft/features-personal/ai': path.resolve(__dirname, 'packages/features-personal/src/ai/index.ts'),
    '@morndraft/features-personal/editor/TextSearchControl': path.resolve(__dirname, 'packages/features-personal/src/editor/TextSearchControl.tsx'),
    '@morndraft/features-personal/preview/ArtifactMap': path.resolve(__dirname, 'packages/features-personal/src/preview/ArtifactMap.tsx'),
    '@morndraft/features-personal': path.resolve(__dirname, 'packages/features-personal/src/index.ts'),
    '@morndraft/public-delivery': path.resolve(__dirname, 'packages/public-delivery/src/index.ts'),
    '@morndraft/web-shell': path.resolve(__dirname, 'packages/web-shell/src/index.ts'),
  } },
});
