const STATIC_ASSET_BASE_URL = typeof __MORNDRAFT_STATIC_ASSET_BASE_URL__ === 'undefined'
  ? ''
  : __MORNDRAFT_STATIC_ASSET_BASE_URL__;

const normalizeRelativeStaticAssetPath = (relativePath: string) => (
  relativePath
    .trim()
    .replace(/^\.\/+/, '')
    .replace(/^\/+/, '')
);

export function resolveMornDraftStaticAssetUrl(relativePath: string): string {
  const normalizedPath = normalizeRelativeStaticAssetPath(relativePath);
  if (!STATIC_ASSET_BASE_URL) return `./${normalizedPath}`;
  return new URL(normalizedPath, STATIC_ASSET_BASE_URL).toString();
}

export function getMornDraftStaticAssetBaseUrl(): string {
  return STATIC_ASSET_BASE_URL;
}
