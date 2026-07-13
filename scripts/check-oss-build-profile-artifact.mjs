/* global console, process */
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CAPABILITY_DEFINITIONS,
  PROFILE_CAPABILITIES,
} from '../packages/core/src/oss-capabilities.js';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(projectDir, 'dist', 'oss');
const artifactPath = path.join(distDir, 'morndraft-build-profile.json');
const expectedCapabilities = PROFILE_CAPABILITIES.oss;
const expectedAllowedPackages = [
  '@morndraft/core',
  '@morndraft/features-personal',
  '@morndraft/public-delivery',
  '@morndraft/web-shell',
];
const expectedAppEntryMarker = 'morndraft-app-entry:web-oss';

const arrayEquals = (left, right) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

function pushIf(findings, condition, message) {
  if (condition) findings.push(message);
}

async function collectJsFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectJsFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(entryPath);
    }
  }
  return files;
}

async function main() {
  try {
    if (!(await stat(artifactPath)).isFile()) throw new Error('not a file');
  } catch {
    console.error(`[oss-build-profile] Missing build profile artifact: ${artifactPath}`);
    process.exitCode = 1;
    return;
  }

  const artifact = JSON.parse(await readFile(artifactPath, 'utf8'));
  const findings = [];
  pushIf(findings, artifact.schemaVersion !== 1, 'schemaVersion must be 1');
  pushIf(findings, artifact.buildPreset?.id !== 'oss-full', 'buildPreset.id must be oss-full');
  pushIf(findings, artifact.profile?.id !== 'oss', 'profile.id must be oss');
  pushIf(findings, artifact.profile?.appEntry !== 'apps/web-oss', 'profile.appEntry must be apps/web-oss');
  pushIf(
    findings,
    !arrayEquals(artifact.profile?.allowedPackages ?? [], expectedAllowedPackages),
    `profile.allowedPackages must equal ${expectedAllowedPackages.join(', ')}`,
  );
  pushIf(
    findings,
    !arrayEquals(artifact.profile?.capabilities ?? [], expectedCapabilities),
    `profile.capabilities must equal ${expectedCapabilities.join(', ')}`,
  );
  pushIf(findings, artifact.appEntry?.path !== 'apps/web-oss', 'appEntry.path must be apps/web-oss');
  pushIf(findings, artifact.appEntry?.script !== '/apps/web-oss/src/index.ts', 'appEntry.script must be the OSS entry');
  pushIf(findings, artifact.appEntry?.marker !== expectedAppEntryMarker, 'appEntry.marker must be the OSS marker');
  pushIf(findings, (artifact.featureModules ?? []).length !== 0, 'featureModules must be empty');

  const expectedDefinitions = expectedCapabilities.map(capabilityId => CAPABILITY_DEFINITIONS[capabilityId]);
  pushIf(
    findings,
    JSON.stringify(artifact.capabilities ?? []) !== JSON.stringify(expectedDefinitions),
    'capabilities must exactly match the minimal OSS registry',
  );

  let appEntryMarkerFound = false;
  for (const filePath of await collectJsFiles(distDir)) {
    const content = await readFile(filePath, 'utf8');
    if (content.includes(expectedAppEntryMarker)) appEntryMarkerFound = true;
  }
  pushIf(findings, !appEntryMarkerFound, `JS bundle is missing ${expectedAppEntryMarker}`);

  if (findings.length > 0) {
    console.error('[oss-build-profile] Public build profile violations found:');
    for (const finding of findings) console.error(`- ${finding}`);
    process.exitCode = 1;
    return;
  }

  console.log('[oss-build-profile] Minimal OSS capability registry and app entry verified.');
}

await main();
