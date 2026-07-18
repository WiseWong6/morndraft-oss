export const PREVIEW_CAPTURE_MAX_CANVAS_DIMENSION = 16_384;
export const PREVIEW_CAPTURE_MAX_CANVAS_PIXELS = 16_000_000;

export const normalizePreviewCaptureScale = (captureScale?: number) => {
  const requestedScale = Number.isFinite(captureScale) ? captureScale ?? 2 : 2;
  return Math.max(0.5, Math.min(4, requestedScale));
};

export type PreviewCapturePagePlan = {
  pageCount: number;
  pageHeight: number;
  scale: number;
};

export const resolvePreviewCapturePagePlan = ({
  captureScale,
  height,
  width,
}: {
  captureScale?: number;
  height: number;
  width: number;
}): PreviewCapturePagePlan => {
  const scale = normalizePreviewCaptureScale(captureScale);
  const safeWidth = Math.max(1, Math.ceil(width));
  const safeHeight = Math.max(1, Math.ceil(height));
  const outputWidth = Math.max(1, Math.ceil(safeWidth * scale));
  if (outputWidth > PREVIEW_CAPTURE_MAX_CANVAS_DIMENSION) {
    throw new Error('截图宽度超过浏览器安全上限，请缩小内容宽度后重试。');
  }

  const maxHeightByDimension = Math.floor(PREVIEW_CAPTURE_MAX_CANVAS_DIMENSION / scale);
  const maxHeightByPixels = Math.floor(PREVIEW_CAPTURE_MAX_CANVAS_PIXELS / outputWidth / scale);
  const pageHeight = Math.max(1, Math.min(safeHeight, maxHeightByDimension, maxHeightByPixels));
  return {
    pageCount: Math.max(1, Math.ceil(safeHeight / pageHeight)),
    pageHeight,
    scale,
  };
};

export const exceedsPreviewCapturePixelBudget = ({
  captureScale,
  height,
  width,
}: {
  captureScale?: number;
  height: number;
  width: number;
}) => {
  const scale = normalizePreviewCaptureScale(captureScale);
  const outputWidth = Math.max(1, Math.ceil(width * scale));
  const outputHeight = Math.max(1, Math.ceil(height * scale));
  return outputWidth > PREVIEW_CAPTURE_MAX_CANVAS_DIMENSION ||
    outputHeight > PREVIEW_CAPTURE_MAX_CANVAS_DIMENSION ||
    outputWidth * outputHeight > PREVIEW_CAPTURE_MAX_CANVAS_PIXELS;
};
