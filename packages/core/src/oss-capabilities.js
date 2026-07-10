export const MORNDRAFT_PROFILES = Object.freeze({
  OSS: 'oss',
});

export const MORNDRAFT_CAPABILITIES = Object.freeze({
  HTML_PREVIEW: 'htmlPreview',
});

const OSS_PROFILE_SCOPE = Object.freeze([MORNDRAFT_PROFILES.OSS]);

export const CAPABILITY_DEFINITIONS = Object.freeze({
  [MORNDRAFT_CAPABILITIES.HTML_PREVIEW]: Object.freeze({
    id: MORNDRAFT_CAPABILITIES.HTML_PREVIEW,
    label: 'HTML Preview',
    moduleKey: 'htmlPreview',
    packageName: '@morndraft/core',
    profileScope: OSS_PROFILE_SCOPE,
    buildMode: 'static',
    securityBoundary: 'public-client',
  }),
});

export const PROFILE_CAPABILITIES = Object.freeze({
  [MORNDRAFT_PROFILES.OSS]: Object.freeze([
    MORNDRAFT_CAPABILITIES.HTML_PREVIEW,
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
