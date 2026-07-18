import { resolveMeasuredHtmlPreviewExtent } from '../../utils/html-preview-size.js';

const SHOW_TEXT_NODE_FILTER = 4;
const CLIPPING_OVERFLOW_VALUES = new Set(['auto', 'clip', 'hidden', 'scroll']);

type HtmlDocumentMeasuredRect = {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
};

const hasClippingOverflow = (style: CSSStyleDeclaration) => (
  CLIPPING_OVERFLOW_VALUES.has(style.overflow) ||
  CLIPPING_OVERFLOW_VALUES.has(style.overflowX) ||
  CLIPPING_OVERFLOW_VALUES.has(style.overflowY)
);

const clipRectToVisibleAncestors = (
  rect: DOMRect,
  ownerElement: Element | null,
  body: HTMLElement,
  html: HTMLElement,
  view: Window | null,
): HtmlDocumentMeasuredRect | null => {
  if (!rect || (rect.width === 0 && rect.height === 0)) return null;
  let top = rect.top;
  let bottom = rect.bottom;
  let left = rect.left;
  let right = rect.right;
  let current = ownerElement?.parentElement ?? null;

  while (current && current !== body && current !== html) {
    const style = view?.getComputedStyle(current);
    if (style && hasClippingOverflow(style)) {
      const clipRect = current.getBoundingClientRect();
      top = Math.max(top, clipRect.top);
      bottom = Math.min(bottom, clipRect.bottom);
      left = Math.max(left, clipRect.left);
      right = Math.min(right, clipRect.right);
      if (bottom <= top || right <= left) return null;
    }
    current = current.parentElement;
  }

  return {
    bottom,
    height: Math.max(0, bottom - top),
    left,
    right,
    top,
    width: Math.max(0, right - left),
  };
};

export const resolveHtmlDocumentMeasuredHeight = ({
  contentExtent,
  rectExtent,
  scrollExtent,
  viewportExtent,
}: {
  contentExtent: number;
  rectExtent: number;
  scrollExtent: number;
  viewportExtent: number;
}) => Math.max(0, resolveMeasuredHtmlPreviewExtent({
  contentExtent,
  rectExtent,
  scrollExtent,
  viewportExtent,
}));

export const measureHtmlDocumentContentHeight = (doc: Document) => {
  const body = doc.body;
  const html = doc.documentElement;
  if (!body || !html) return 0;
  let hasRect = false;
  let minTop = 0;
  let maxBottom = 0;
  const collectRect = (rect: DOMRect, ownerElement: Element | null) => {
    const clippedRect = clipRectToVisibleAncestors(rect, ownerElement, body, html, doc.defaultView);
    if (!clippedRect) return;
    if (!hasRect) {
      minTop = clippedRect.top;
      maxBottom = clippedRect.bottom;
      hasRect = true;
      return;
    }
    minTop = Math.min(minTop, clippedRect.top);
    maxBottom = Math.max(maxBottom, clippedRect.bottom);
  };

  body.querySelectorAll('*').forEach((node) => {
    if (node.tagName === 'SCRIPT') return;
    collectRect(node.getBoundingClientRect(), node);
  });

  const walker = doc.createTreeWalker(body, SHOW_TEXT_NODE_FILTER);
  const range = doc.createRange();
  while (walker.nextNode()) {
    const textNode = walker.currentNode;
    if (!textNode.textContent?.trim()) continue;
    range.selectNodeContents(textNode);
    Array.from(range.getClientRects()).forEach((rect) => collectRect(rect, textNode.parentElement));
  }
  range.detach();

  const paddingBottom = Number.parseFloat(doc.defaultView?.getComputedStyle(body).paddingBottom ?? '') || 0;
  const bodyRect = body.getBoundingClientRect();
  const htmlRect = html.getBoundingClientRect();
  return resolveHtmlDocumentMeasuredHeight({
    contentExtent: hasRect ? Math.max(0, Math.ceil(maxBottom - minTop + paddingBottom)) : 0,
    rectExtent: Math.max(bodyRect.height, htmlRect.height),
    scrollExtent: Math.max(body.scrollHeight, html.scrollHeight),
    viewportExtent: doc.defaultView?.innerHeight ?? html.clientHeight ?? body.clientHeight,
  });
};
