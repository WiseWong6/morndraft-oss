import {
  sourceRangeContainsMatch,
  type SourcePositionRange,
  type SourcePositionMatch,
} from './sourcePosition';
import { HTML_PREVIEW_BRIDGE_SOURCE } from '../../utils/htmlPreviewBridge';

const PREVIEW_SEARCH_SKIP_SELECTOR = [
  '.aad-block-header',
  '.aad-preview-title-search',
  '.aad-artifact-map-sidecar',
  '.aad-artifact-map-drawer',
  '.aad-artifact-map-rail',
  '.aad-loading-overlay',
  'button',
  'input',
  'textarea',
  'select',
  'option',
  'iframe',
  'svg',
  'script',
  'style',
  'template',
  'mark.aad-preview-search-highlight',
  '.aad-preview-search-overlay',
].join(',');
const PREVIEW_SEARCH_SVG_TEXT_SKIP_SELECTOR = [
  '.aad-block-header',
  '.aad-preview-title-search',
  '.aad-artifact-map-sidecar',
  '.aad-artifact-map-drawer',
  '.aad-artifact-map-rail',
  '.aad-loading-overlay',
  'button',
  'input',
  'textarea',
  'select',
  'option',
  'script',
  'style',
  'template',
  'mark.aad-preview-search-highlight',
  '.aad-preview-search-overlay',
].join(',');

const PREVIEW_SEARCH_CSS_HIGHLIGHT_NAME = 'aad-preview-search';
const PREVIEW_SEARCH_ACTIVE_CSS_HIGHLIGHT_NAME = 'aad-preview-search-active';
const PREVIEW_SEARCH_BLOCK_TARGET_SELECTOR = '.aad-artifact-block, [data-artifact-id]:not(.aad-preview-source-anchor)';
const PREVIEW_SEARCH_SVG_TEXT_SELECTOR = [
  'svg .nodeLabel',
  'svg foreignObject p',
  'svg foreignObject span',
  'svg text',
  'svg tspan',
  'svg foreignObject',
].join(',');
const PREVIEW_SEARCH_TEXT_BLOCK_SELECTOR = [
  'p',
  '.aad-md-paragraph',
  'li',
  'blockquote',
  'td',
  'th',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
].join(',');
const PREVIEW_SEARCH_SOURCE_RANGE_SELECTOR =
  '[data-source-start-line][data-source-start-column][data-source-end-line][data-source-end-column]';

type CssHighlightRegistry = {
  delete(name: string): void;
  set(name: string, highlight: unknown): void;
};

type CssHighlightConstructor = new (...ranges: Range[]) => unknown;

type PreviewTextSearchRange = {
  start: number;
  end: number;
  index: number;
};

type PreviewTextSearchNodeMatch = {
  node: Text;
  ranges: PreviewTextSearchRange[];
};

export type PreviewSearchCssRange = {
  element: HTMLElement;
  index: number;
  range: Range;
};

export type PreviewSearchOverlayRange = PreviewSearchCssRange & {
  overlayElement: HTMLElement;
};

export type PreviewSearchRangeTarget = PreviewSearchCssRange & {
  overlayElement?: HTMLElement;
};

type PreviewSearchMatch = SourcePositionMatch & {
  id: string;
  lineText: string;
};

const escapeCssAttributeValue = (value: string) =>
  value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const getCssHighlightApi = () => {
  const css = window.CSS as (typeof CSS & { highlights?: CssHighlightRegistry }) | undefined;
  const HighlightConstructor = (window as Window & { Highlight?: CssHighlightConstructor }).Highlight;
  if (!css?.highlights || !HighlightConstructor) return null;
  return { HighlightConstructor, registry: css.highlights };
};

const clearPreviewSearchCssHighlights = () => {
  const api = getCssHighlightApi();
  api?.registry.delete(PREVIEW_SEARCH_CSS_HIGHLIGHT_NAME);
  api?.registry.delete(PREVIEW_SEARCH_ACTIVE_CSS_HIGHLIGHT_NAME);
};

const clearPreviewSearchOverlays = (root: HTMLElement) => {
  root.querySelectorAll('.aad-preview-search-overlay').forEach((element) => element.remove());
};

const createPreviewSearchOverlayRoot = () => {
  const overlayRoot = document.createElement('span');
  overlayRoot.className = 'aad-preview-search-overlay';
  overlayRoot.setAttribute('aria-hidden', 'true');
  overlayRoot.setAttribute('data-copy-remove', 'true');
  return overlayRoot;
};

const isLexicalManagedSearchTextNode = (node: Text) =>
  Boolean(node.parentElement?.closest('[data-lexical-editor="true"], [data-preview-edit-island="document:preview-markdown"]'));

const isPreviewSearchTextNodeVisible = (node: Text) => {
  const parent = node.parentElement;
  if (!parent || parent.closest(PREVIEW_SEARCH_SKIP_SELECTOR)) return false;
  const style = window.getComputedStyle(parent);
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
};

const readSourceRange = (element: HTMLElement): SourcePositionRange | null => {
  const startLine = Number(element.dataset.sourceStartLine);
  const startColumn = Number(element.dataset.sourceStartColumn);
  const endLine = Number(element.dataset.sourceEndLine);
  const endColumn = Number(element.dataset.sourceEndColumn);
  if (![startLine, startColumn, endLine, endColumn].every(Number.isFinite)) return null;
  return {
    startLine,
    startColumn,
    endLine,
    endColumn,
  };
};

const getSourceRangeScore = (range: SourcePositionRange, element: HTMLElement) => {
  const lineSpan = range.endLine - range.startLine;
  const columnSpan = lineSpan === 0 ? range.endColumn - range.startColumn : 1_000_000;
  let depth = 0;
  let cursor: Element | null = element;
  while (cursor) {
    depth += 1;
    cursor = cursor.parentElement;
  }
  return { lineSpan, columnSpan, depth };
};

const compareSourceRangeCandidates = (
  first: { element: HTMLElement; range: SourcePositionRange },
  second: { element: HTMLElement; range: SourcePositionRange },
) => {
  const firstScore = getSourceRangeScore(first.range, first.element);
  const secondScore = getSourceRangeScore(second.range, second.element);
  if (firstScore.lineSpan !== secondScore.lineSpan) return firstScore.lineSpan - secondScore.lineSpan;
  if (firstScore.columnSpan !== secondScore.columnSpan) return firstScore.columnSpan - secondScore.columnSpan;
  return secondScore.depth - firstScore.depth;
};

const getSourceRangeElementForMatch = (
  root: HTMLElement,
  match: PreviewSearchMatch,
) => {
  const candidates = Array.from(root.querySelectorAll<HTMLElement>(PREVIEW_SEARCH_SOURCE_RANGE_SELECTOR))
    .map((element) => ({ element, range: readSourceRange(element) }))
    .filter((candidate): candidate is { element: HTMLElement; range: SourcePositionRange } => (
      Boolean(candidate.range) && sourceRangeContainsMatch(candidate.range, match)
    ))
    .sort(compareSourceRangeCandidates);

  return candidates[0] ?? null;
};

const getVisiblePreviewSearchMarks = (element: HTMLElement) =>
  Array.from(element.querySelectorAll<HTMLElement>('.aad-preview-search-highlight'))
    .filter((mark) => !mark.parentElement?.closest(PREVIEW_SEARCH_SKIP_SELECTOR));

const getSourceMatchOrdinalInRange = (
  matches: readonly PreviewSearchMatch[],
  activeMatch: PreviewSearchMatch,
  range: SourcePositionRange,
) => matches
  .filter((match) => sourceRangeContainsMatch(range, match))
  .findIndex((match) => match.id === activeMatch.id);

const normalizePreviewSearchText = (value: string) => value.replace(/\s+/g, ' ').trim();

const getVisiblePreviewSearchTextBlockForText = (
  root: HTMLElement,
  text: string,
) => {
  const lineText = normalizePreviewSearchText(text);
  if (!lineText) return null;
  return Array.from(root.querySelectorAll<HTMLElement>(PREVIEW_SEARCH_TEXT_BLOCK_SELECTOR))
    .filter((element) => {
      if (element.closest(PREVIEW_SEARCH_SKIP_SELECTOR)) return false;
      const style = window.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
      return normalizePreviewSearchText(element.textContent ?? '').includes(lineText);
    })
    .sort((first, second) => (
      normalizePreviewSearchText(first.textContent ?? '').length -
      normalizePreviewSearchText(second.textContent ?? '').length
    ))[0] ?? null;
};

const getVisiblePreviewSearchTextBlockForMatch = (
  root: HTMLElement,
  activeMatch: PreviewSearchMatch,
  fallbackText: string,
) => getVisiblePreviewSearchTextBlockForText(root, activeMatch.lineText || fallbackText);

export const getPreviewSearchTextBlockTarget = (
  root: HTMLElement,
  text: string,
) => getVisiblePreviewSearchTextBlockForText(root, text);

const getVisiblePreviewSearchSvgTextForText = (
  root: HTMLElement,
  text: string,
  scope?: Element | null,
) => {
  const lineText = normalizePreviewSearchText(text).toLocaleLowerCase();
  const searchRoot = scope ?? root;
  if (!lineText) return null;
  return Array.from(searchRoot.querySelectorAll<Element>(PREVIEW_SEARCH_SVG_TEXT_SELECTOR))
    .filter((element) => {
      if (element.closest(PREVIEW_SEARCH_SVG_TEXT_SKIP_SELECTOR)) return false;
      const style = window.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
      return normalizePreviewSearchText(element.textContent ?? '').toLocaleLowerCase().includes(lineText);
    })
    .sort((first, second) => {
      const firstTextLength = normalizePreviewSearchText(first.textContent ?? '').length;
      const secondTextLength = normalizePreviewSearchText(second.textContent ?? '').length;
      if (firstTextLength !== secondTextLength) return firstTextLength - secondTextLength;
      const firstRect = first.getBoundingClientRect();
      const secondRect = second.getBoundingClientRect();
      return (firstRect.width * firstRect.height) - (secondRect.width * secondRect.height);
    })[0] ?? null;
};

export const getPreviewSearchVisibleTextTarget = (
  root: HTMLElement,
  text: string,
  scope?: Element | null,
) => getVisiblePreviewSearchSvgTextForText(root, text, scope);

const postPreviewSearchFrameMessage = (
  iframe: HTMLIFrameElement,
  query: string,
  kind: 'search-highlight-request' | 'search-highlight-clear',
) => {
  const frameId = iframe.dataset.htmlPreviewFrameId;
  if (!frameId || !iframe.contentWindow) return false;
  iframe.contentWindow.postMessage({
    source: HTML_PREVIEW_BRIDGE_SOURCE,
    id: frameId,
    kind,
    query,
    activeIndex: 0,
  }, '*');
  return true;
};

export const applyPreviewSearchFrameTextHighlight = (
  element: Element,
  query: string,
) => {
  const frames = Array.from(element.querySelectorAll<HTMLIFrameElement>('iframe[data-html-preview-live="true"][data-html-preview-frame-id]'));
  let didPost = false;
  frames.forEach((iframe) => {
    didPost = postPreviewSearchFrameMessage(iframe, query, 'search-highlight-request') || didPost;
    window.requestAnimationFrame(() => {
      postPreviewSearchFrameMessage(iframe, query, 'search-highlight-request');
    });
  });
  return didPost;
};

const clearPreviewSearchFrameTextHighlights = (root: HTMLElement) => {
  root.querySelectorAll<HTMLIFrameElement>('iframe[data-html-preview-live="true"][data-html-preview-frame-id]').forEach((iframe) => {
    postPreviewSearchFrameMessage(iframe, '', 'search-highlight-clear');
  });
};

export const unwrapPreviewSearchHighlights = (root: HTMLElement) => {
  clearPreviewSearchCssHighlights();
  clearPreviewSearchFrameTextHighlights(root);
  clearPreviewSearchOverlays(root);
  const highlights = Array.from(root.querySelectorAll('mark.aad-preview-search-highlight'));
  highlights.forEach((highlight) => {
    const parent = highlight.parentNode;
    if (!parent) return;
    while (highlight.firstChild) {
      parent.insertBefore(highlight.firstChild, highlight);
    }
    highlight.remove();
    parent.normalize();
  });
};

export const clearPreviewSearchBlockHighlights = (root: HTMLElement) => {
  root.querySelectorAll('.aad-preview-search-block-highlight').forEach((element) => {
    element.classList.remove('aad-preview-search-block-highlight');
  });
};

const collectPreviewSearchTextMatches = (root: HTMLElement, query: string) => {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const textNodeMatches: PreviewTextSearchNodeMatch[] = [];
  let total = 0;
  if (!normalizedQuery) return { textNodeMatches, total };

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!(node instanceof Text) || !isPreviewSearchTextNodeVisible(node)) {
        return NodeFilter.FILTER_REJECT;
      }
      return node.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });

  let currentNode = walker.nextNode();
  while (currentNode) {
    const textNode = currentNode as Text;
    const text = textNode.textContent ?? '';
    const haystack = text.toLocaleLowerCase();
    const ranges: PreviewTextSearchRange[] = [];
    let offset = 0;
    while (total < 100) {
      const index = haystack.indexOf(normalizedQuery, offset);
      if (index === -1) break;
      ranges.push({
        start: index,
        end: index + normalizedQuery.length,
        index: total,
      });
      total += 1;
      offset = index + Math.max(1, normalizedQuery.length);
    }
    if (ranges.length > 0) {
      textNodeMatches.push({ node: textNode, ranges });
    }
    if (total >= 100) break;
    currentNode = walker.nextNode();
  }

  return { textNodeMatches, total };
};

const renderPreviewSearchOverlays = (
  root: HTMLElement,
  ranges: readonly PreviewSearchCssRange[],
): PreviewSearchOverlayRange[] => {
  if (ranges.length === 0) return [];
  const rootRect = root.getBoundingClientRect();
  const overlayRoot = createPreviewSearchOverlayRoot();
  const overlayRanges: PreviewSearchOverlayRange[] = [];

  ranges.forEach((item) => {
    const rects = Array.from(item.range.getClientRects())
      .filter((rect) => rect.width > 0 && rect.height > 0);
    rects.forEach((rect) => {
      const overlayElement = document.createElement('span');
      overlayElement.className = 'aad-preview-search-overlay-hit';
      overlayElement.dataset.previewSearchIndex = String(item.index);
      overlayElement.style.left = `${rect.left - rootRect.left + root.scrollLeft}px`;
      overlayElement.style.top = `${rect.top - rootRect.top + root.scrollTop}px`;
      overlayElement.style.width = `${rect.width}px`;
      overlayElement.style.height = `${rect.height}px`;
      overlayRoot.appendChild(overlayElement);
      overlayRanges.push({
        element: item.element,
        index: item.index,
        range: item.range,
        overlayElement,
      });
    });
  });

  if (overlayRoot.childNodes.length > 0) {
    root.appendChild(overlayRoot);
  }
  return overlayRanges;
};

export const applyPreviewSearchBlockOverlay = (
  root: HTMLElement,
  element: Element,
) => {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const rootRect = root.getBoundingClientRect();
  const overlayRoot = createPreviewSearchOverlayRoot();
  const overlayElement = document.createElement('span');
  overlayElement.className = 'aad-preview-search-overlay-hit is-active';
  overlayElement.style.left = `${rect.left - rootRect.left + root.scrollLeft}px`;
  overlayElement.style.top = `${rect.top - rootRect.top + root.scrollTop}px`;
  overlayElement.style.width = `${rect.width}px`;
  overlayElement.style.height = `${rect.height}px`;
  overlayRoot.appendChild(overlayElement);
  root.appendChild(overlayRoot);
  return overlayElement;
};

export const applyPreviewSearchTextHighlights = (
  root: HTMLElement,
  query: string,
) => {
  const { textNodeMatches, total } = collectPreviewSearchTextMatches(root, query);
  const cssHighlightApi = getCssHighlightApi();
  const cssRanges: PreviewSearchCssRange[] = [];
  const overlayRangeTargets: PreviewSearchCssRange[] = [];
  const domTextNodeMatches: PreviewTextSearchNodeMatch[] = [];

  textNodeMatches.forEach(({ node, ranges }) => {
    const parent = node.parentElement;
    if (parent && isLexicalManagedSearchTextNode(node)) {
      ranges.forEach((textRange) => {
        const range = document.createRange();
        range.setStart(node, textRange.start);
        range.setEnd(node, textRange.end);
        const rangeTarget = {
          element: parent,
          index: textRange.index,
          range,
        };
        if (cssHighlightApi) {
          cssRanges.push(rangeTarget);
        } else {
          overlayRangeTargets.push(rangeTarget);
        }
      });
      return;
    }
    domTextNodeMatches.push({ node, ranges });
  });

  if (cssHighlightApi && cssRanges.length > 0) {
    cssHighlightApi.registry.set(
      PREVIEW_SEARCH_CSS_HIGHLIGHT_NAME,
      new cssHighlightApi.HighlightConstructor(...cssRanges.map((item) => item.range)),
    );
  }
  const overlayRanges = renderPreviewSearchOverlays(root, overlayRangeTargets);

  domTextNodeMatches.forEach(({ node, ranges }) => {
    const text = node.textContent ?? '';
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    ranges.forEach((range) => {
      if (range.start > lastIndex) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex, range.start)));
      }
      const mark = document.createElement('mark');
      mark.className = 'aad-preview-search-highlight';
      mark.textContent = text.slice(range.start, range.end);
      fragment.appendChild(mark);
      lastIndex = range.end;
    });
    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
    node.parentNode?.replaceChild(fragment, node);
  });

  return { cssRanges, overlayRanges, textRanges: [...cssRanges, ...overlayRanges], total };
};

export const applyPreviewSearchActiveCssHighlight = (range: Range | null) => {
  const api = getCssHighlightApi();
  if (!api) return;
  api.registry.delete(PREVIEW_SEARCH_ACTIVE_CSS_HIGHLIGHT_NAME);
  if (!range) return;
  api.registry.set(
    PREVIEW_SEARCH_ACTIVE_CSS_HIGHLIGHT_NAME,
    new api.HighlightConstructor(range),
  );
};

export const getPreviewSearchBlockTarget = (root: HTMLElement, artifactId: string) => {
  const selector = `[data-artifact-id="${escapeCssAttributeValue(artifactId)}"]`;
  const artifactNode = root.querySelector<HTMLElement>(selector);
  return artifactNode?.matches(PREVIEW_SEARCH_BLOCK_TARGET_SELECTOR)
    ? artifactNode
    : artifactNode?.closest<HTMLElement>(PREVIEW_SEARCH_BLOCK_TARGET_SELECTOR) ?? null;
};

export const getPreviewSearchActiveTarget = (
  root: HTMLElement,
  activeMatch: PreviewSearchMatch,
  matches: readonly PreviewSearchMatch[],
  fallbackBlock: HTMLElement | null,
  textRanges: readonly PreviewSearchRangeTarget[] = [],
  fallbackText = '',
) => {
  const activeMatchIndex = matches.findIndex((match) => match.id === activeMatch.id);
  const textRange = textRanges.find((item) => item.index === activeMatchIndex);
  const lineTextBlock = getVisiblePreviewSearchTextBlockForMatch(root, activeMatch, fallbackText);
  const sourceCandidate = getSourceRangeElementForMatch(root, activeMatch);
  if (!sourceCandidate) {
    return {
      mark: null,
      block: textRange ? null : fallbackBlock ?? lineTextBlock,
      range: textRange?.range ?? null,
      rangeElement: textRange?.element ?? null,
      overlayElement: textRange?.overlayElement ?? null,
    };
  }

  const marks = getVisiblePreviewSearchMarks(sourceCandidate.element);
  const ordinal = getSourceMatchOrdinalInRange(matches, activeMatch, sourceCandidate.range);
  if (ordinal >= 0 && ordinal < marks.length) {
    return { mark: marks[ordinal], block: null, range: null, rangeElement: null, overlayElement: null };
  }

  const blockFallback = sourceCandidate.element.closest<HTMLElement>(PREVIEW_SEARCH_BLOCK_TARGET_SELECTOR) ?? fallbackBlock;
  return {
    mark: null,
    block: textRange ? null : blockFallback ?? lineTextBlock,
    range: textRange?.range ?? null,
    rangeElement: textRange?.element ?? null,
    overlayElement: textRange?.overlayElement ?? null,
  };
};
