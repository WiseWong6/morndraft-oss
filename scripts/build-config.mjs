/* global process */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createBuildProfile, MORNDRAFT_PROFILES } from '../packages/core/src/oss-capabilities.js';

export const PROFILE_ALIASES = Object.freeze({ oss: MORNDRAFT_PROFILES.OSS });
export const APP_ENTRY_MARKERS = Object.freeze({ 'apps/web-oss': 'morndraft-app-entry:web-oss' });
export const RELEASE_RESTRICTION_ENV_KEYS = Object.freeze({});

const readJson = (filePath) => JSON.parse(readFileSync(filePath, 'utf8'));
export function loadBuildPresets(projectDir) {
  const value = readJson(path.join(projectDir, 'profiles', 'build-presets.json'));
  if (value.schemaVersion !== 1 || !Array.isArray(value.presets)) {
    throw new Error('profiles/build-presets.json must use schemaVersion 1 and a presets array');
  }
  return value.presets;
}
export const resolveDefaultProfileForPackage = () => MORNDRAFT_PROFILES.OSS;
export const resolveDefaultProfile = () => MORNDRAFT_PROFILES.OSS;

/** @param {{ projectDir: string; env?: NodeJS.ProcessEnv }} options */
export function resolveBuildConfig({ projectDir, env = process.env }) {
  if (!projectDir) throw new Error('resolveBuildConfig requires projectDir');
  const forbiddenOverrides = ['MORNDRAFT_PROFILE', 'MORNDRAFT_CAPABILITIES', 'MORNDRAFT_DIST_DIR']
    .filter((key) => env[key] !== undefined);
  if (forbiddenOverrides.length > 0) {
    throw new Error(`The OSS release preset owns its build boundary; remove env override(s): ${forbiddenOverrides.join(', ')}`);
  }
  const presetId = env.MORNDRAFT_BUILD_PRESET ?? 'oss-full';
  if (presetId !== 'oss-full') throw new Error(`Unknown MORNDRAFT_BUILD_PRESET ${presetId}`);
  const preset = loadBuildPresets(projectDir).find((entry) => entry.id === 'oss-full');
  if (!preset || preset.profile !== 'oss' || preset.appEntry && preset.appEntry !== 'apps/web-oss') {
    throw new Error('The public distribution requires the oss-full -> apps/web-oss preset');
  }
  const profile = readJson(path.join(projectDir, 'profiles', 'oss.json'));
  const buildProfile = createBuildProfile(profile);
  if (buildProfile.id !== 'oss' || buildProfile.appEntry !== 'apps/web-oss') {
    throw new Error('The public distribution only accepts the OSS app entry');
  }
  return Object.freeze({
    buildPreset: Object.freeze({ id: 'oss-full', label: preset.label ?? 'OSS full release' }),
    buildProfile,
    releaseRestrictions: null,
    profile,
    outDir: preset.outDir ?? 'dist/oss',
    selectedCapabilities: [...buildProfile.capabilities],
    appEntryScript: '/apps/web-oss/src/index.ts',
    appEntryMarker: 'morndraft-app-entry:web-oss',
  });
}
