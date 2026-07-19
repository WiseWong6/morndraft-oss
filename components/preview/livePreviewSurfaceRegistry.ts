const livePreviewSurfaces = new WeakSet<HTMLElement>();
const frozenLivePreviewA4Layouts = new WeakMap<HTMLElement, number>();
const A4_PAGINATION_ATTR = 'data-preview-a4-pagination';
const A4_PAGE_COUNT_ATTR = 'data-preview-a4-page-count';
const A4_LAYOUT_SIGNATURE_ATTR = 'data-preview-a4-layout-signature';
const A4_BREAK_SELECTOR = '[data-preview-a4-break-before="true"]';
const A4_BREAK_SPACER_ATTR = 'data-preview-a4-break-spacer';
const A4_BREAK_SOURCE_Y_ATTR = 'data-preview-a4-break-source-y';

type LivePreviewA4Snapshot = {
  breakCount: number;
  breakMarkers: string;
  clientWidth: number;
  contentSignature: string;
  hasA4Pagination: boolean;
  layoutSignature: string | null;
  minHeight: string;
  pageCount: string | null;
};

const SHOW_TEXT_NODE = 4;

const isProductionRuntime = () => {
  const metaEnv = (import.meta as ImportMeta & { env?: { PROD?: boolean } }).env;
  if (metaEnv?.PROD) return true;
  return typeof process !== 'undefined' && process.env?.NODE_ENV === 'production';
};

export const shouldRunLivePreviewMutationDiagnostics = () => !isProductionRuntime();

export const registerLivePreviewSurface = (surface: HTMLElement) => {
  livePreviewSurfaces.add(surface);
};

export const unregisterLivePreviewSurface = (surface: HTMLElement) => {
  livePreviewSurfaces.delete(surface);
};

export const isInsideLivePreviewSurface = (node: HTMLElement | null | undefined) => {
  let current: HTMLElement | null = node ?? null;
  while (current) {
    if (livePreviewSurfaces.has(current)) return true;
    current = current.parentElement;
  }
  return false;
};

export const freezeLivePreviewA4Layout = (surface: HTMLElement | null | undefined) => {
  if (!surface || !isInsideLivePreviewSurface(surface)) return () => undefined;
  const count = frozenLivePreviewA4Layouts.get(surface) ?? 0;
  frozenLivePreviewA4Layouts.set(surface, count + 1);
  return () => {
    const current = frozenLivePreviewA4Layouts.get(surface) ?? 0;
    if (current <= 1) {
      frozenLivePreviewA4Layouts.delete(surface);
    } else {
      frozenLivePreviewA4Layouts.set(surface, current - 1);
    }
  };
};

export const isLivePreviewA4LayoutFrozen = (surface: HTMLElement | null | undefined) =>
  Boolean(surface && frozenLivePreviewA4Layouts.has(surface));

export const assertNotLivePreviewMutationTarget = (
  root: HTMLElement | null | undefined,
  helperName: string,
) => {
  if (!root || !shouldRunLivePreviewMutationDiagnostics()) return;
  if (!isInsideLivePreviewSurface(root)) return;

  const breakCount = root.querySelectorAll('[data-preview-a4-break-before="true"]').length;

  console.error(`[preview-a4] ${helperName} attempted to mutate live preview`, {
    breakCount,
    hasA4Pagination: root.hasAttribute('data-preview-a4-pagination'),
    isConnected: root.isConnected,
    pageCount: root.getAttribute('data-preview-a4-page-count'),
    root,
    stack: new Error().stack,
  });

  throw new Error(`[preview-a4] ${helperName} cannot mutate live preview`);
};

const isComparableTextNode = (node: Node) => {
  const parent = node.parentElement;
  if (!parent) return true;
  return !parent.closest('[data-copy-remove="true"], script, style, noscript, template');
};

const getComparableTextContent = (root: HTMLElement) => {
  const walker = root.ownerDocument.createTreeWalker(root, SHOW_TEXT_NODE);
  let text = '';
  let node = walker.nextNode();
  while (node) {
    if (isComparableTextNode(node)) {
      text += node.textContent ?? '';
    }
    node = walker.nextNode();
  }
  return text;
};

const getContentSignature = (root: HTMLElement) => {
  const text = getComparableTextContent(root);
  const head = text.slice(0, 96);
  const tail = text.slice(Math.max(0, text.length - 96));
  return `${root.childElementCount}:${text.length}:${head}:${tail}`;
};

export const snapshotLivePreviewA4State = (
  root: HTMLElement | null | undefined,
): LivePreviewA4Snapshot | null => {
  if (!root) return null;
  const breakMarkers = Array.from(root.querySelectorAll<HTMLElement>(A4_BREAK_SELECTOR))
    .map((element) => [
      element.tagName,
      element.getAttribute(A4_BREAK_SOURCE_Y_ATTR) ?? '',
      element.getAttribute(A4_BREAK_SPACER_ATTR) ?? '',
      element.style.marginTop,
    ].join(':'))
    .join('|');

  return {
    breakCount: root.querySelectorAll(A4_BREAK_SELECTOR).length,
    breakMarkers,
    clientWidth: root.clientWidth,
    contentSignature: getContentSignature(root),
    hasA4Pagination: root.hasAttribute(A4_PAGINATION_ATTR),
    layoutSignature: root.getAttribute(A4_LAYOUT_SIGNATURE_ATTR),
    minHeight: root.style.minHeight,
    pageCount: root.getAttribute(A4_PAGE_COUNT_ATTR),
  };
};

const shouldCompareLivePreviewA4Snapshots = (
  before: LivePreviewA4Snapshot | null,
  after: LivePreviewA4Snapshot | null,
) => {
  if (!before || !after) return false;
  if (!before.hasA4Pagination && !after.hasA4Pagination) return false;
  if (before.contentSignature !== after.contentSignature) return false;
  if (before.clientWidth !== after.clientWidth) return false;
  return true;
};

export const assertLivePreviewA4SnapshotUnchanged = (
  label: string,
  before: LivePreviewA4Snapshot | null,
  root: HTMLElement | null | undefined,
) => {
  if (!before || !root || !shouldRunLivePreviewMutationDiagnostics()) return;
  if (!isInsideLivePreviewSurface(root)) return;
  const after = snapshotLivePreviewA4State(root);
  if (!shouldCompareLivePreviewA4Snapshots(before, after)) return;

  const changed = Boolean(after && (
    before.hasA4Pagination !== after.hasA4Pagination ||
    before.layoutSignature !== after.layoutSignature ||
    before.pageCount !== after.pageCount ||
    before.minHeight !== after.minHeight ||
    before.breakCount !== after.breakCount ||
    before.breakMarkers !== after.breakMarkers
  ));
  if (!changed) return;

  console.error(`[preview-a4] ${label} changed live A4 pagination`, {
    after,
    before,
    root,
    stack: new Error().stack,
  });
  throw new Error(`[preview-a4] ${label} changed live A4 pagination`);
};

export const createLivePreviewA4SnapshotGuard = (
  root: HTMLElement | null | undefined,
  label: string,
) => {
  if (!root || !isInsideLivePreviewSurface(root)) {
    return { assertUnchanged: () => undefined };
  }
  const releaseFreeze = freezeLivePreviewA4Layout(root);
  const before = shouldRunLivePreviewMutationDiagnostics()
    ? snapshotLivePreviewA4State(root)
    : null;
  return {
    assertUnchanged: () => {
      try {
        if (before) {
          assertLivePreviewA4SnapshotUnchanged(label, before, root);
        }
      } finally {
        releaseFreeze();
      }
    },
  };
};
