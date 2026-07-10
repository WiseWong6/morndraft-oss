/* global console, process */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROFILE_CAPABILITIES } from '../packages/core/src/oss-capabilities.js';
import { resolveBuildConfig } from './build-config.mjs';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const findings = [];
const readJson = async (relativePath) => JSON.parse(await readFile(path.join(projectDir, relativePath), 'utf8'));
const profileFiles = (await readdir(path.join(projectDir, 'profiles'))).filter((name) => name.endsWith('.json')).sort();
const expectedProfileFiles = ['build-presets.json', 'oss-public-distribution.json', 'oss.json'].sort();
if (JSON.stringify(profileFiles) !== JSON.stringify(expectedProfileFiles)) {
  findings.push(`profiles must contain only ${expectedProfileFiles.join(', ')}`);
}
const profile = await readJson('profiles/oss.json');
if (profile.id !== 'oss' || profile.appEntry !== 'apps/web-oss' || profile.securityBoundary !== 'public-client') {
  findings.push('profiles/oss.json must describe the public OSS app entry');
}
const expectedAllowedPackages = ['@morndraft/core', '@morndraft/web-shell'];
if (JSON.stringify(profile.allowedPackages ?? []) !== JSON.stringify(expectedAllowedPackages)) findings.push('OSS allowedPackages differ from the public workspace manifest');
if (JSON.stringify(profile.capabilities ?? []) !== JSON.stringify(PROFILE_CAPABILITIES.oss ?? [])) findings.push('OSS capabilities differ from the public registry');
const config = resolveBuildConfig({ projectDir, env: { MORNDRAFT_BUILD_PRESET: 'oss-full' } });
if (config.buildProfile.id !== 'oss' || config.buildProfile.appEntry !== 'apps/web-oss') findings.push('oss-full resolves outside the OSS app entry');
const entry = await readFile(path.join(projectDir, 'apps/web-oss/src/index.ts'), 'utf8');
if (!entry.includes('morndraft-app-entry:web-oss') || !entry.includes('mountMornDraftShell')) findings.push('OSS entry marker or mount is missing');
if (new RegExp('features-(?:pro|ide)|apps/(?:web-pro|ide|admin-data)').test(entry)) findings.push('OSS entry imports a private package or app');
if (findings.length > 0) {
  console.error('[profiles] Public profile violations found:');
  for (const finding of findings) console.error(`- ${finding}`);
  process.exitCode = 1;
} else {
  console.log('[profiles] OSS profile, preset, capability registry, and app entry verified.');
}
