import React, { useMemo, useRef, useState } from 'react';
import ReactMarkdown, { defaultUrlTransform, type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  patchPublicMarkdownVisibleText,
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
    event.stopPropagation();
    const selection = event.currentTarget.ownerDocument.defaultView?.getSelection();
    const browserRange = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (!selection || selection.isCollapsed || !browserRange || !event.currentTarget.contains(browserRange.commonAncestorContainer)) {
      onSelectionChange(null);
      return;
    }
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
  }, [editable, onSelectionChange, onSourcePatch, segmentStart, source]);

  return <ReactMarkdown components={components} remarkPlugins={[remarkGfm]} urlTransform={transformPublicMarkdownUrl}>{content}</ReactMarkdown>;
};
