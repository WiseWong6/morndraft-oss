// Generated from packages/core/src/capabilities.js by scripts/generate-oss-capabilities.mjs.
// Do not edit this public projection by hand.
export const MORNDRAFT_PROFILES = Object.freeze({
  "OSS": "oss"
});

export const MORNDRAFT_CAPABILITIES = Object.freeze({
  "HTML_PREVIEW": "htmlPreview",
  "PREVIEW_TEXT_EDIT": "previewTextEdit"
});

export const CAPABILITY_DEFINITIONS = Object.freeze(Object.fromEntries([
  [
    "htmlPreview",
    {
      "id": "htmlPreview",
      "label": "HTML Preview",
      "moduleKey": "htmlPreview",
      "packageName": "@morndraft/core",
      "profileScope": [
        "oss"
      ],
      "buildMode": "static",
      "securityBoundary": "public-client"
    }
  ],
  [
    "previewTextEdit",
    {
      "id": "previewTextEdit",
      "label": "Preview Text Edit",
      "moduleKey": "previewTextEdit",
      "packageName": "@morndraft/core",
      "profileScope": [
        "oss"
      ],
      "buildMode": "static",
      "securityBoundary": "public-client"
    }
  ]
].map(
  ([capabilityId, definition]) => [capabilityId, Object.freeze(definition)],
)));

export const PROFILE_CAPABILITIES = Object.freeze({
  [MORNDRAFT_PROFILES.OSS]: Object.freeze([
  "htmlPreview",
  "previewTextEdit"
]),
});

export const isKnownCapabilityId = (capabilityId) =>
  Object.prototype.hasOwnProperty.call(CAPABILITY_DEFINITIONS, capabilityId);

export const resolveCapabilities = (profileId = MORNDRAFT_PROFILES.OSS) => [
  ...(PROFILE_CAPABILITIES[profileId] ?? []),
];

export const normalizeCapabilityList = (capabilities, fallbackCapabilities = []) => {
  const source = Array.isArray(capabilities) ? capabilities : fallbackCapabilities;
  return [...new Set(source.filter(isKnownCapabilityId))];
};

export const createBuildProfile = (profile) => {
  const profileId = profile?.id ?? MORNDRAFT_PROFILES.OSS;
  return Object.freeze({
    id: profileId,
    label: profile?.label ?? profileId,
    appEntry: profile?.appEntry ?? '',
    allowedPackages: Object.freeze([...(profile?.allowedPackages ?? [])]),
    capabilities: Object.freeze(normalizeCapabilityList(
      profile?.capabilities,
      resolveCapabilities(profileId),
    )),
    securityBoundary: profile?.securityBoundary ?? 'public-client',
    status: profile?.status ?? 'active',
  });
};
