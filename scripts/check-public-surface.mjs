/* global console, process */
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveBuildConfig } from './build-config.mjs';
import { readOssDistributionManifest } from './oss-public-distribution.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, '..');
const buildConfig = resolveBuildConfig({ projectDir, env: process.env });
const distDir = path.resolve(projectDir, buildConfig.outDir);
const artifactPath = path.join(distDir, 'morndraft-build-profile.json');
const distributionManifest = await readOssDistributionManifest(projectDir);
const publicProfiles = new Set(['oss']);
const textExtensions = new Set(['.css', '.html', '.js', '.json', '.svg', '.txt', '.xml']);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const forbiddenMobileShellMarkers = [
  ['Mobile', 'MornDraft', 'Shell'].join(''),
  ['aad', 'mobile', 'shell'].join('-'),
  ['mobile', 'chatbot', 'shell'].join('-'),
  ['data', 'mobile', 'morndraft', 'shell'].join('-'),
];

const privatePaymentGatewayName = ['ali', 'pay'].join('');
const privatePaymentGatewayTitle = `${privatePaymentGatewayName[0].toUpperCase()}${privatePaymentGatewayName.slice(1)}`;
const privatePaymentGatewayMarkers = [
  privatePaymentGatewayName,
  `subscription${privatePaymentGatewayTitle}`,
  `aad-${privatePaymentGatewayName}`,
  `aad-subscription-${privatePaymentGatewayName}`,
  `morndraft.${privatePaymentGatewayName}`,
  ['account', 'billing', privatePaymentGatewayName].join('/'),
  ['', 'api', 'billing'].join('/'),
  ['public', 'noop-billing'].join('/'),
  ['page', 'pay', 'checkout'].join('-'),
  ['Payment', 'Return', 'Page'].join(''),
];

const forbiddenDistPatterns = [
  {
    label: 'private app entry marker',
    pattern: /morndraft-app-entry:(?:admin-data|ide|personal|web-pro)/g,
  },
  {
    label: 'private dependency marker',
    pattern: /(?:@modelcontextprotocol\/sdk|@paddle\/paddle-node-sdk|@alicloud\/(?:dypnsapi20170525|green20220302)|@volcengine\/openapi|better-auth|node-postgres|pg-native|["'`]resend["'`]|node_modules\/resend)/gi,
  },
  {
    label: 'private API surface',
    pattern: /\/api\/(?:dev\/)?(?:ai|auth|billing|hosted-link|internal\/admin-data|mcp|sms|telemetry)\b/gi,
  },
  {
    label: 'private payment gateway marker',
    pattern: new RegExp(`(?:${privatePaymentGatewayMarkers.map(escapeRegExp).join('|')})`, 'gi'),
  },
  {
    label: 'third-party telemetry marker',
    pattern: /(?:google-analytics\.com|googletagmanager\.com|gtag\(|G-0GYD7FWX66|hm\.baidu\.com|_hmt|832c0aa63fe65c887a71252c4c0494aa)/gi,
  },
  {
    label: 'private AI provider or usage marker',
    pattern: /(?:ai_usage_events|aiTokenUsage|usageLedger|AI_USAGE_LEDGER)/g,
  },
  {
    label: 'hosted share link marker',
    pattern: /(?:\/delivery\/hosted-link|hostedLinkHtmlOptimizer|privateHostedLink|HOSTED_LINK_|hostedLinkView|hostedLink|shareLinkUpgradeToast)/g,
  },
  {
    label: 'commercial upgrade copy',
    pattern: /(?:Upgrade to Pro|Web Pro|MornDraft Free|Free \/ Pro|升级\s*Pro|升级Pro)/g,
  },
  {
    label: 'private UI component marker',
    pattern: /(?:PhoneLoginDialog|EntitlementPanelLauncher|FeedbackDrawer|LegalAgreementPage)/g,
  },
  {
    label: 'watermark implementation leak',
    pattern: /addMornDraftWatermarkTo(?:StandaloneHtml|PngBlob|PngCapture)/g,
  },
  {
    label: 'private auth endpoint pattern',
    pattern: /PRIVATE_AUTH_ENDPOINTS|\/api\/(?:me$|auth\/(?:phone-number|sign-out|update-user))\b/g,
  },
  {
    label: 'commercial subscription marker',
    pattern: /subscriptionModalTitle|subscriptionCouponCenter|inviteDialogBody|Paddle|paddle-js|paddle_node/gi,
  },
  {
    label: 'commercial mobile shell marker',
    pattern: new RegExp(`(?:${forbiddenMobileShellMarkers.map(escapeRegExp).join('|')})`, 'g'),
  },
];

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(entryPath));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files;
}

function rel(filePath) {
  return path.relative(projectDir, filePath).split(path.sep).join('/');
}

function relativeDistPath(filePath) {
  return path.relative(distDir, filePath).split(path.sep).join('/');
}

function makeSnippet(content, index) {
  const start = Math.max(0, index - 80);
  const end = Math.min(content.length, index + 120);
  return content.slice(start, end).replace(/\s+/g, ' ').trim();
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function main() {
  const findings = [];
  let optionalProviderPresetMarkers = 0;
  const optionalProviderPresetLimit = Object.values(
    distributionManifest.sourceMarkerAllowances?.['private AI provider or usage marker'] ?? {},
  ).reduce((sum, value) => sum + value, 0);
  const profileId = buildConfig.buildProfile.id;

  if (!publicProfiles.has(profileId)) {
    findings.push(`check:public-surface requires oss profile, got ${profileId}`);
  }

  if (!await exists(artifactPath)) {
    findings.push(`${rel(artifactPath)}: missing build profile artifact; run npm run build:oss first`);
  } else {
    const artifact = await readJson(artifactPath);
    if (artifact.profile?.id !== profileId) {
      findings.push(`${rel(artifactPath)}: profile.id must be ${profileId}`);
    }
    if (artifact.profile?.securityBoundary !== 'public-client') {
      findings.push(`${rel(artifactPath)}: public profile must use public-client boundary`);
    }
    if (artifact.appEntry?.marker !== buildConfig.appEntryMarker) {
      findings.push(`${rel(artifactPath)}: app entry marker must be ${buildConfig.appEntryMarker}`);
    }
  }

  if (!await exists(distDir)) {
    findings.push(`${rel(distDir)}: missing dist directory`);
  } else {
    const files = await collectFiles(distDir);
    for (const filePath of files) {
      if (!textExtensions.has(path.extname(filePath))) continue;
      const content = await readFile(filePath, 'utf8');
      optionalProviderPresetMarkers += content.match(/(?:DeepSeek|DEEPSEEK)/g)?.length ?? 0;
      for (const { label, pattern } of forbiddenDistPatterns) {
        pattern.lastIndex = 0;
        const match = pattern.exec(content);
        if (!match) continue;
        findings.push(`${relativeDistPath(filePath)}: ${label}: ${makeSnippet(content, match.index)}`);
      }
    }
  }

  if (optionalProviderPresetMarkers > optionalProviderPresetLimit) {
    findings.push(
      `dist contains ${optionalProviderPresetMarkers} optional provider preset markers, exceeding the reviewed source allowance ${optionalProviderPresetLimit}`,
    );
  }

  const profile = buildConfig.profile;
  for (const packageName of profile.allowedPackages ?? []) {
    if (packageName === '@morndraft/features-pro' || packageName === '@morndraft/features-ide') {
      findings.push(`profiles/${profileId}.json: public profile must not allow ${packageName}`);
    }
  }
  if (profile.securityBoundary !== 'public-client') {
    findings.push(`profiles/${profileId}.json: securityBoundary must be public-client`);
  }

  if (findings.length > 0) {
    console.error('[public-surface] Public surface violations found:');
    for (const finding of findings) console.error(`- ${finding}`);
    process.exitCode = 1;
    return;
  }

  console.log(`[public-surface] ${profileId} checked at ${rel(distDir)}; no private app, dependency, API, AI, MCP, billing, payment gateway, auth, hosted-link, telemetry, or upgrade markers found.`);
}

await main();
