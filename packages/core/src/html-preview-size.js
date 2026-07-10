export function resolveMeasuredHtmlPreviewExtent({
  contentExtent,
  scrollExtent,
  rectExtent,
  viewportExtent,
  minExtent = 1,
}) {
  const VIEWPORT_FEEDBACK_TOLERANCE = 160;
  const sanitize = (value) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.ceil(number) : 0;
  };

  const content = sanitize(contentExtent);
  const scroll = sanitize(scrollExtent);
  const rect = sanitize(rectExtent);
  const viewport = sanitize(viewportExtent);
  const minimum = Math.max(1, sanitize(minExtent) || 1);
  const candidates = [minimum, content];
  const isViewportFeedbackExtent = (extent) => {
    if (viewport <= 0 || content <= 0 || content >= extent) return false;
    const viewportDelta = Math.abs(extent - viewport);
    return (
      viewportDelta <= 1 ||
      (content <= viewport && viewportDelta <= VIEWPORT_FEEDBACK_TOLERANCE)
    );
  };

  if (scroll > 0) {
    if (!isViewportFeedbackExtent(scroll)) candidates.push(scroll);
  }

  if (rect > 0) {
    if (!isViewportFeedbackExtent(rect)) candidates.push(rect);
  }

  return Math.max(...candidates);
}

export function resolveMeasuredHtmlPreviewWidth({
  contentExtent,
  scrollExtent,
  rectExtent,
  visualExtent,
  viewportExtent,
  minExtent = 1,
}) {
  return resolveMeasuredHtmlPreviewWidthReport({
    contentExtent,
    scrollExtent,
    rectExtent,
    visualExtent,
    viewportExtent,
    minExtent,
  }).width;
}

export function resolveMeasuredHtmlPreviewWidthReport({
  contentExtent,
  scrollExtent,
  rectExtent,
  visualExtent,
  viewportExtent,
  minExtent = 1,
}) {
  const VIEWPORT_FEEDBACK_TOLERANCE = 96;
  const sanitize = (value) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.ceil(number) : 0;
  };

  const minimum = Math.max(1, sanitize(minExtent) || 1);
  const content = sanitize(contentExtent);
  const scroll = sanitize(scrollExtent);
  const rect = sanitize(rectExtent);
  const visual = sanitize(visualExtent);
  const viewport = sanitize(viewportExtent);
  const candidates = [{ width: minimum, source: 'minimum' }];

  const isViewportFeedbackWidth = (extent) => {
    if (viewport <= 0 || extent <= 0) return false;
    const contentAnchor = Math.max(content, minimum);
    if (extent <= contentAnchor) return false;
    const viewportDelta = Math.abs(extent - viewport);
    return (
      viewportDelta <= 1 ||
      (contentAnchor <= viewport && viewportDelta <= VIEWPORT_FEEDBACK_TOLERANCE)
    );
  };

  if (content > 0) candidates.push({ width: content, source: 'content' });

  [
    { width: visual, source: 'visual' },
    { width: scroll, source: 'scroll' },
    { width: rect, source: 'rect' },
  ].forEach((candidate) => {
    if (candidate.width <= 0) return;
    if (isViewportFeedbackWidth(candidate.width)) return;
    candidates.push(candidate);
  });

  const selected = candidates.reduce((best, candidate) => (
    candidate.width > best.width ? candidate : best
  ), candidates[0]);
  const hasViewportSizedMeasure = viewport > 0 && [content, visual, scroll, rect].some((width) => (
    width > 0 && Math.abs(width - viewport) <= 1
  ));
  const hasNonViewportOverflow = viewport > 0 && (
    content > viewport + 1 ||
    [visual, scroll, rect].some((width) => (
      width > viewport + 1 && !isViewportFeedbackWidth(width)
    ))
  );
  const isSelectedViewportBound = (
    viewport > 0 &&
    selected.width > 0 &&
    hasViewportSizedMeasure &&
    Math.abs(selected.width - viewport) <= 1 &&
    !hasNonViewportOverflow
  );

  return {
    width: selected.width,
    widthKind:
      selected.source === 'minimum' || isSelectedViewportBound
        ? 'viewport-feedback'
        : 'content',
  };
}

export function resolveHtmlPreviewFitDimensions({
  contentWidth,
  contentHeight,
  availableWidth,
  minHeight = 1,
  maxHeight = Number.POSITIVE_INFINITY,
  minScale = 0,
  widthMode = 'natural',
}) {
  const sanitize = (value) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.ceil(number) : 0;
  };
  const sanitizeScale = (value) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
  };
  const normalizeHeight = (value) => {
    const height = sanitize(value);
    const minimum = Math.max(1, sanitize(minHeight) || 1);
    const maximum = sanitize(maxHeight) || Number.POSITIVE_INFINITY;
    return Math.min(maximum, Math.max(minimum, height || minimum));
  };

  const naturalWidth = sanitize(contentWidth);
  const naturalHeight = normalizeHeight(contentHeight);
  const stageWidth = sanitize(availableWidth);
  const shouldFillAvailableWidth = widthMode === 'fill';

  if (!naturalWidth || !stageWidth) {
    return {
      scale: 1,
      iframeWidth: null,
      renderedWidth: null,
      renderedHeight: naturalHeight,
    };
  }

  const rawScale = naturalWidth > stageWidth ? stageWidth / naturalWidth : 1;
  const minimumScale = sanitizeScale(minScale);
  const scale = Math.min(1, minimumScale > 0 ? Math.max(minimumScale, rawScale) : rawScale);
  const iframeWidth = shouldFillAvailableWidth && naturalWidth <= stageWidth
    ? stageWidth
    : naturalWidth;
  const renderedWidth = Math.min(stageWidth, Math.ceil(iframeWidth * scale));
  const renderedHeight = normalizeHeight(naturalHeight * scale);

  return {
    scale: Number(scale.toFixed(6)),
    iframeWidth,
    renderedWidth,
    renderedHeight,
  };
}

export function shouldCommitHtmlPreviewSize({
  currentHeight,
  currentWidth,
  hasSettled,
  heightEpsilon = 4,
  nextHeight,
  nextWidth,
  widthEpsilon = 4,
}) {
  if (!hasSettled) return true;
  const sanitize = (value) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
  };

  return (
    Math.abs(sanitize(nextHeight) - sanitize(currentHeight)) > heightEpsilon ||
    Math.abs(sanitize(nextWidth) - sanitize(currentWidth)) > widthEpsilon
  );
}

export function resolveStableHtmlPreviewSize({
  currentHeight,
  currentWidth,
  heightEpsilon = 4,
  heightKind = 'content',
  hasSettled,
  nextHeight,
  nextWidth,
  widthKind = 'content',
  widthEpsilon = 4,
}) {
  const sanitizeHeight = (value) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.ceil(number) : 0;
  };
  const sanitizeWidth = (value) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.ceil(number) : 0;
  };
  const currentStableHeight = sanitizeHeight(currentHeight);
  const nextStableHeight = sanitizeHeight(nextHeight);
  const current = sanitizeWidth(currentWidth);
  const next = sanitizeWidth(nextWidth);
  const isViewportFeedbackHeight = (
    hasSettled &&
    currentStableHeight > 0 &&
    Math.abs(nextStableHeight - currentStableHeight) > heightEpsilon &&
    (heightKind === 'viewport-feedback' || widthKind === 'viewport-feedback')
  );

  return {
    height: isViewportFeedbackHeight
      ? currentHeight
      : nextHeight,
    width: hasSettled && current > 0 && (next <= 0 || next < current - widthEpsilon)
      ? currentWidth
      : nextWidth,
  };
}
