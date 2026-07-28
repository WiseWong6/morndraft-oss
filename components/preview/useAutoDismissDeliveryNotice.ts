import { useEffect } from 'react';
import type { DeliveryNotice } from './deliveryAccess';

export const useAutoDismissDeliveryNotice = (
  deliveryNotice: DeliveryNotice | null,
  setDeliveryNotice: (notice: DeliveryNotice | null) => void,
) => {
  useEffect(() => {
    if (!deliveryNotice) return undefined;
    const timeoutId = window.setTimeout(
      () => setDeliveryNotice(null),
      deliveryNotice.tone === 'error' ? 4200 : 2600,
    );
    return () => window.clearTimeout(timeoutId);
  }, [deliveryNotice, setDeliveryNotice]);
};
