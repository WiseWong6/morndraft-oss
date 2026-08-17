import type { ArtifactPreviewTranslations } from '../../i18n';

// The OSS build ships a single access mode: every capability is open and runs
// browser-locally. There is no account, plan, entitlement, quota, or licensing
// backend behind it.

export type DeliveryEntitlementSummary = {
  account_plan: string;
  entitlements: string[];
  surfaces: string[];
};

export type DeliveryAccessState = {
  accessMode?: 'public-all-open';
  entitlement: DeliveryEntitlementSummary | null;
  isDevMode: boolean;
  isLoading: boolean;
  refresh: () => void | Promise<void>;
  scenarioId?: string;
};

export type PreviewRenderDeliveryAccess = {
  accessMode?: 'public-all-open';
  entitlement: Pick<DeliveryEntitlementSummary, 'account_plan' | 'surfaces' | 'entitlements'> | null;
  isDevMode: boolean;
  isLoading: boolean;
  loginState: 'logged-out' | 'signed-in-or-unknown';
};

export type DeliveryNotice = {
  tone: 'info' | 'success' | 'error';
  text: string;
};

export type MornDraftFlatLayoutDecision = {
  code: 'allowed';
  isAllowed: true;
  text: string;
};

const PUBLIC_ALL_OPEN_ENTITLEMENT: DeliveryEntitlementSummary = Object.freeze({
  account_plan: 'oss',
  entitlements: [],
  surfaces: ['web'],
});

export const createPublicAllOpenDeliveryAccess = (refresh: () => void | Promise<void> = () => undefined): DeliveryAccessState => ({
  accessMode: 'public-all-open',
  entitlement: PUBLIC_ALL_OPEN_ENTITLEMENT,
  isDevMode: false,
  isLoading: false,
  refresh,
  scenarioId: 'public-all-open',
});

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
    loginState: 'signed-in-or-unknown',
  };
};

const getPreviewRenderDeliveryAccessSignature = (
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

export const canUseLocalEditorImportAssetsByAccess = (
  deliveryAccess: DeliveryAccessState | PreviewRenderDeliveryAccess | undefined,
) => deliveryAccess?.accessMode === 'public-all-open';

export const getMornDraftFlatLayoutDecision = (
  _deliveryAccess: DeliveryAccessState | PreviewRenderDeliveryAccess | undefined,
  t: ArtifactPreviewTranslations,
  _layout: string | null | undefined,
  _variant: string | null | undefined,
): MornDraftFlatLayoutDecision => ({ code: 'allowed', isAllowed: true, text: t.morndraftComponentPreview });
