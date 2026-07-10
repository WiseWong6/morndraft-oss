const normalizeSize = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
};

const normalizeScale = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 1;
};

/**
 * @param {{
 *   fullWidth?: boolean,
 *   naturalHeight: number,
 *   naturalWidth: number,
 *   scale: number,
 *   viewportHeight?: number,
 *   viewportWidth: number,
 * }} input
 */
export const getZoomPanLayout = ({
  fullWidth = false,
  naturalHeight,
  naturalWidth,
  scale,
  viewportWidth,
}) => {
  const normalizedScale = normalizeScale(scale);
  const width = normalizeSize(naturalWidth);
  const height = normalizeSize(naturalHeight);
  const viewportX = normalizeSize(viewportWidth);
  const scaledWidth = width > 0 ? Math.ceil(width * normalizedScale) : undefined;
  const scaledHeight = height > 0 ? Math.ceil(height * normalizedScale) : undefined;
  const spacerWidth = scaledWidth === undefined
    ? undefined
    : viewportX > 0 ? Math.max(scaledWidth, viewportX) : scaledWidth;
  const spacerHeight = scaledHeight;
  const visualLeft = scaledWidth === undefined || viewportX <= 0
    ? undefined
    : Math.max(0, Math.floor(((spacerWidth ?? scaledWidth) - scaledWidth) / 2));
  const originOffsetX = width > 0 && scaledWidth !== undefined
    ? Math.floor((scaledWidth - width) / 2)
    : 0;
  const originOffsetY = height > 0 && scaledHeight !== undefined
    ? Math.floor((scaledHeight - height) / 2)
    : 0;
  const contentLeft = visualLeft === undefined ? undefined : visualLeft + originOffsetX;
  const contentTop = originOffsetY;
  const maxScrollLeft = spacerWidth === undefined || viewportX <= 0
    ? undefined
    : Math.max(0, spacerWidth - viewportX);

  return {
    contentLeft,
    contentTop,
    contentWidth: fullWidth && width > 0 ? `${width}px` : fullWidth ? '100%' : undefined,
    maxScrollLeft,
    minSpacerWidth: fullWidth ? '100%' : spacerWidth,
    scaledHeight,
    scaledWidth,
    spacerHeight,
    spacerWidth,
    visualLeft,
  };
};
