import type { DeliveryAccessState } from './deliveryAccess';
import type { DeliveryRequestContext } from './deliveryActionTypes';

export const createPreviewDeliveryRequestContext = (
  activeDraftId: string | null | undefined,
  deliveryAccess: DeliveryAccessState | undefined,
  disableAiAssistUi: boolean,
  enableOssAiProvider: boolean,
): DeliveryRequestContext => ({
  draftId: activeDraftId,
  disableAiAssistUi,
  enableOssAiProvider,
  isDevMode: deliveryAccess?.isDevMode ?? false,
  publicAllOpen: deliveryAccess?.accessMode === 'public-all-open',
  refresh: deliveryAccess?.refresh,
  scenarioId: deliveryAccess?.scenarioId,
});
