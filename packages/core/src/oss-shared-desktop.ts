// Public-safe core facade used by the shared OSS desktop editor. Keep this
// explicit: adding a private entitlement, account, provider, or server module
// to packages/core/src/index.ts must not widen the OSS source closure.
export * from './ai-instruction-contract.js';
export * from './clipboard-feedback.js';
export * from './oss-capabilities.js';
import { isKnownCapabilityId } from './oss-capabilities.js';
export const createCapabilitySet = (capabilities: readonly string[] | undefined) =>
  new Set(Array.isArray(capabilities) ? capabilities : []);
export const isCapabilityEnabled = (
  enabledCapabilities: readonly string[] | Set<string> | undefined,
  capabilityId: string,
) => {
  if (!isKnownCapabilityId(capabilityId)) return false;
  if (enabledCapabilities instanceof Set) return enabledCapabilities.has(capabilityId);
  return Array.isArray(enabledCapabilities) && enabledCapabilities.includes(capabilityId);
};
export * from './artifact-map.js';
export * from './artifact-correction.js';
export * from './artifact-document-analysis.js';
export * from './code-fence-language.js';
export * from './content-detection.js';
export * from './document-spec.js';
export * from './html-preview-size.js';
export * from './json-error-location.js';
export * from './json-fence-content.js';
export * from './mermaid-label-parser.js';
export * from './mermaid-source.js';
export * from './markdown-lexical-edit.js';
export * from './markdown-source-patch.js';
export * from './morndraft-flat-adapter.js';
export * from './morndraft-flat-default-item.js';
export * from './morndraft-flat-entitlements.js';
export * from './morndraft-flat-source-patch.js';
export * from './morndraft-html-source.js';
export * from './portable-block-header.js';
export * from './portable-artifact-map.js';
export * from './public-morndraft-showcase.js';
export * from './public-standalone-fence.js';
export * from './swiss-catalog-css.js';
export * from './swiss-catalog-renderer.js';
export * from './text-search.js';
export * from './text-metrics.js';
export * from './zoomable-layout.js';
