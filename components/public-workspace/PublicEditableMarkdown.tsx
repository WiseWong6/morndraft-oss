import React, { useContext, useMemo, useRef, useState } from 'react';
import ReactMarkdown, { defaultUrlTransform, type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  patchPublicMarkdownVisibleText,
  resolvePublicMarkdownVisibleSourceOffset,
  resolvePublicMarkdownVisibleSourceRange,
} from './publicMarkdownPatch';
import {
  selectPublicFinalLogicalLine,
  shouldHandlePublicLineDoubleClick,
} from './publicLineSelection';
import type { PublicTextSelection } from './types';

type EditableTag = 'blockquote' | 'code' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'li' | 'p' | 'td' | 'th';
type MarkdownPosition = { start?: { offset?: number }; end?: { offset?: number } } | undefined;
type MarkdownRenderNode = {
  type?: string;
  tagName?: string;
  children?: readonly MarkdownRenderNode[];
};

type PublicEditableMarkdownRenderContext = {
  editable: boolean;
  onSelectionChange?(selection: PublicTextSelection | null): void;
  onSourcePatch(next: string): void;
  segmentEnd: number;
  segmentStart: number;
  source: string;
};

const PublicEditableMarkdownContext = React.createContext<PublicEditableMarkdownRenderContext | null>(null);

const PUBLIC_REVERSIBLE_MARKDOWN_TAGS = new Set([
  'a', 'blockquote', 'code', 'del', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'li', 'p', 'strong', 'td', 'th',
]);

const PUBLIC_NESTED_EDITABLE_BLOCK_TAGS = new Set([
  'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'p', 'td', 'th',
]);

/**
 * Browsers focus the outer owner when contentEditable elements are nested.
 * Loose lists and blockquotes contain paragraph elements, so the container
 * must stay structural while its innermost reversible block owns editing.
 */
export const hasPublicMarkdownNestedEditableBlock = (
  node: MarkdownRenderNode | null | undefined,
): boolean => (node?.children ?? []).some((child) => (
  (child.type === 'element' && typeof child.tagName === 'string' && PUBLIC_NESTED_EDITABLE_BLOCK_TAGS.has(child.tagName))
  || hasPublicMarkdownNestedEditableBlock(child)
));

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

const PUBLIC_LOCAL_IMAGE_DATA_URL = /^data:image\/(?:avif|gif|jpeg|png|webp);base64,(?:[a-z0-9+/=\s]|%[0-9a-f]{2})+$/iu;

const PUBLIC_EDITABLE_DOM_BLOCK_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DIV', 'FOOTER', 'HEADER',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'MAIN', 'NAV', 'P', 'PRE', 'SECTION',
]);

/**
 * contentEditable creates block elements for Enter and BR elements for a soft
 * line break. textContent concatenates those nodes and would silently turn
 * `First<div>Second` into `FirstSecond`; serialize their Markdown meaning
 * before applying the source patch.
 */
const readPublicEditableDomText = (root: HTMLElement, multilineCode = false) => {
  const readNode = (node: Node): string => {
    if (node.nodeType === 3) return node.nodeValue ?? '';
    if (node.nodeType !== 1) return '';
    const element = node as HTMLElement;
    if (element.tagName === 'BR') return multilineCode ? '\n' : '  \n';
    let result = '';
    for (const child of element.childNodes) {
      if (
        child.nodeType === 1 &&
        PUBLIC_EDITABLE_DOM_BLOCK_TAGS.has((child as HTMLElement).tagName) &&
        result && !(multilineCode ? result.endsWith('\n') : result.endsWith('\n\n'))
      ) {
        result += multilineCode ? '\n' : result.endsWith('\n') ? '\n' : '\n\n';
      }
      result += readNode(child);
    }
    return result;
  };
  return readNode(root);
};

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
  sourceReversible: boolean;
  canOwnEdit: boolean;
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
  sourceReversible,
  canOwnEdit,
  onSourcePatch,
  onSelectionChange,
}) => {
  const focusSnapshotRef = useRef<{ source: string; visibleText: string } | null>(null);
  const lastPointerTypeRef = useRef<string | null>(null);
  const [recoveryEpoch, setRecoveryEpoch] = useState(0);
  const relativeStart = position?.start?.offset;
  const relativeEnd = position?.end?.offset;
  const canPatch = Number.isInteger(relativeStart) && Number.isInteger(relativeEnd);
  const canEditBlock = editable && canPatch && sourceReversible && canOwnEdit;

  const restoreControlledChildren = () => {
    // A changed key remounts the host subtree from React's source-controlled
    // children. Writing textContent here would permanently discard images,
    // links, and formatting nodes while leaving Source unchanged.
    setRecoveryEpoch((value) => value + 1);
  };

  const publishRenderedSelection = (element: HTMLElement) => {
    if (!onSelectionChange || !canPatch) return false;
    const selection = element.ownerDocument.defaultView?.getSelection();
    const browserRange = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (!selection || selection.isCollapsed || !browserRange) {
      onSelectionChange(null);
      return true;
    }
    if (!sourceReversible) {
      onSelectionChange(null);
      return true;
    }
    if (
      !element.contains(browserRange.startContainer)
      || !element.contains(browserRange.endContainer)
    ) {
      // A selection spanning multiple rendered blocks is resolved once at the
      // workspace root. Let the event bubble so exact source offsets can be
      // derived from both boundary blocks.
      return false;
    }
    const prefixRange = element.ownerDocument.createRange();
    prefixRange.selectNodeContents(element);
    prefixRange.setEnd(browserRange.startContainer, browserRange.startOffset);
    const visibleText = element.textContent ?? '';
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
      visibleText: visibleSelection,
      source,
    } : null);
    return true;
  };

  const updateRenderedSelection = (event: React.SyntheticEvent<HTMLElement>) => {
    if (publishRenderedSelection(event.currentTarget)) event.stopPropagation();
  };

  return React.createElement(tag, {
    className,
    key: `public-editable-${recoveryEpoch}`,
    contentEditable: canEditBlock,
    'data-public-final-editable': canEditBlock ? 'true' : undefined,
    'data-public-final-block': canPatch ? 'true' : undefined,
    'data-public-final-reversible': canPatch ? String(sourceReversible) : undefined,
    'data-public-source-start': canPatch ? segmentStart + (relativeStart ?? 0) : undefined,
    'data-public-source-end': canPatch ? segmentStart + (relativeEnd ?? 0) : undefined,
    'data-public-segment-start': canPatch ? segmentStart : undefined,
    'data-public-segment-end': canPatch ? segmentEnd : undefined,
    suppressContentEditableWarning: true,
    onFocus: (event: React.FocusEvent<HTMLElement>) => {
      if (!canEditBlock) return;
      focusSnapshotRef.current = {
        source,
        visibleText: readPublicEditableDomText(event.currentTarget, tag === 'code'),
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
      const nextVisibleText = readPublicEditableDomText(event.currentTarget, tag === 'code');
      const next = patchPublicMarkdownVisibleText({
        source,
        range: {
          start: segmentStart + (relativeStart ?? 0),
          end: segmentStart + (relativeEnd ?? 0),
        },
        previousVisibleText: snapshot.visibleText,
        nextVisibleText,
      });
      // contentEditable has already mutated this host subtree outside React.
      // Remount only the block that owned the edit before reconciling the new
      // Markdown AST; sibling blocks keep their DOM identity and click target.
      restoreControlledChildren();
      if (next === null) {
        return;
      }
      if (next !== source) onSourcePatch(next);
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.key !== 'Enter' || event.nativeEvent.isComposing || event.keyCode === 229 || tag === 'code') return;
      // Final owns one reversible Markdown block at a time. Treat Enter as a
      // commit instead of letting contentEditable create DIV/BR descendants
      // that can escape a list, heading, or table cell source boundary. Fenced
      // code remains intentionally multiline, and IME confirmation Enter stays
      // owned by the browser composition session.
      event.preventDefault();
      event.currentTarget.blur();
    },
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      lastPointerTypeRef.current = event.pointerType;
    },
    onDoubleClick: (event: React.MouseEvent<HTMLElement>) => {
      const pointerType = lastPointerTypeRef.current;
      lastPointerTypeRef.current = null;
      if (!shouldHandlePublicLineDoubleClick({
        altKey: event.altKey,
        button: event.button,
        ctrlKey: event.ctrlKey,
        detail: event.detail,
        metaKey: event.metaKey,
        pointerType,
        shiftKey: event.shiftKey,
      })) return;
      if (!selectPublicFinalLogicalLine(event.currentTarget)) return;
      event.preventDefault();
      event.stopPropagation();
      if (sourceReversible) publishRenderedSelection(event.currentTarget);
    },
    onMouseUp: updateRenderedSelection,
    onKeyUp: updateRenderedSelection,
  }, children);
};

const PublicContextEditableBlock: React.FC<{
  tag: EditableTag;
  className?: string;
  children: React.ReactNode;
  node: MarkdownRenderNode | null | undefined;
  position: MarkdownPosition;
}> = ({ tag, className, children, node, position }) => {
  const context = useContext(PublicEditableMarkdownContext);
  if (!context) throw new Error('Public editable Markdown block requires its render context.');
  return (
    <PublicEditableBlock
      tag={tag}
      className={className}
      position={position}
      segmentStart={context.segmentStart}
      segmentEnd={context.segmentEnd}
      source={context.source}
      editable={context.editable}
      sourceReversible={isPublicMarkdownNodeSafelyEditable(node)}
      canOwnEdit={!hasPublicMarkdownNestedEditableBlock(node)}
      onSourcePatch={context.onSourcePatch}
      onSelectionChange={context.onSelectionChange}
    >
      {children}
    </PublicEditableBlock>
  );
};

const renderPublicEditableBlock = (
  tag: EditableTag,
  node: MarkdownRenderNode | null | undefined,
  position: MarkdownPosition,
  children: React.ReactNode,
  className?: string,
) => (
  <PublicContextEditableBlock
    tag={tag}
    className={className}
    node={node}
    position={position}
  >
    {children}
  </PublicContextEditableBlock>
);

const PublicContextCode: React.FC<{
  children: React.ReactNode;
  className?: string;
  node: MarkdownRenderNode | null | undefined;
}> = ({ children, className, node }) => {
  const context = useContext(PublicEditableMarkdownContext);
  if (!context) throw new Error('Public editable Markdown code requires its render context.');
  const relativeStart = (node as { position?: MarkdownPosition } | null | undefined)?.position?.start?.offset;
  const relativeEnd = (node as { position?: MarkdownPosition } | null | undefined)?.position?.end?.offset;
  const nodeSource = Number.isInteger(relativeStart) && Number.isInteger(relativeEnd)
    ? context.source.slice(
      context.segmentStart + (relativeStart ?? 0),
      context.segmentStart + (relativeEnd ?? 0),
    )
    : '';
  // react-markdown does not expose an `inline` flag. Inspect the exact source
  // range so an unlabelled fenced block remains editable while inline code —
  // including triple-backtick code spans — stays owned by its parent block.
  const isFenced = /^ {0,3}(?:`{3,}|~{3,})[^\r\n]*(?:\r\n|\r|\n)/u.test(nodeSource);
  return isFenced
    ? renderPublicEditableBlock('code', node, (node as { position?: MarkdownPosition } | null | undefined)?.position, children, className)
    : <code className={className}>{children}</code>;
};

const PUBLIC_MARKDOWN_COMPONENTS: Components = {
  blockquote: ({ node, children, className }) => renderPublicEditableBlock('blockquote', node, node?.position, children, className),
  code: ({ node, children, className }) => <PublicContextCode node={node} className={className}>{children}</PublicContextCode>,
  h1: ({ node, children, className }) => renderPublicEditableBlock('h1', node, node?.position, children, className),
  h2: ({ node, children, className }) => renderPublicEditableBlock('h2', node, node?.position, children, className),
  h3: ({ node, children, className }) => renderPublicEditableBlock('h3', node, node?.position, children, className),
  h4: ({ node, children, className }) => renderPublicEditableBlock('h4', node, node?.position, children, className),
  h5: ({ node, children, className }) => renderPublicEditableBlock('h5', node, node?.position, children, className),
  h6: ({ node, children, className }) => renderPublicEditableBlock('h6', node, node?.position, children, className),
  li: ({ node, children, className }) => renderPublicEditableBlock('li', node, getChildContentPosition(node), children, className),
  p: ({ node, children, className }) => renderPublicEditableBlock('p', node, node?.position, children, className),
  td: ({ node, children, className }) => renderPublicEditableBlock('td', node, getChildContentPosition(node), children, className),
  th: ({ node, children, className }) => renderPublicEditableBlock('th', node, getChildContentPosition(node), children, className),
};

const PUBLIC_MARKDOWN_REMARK_PLUGINS = [remarkGfm];

export const PublicEditableMarkdown: React.FC<{
  content: string;
  segmentStart: number;
  source: string;
  editable: boolean;
  onSourcePatch(next: string): void;
  onSelectionChange?(selection: PublicTextSelection | null): void;
}> = ({ content, segmentStart, source, editable, onSourcePatch, onSelectionChange }) => {
  const segmentEnd = segmentStart + content.length;
  const context = useMemo<PublicEditableMarkdownRenderContext>(() => ({
    editable,
    onSelectionChange,
    onSourcePatch,
    segmentEnd,
    segmentStart,
    source,
  }), [editable, onSelectionChange, onSourcePatch, segmentEnd, segmentStart, source]);

  return (
    <PublicEditableMarkdownContext.Provider value={context}>
      <ReactMarkdown
        components={PUBLIC_MARKDOWN_COMPONENTS}
        remarkPlugins={PUBLIC_MARKDOWN_REMARK_PLUGINS}
        urlTransform={transformPublicMarkdownUrl}
      >
        {content}
      </ReactMarkdown>
    </PublicEditableMarkdownContext.Provider>
  );
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
  return {
    start,
    end,
    text,
    visibleText: text,
    sourceText: source.slice(start, end),
    source,
  };
};
