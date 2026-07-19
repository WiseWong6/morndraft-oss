import type { RefObject } from 'react';
import {
  isLivePreviewA4LayoutFrozen,
  isInsideLivePreviewSurface,
  shouldRunLivePreviewMutationDiagnostics,
} from './livePreviewSurfaceRegistry';
import {
  PREVIEW_A4_BREAK_EPSILON_PX,
  computePreviewA4PaginationPlanFromFlowItems,
  isPreviewA4AtomicFlowItem,
  type PreviewA4PaginationMetrics,
  type PreviewA4PlannerFlowItem,
} from './previewA4PaginationPlanner';

export {
  PREVIEW_A4_BREAK_EPSILON_PX,
  PREVIEW_A4_PAGE_TOP_EPSILON_PX,
  computePreviewA4PaginationPlanFromFlowItems,
  getPreviewA4HeadingSoftKeepHeight,
  isPreviewA4AtomicFlowItem,
  isPreviewA4HeadingFlowItem,
} from './previewA4PaginationPlanner';

export type {
  PreviewA4PaginationMetrics,
  PreviewA4PlannerFlowItem,
} from './previewA4PaginationPlanner';

export const PREVIEW_A4_WIDTH_PT = 595.28;
export const PREVIEW_A4_HEIGHT_PT = 841.89;
export const PREVIEW_A4_MARGIN_PT = 36;
export const PREVIEW_A4_PAGE_GAP_PX = 44;
export const PREVIEW_A4_DEFAULT_PAGE_WIDTH_PX = 794;

export const PREVIEW_A4_PAGINATION_ATTR = 'data-preview-a4-pagination';
export const PREVIEW_A4_PAGE_COUNT_ATTR = 'data-preview-a4-page-count';
export const PREVIEW_A4_BREAK_ATTR = 'data-preview-a4-break-before';
export const PREVIEW_A4_BREAK_SOURCE_Y_ATTR = 'data-preview-a4-break-source-y';
export const PREVIEW_A4_BREAK_SPACER_ATTR = 'data-preview-a4-break-spacer';
export const PREVIEW_A4_ORIGINAL_MARGIN_TOP_ATTR = 'data-preview-a4-original-margin-top';
export const PREVIEW_A4_LAYOUT_SIGNATURE_ATTR = 'data-preview-a4-layout-signature';

export type ClearPreviewA4Reason =
  | 'disabled'
  | 'surface-disposed'
  | 'test'
  | 'unknown';

type PreviewA4FlowItem = PreviewA4PlannerFlowItem & {
  element: HTMLElement;
};

type PreviewA4BreakPlan = {
  element: HTMLElement;
  sourceY: number;
  spacer: number;
};

type PreviewA4PaginationPlan = PreviewA4PaginationMetrics & {
  flowSignature: string;
  layoutSignature: string;
  markerSignature: string;
  breaks: PreviewA4BreakPlan[];
  minHeight: number;
};

type ElementLayoutSnapshot = {
  element: HTMLElement;
  attributes: Record<string, string | null>;
  style: string | null;
};

type PreviewA4LayoutSnapshot = {
  elementSnapshots: ElementLayoutSnapshot[];
  surfaceAttributes: Record<string, string | null>;
  surfaceStyle: string | null;
};

const A4_SURFACE_ATTRS = [
  PREVIEW_A4_PAGINATION_ATTR,
  PREVIEW_A4_PAGE_COUNT_ATTR,
  PREVIEW_A4_LAYOUT_SIGNATURE_ATTR,
] as const;

const A4_BREAK_ATTRS = [
  PREVIEW_A4_BREAK_ATTR,
  PREVIEW_A4_BREAK_SOURCE_Y_ATTR,
  PREVIEW_A4_BREAK_SPACER_ATTR,
  PREVIEW_A4_ORIGINAL_MARGIN_TOP_ATTR,
] as const;

const A4_FLOW_CONTAINER_CLASS_NAMES = new Set([
  'aad-markdown-lexical-document',
  'aad-markdown-lexical-island',
  'aad-markdown-lexical-island-content',
]);

const isHeadingElement = (element: HTMLElement) =>
  /^H[1-6]$/i.test(element.tagName);

const isAtomicFlowElement = (element: HTMLElement) =>
  isPreviewA4AtomicFlowItem({
    classNames: Array.from(element.classList),
    height: 0,
    naturalBottom: 0,
    naturalTop: 0,
    tagName: element.tagName,
  });

const isVisibleFlowElement = (surface: HTMLElement, child: Element): child is HTMLElement => {
  const view = surface.ownerDocument.defaultView;
  if (!view?.HTMLElement || !(child instanceof view.HTMLElement)) return false;
  if (child.hidden || child.matches('[data-copy-remove="true"]')) return false;
  const style = view.getComputedStyle(child);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  if (style.position === 'absolute' || style.position === 'fixed') return false;
  const rect = child.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
};

const isPreviewA4FlowContainer = (element: HTMLElement) =>
  Array.from(element.classList).some((className) => A4_FLOW_CONTAINER_CLASS_NAMES.has(className));

const collectVisibleFlowChildren = (
  surface: HTMLElement,
  children: HTMLCollection,
  result: HTMLElement[],
) => {
  for (const child of Array.from(children)) {
    if (!isVisibleFlowElement(surface, child)) continue;
    if (isPreviewA4FlowContainer(child) && !isAtomicFlowElement(child)) {
      collectVisibleFlowChildren(surface, child.children, result);
      continue;
    }
    result.push(child);
  }
};

const getVisibleFlowChildren = (surface: HTMLElement) => {
  const result: HTMLElement[] = [];
  collectVisibleFlowChildren(surface, surface.children, result);
  return result;
};

const readNumericAttribute = (element: HTMLElement, attr: string) => {
  const value = Number.parseFloat(element.getAttribute(attr) ?? '');
  return Number.isFinite(value) ? value : 0;
};

const readNumericStyle = (element: HTMLElement, property: string) => {
  const value = Number.parseFloat(element.style.getPropertyValue(property));
  return Number.isFinite(value) ? value : Number.NaN;
};

const roundLayoutValue = (value: number) =>
  Math.round(value * 100) / 100;

const formatLayoutValue = (value: number) =>
  String(roundLayoutValue(value));

export const clearPreviewA4BreakElement = (element: HTMLElement) => {
  const originalMarginTop = element.getAttribute(PREVIEW_A4_ORIGINAL_MARGIN_TOP_ATTR);
  element.style.removeProperty('margin');
  if (originalMarginTop !== null) {
    element.style.marginTop = originalMarginTop;
  } else {
    element.style.removeProperty('margin-top');
  }
  element.removeAttribute(PREVIEW_A4_BREAK_ATTR);
  element.removeAttribute(PREVIEW_A4_BREAK_SOURCE_Y_ATTR);
  element.removeAttribute(PREVIEW_A4_BREAK_SPACER_ATTR);
  element.removeAttribute(PREVIEW_A4_ORIGINAL_MARGIN_TOP_ATTR);
};

export const clearPreviewA4PaginationLayout = (
  surface: HTMLElement | null | undefined,
  options: { reason: ClearPreviewA4Reason } = { reason: 'unknown' },
) => {
  if (!surface) return;
  if (shouldRunLivePreviewMutationDiagnostics() && isInsideLivePreviewSurface(surface)) {
    const isAllowedReason =
      options.reason === 'disabled' ||
      options.reason === 'surface-disposed' ||
      options.reason === 'test';

    if (!isAllowedReason) {
      const breakCount = surface.querySelectorAll<HTMLElement>(`[${PREVIEW_A4_BREAK_ATTR}="true"]`).length;
      console.warn('[preview-a4] clearPreviewA4PaginationLayout', {
        breakCount,
        hasA4Pagination: surface.hasAttribute(PREVIEW_A4_PAGINATION_ATTR),
        isConnected: surface.isConnected,
        isLivePreview: true,
        pageCount: surface.getAttribute(PREVIEW_A4_PAGE_COUNT_ATTR),
        reason: options.reason,
        stack: new Error().stack,
      });
      throw new Error(`[preview-a4] Refusing to clear live A4 layout for reason: ${options.reason}`);
    }
  }

  surface.removeAttribute(PREVIEW_A4_PAGINATION_ATTR);
  surface.removeAttribute(PREVIEW_A4_PAGE_COUNT_ATTR);
  surface.removeAttribute(PREVIEW_A4_LAYOUT_SIGNATURE_ATTR);
  surface.style.removeProperty('--aad-preview-a4-page-width');
  surface.style.removeProperty('--aad-preview-a4-page-height');
  surface.style.removeProperty('--aad-preview-a4-page-margin');
  surface.style.removeProperty('--aad-preview-a4-page-gap');
  surface.style.removeProperty('--aad-preview-a4-page-count');
  surface.style.removeProperty('min-height');
  surface.querySelectorAll<HTMLElement>(`[${PREVIEW_A4_BREAK_ATTR}="true"]`).forEach(clearPreviewA4BreakElement);
};

const buildPreviewA4FlowItems = (
  surface: HTMLElement,
  surfaceRect: DOMRect,
  options: { compensateExistingBreaks?: boolean } = {},
): PreviewA4FlowItem[] => {
  let accumulatedSpacer = 0;
  return getVisibleFlowChildren(surface).map((element) => {
    const rect = element.getBoundingClientRect();
    const ownSpacer = options.compensateExistingBreaks &&
      element.getAttribute(PREVIEW_A4_BREAK_ATTR) === 'true'
      ? readNumericAttribute(element, PREVIEW_A4_BREAK_SPACER_ATTR)
      : 0;
    const offset = options.compensateExistingBreaks
      ? accumulatedSpacer + ownSpacer
      : 0;
    if (options.compensateExistingBreaks) {
      accumulatedSpacer += ownSpacer;
    }
    return {
      classNames: Array.from(element.classList),
      element,
      height: rect.height,
      isAtomic: isAtomicFlowElement(element),
      isHeading: isHeadingElement(element),
      naturalBottom: Math.max(0, rect.bottom - surfaceRect.top - offset),
      naturalTop: Math.max(0, rect.top - surfaceRect.top - offset),
      tagName: element.tagName.toUpperCase(),
    };
  });
};

const applyBreakBefore = (element: HTMLElement, spacer: number, sourceY: number) => {
  if (!element.hasAttribute(PREVIEW_A4_ORIGINAL_MARGIN_TOP_ATTR)) {
    element.setAttribute(PREVIEW_A4_ORIGINAL_MARGIN_TOP_ATTR, element.style.marginTop);
  }
  const originalMarginTop = element.getAttribute(PREVIEW_A4_ORIGINAL_MARGIN_TOP_ATTR) ?? '';
  const computedMarginTop = element.ownerDocument.defaultView?.getComputedStyle(element).marginTop;
  const baseMarginTop = originalMarginTop || computedMarginTop || '0px';
  element.setAttribute(PREVIEW_A4_BREAK_ATTR, 'true');
  element.setAttribute(PREVIEW_A4_BREAK_SOURCE_Y_ATTR, String(Math.max(0, Math.round(sourceY))));
  element.setAttribute(PREVIEW_A4_BREAK_SPACER_ATTR, String(Math.max(0, Math.round(spacer))));
  element.style.removeProperty('margin');
  element.style.marginTop = `calc(${baseMarginTop} + ${spacer}px)`;
};

const buildFlowSignature = (items: PreviewA4FlowItem[]) =>
  items.map((item) => [
    item.element.tagName,
    formatLayoutValue(item.height),
    formatLayoutValue(item.naturalTop),
    formatLayoutValue(item.naturalBottom),
  ].join(':')).join('|');

const buildMarkerSignature = (breaks: PreviewA4BreakPlan[]) =>
  breaks.map((item) => [
    item.element.tagName,
    String(Math.max(0, Math.round(item.sourceY))),
    String(Math.max(0, Math.round(item.spacer))),
  ].join(':')).join('|');

const buildLayoutSignature = (plan: Omit<PreviewA4PaginationPlan, 'layoutSignature'>) =>
  [
    formatLayoutValue(plan.pageWidth),
    formatLayoutValue(plan.pageHeight),
    formatLayoutValue(plan.pageMargin),
    formatLayoutValue(plan.pageGap),
    String(plan.pageCount),
    formatLayoutValue(plan.minHeight),
    plan.flowSignature,
    plan.markerSignature,
  ].join('||');

const readElementLayoutSnapshot = (element: HTMLElement): ElementLayoutSnapshot => ({
  element,
  attributes: Object.fromEntries(
    A4_BREAK_ATTRS.map((attr) => [attr, element.getAttribute(attr)]),
  ),
  style: element.getAttribute('style'),
});

const readPreviewA4LayoutSnapshot = (
  surface: HTMLElement,
  plan: PreviewA4PaginationPlan,
): PreviewA4LayoutSnapshot => {
  const elements = new Set<HTMLElement>([
    ...Array.from(surface.querySelectorAll<HTMLElement>(`[${PREVIEW_A4_BREAK_ATTR}="true"]`)),
    ...plan.breaks.map((item) => item.element),
  ]);
  return {
    elementSnapshots: Array.from(elements).map(readElementLayoutSnapshot),
    surfaceAttributes: Object.fromEntries(
      A4_SURFACE_ATTRS.map((attr) => [attr, surface.getAttribute(attr)]),
    ),
    surfaceStyle: surface.getAttribute('style'),
  };
};

const restoreAttributeSnapshot = (
  element: HTMLElement,
  attributes: Record<string, string | null>,
) => {
  Object.entries(attributes).forEach(([attr, value]) => {
    if (value === null) {
      element.removeAttribute(attr);
    } else {
      element.setAttribute(attr, value);
    }
  });
};

const restoreStyleSnapshot = (element: HTMLElement, style: string | null) => {
  if (style === null) {
    element.removeAttribute('style');
  } else {
    element.setAttribute('style', style);
  }
};

const restorePreviewA4LayoutSnapshot = (
  surface: HTMLElement,
  snapshot: PreviewA4LayoutSnapshot,
) => {
  restoreStyleSnapshot(surface, snapshot.surfaceStyle);
  restoreAttributeSnapshot(surface, snapshot.surfaceAttributes);
  snapshot.elementSnapshots.forEach((item) => {
    restoreStyleSnapshot(item.element, item.style);
    restoreAttributeSnapshot(item.element, item.attributes);
  });
};

const computePreviewA4PaginationPlan = (
  surface: HTMLElement,
): PreviewA4PaginationPlan | null => {
  if (!surface.isConnected) return null;

  const surfaceRect = surface.getBoundingClientRect();
  const pageWidth = surfaceRect.width || surface.clientWidth;
  if (!Number.isFinite(pageWidth) || pageWidth <= 0) return null;

  const pageHeight = pageWidth * (PREVIEW_A4_HEIGHT_PT / PREVIEW_A4_WIDTH_PT);
  const pageMargin = pageWidth * (PREVIEW_A4_MARGIN_PT / PREVIEW_A4_WIDTH_PT);
  const pageGap = PREVIEW_A4_PAGE_GAP_PX;
  const items = buildPreviewA4FlowItems(surface, surfaceRect, { compensateExistingBreaks: true });
  const computedPlan = computePreviewA4PaginationPlanFromFlowItems({
    items,
    pageGap,
    pageHeight,
    pageMargin,
    pageWidth,
  });
  if (!computedPlan) return null;
  const breaks: PreviewA4BreakPlan[] = [];
  for (const item of computedPlan.breaks) {
    const flowItem = items[item.itemIndex];
    if (!flowItem) return null;
    breaks.push({
      element: flowItem.element,
      sourceY: item.sourceY,
      spacer: item.spacer,
    });
  }
  const flowSignature = buildFlowSignature(items);
  const markerSignature = buildMarkerSignature(breaks);
  const planWithoutSignature = {
    breaks,
    flowSignature,
    markerSignature,
    minHeight: computedPlan.minHeight,
    pageContentHeight: computedPlan.pageContentHeight,
    pageCount: computedPlan.pageCount,
    pageGap: computedPlan.pageGap,
    pageHeight: computedPlan.pageHeight,
    pageMargin: computedPlan.pageMargin,
    pageStride: computedPlan.pageStride,
    pageWidth: computedPlan.pageWidth,
  };
  return {
    ...planWithoutSignature,
    layoutSignature: buildLayoutSignature(planWithoutSignature),
  };
};

const hasCommittedPreviewA4Layout = (surface: HTMLElement, plan: PreviewA4PaginationPlan) =>
  surface.hasAttribute(PREVIEW_A4_PAGINATION_ATTR) &&
  surface.getAttribute(PREVIEW_A4_PAGE_COUNT_ATTR) === String(plan.pageCount) &&
  surface.getAttribute(PREVIEW_A4_LAYOUT_SIGNATURE_ATTR) === plan.layoutSignature &&
  Boolean(surface.style.minHeight);

const hasEquivalentCommittedBreakPlan = (surface: HTMLElement, plan: PreviewA4PaginationPlan) => {
  const committedBreaks = Array.from(
    surface.querySelectorAll<HTMLElement>(`[${PREVIEW_A4_BREAK_ATTR}="true"]`),
  );
  if (committedBreaks.length !== plan.breaks.length) return false;
  return plan.breaks.every((item, index) => {
    const committed = committedBreaks[index];
    if (committed !== item.element) return false;
    const committedSourceY = readNumericAttribute(committed, PREVIEW_A4_BREAK_SOURCE_Y_ATTR);
    const committedSpacer = readNumericAttribute(committed, PREVIEW_A4_BREAK_SPACER_ATTR);
    return Math.abs(committedSourceY - item.sourceY) <= PREVIEW_A4_BREAK_EPSILON_PX &&
      Math.abs(committedSpacer - item.spacer) <= PREVIEW_A4_BREAK_EPSILON_PX;
  });
};

const hasEquivalentCommittedPreviewA4Layout = (
  surface: HTMLElement,
  plan: PreviewA4PaginationPlan,
) =>
  surface.hasAttribute(PREVIEW_A4_PAGINATION_ATTR) &&
  surface.getAttribute(PREVIEW_A4_PAGE_COUNT_ATTR) === String(plan.pageCount) &&
  Boolean(surface.style.minHeight) &&
  hasEquivalentCommittedBreakPlan(surface, plan);

const readCommittedPreviewA4Metrics = (surface: HTMLElement): PreviewA4PaginationMetrics | null => {
  if (!surface.hasAttribute(PREVIEW_A4_PAGINATION_ATTR)) return null;
  const pageCount = Number.parseInt(surface.getAttribute(PREVIEW_A4_PAGE_COUNT_ATTR) ?? '', 10);
  const pageWidth = readNumericStyle(surface, '--aad-preview-a4-page-width');
  const pageHeight = readNumericStyle(surface, '--aad-preview-a4-page-height');
  const pageMargin = readNumericStyle(surface, '--aad-preview-a4-page-margin');
  const pageGap = readNumericStyle(surface, '--aad-preview-a4-page-gap');
  if (
    !Number.isFinite(pageCount) ||
    pageCount < 1 ||
    !Number.isFinite(pageWidth) ||
    !Number.isFinite(pageHeight) ||
    !Number.isFinite(pageMargin) ||
    !Number.isFinite(pageGap)
  ) {
    return null;
  }
  const pageStride = pageHeight + pageGap;
  return {
    pageContentHeight: Math.max(1, pageHeight - pageMargin * 2),
    pageCount,
    pageGap,
    pageHeight,
    pageMargin,
    pageStride,
    pageWidth,
  };
};

const applyPreviewA4PaginationPlan = (
  surface: HTMLElement,
  plan: PreviewA4PaginationPlan,
) => {
  surface.querySelectorAll<HTMLElement>(`[${PREVIEW_A4_BREAK_ATTR}="true"]`).forEach(clearPreviewA4BreakElement);

  plan.breaks.forEach((item) => {
    applyBreakBefore(item.element, item.spacer, item.sourceY);
  });

  surface.setAttribute(PREVIEW_A4_PAGINATION_ATTR, 'true');
  surface.setAttribute(PREVIEW_A4_PAGE_COUNT_ATTR, String(plan.pageCount));
  surface.setAttribute(PREVIEW_A4_LAYOUT_SIGNATURE_ATTR, plan.layoutSignature);
  surface.style.setProperty('--aad-preview-a4-page-width', `${plan.pageWidth}px`);
  surface.style.setProperty('--aad-preview-a4-page-height', `${plan.pageHeight}px`);
  surface.style.setProperty('--aad-preview-a4-page-margin', `${plan.pageMargin}px`);
  surface.style.setProperty('--aad-preview-a4-page-gap', `${plan.pageGap}px`);
  surface.style.setProperty('--aad-preview-a4-page-count', String(plan.pageCount));
  surface.style.setProperty('min-height', `${plan.minHeight}px`);
};

export const layoutPreviewA4Pagination = (surface: HTMLElement | null | undefined): PreviewA4PaginationMetrics | null => {
  if (!surface) return null;
  if (isLivePreviewA4LayoutFrozen(surface)) {
    return readCommittedPreviewA4Metrics(surface);
  }

  const plan = computePreviewA4PaginationPlan(surface);
  if (!plan) return null;
  if (
    hasCommittedPreviewA4Layout(surface, plan) ||
    hasEquivalentCommittedPreviewA4Layout(surface, plan)
  ) {
    return {
      pageContentHeight: plan.pageContentHeight,
      pageCount: plan.pageCount,
      pageGap: plan.pageGap,
      pageHeight: plan.pageHeight,
      pageMargin: plan.pageMargin,
      pageStride: plan.pageStride,
      pageWidth: plan.pageWidth,
    };
  }

  const snapshot = readPreviewA4LayoutSnapshot(surface, plan);
  try {
    applyPreviewA4PaginationPlan(surface, plan);
  } catch {
    restorePreviewA4LayoutSnapshot(surface, snapshot);
    return null;
  }
  return {
    pageContentHeight: plan.pageContentHeight,
    pageCount: plan.pageCount,
    pageGap: plan.pageGap,
    pageHeight: plan.pageHeight,
    pageMargin: plan.pageMargin,
    pageStride: plan.pageStride,
    pageWidth: plan.pageWidth,
  };
};

export type PreviewA4PaginationHookInput = {
  enabled: boolean;
  previewRef: RefObject<HTMLElement | null>;
  resetKey: string;
};
