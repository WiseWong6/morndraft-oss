import type { DeliveryAccessState } from './deliveryAccess';
import type { DeliveryRequestContext } from './deliveryActionTypes';

export const createPreviewDeliveryRequestContext = (
  activeDraftId: string | null | undefined,
  deliveryAccess: DeliveryAccessState | undefined,
  disableAiAssistUi: boolean,
  enableOssAiProvider: boolean,
  enableOssAiFeatures: boolean,
): DeliveryRequestContext => ({
  draftId: activeDraftId,
  disableAiAssistUi,
  enableOssAiFeatures,
  enableOssAiProvider,
  isDevMode: deliveryAccess?.isDevMode ?? false,
  publicAllOpen: deliveryAccess?.accessMode === 'public-all-open',
  refresh: deliveryAccess?.refresh,
  scenarioId: deliveryAccess?.scenarioId,
});
