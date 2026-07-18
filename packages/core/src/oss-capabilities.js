// Generated from packages/core/src/capabilities.js by scripts/generate-oss-capabilities.mjs.
// Do not edit this public projection by hand.
export const MORNDRAFT_PROFILES = Object.freeze({
  "OSS": "oss"
});

export const MORNDRAFT_CAPABILITIES = Object.freeze({
  "HTML_PREVIEW": "htmlPreview",
  "ERROR_LINE_NAVIGATION": "errorLineNavigation",
  "ARTIFACT_MAP": "artifactMap",
  "TEXT_SEARCH": "textSearch",
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
    "errorLineNavigation",
    {
      "id": "errorLineNavigation",
      "label": "Error Line Navigation",
      "moduleKey": "errorLineNavigation",
      "packageName": "@morndraft/features-personal",
      "profileScope": [
        "oss"
      ],
      "buildMode": "static",
      "securityBoundary": "public-client"
    }
  ],
  [
    "artifactMap",
    {
      "id": "artifactMap",
      "label": "Artifact Map",
      "moduleKey": "artifactMap",
      "packageName": "@morndraft/features-personal",
      "profileScope": [
        "oss"
      ],
      "buildMode": "lazy",
      "securityBoundary": "public-client"
    }
  ],
  [
    "textSearch",
    {
      "id": "textSearch",
      "label": "Text Search",
      "moduleKey": "textSearch",
      "packageName": "@morndraft/features-personal",
      "profileScope": [
        "oss"
      ],
      "buildMode": "lazy",
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
  "errorLineNavigation",
  "artifactMap",
  "textSearch",
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
