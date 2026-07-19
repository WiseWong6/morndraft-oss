export const PREVIEW_A4_BREAK_EPSILON_PX = 2;
export const PREVIEW_A4_PAGE_TOP_EPSILON_PX = 4;

const PREVIEW_A4_HEADING_SOFT_KEEP_MAX_NEXT_RATIO = 0.62;
const PREVIEW_A4_HEADING_SOFT_KEEP_BLANK_RATIO = 0.24;
const PREVIEW_A4_HEADING_SOFT_KEEP_MIN_BLANK_PX = 96;
const PREVIEW_A4_HEADING_SOFT_KEEP_MAX_BLANK_PX = 180;

export type PreviewA4PaginationMetrics = {
  pageContentHeight: number;
  pageCount: number;
  pageGap: number;
  pageHeight: number;
  pageMargin: number;
  pageStride: number;
  pageWidth: number;
};

export type PreviewA4PlannerFlowItem = {
  classNames?: readonly string[];
  height: number;
  isAtomic?: boolean;
  isHeading?: boolean;
  naturalBottom: number;
  naturalTop: number;
  tagName: string;
};

export type PreviewA4PlannerBreakReason =
  | 'overflow'
  | 'heading-soft-keep'
  | 'page-gap-guard';

export type PreviewA4PlannerBreakPlan = {
  itemIndex: number;
  reason: PreviewA4PlannerBreakReason;
  sourceY: number;
  spacer: number;
};

export type PreviewA4PlannerInput = {
  items: readonly PreviewA4PlannerFlowItem[];
  pageGap: number;
  pageHeight: number;
  pageMargin: number;
  pageWidth: number;
};

export type PreviewA4PlannerPlan = PreviewA4PaginationMetrics & {
  breaks: PreviewA4PlannerBreakPlan[];
  minHeight: number;
};

const normalizeTagName = (tagName: string) => String(tagName).trim().toUpperCase();

export const isPreviewA4HeadingFlowItem = (item: PreviewA4PlannerFlowItem) =>
  item.isHeading ?? /^H[1-6]$/i.test(item.tagName);

export const isPreviewA4AtomicFlowItem = (item: PreviewA4PlannerFlowItem) => {
  if (typeof item.isAtomic === 'boolean') return item.isAtomic;
  const tagName = normalizeTagName(item.tagName);
  if (['CANVAS', 'FIGURE', 'IFRAME', 'IMG', 'PRE', 'SVG', 'TABLE'].includes(tagName)) return true;
  const classNames = new Set(item.classNames ?? []);
  return [
    'aad-artifact-block',
    'aad-code-block-wrapper',
    'aad-html-preview-frame',
    'aad-json-viewer',
    'aad-markdown-image-frame',
    'aad-mermaid-block',
  ].some((className) => classNames.has(className));
};

const getHeadingKeepBlankThreshold = (pageContentHeight: number) =>
  Math.min(
    PREVIEW_A4_HEADING_SOFT_KEEP_MAX_BLANK_PX,
    Math.max(
      PREVIEW_A4_HEADING_SOFT_KEEP_MIN_BLANK_PX,
      pageContentHeight * PREVIEW_A4_HEADING_SOFT_KEEP_BLANK_RATIO,
    ),
  );

export const getPreviewA4HeadingSoftKeepHeight = ({
  index,
  item,
  items,
  pageContentHeight,
}: {
  index: number;
  item: PreviewA4PlannerFlowItem;
  items: readonly PreviewA4PlannerFlowItem[];
  pageContentHeight: number;
}) => {
  if (!isPreviewA4HeadingFlowItem(item)) return item.height;
  const next = items[index + 1];
  if (!next || isPreviewA4HeadingFlowItem(next)) return item.height;

  const nextHeight = Math.max(next.height, next.naturalBottom - next.naturalTop);
  const maxReasonableNextHeight = Math.max(
    PREVIEW_A4_HEADING_SOFT_KEEP_MIN_BLANK_PX,
    pageContentHeight * PREVIEW_A4_HEADING_SOFT_KEEP_MAX_NEXT_RATIO,
  );
  if (nextHeight > maxReasonableNextHeight) return item.height;

  const keepHeight = Math.max(item.height, next.naturalBottom - item.naturalTop);
  if (keepHeight > pageContentHeight) return item.height;
  return keepHeight;
};

const shouldSoftBreakHeading = ({
  currentTop,
  index,
  item,
  items,
  pageContentBottom,
  pageContentHeight,
}: {
  currentTop: number;
  index: number;
  item: PreviewA4PlannerFlowItem;
  items: readonly PreviewA4PlannerFlowItem[];
  pageContentBottom: number;
  pageContentHeight: number;
}) => {
  if (!isPreviewA4HeadingFlowItem(item)) return false;
  const itemHeight = Math.max(0, item.height);
  const keepHeight = getPreviewA4HeadingSoftKeepHeight({
    index,
    item,
    items,
    pageContentHeight,
  });
  if (keepHeight <= itemHeight + PREVIEW_A4_BREAK_EPSILON_PX) return false;
  if (currentTop + itemHeight > pageContentBottom + PREVIEW_A4_BREAK_EPSILON_PX) return false;
  if (currentTop + keepHeight <= pageContentBottom + PREVIEW_A4_BREAK_EPSILON_PX) return false;

  const blankIfHeadingMoves = Math.max(0, pageContentBottom - currentTop);
  return blankIfHeadingMoves <= getHeadingKeepBlankThreshold(pageContentHeight);
};

export const computePreviewA4PaginationPlanFromFlowItems = ({
  items,
  pageGap,
  pageHeight,
  pageMargin,
  pageWidth,
}: PreviewA4PlannerInput): PreviewA4PlannerPlan | null => {
  if (
    !Number.isFinite(pageWidth) ||
    !Number.isFinite(pageHeight) ||
    !Number.isFinite(pageMargin) ||
    !Number.isFinite(pageGap) ||
    pageWidth <= 0 ||
    pageHeight <= 0 ||
    pageMargin < 0 ||
    pageGap < 0
  ) {
    return null;
  }

  if (!items.every((item) => (
    Number.isFinite(item.height) &&
    Number.isFinite(item.naturalBottom) &&
    Number.isFinite(item.naturalTop)
  ))) {
    return null;
  }

  const pageStride = pageHeight + pageGap;
  const pageContentHeight = Math.max(1, pageHeight - pageMargin * 2);
  const pageContentBottomOffset = pageHeight - pageMargin;
  const breaks: PreviewA4PlannerBreakPlan[] = [];
  let accumulatedSpacer = 0;
  let contentBottom = pageMargin;

  for (const [index, item] of items.entries()) {
    const height = Math.max(0, item.height);
    let currentTop = item.naturalTop + accumulatedSpacer;
    let pageIndex = Math.max(0, Math.floor(currentTop / pageStride));
    let pageContentTop = pageIndex * pageStride + pageMargin;
    let pageContentBottom = pageIndex * pageStride + pageContentBottomOffset;

    if (currentTop < pageContentTop) {
      const spacer = pageContentTop - currentTop;
      if (spacer > PREVIEW_A4_BREAK_EPSILON_PX) {
        breaks.push({
          itemIndex: index,
          reason: 'page-gap-guard',
          sourceY: item.naturalTop,
          spacer,
        });
        accumulatedSpacer += spacer;
        currentTop += spacer;
      } else {
        currentTop = pageContentTop;
      }
    }

    const isAtPageTop = currentTop <= pageContentTop + PREVIEW_A4_PAGE_TOP_EPSILON_PX;
    const overflowsPage = currentTop + height > pageContentBottom + PREVIEW_A4_BREAK_EPSILON_PX;
    const breakReason: PreviewA4PlannerBreakReason | null = shouldSoftBreakHeading({
      currentTop,
      index,
      item,
      items,
      pageContentBottom,
      pageContentHeight,
    })
      ? 'heading-soft-keep'
      : overflowsPage && !isAtPageTop
        ? 'overflow'
        : null;

    if (breakReason) {
      const nextPageContentTop = (pageIndex + 1) * pageStride + pageMargin;
      const spacer = Math.max(0, nextPageContentTop - currentTop);
      breaks.push({
        itemIndex: index,
        reason: breakReason,
        sourceY: item.naturalTop,
        spacer,
      });
      accumulatedSpacer += spacer;
      currentTop += spacer;
      pageIndex += 1;
      pageContentTop = pageIndex * pageStride + pageMargin;
      pageContentBottom = pageIndex * pageStride + pageContentBottomOffset;
    }

    contentBottom = Math.max(contentBottom, currentTop + height, pageContentTop);
  }

  const pageCount = Math.max(1, Math.ceil((contentBottom + pageGap) / pageStride));
  const minHeight = pageCount * pageHeight + (pageCount - 1) * pageGap;

  return {
    breaks,
    minHeight,
    pageContentHeight,
    pageCount,
    pageGap,
    pageHeight,
    pageMargin,
    pageStride,
    pageWidth,
  };
};
