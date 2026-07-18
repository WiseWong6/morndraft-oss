import { resolveMornDraftFlatLayoutTier } from '@morndraft/core';
import type { ArtifactPreviewTranslations } from '../../i18n';

export type DeliveryQuotaRecord = {
  meter: string;
  limit: number | null;
  used: number;
  reserved: number;
};

export type DeliveryAiTokenUsageSummary = {
  used: number;
  limit: number | null;
  monthStart: string;
};

export type DeliveryEntitlementSummary = {
  account_plan: string;
  apiTokenCounts?: {
    mcp: number;
  };
  aiTokenUsage?: DeliveryAiTokenUsageSummary;
  authState?: 'logged-out' | 'signed-in';
  deliveryPolicies?: {
    image?: DeliveryImageRenderPolicy;
  };
  region: string;
  surfaces: string[];
  entitlements: string[];
  quotas: Record<string, DeliveryQuotaRecord>;
  planCode: string | null;
  subscriptionStatus: string;
  currentPeriodEndsAt?: string | null;
  validUntil: string | null;
};

export type DeliveryAccessMode =
  | 'dev-lab'
  | 'live'
  | 'live-logged-out'
  | 'local-preview-unavailable'
  | 'public-all-open';

export type DeliveryAccessState = {
  accessMode?: DeliveryAccessMode;
  entitlement: DeliveryEntitlementSummary | null;
  isDevMode: boolean;
  isLocalPreviewFallback?: boolean;
  isLoading: boolean;
  isRefreshing?: boolean;
  refresh: () => void | Promise<void>;
  scenarioId?: string;
};

export type PreviewRenderDeliveryAccess = {
  accessMode?: DeliveryAccessMode;
  entitlement: Pick<DeliveryEntitlementSummary, 'account_plan' | 'surfaces' | 'entitlements'> | null;
  isDevMode: boolean;
  isLoading: boolean;
  loginState: 'logged-out' | 'signed-in-or-unknown';
};

export type DeliveryDecision = {
  code:
    | 'checking'
    | 'service-unavailable'
    | 'free-watermark'
    | 'login-required'
    | 'upgrade'
    | 'surface-denied'
    | 'region-denied'
      | 'quota-exhausted'
      | 'allowed';
  isProAllowed: boolean;
  requiresBackendAuthorization?: boolean;
  text: string;
};

type DeliveryDecisionTranslationKey =
  | 'deliveryAccessUnavailable'
  | 'deliveryChecking'
  | 'deliveryFreeWatermark'
  | 'deliveryLoginRequired'
  | 'deliveryProReady'
  | 'deliveryPublicReady'
  | 'deliveryQuotaExhausted'
  | 'deliverySurfaceDenied'
  | 'deliveryUpgradeRequired';

type DeliveryDecisionTranslations = Record<DeliveryDecisionTranslationKey, string>;

export type MornDraftFlatLayoutDecision = {
  code:
    | 'free-allowed'
    | 'checking'
    | 'service-unavailable'
    | 'login-required'
    | 'upgrade'
    | 'surface-denied'
    | 'allowed';
  isAllowed: boolean;
  tier: 'free' | 'pro';
  text: string;
};

export type DeliveryApiResponse = {
  ok?: boolean;
  content?: string;
  fileName?: string;
  hostedLink?: {
    accessCode?: string;
    draftId?: string;
    expiresAt?: string;
    linkId?: string;
    mode?: string;
    status?: 'active' | 'closed' | 'taken_down';
    url?: string;
    visibility?: 'private' | 'password' | 'public';
  };
  policy?: DeliveryImageRenderPolicy;
  url?: string;
  message?: string;
  code?: string;
  error?: {
    code?: string;
    message?: string;
  };
};

export type DeliveryNotice = {
  tone: 'info' | 'success' | 'error';
  text: string;
};

export type DeliveryImageRenderPolicy = {
  renderer: 'browser-capture';
  watermark: boolean;
  outputHeightRatio: number;
  captureScale: number;
  minLongEdge: number;
  maxLongEdge: number | null;
  smoothingQuality: ImageSmoothingQuality;
};

export type FreePdfDeliveryMode = 'none' | 'preserve' | 'watermark';

export type FreeDeliveryArtifactPolicy = {
  bypassImageWatermark: boolean;
  canBypassHtmlExportBlock: boolean;
  freePdfMode: FreePdfDeliveryMode;
  isFreeDeliveryAccount: boolean;
  preserveStandaloneHtmlOutput: boolean;
};

export const DELIVERY_IMAGE_OUTPUT_HEIGHT_RATIO_MIN = 0.25;
export const DELIVERY_IMAGE_OUTPUT_HEIGHT_RATIO_MAX = 1;
export const DELIVERY_IMAGE_CAPTURE_SCALE_MIN = 0.5;
export const DELIVERY_IMAGE_CAPTURE_SCALE_MAX = 4;
export const FREE_WATERMARK_RENDER_ERROR = 'MornDraft Free watermarked image rendering failed';
export const DELIVERY_IMAGE_POLICY_MISSING_ERROR = 'MornDraft delivery image policy is missing';

export const FALLBACK_DELIVERY_IMAGE_RENDER_POLICY: DeliveryImageRenderPolicy = Object.freeze({
  renderer: 'browser-capture',
  watermark: false,
  outputHeightRatio: 0.4,
  captureScale: 2,
  minLongEdge: 1800,
  maxLongEdge: 12000,
  smoothingQuality: 'high',
});

export const PUBLIC_ALL_OPEN_DELIVERY_IMAGE_RENDER_POLICY: DeliveryImageRenderPolicy = Object.freeze({
  renderer: 'browser-capture',
  watermark: false,
  outputHeightRatio: 1,
  captureScale: 2,
  minLongEdge: 1,
  maxLongEdge: null,
  smoothingQuality: 'high',
});

export const PREVIEW_TEXT_EDIT_ENTITLEMENT = 'previewTextEdit';
export const AI_REPAIR_ENTITLEMENT = 'aiRepair';

const isPaidFinalAiRepairAccountPlan = (accountPlan: string) =>
  accountPlan === 'pro' || accountPlan === 'team' || accountPlan === 'enterprise';

export const PUBLIC_ALL_OPEN_ENTITLEMENT: DeliveryEntitlementSummary = Object.freeze({
  account_plan: 'oss',
  apiTokenCounts: { mcp: 0 },
  deliveryPolicies: {
    image: PUBLIC_ALL_OPEN_DELIVERY_IMAGE_RENDER_POLICY,
  },
  region: 'global',
  surfaces: ['web', 'web-pro'],
  entitlements: [
    'basicPreview',
    'longImageExport',
    'morndraftProLayouts',
    PREVIEW_TEXT_EDIT_ENTITLEMENT,
    'proExport',
    'proImport',
  ],
  quotas: {},
  planCode: null,
  subscriptionStatus: 'public',
  currentPeriodEndsAt: null,
  validUntil: null,
});

export const createPublicAllOpenDeliveryAccess = (refresh: () => void | Promise<void> = () => undefined): DeliveryAccessState => ({
  accessMode: 'public-all-open',
  entitlement: PUBLIC_ALL_OPEN_ENTITLEMENT,
  isDevMode: false,
  isLocalPreviewFallback: false,
  isLoading: false,
  refresh,
  scenarioId: 'public-all-open',
});

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const normalizeDeliveryImageRenderPolicy = (
  policy: Partial<DeliveryImageRenderPolicy> | null | undefined,
): DeliveryImageRenderPolicy => {
  const fallback = FALLBACK_DELIVERY_IMAGE_RENDER_POLICY;
  const minLongEdge = Number.isFinite(policy?.minLongEdge)
    ? Math.max(1, Math.round(policy?.minLongEdge ?? fallback.minLongEdge))
    : fallback.minLongEdge;
  const maxLongEdge = policy?.maxLongEdge === null
    ? null
    : Number.isFinite(policy?.maxLongEdge)
      ? Math.max(minLongEdge, Math.round(policy?.maxLongEdge ?? fallback.maxLongEdge ?? minLongEdge))
      : fallback.maxLongEdge;
  const outputHeightRatio = Number.isFinite(policy?.outputHeightRatio)
    ? clamp(
        policy?.outputHeightRatio ?? fallback.outputHeightRatio,
        DELIVERY_IMAGE_OUTPUT_HEIGHT_RATIO_MIN,
        DELIVERY_IMAGE_OUTPUT_HEIGHT_RATIO_MAX,
      )
    : fallback.outputHeightRatio;
  const captureScale = Number.isFinite(policy?.captureScale)
    ? clamp(
        policy?.captureScale ?? fallback.captureScale,
        DELIVERY_IMAGE_CAPTURE_SCALE_MIN,
        DELIVERY_IMAGE_CAPTURE_SCALE_MAX,
      )
    : fallback.captureScale;
  const smoothingQuality = policy?.smoothingQuality === 'low' || policy?.smoothingQuality === 'medium' || policy?.smoothingQuality === 'high'
    ? policy.smoothingQuality
    : fallback.smoothingQuality;

  return {
    renderer: 'browser-capture',
    watermark: Boolean(policy?.watermark ?? fallback.watermark),
    outputHeightRatio,
    captureScale,
    minLongEdge,
    maxLongEdge,
    smoothingQuality,
  };
};

export const requireDeliveryImageRenderPolicy = (body: DeliveryApiResponse): DeliveryImageRenderPolicy => {
  if (!body.policy) throw new Error(DELIVERY_IMAGE_POLICY_MISSING_ERROR);
  return normalizeDeliveryImageRenderPolicy(body.policy);
};

export const resolveDeliveryImageTargetSize = (
  width: number,
  height: number,
  policy: Partial<DeliveryImageRenderPolicy> | null | undefined = FALLBACK_DELIVERY_IMAGE_RENDER_POLICY,
) => {
  const normalized = normalizeDeliveryImageRenderPolicy(policy);
  const sourceWidth = Math.max(1, Math.round(width));
  const sourceHeight = Math.max(1, Math.round(height));
  const sourceLongEdge = Math.max(sourceWidth, sourceHeight);
  if (sourceLongEdge <= normalized.minLongEdge) {
    return {
      width: sourceWidth,
      height: sourceHeight,
      scale: 1,
      targetLongEdge: sourceLongEdge,
    };
  }
  const unclampedTargetLongEdge = Math.round(sourceHeight * normalized.outputHeightRatio);
  const targetLongEdge = normalized.maxLongEdge === null
    ? Math.max(normalized.minLongEdge, unclampedTargetLongEdge)
    : clamp(unclampedTargetLongEdge, normalized.minLongEdge, normalized.maxLongEdge);
  const scale = Math.min(1, targetLongEdge / sourceLongEdge);

  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
    scale,
    targetLongEdge,
  };
};

const isQuotaExhausted = (quota: DeliveryQuotaRecord | undefined) =>
  Boolean(quota && quota.limit !== null && quota.used + quota.reserved >= quota.limit);

type DeliveryAccessLike = DeliveryAccessState | PreviewRenderDeliveryAccess | undefined;

const hasWebSurface = (entitlement: Pick<DeliveryEntitlementSummary, 'surfaces'> | null | undefined) =>
  Boolean(entitlement?.surfaces.some((surface) => surface === 'web' || surface === 'web-pro'));

const isLoggedOutDeliveryAccess = (deliveryAccess: DeliveryAccessLike) => {
  if (!deliveryAccess) return false;
  if (deliveryAccess.accessMode === 'live-logged-out') return true;
  if ('loginState' in deliveryAccess) return deliveryAccess.loginState === 'logged-out';
  return Boolean(deliveryAccess.isDevMode && deliveryAccess.scenarioId?.startsWith('logged-out'));
};

const hasLoggedOutWebSurface = (deliveryAccess: DeliveryAccessLike) => {
  if (!isLoggedOutDeliveryAccess(deliveryAccess)) return false;
  if (hasWebSurface(deliveryAccess?.entitlement)) return true;
  if (deliveryAccess?.entitlement) return false;
  if (deliveryAccess?.accessMode === 'live-logged-out') return true;
  if (!deliveryAccess || !('scenarioId' in deliveryAccess)) return false;
  return Boolean(
    deliveryAccess.isDevMode &&
    deliveryAccess.scenarioId?.startsWith('logged-out') &&
    !deliveryAccess.scenarioId.includes('-ide'),
  );
};

export const canUseLocalEditorImportAssetsByAccess = (deliveryAccess: DeliveryAccessLike) => {
  if (deliveryAccess?.accessMode === 'public-all-open') return true;
  if (deliveryAccess?.isLoading && !deliveryAccess.entitlement) return false;
  return hasLoggedOutWebSurface(deliveryAccess);
};

export const shouldAuthorizeEditorImportByAccess = (deliveryAccess: DeliveryAccessLike) => {
  if (deliveryAccess?.accessMode === 'public-all-open') return false;
  const entitlement = deliveryAccess?.entitlement;
  if (deliveryAccess?.isLoading && !entitlement) return false;
  return hasWebSurface(entitlement) && !isLoggedOutDeliveryAccess(deliveryAccess);
};

export const canUseEditorImportByAccess = (deliveryAccess: DeliveryAccessLike) =>
  canUseLocalEditorImportAssetsByAccess(deliveryAccess) ||
  shouldAuthorizeEditorImportByAccess(deliveryAccess);

export const createPreviewRenderDeliveryAccess = (
  deliveryAccess: DeliveryAccessState | undefined,
): PreviewRenderDeliveryAccess | undefined => {
  if (!deliveryAccess) return undefined;
  const entitlement = deliveryAccess.entitlement
    ? {
        account_plan: deliveryAccess.entitlement.account_plan,
        entitlements: [...deliveryAccess.entitlement.entitlements],
        surfaces: [...deliveryAccess.entitlement.surfaces],
      }
    : null;
  return {
    accessMode: deliveryAccess.accessMode,
    entitlement,
    isDevMode: deliveryAccess.isDevMode,
    isLoading: Boolean(deliveryAccess.isLoading && !entitlement),
    loginState:
      deliveryAccess.accessMode === 'live-logged-out' ||
      (deliveryAccess.isDevMode && deliveryAccess.scenarioId?.startsWith('logged-out'))
        ? 'logged-out'
        : 'signed-in-or-unknown',
  };
};

export const getPreviewRenderDeliveryAccessSignature = (
  deliveryAccess: PreviewRenderDeliveryAccess | undefined,
) => {
  if (!deliveryAccess) return 'no-access';
  const entitlement = deliveryAccess.entitlement;
  return [
    deliveryAccess.isLoading && !entitlement ? 'loading' : 'resolved',
    deliveryAccess.accessMode ?? 'no-mode',
    deliveryAccess.isDevMode ? 'dev' : 'live',
    deliveryAccess.loginState,
    entitlement?.account_plan ?? 'no-plan',
    entitlement?.surfaces.join('|') ?? '',
    entitlement?.entitlements.join('|') ?? '',
  ].join(':');
};

export const arePreviewRenderDeliveryAccessEqual = (
  previous: PreviewRenderDeliveryAccess | undefined,
  next: PreviewRenderDeliveryAccess | undefined,
) => getPreviewRenderDeliveryAccessSignature(previous) === getPreviewRenderDeliveryAccessSignature(next);

type DeliveryApiErrorTranslations = {
  [key: string]: unknown;
  deliveryPayloadTooLarge?: string;
  publicOutputImageUnreviewable?: string;
  publicOutputModerationRejected?: string;
  publicOutputModerationRequestInvalid?: string;
  publicOutputModerationUnavailable?: string;
  shareLinkTooLarge?: string;
};

export const getDeliveryApiErrorCode = (body: DeliveryApiResponse) => body.error?.code ?? body.code ?? '';

export const getDeliveryApiMessage = (
  body: DeliveryApiResponse,
  fallback: string,
  t?: DeliveryApiErrorTranslations,
) => {
  const code = getDeliveryApiErrorCode(body);
  if (code === 'payload_too_large') return t?.deliveryPayloadTooLarge ?? fallback;
  if (code === 'hosted_link_too_large') return t?.shareLinkTooLarge ?? fallback;
  if (code === 'public_output_moderation_rejected') return t?.publicOutputModerationRejected ?? fallback;
  if (code === 'public_output_moderation_request_invalid') return t?.publicOutputModerationRequestInvalid ?? fallback;
  if (code === 'public_output_moderation_unavailable') return t?.publicOutputModerationUnavailable ?? fallback;
  if (code === 'public_output_moderation_required') return t?.publicOutputModerationUnavailable ?? fallback;
  if (code === 'public_output_image_unreviewable') return t?.publicOutputImageUnreviewable ?? fallback;
  return body.error?.message ?? body.message ?? body.error?.code ?? body.code ?? fallback;
};

export const canUsePreviewMarkdownEditingByAccess = (
  deliveryAccess: DeliveryAccessState | undefined,
) => {
  if (deliveryAccess?.accessMode === 'public-all-open') return true;
  const entitlement = deliveryAccess?.entitlement;
  if (isLoggedOutDeliveryAccess(deliveryAccess)) return hasLoggedOutWebSurface(deliveryAccess);
  if (deliveryAccess?.isLoading && !entitlement) return false;
  if (!entitlement) return false;
  return hasWebSurface(entitlement) &&
    entitlement.entitlements.includes(PREVIEW_TEXT_EDIT_ENTITLEMENT);
};

export const canUseFinalAiRepairByAccess = (
  deliveryAccess: DeliveryAccessState | undefined,
) => {
  if (deliveryAccess?.accessMode === 'public-all-open') return false;
  const entitlement = deliveryAccess?.entitlement;
  if (deliveryAccess?.isLoading && !entitlement) return false;
  if (!entitlement) return false;
  if (isLoggedOutDeliveryAccess(deliveryAccess)) return false;
  if (!isPaidFinalAiRepairAccountPlan(entitlement.account_plan)) return false;
  return entitlement.surfaces.includes('web-pro');
};

export const canUseFinalAiRepairByPreviewAccess = (
  deliveryAccess: PreviewRenderDeliveryAccess | undefined,
) => {
  if (deliveryAccess?.accessMode === 'public-all-open') return false;
  const entitlement = deliveryAccess?.entitlement;
  if (deliveryAccess?.isLoading && !entitlement) return false;
  if (!entitlement) return false;
  if (deliveryAccess.loginState === 'logged-out') return false;
  if (!isPaidFinalAiRepairAccountPlan(entitlement.account_plan)) return false;
  return entitlement.surfaces.includes('web-pro');
};

export const resolveFinalRepairModeByPreviewAccess = (
  disableAiAssistUi: boolean,
  renderDeliveryAccess: PreviewRenderDeliveryAccess | undefined,
  aiCandidateRenderDeliveryAccess: PreviewRenderDeliveryAccess | undefined,
): 'ai' | 'deterministic' => (
  !disableAiAssistUi && (
    canUseFinalAiRepairByPreviewAccess(renderDeliveryAccess) ||
    canUseFinalAiRepairByPreviewAccess(aiCandidateRenderDeliveryAccess)
  )
    ? 'ai'
    : 'deterministic'
);

export const isPreviewMarkdownEditingUpgradeRequiredByAccess = (
  deliveryAccess: DeliveryAccessState | undefined,
) => {
  if (deliveryAccess?.accessMode === 'public-all-open') return false;
  const entitlement = deliveryAccess?.entitlement;
  if (deliveryAccess?.isLoading && !entitlement) return false;
  if (!entitlement) return false;
  if (isLoggedOutDeliveryAccess(deliveryAccess)) return false;
  return hasWebSurface(entitlement) &&
    !entitlement.entitlements.includes(PREVIEW_TEXT_EDIT_ENTITLEMENT);
};

export const getDeliveryDecision = (
  deliveryAccess: DeliveryAccessState | undefined,
  t: DeliveryDecisionTranslations,
  operation: 'editorImport' | 'exportHtml' | 'exportImage' | 'exportPdf' | 'hostedLink',
): DeliveryDecision => {
  if (deliveryAccess?.accessMode === 'public-all-open') {
    return {
      code: 'allowed',
      isProAllowed: true,
      requiresBackendAuthorization: false,
      text: t.deliveryPublicReady,
    };
  }
  const entitlement = deliveryAccess?.entitlement;
  if (deliveryAccess?.isLoading && !entitlement) {
    return { code: 'checking', isProAllowed: false, text: t.deliveryChecking };
  }
  if (operation === 'editorImport' && canUseLocalEditorImportAssetsByAccess(deliveryAccess)) {
    return {
      code: 'allowed',
      isProAllowed: true,
      requiresBackendAuthorization: false,
      text: t.deliveryPublicReady,
    };
  }
  if (!entitlement) {
    if (operation === 'editorImport' && isLoggedOutDeliveryAccess(deliveryAccess)) {
      return { code: 'surface-denied', isProAllowed: false, text: t.deliverySurfaceDenied };
    }
    if (isLoggedOutDeliveryAccess(deliveryAccess)) {
      return { code: 'login-required', isProAllowed: false, text: t.deliveryLoginRequired };
    }
    return { code: 'service-unavailable', isProAllowed: false, text: t.deliveryAccessUnavailable };
  }
  if (operation === 'editorImport') {
    if (!hasWebSurface(entitlement)) {
      return { code: 'surface-denied', isProAllowed: false, text: t.deliverySurfaceDenied };
    }
    const requiresBackendAuthorization = shouldAuthorizeEditorImportByAccess(deliveryAccess);
    return {
      code: 'allowed',
      isProAllowed: true,
      requiresBackendAuthorization,
      text: requiresBackendAuthorization ? t.deliveryProReady : t.deliveryPublicReady,
    };
  }
  if (isLoggedOutDeliveryAccess(deliveryAccess)) {
    return { code: 'login-required', isProAllowed: false, text: t.deliveryLoginRequired };
  }
  if (entitlement.account_plan === 'free') {
    return {
      code: operation === 'exportImage' ? 'free-watermark' : 'upgrade',
      isProAllowed: false,
      text: operation === 'exportImage' ? t.deliveryFreeWatermark : t.deliveryUpgradeRequired,
    };
  }
  if (!entitlement.surfaces.includes('web-pro')) {
    return { code: 'surface-denied', isProAllowed: false, text: t.deliverySurfaceDenied };
  }

  const requiredEntitlement = operation === 'exportImage' ? 'longImageExport' : 'proExport';
  const quotaMeter = operation === 'exportImage' ? 'longImageExports' : 'exportJobs';
  if (!entitlement.entitlements.includes(requiredEntitlement)) {
    return { code: 'upgrade', isProAllowed: false, text: t.deliveryUpgradeRequired };
  }
  if (quotaMeter && isQuotaExhausted(entitlement.quotas[quotaMeter])) {
    return { code: 'quota-exhausted', isProAllowed: false, text: t.deliveryQuotaExhausted };
  }
  return { code: 'allowed', isProAllowed: true, requiresBackendAuthorization: true, text: t.deliveryProReady };
};

export const resolveFreeDeliveryArtifactPolicy = ({
  contentType,
  deliveryAccess,
  isPureImageSource,
}: {
  contentType: 'markdown' | 'json' | 'html' | 'mermaid' | 'mixed';
  deliveryAccess: DeliveryAccessState | undefined;
  isPureImageSource: boolean;
}): FreeDeliveryArtifactPolicy => {
  if (deliveryAccess?.accessMode === 'public-all-open') {
    return {
      bypassImageWatermark: true,
      canBypassHtmlExportBlock: true,
      freePdfMode: 'preserve',
      isFreeDeliveryAccount: false,
      preserveStandaloneHtmlOutput: true,
    };
  }
  const isFreeDeliveryAccount = Boolean(
    deliveryAccess?.entitlement?.account_plan === 'free' &&
    !isLoggedOutDeliveryAccess(deliveryAccess),
  );
  const preservesFreeOutputQuality = isFreeDeliveryAccount &&
    (isPureImageSource || contentType === 'html');
  return {
    bypassImageWatermark: isFreeDeliveryAccount && isPureImageSource,
    canBypassHtmlExportBlock: preservesFreeOutputQuality,
    freePdfMode: 'none',
    isFreeDeliveryAccount,
    preserveStandaloneHtmlOutput: isFreeDeliveryAccount,
  };
};

export const getMornDraftFlatLayoutDecision = (
  deliveryAccess: DeliveryAccessState | PreviewRenderDeliveryAccess | undefined,
  t: ArtifactPreviewTranslations,
  layout: string | null | undefined,
  variant: string | null | undefined,
): MornDraftFlatLayoutDecision => {
  const tier = resolveMornDraftFlatLayoutTier({ layout, variant });
  if (deliveryAccess?.accessMode === 'public-all-open') {
    return { code: 'allowed', isAllowed: true, tier, text: t.morndraftComponentPreview };
  }
  // MornDraft components are rendered locally in Preview. Delivery/export actions
  // still perform entitlement, surface, quota, and moderation checks separately.
  return { code: 'allowed', isAllowed: true, tier, text: t.morndraftComponentPreview };
};

export const addMornDraftWatermarkToStandaloneHtml = (html: string, label: string): string => {
  const watermark = `
<style data-morndraft-free-watermark-style>
  [data-morndraft-free-watermark] {
    position: fixed;
    right: 24px;
    bottom: 24px;
    z-index: 2147483647;
    border: 1px solid rgba(15, 23, 42, 0.14);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.82);
    color: rgba(15, 23, 42, 0.72);
    font: 700 14px/1.1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    padding: 8px 12px;
    pointer-events: none;
    box-shadow: 0 10px 30px rgba(15, 23, 42, 0.12);
  }
</style>
<div data-morndraft-free-watermark>${label}</div>`;

  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${watermark}</body>`);
  }
  return `${html}\n${watermark}`;
};

const renderMornDraftWatermarkedPngBlob = async (
  blob: Blob,
  label: string,
  policy: Partial<DeliveryImageRenderPolicy> | null | undefined = FALLBACK_DELIVERY_IMAGE_RENDER_POLICY,
): Promise<{ blob: Blob; height: number; width: number }> => {
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') {
    throw new Error(FREE_WATERMARK_RENDER_ERROR);
  }
  const bitmap = await createImageBitmap(blob);
  try {
    const outputSize = resolveDeliveryImageTargetSize(bitmap.width, bitmap.height, policy);
    const normalizedPolicy = normalizeDeliveryImageRenderPolicy(policy);
    const canvas = document.createElement('canvas');
    canvas.width = outputSize.width;
    canvas.height = outputSize.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error(FREE_WATERMARK_RENDER_ERROR);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = normalizedPolicy.smoothingQuality;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const fontSize = Math.max(18, Math.min(42, Math.round(canvas.width / 24)));
    const padding = Math.round(fontSize * 0.7);
    ctx.font = `700 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    const metrics = ctx.measureText(label);
    const x = Math.max(padding, canvas.width - metrics.width - padding * 2);
    const y = Math.max(padding * 2, canvas.height - padding);
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.fillRect(
      x - padding * 0.7,
      y - fontSize - padding * 0.45,
      metrics.width + padding * 1.4,
      fontSize + padding * 0.8,
    );
    ctx.strokeStyle = 'rgba(15,23,42,0.18)';
    ctx.strokeRect(
      x - padding * 0.7,
      y - fontSize - padding * 0.45,
      metrics.width + padding * 1.4,
      fontSize + padding * 0.8,
    );
    ctx.fillStyle = 'rgba(15,23,42,0.72)';
    ctx.fillText(label, x, y);

    const watermarkedBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((nextBlob) => resolve(nextBlob), 'image/png');
    });
    if (!watermarkedBlob) throw new Error(FREE_WATERMARK_RENDER_ERROR);

    return {
      blob: watermarkedBlob,
      height: canvas.height,
      width: canvas.width,
    };
  } finally {
    bitmap.close();
  }
};

export const addMornDraftWatermarkToPngBlob = async (
  blob: Blob,
  label: string,
  policy: Partial<DeliveryImageRenderPolicy> | null | undefined = FALLBACK_DELIVERY_IMAGE_RENDER_POLICY,
): Promise<Blob> => {
  const rendered = await renderMornDraftWatermarkedPngBlob(blob, label, policy);
  return rendered.blob;
};

export const addMornDraftWatermarkToPngCapture = async <T extends { blob: Blob; height: number; width: number }>(
  capture: T,
  label: string,
  policy: Partial<DeliveryImageRenderPolicy> | null | undefined = FALLBACK_DELIVERY_IMAGE_RENDER_POLICY,
): Promise<T> => {
  const rendered = await renderMornDraftWatermarkedPngBlob(capture.blob, label, policy);
  const pdfPages = (capture as {
    pdfPages?: Array<{ blob: Blob; height: number; width: number }>;
  }).pdfPages;
  const imagePages = (capture as {
    imagePages?: Array<{ blob: Blob; height: number; width: number }>;
  }).imagePages;
  const nextPdfPages = Array.isArray(pdfPages) ? [] : null;
  if (nextPdfPages) {
    for (const page of pdfPages) {
      const nextPage = await renderMornDraftWatermarkedPngBlob(page.blob, label, policy);
      nextPdfPages.push({ ...page, ...nextPage });
    }
  }
  const nextImagePages = Array.isArray(imagePages) ? [] : null;
  if (nextImagePages) {
    for (const page of imagePages) {
      const nextPage = await renderMornDraftWatermarkedPngBlob(page.blob, label, policy);
      nextImagePages.push({ ...page, ...nextPage });
    }
  }

  const scaleY = rendered.height / Math.max(1, capture.height);
  const pageBreakHints = (capture as {
    pageBreakHints?: Array<{ height: number; y: number }>;
  }).pageBreakHints;
  return {
    ...capture,
    blob: rendered.blob,
    height: rendered.height,
    ...(Array.isArray(pageBreakHints) ? {
      pageBreakHints: pageBreakHints.map((hint) => ({
          ...hint,
          height: hint.height * scaleY,
          y: hint.y * scaleY,
        })),
    } : {}),
    ...(nextImagePages ? { imagePages: nextImagePages } : {}),
    ...(nextPdfPages ? { pdfPages: nextPdfPages } : {}),
    width: rendered.width,
  };
};
