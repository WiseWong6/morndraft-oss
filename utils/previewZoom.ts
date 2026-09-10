export const PREVIEW_ZOOM_LAYER_ATTRIBUTE = 'data-preview-zoom';

export const PREVIEW_ZOOM_MIN = 0.5;
export const PREVIEW_ZOOM_MAX = 2;
export const PREVIEW_ZOOM_STEP = 0.1;

export const clampPreviewZoom = (value: number) => {
  if (!Number.isFinite(value)) return 1;
  return Math.min(PREVIEW_ZOOM_MAX, Math.max(PREVIEW_ZOOM_MIN, value));
};

// The live preview canvas can be visually zoomed via a `data-preview-zoom`
// layer above the artifact surface. getBoundingClientRect on nodes inside the
// layer returns viewport-scaled values, while offset*/client*/scroll* widths
// stay in the layer's local coordinate space. Capture and fit-to-width math
// must divide rect-based measurements by this factor to stay zoom-agnostic.
export const getPreviewZoomFactorFrom = (element: Element | null | undefined): number => {
  const layer = element?.closest?.(`[${PREVIEW_ZOOM_LAYER_ATTRIBUTE}]`);
  if (!layer) return 1;
  const value = Number.parseFloat(layer.getAttribute(PREVIEW_ZOOM_LAYER_ATTRIBUTE) ?? '');
  return Number.isFinite(value) && value > 0 ? value : 1;
};
