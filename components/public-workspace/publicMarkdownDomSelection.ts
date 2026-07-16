import { resolvePublicMarkdownVisibleSourceOffset } from './publicMarkdownPatch';
import type { PublicTextSelection } from './types';

const getPublicFinalBlock = (node: Node | null): HTMLElement | null => {
  const element = node instanceof HTMLElement ? node : node?.parentElement;
  return element?.closest<HTMLElement>('[data-public-final-block="true"]') ?? null;
};

const readIntegerAttribute = (element: HTMLElement, name: string) => {
  const raw = element.getAttribute(name);
  if (!raw || !/^-?\d+$/u.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
};

const getVisibleOffset = (block: HTMLElement, container: Node, offset: number) => {
  const range = block.ownerDocument.createRange();
  try {
    range.selectNodeContents(block);
    range.setEnd(container, offset);
    return range.toString().length;
  } catch {
    return null;
  }
};

const isRangeCoveredByReversibleMarkdownBlocks = (
  root: HTMLElement,
  range: Range,
) => {
  let coveredBlockCount = 0;
  for (const block of root.querySelectorAll<HTMLElement>('[data-public-final-block="true"]')) {
    let intersects = false;
    try {
      intersects = range.intersectsNode(block);
    } catch {
      return false;
    }
    if (!intersects) continue;
    coveredBlockCount += 1;
    if (block.getAttribute('data-public-final-reversible') !== 'true') return false;
  }
  if (coveredBlockCount === 0) return false;
  const fragment = range.cloneContents();
  return !fragment.querySelector([
    '[data-public-final-reversible="false"]',
    'audio', 'br', 'button', 'canvas', 'embed', 'hr', 'iframe', 'img',
    'input', 'object', 'select', 'svg', 'textarea', 'video',
  ].join(','));
};

/**
 * Resolve a browser selection spanning multiple Markdown blocks back to exact
 * Source offsets. Selections crossing a non-Markdown segment fail closed so an
 * AI modification can never remove an intervening HTML/Mermaid artifact.
 */
export const resolvePublicMarkdownDomSelection = (
  root: HTMLElement,
  selection: Selection,
  source: string,
): PublicTextSelection | null => {
  if (selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const startBlock = getPublicFinalBlock(range.startContainer);
  const endBlock = getPublicFinalBlock(range.endContainer);
  if (!startBlock || !endBlock || !root.contains(startBlock) || !root.contains(endBlock)) return null;

  const startSegment = readIntegerAttribute(startBlock, 'data-public-segment-start');
  const endSegment = readIntegerAttribute(startBlock, 'data-public-segment-end');
  if (
    startSegment === null || endSegment === null
    || startSegment !== readIntegerAttribute(endBlock, 'data-public-segment-start')
    || endSegment !== readIntegerAttribute(endBlock, 'data-public-segment-end')
  ) return null;

  const startRange = {
    start: readIntegerAttribute(startBlock, 'data-public-source-start'),
    end: readIntegerAttribute(startBlock, 'data-public-source-end'),
  };
  const endRange = {
    start: readIntegerAttribute(endBlock, 'data-public-source-start'),
    end: readIntegerAttribute(endBlock, 'data-public-source-end'),
  };
  if (startRange.start === null || startRange.end === null || endRange.start === null || endRange.end === null) return null;

  const visibleStart = getVisibleOffset(startBlock, range.startContainer, range.startOffset);
  const visibleEnd = getVisibleOffset(endBlock, range.endContainer, range.endOffset);
  if (visibleStart === null || visibleEnd === null) return null;
  const start = resolvePublicMarkdownVisibleSourceOffset({
    source,
    range: { start: startRange.start, end: startRange.end },
    visibleText: startBlock.textContent ?? '',
    visibleOffset: visibleStart,
    edge: 'start',
  });
  const end = resolvePublicMarkdownVisibleSourceOffset({
    source,
    range: { start: endRange.start, end: endRange.end },
    visibleText: endBlock.textContent ?? '',
    visibleOffset: visibleEnd,
    edge: 'end',
  });
  const text = range.toString();
  if (
    start === null || end === null || end <= start || !text.trim()
    || !isRangeCoveredByReversibleMarkdownBlocks(root, range)
  ) return null;
  return {
    start,
    end,
    text,
    visibleText: text,
    sourceText: source.slice(start, end),
    source,
    formatContext: startBlock === endBlock ? {
      blockEnd: startRange.end,
      blockStart: startRange.start,
      visibleEnd,
      visibleStart,
    } : undefined,
  };
};
