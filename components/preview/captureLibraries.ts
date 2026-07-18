import { loadDeliveryCaptureLibraries } from '@morndraft/public-delivery';

export const loadCaptureLibraries = async () => {
  const { domToCanvas, html2canvas } = await loadDeliveryCaptureLibraries();
  return { domToCanvas, html2canvas };
};
