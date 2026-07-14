import React, { useMemo, useRef, useState } from 'react';
import ReactMarkdown, { defaultUrlTransform, type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  patchPublicMarkdownVisibleText,
  resolvePublicMarkdownVisibleSourceOffset,
  resolvePublicMarkdownVisibleSourceRange,
} from './publicMarkdownPatch';
import type { PublicTextSelection } from './types';

type EditableTag = 'blockquote' | 'code' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'li' | 'p' | 'td' | 'th';
type MarkdownPosition = { start?: { offset?: number }; end?: { offset?: number } } | undefined;
type MarkdownRenderNode = {
  type?: string;
  tagName?: string;
  children?: readonly MarkdownRenderNode[];
};

const PUBLIC_REVERSIBLE_MARKDOWN_TAGS = new Set([
  'a', 'blockquote', 'code', 'del', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'li', 'p', 'strong', 'td', 'th',
]);

/**
 * Final can only edit DOM whose visible text maps back to Markdown without
 * losing a non-text node. Images, hard breaks, and raw/custom elements stay
 * selectable/read-only instead of letting contentEditable delete their DOM.
 */
export const isPublicMarkdownNodeSafelyEditable = (
  node: MarkdownRenderNode | null | undefined,
): boolean => {
  if (!node) return false;
  if (node.type === 'text') return true;
  if (node.type !== 'element' || !node.tagName || !PUBLIC_REVERSIBLE_MARKDOWN_TAGS.has(node.tagName)) {
    return false;
  }
  return (node.children ?? []).every(isPublicMarkdownNodeSafelyEditable);
};

const getChildContentPosition = (node: { children?: Array<{ position?: MarkdownPosition }> } | null | undefined) => {
  const positioned = node?.children?.map(child => child.position).filter((position): position is NonNullable<MarkdownPosition> => (
    Number.isInteger(position?.start?.offset) && Number.isInteger(position?.end?.offset)
  )) ?? [];
  if (positioned.length === 0) return node && 'position' in node ? (node as { position?: MarkdownPosition }).position : undefined;
  return { start: positioned[0].start, end: positioned[positioned.length - 1].end };
};

const PUBLIC_LOCAL_IMAGE_DATA_URL = /^data:image\/(?:avif|gif|jpeg|png|webp);base64,[a-z0-9+/=\s]+$/iu;

export const transformPublicMarkdownUrl = (url: string) => (
  PUBLIC_LOCAL_IMAGE_DATA_URL.test(url) ? url : defaultUrlTransform(url)
);

type PublicEditableBlockProps = {
  tag: EditableTag;
  className?: string;
  children: React.ReactNode;
  position: MarkdownPosition;
  segmentStart: number;
  segmentEnd: number;
  source: string;
  editable: boolean;
  reversible: boolean;
  onSourcePatch(next: string): void;
  onSelectionChange?(selection: PublicTextSelection | null): void;
};

const PublicEditableBlock: React.FC<PublicEditableBlockProps> = ({
  tag,
  className,
  children,
  position,
  segmentStart,
  segmentEnd,
  source,
  editable,
  reversible,
  onSourcePatch,
  onSelectionChange,
}) => {
  const focusSnapshotRef = useRef<{ source: string; visibleText: string } | null>(null);
  const [recoveryEpoch, setRecoveryEpoch] = useState(0);
  const relativeStart = position?.start?.offset;
  const relativeEnd = position?.end?.offset;
  const canPatch = Number.isInteger(relativeStart) && Number.isInteger(relativeEnd);
  const canEditBlock = editable && canPatch && reversible;

  const restoreControlledChildren = () => {
    // A changed key remounts the host subtree from React's source-controlled
    // children. Writing textContent here would permanently discard images,
    // links, and formatting nodes while leaving Source unchanged.
    setRecoveryEpoch((value) => value + 1);
  };

  const updateRenderedSelection = (event: React.SyntheticEvent<HTMLElement>) => {
    if (!onSelectionChange || !canPatch) return;
    const selection = event.currentTarget.ownerDocument.defaultView?.getSelection();
    const browserRange = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (!selection || selection.isCollapsed || !browserRange) {
      event.stopPropagation();
      onSelectionChange(null);
      return;
    }
    if (!reversible) {
      event.stopPropagation();
      onSelectionChange(null);
      return;
    }
    if (
      !event.currentTarget.contains(browserRange.startContainer)
      || !event.currentTarget.contains(browserRange.endContainer)
    ) {
      // A selection spanning multiple rendered blocks is resolved once at the
      // workspace root. Let the event bubble so exact source offsets can be
      // derived from both boundary blocks.
      return;
    }
    event.stopPropagation();
    const prefixRange = event.currentTarget.ownerDocument.createRange();
    prefixRange.selectNodeContents(event.currentTarget);
    prefixRange.setEnd(browserRange.startContainer, browserRange.startOffset);
    const visibleText = event.currentTarget.textContent ?? '';
    const visibleStart = prefixRange.toString().length;
    const visibleSelection = selection.toString();
    const resolved = resolvePublicMarkdownVisibleSourceRange({
      source,
      range: {
        start: segmentStart + (relativeStart ?? 0),
        end: segmentStart + (relativeEnd ?? 0),
      },
      visibleText,
      visibleStart,
      visibleEnd: visibleStart + visibleSelection.length,
    });
    onSelectionChange(resolved ? {
      ...resolved,
      text: visibleSelection,
      source,
    } : null);
  };

  return React.createElement(tag, {
    className,
    key: `public-editable-${recoveryEpoch}`,
    contentEditable: canEditBlock,
    'data-public-final-editable': canEditBlock ? 'true' : undefined,
    'data-public-final-block': canPatch ? 'true' : undefined,
    'data-public-final-reversible': canPatch ? String(reversible) : undefined,
    'data-public-source-start': canPatch ? segmentStart + (relativeStart ?? 0) : undefined,
    'data-public-source-end': canPatch ? segmentStart + (relativeEnd ?? 0) : undefined,
    'data-public-segment-start': canPatch ? segmentStart : undefined,
    'data-public-segment-end': canPatch ? segmentEnd : undefined,
    suppressContentEditableWarning: true,
    onFocus: (event: React.FocusEvent<HTMLElement>) => {
      if (!canEditBlock) return;
      focusSnapshotRef.current = {
        source,
        visibleText: event.currentTarget.textContent ?? '',
      };
    },
    onBlur: (event: React.FocusEvent<HTMLElement>) => {
      const snapshot = focusSnapshotRef.current;
      focusSnapshotRef.current = null;
      if (!snapshot) return;
      if (snapshot.source !== source || !canEditBlock) {
        restoreControlledChildren();
        return;
      }
      const nextVisibleText = event.currentTarget.textContent ?? '';
      const next = patchPublicMarkdownVisibleText({
        source,
        range: {
          start: segmentStart + (relativeStart ?? 0),
          end: segmentStart + (relativeEnd ?? 0),
        },
        previousVisibleText: snapshot.visibleText,
        nextVisibleText,
      });
      if (next === null) {
        restoreControlledChildren();
        return;
      }
      if (next !== source) onSourcePatch(next);
    },
    onMouseUp: updateRenderedSelection,
    onKeyUp: updateRenderedSelection,
  }, children);
};

export const PublicEditableMarkdown: React.FC<{
  content: string;
  segmentStart: number;
  source: string;
  editable: boolean;
  onSourcePatch(next: string): void;
  onSelectionChange?(selection: PublicTextSelection | null): void;
}> = ({ content, segmentStart, source, editable, onSourcePatch, onSelectionChange }) => {
  const segmentEnd = segmentStart + content.length;
  const components = useMemo<Components>(() => {
    const renderEditable = (
      tag: EditableTag,
      node: MarkdownRenderNode | null | undefined,
      position: MarkdownPosition,
      children: React.ReactNode,
      className?: string,
    ) => (
      <PublicEditableBlock
        tag={tag}
        className={className}
        position={position}
        segmentStart={segmentStart}
        segmentEnd={segmentEnd}
        source={source}
        editable={editable}
        reversible={isPublicMarkdownNodeSafelyEditable(node)}
        onSourcePatch={onSourcePatch}
        onSelectionChange={onSelectionChange}
      >
        {children}
      </PublicEditableBlock>
    );
    return {
      blockquote: ({ node, children, className }) => renderEditable('blockquote', node, node?.position, children, className),
      code: ({ node, children, className }) => className?.includes('language-')
        ? renderEditable('code', node, node?.position, children, className)
        : <code className={className}>{children}</code>,
      h1: ({ node, children, className }) => renderEditable('h1', node, node?.position, children, className),
      h2: ({ node, children, className }) => renderEditable('h2', node, node?.position, children, className),
      h3: ({ node, children, className }) => renderEditable('h3', node, node?.position, children, className),
      h4: ({ node, children, className }) => renderEditable('h4', node, node?.position, children, className),
      h5: ({ node, children, className }) => renderEditable('h5', node, node?.position, children, className),
      h6: ({ node, children, className }) => renderEditable('h6', node, node?.position, children, className),
      li: ({ node, children, className }) => renderEditable('li', node, getChildContentPosition(node), children, className),
      p: ({ node, children, className }) => renderEditable('p', node, node?.position, children, className),
      td: ({ node, children, className }) => renderEditable('td', node, getChildContentPosition(node), children, className),
      th: ({ node, children, className }) => renderEditable('th', node, getChildContentPosition(node), children, className),
    };
  }, [editable, onSelectionChange, onSourcePatch, segmentEnd, segmentStart, source]);

  return <ReactMarkdown components={components} remarkPlugins={[remarkGfm]} urlTransform={transformPublicMarkdownUrl}>{content}</ReactMarkdown>;
};

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
  return { start, end, text, sourceText: source.slice(start, end), source };
};
