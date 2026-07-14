import {
  createBrowserPublicDeliveryAdapter,
  type PublicDeliveryInput,
} from '@morndraft/public-delivery';

export type PublicDeliveryAction = 'copyImage' | 'downloadImage' | 'downloadPdf' | 'downloadHtml';

const browserPublicDeliveryAdapter = createBrowserPublicDeliveryAdapter();

export const runBrowserPublicDeliveryAction = async (
  action: PublicDeliveryAction,
  input: PublicDeliveryInput,
) => {
  const handler = browserPublicDeliveryAdapter[action];
  if (!handler) throw new Error(`Public delivery action is unavailable: ${action}`);
  await handler(input);
};
