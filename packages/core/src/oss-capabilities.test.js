import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CAPABILITY_DEFINITIONS,
  MORNDRAFT_CAPABILITIES,
  MORNDRAFT_PROFILES,
  PROFILE_CAPABILITIES,
  createBuildProfile,
} from './oss-capabilities.js';

test('OSS capability registry exposes only the mounted HTML preview capability', () => {
  assert.deepEqual(Object.keys(CAPABILITY_DEFINITIONS), ['htmlPreview']);
  assert.deepEqual(PROFILE_CAPABILITIES.oss, ['htmlPreview']);
  assert.deepEqual(CAPABILITY_DEFINITIONS.htmlPreview, {
    id: MORNDRAFT_CAPABILITIES.HTML_PREVIEW,
    label: 'HTML Preview',
    moduleKey: 'htmlPreview',
    packageName: '@morndraft/core',
    profileScope: [MORNDRAFT_PROFILES.OSS],
    buildMode: 'static',
    securityBoundary: 'public-client',
  });
});

test('OSS build profile drops undeclared capabilities and preserves the public package boundary', () => {
  const profile = createBuildProfile({
    id: 'oss',
    appEntry: 'apps/web-oss',
    allowedPackages: ['@morndraft/core', '@morndraft/web-shell'],
    capabilities: ['htmlPreview', 'artifactMap'],
  });

  assert.deepEqual(profile.allowedPackages, ['@morndraft/core', '@morndraft/web-shell']);
  assert.deepEqual(profile.capabilities, ['htmlPreview']);
});
