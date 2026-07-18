import React from 'react';
import { getNodeSourceRange, sourcePositionAttributes, type SourceLineMap } from './sourcePosition';

const renderSourcePositionElement = (
  tag: React.ElementType,
  options: { className?: string; isSourceLineHidden?: (line: number) => boolean } = {},
  lineMap?: SourceLineMap,
) => {
  const SourcePositionElement = (props: any) => {
    const { node, className, ...rest } = props;
    const mergedClassName = [options.className, className].filter(Boolean).join(' ') || undefined;
    const sourceRange = getNodeSourceRange(node, lineMap);
    return React.createElement(tag, {
      ...sourcePositionAttributes(sourceRange),
      ...rest,
      ...(mergedClassName ? { className: mergedClassName } : {}),
      ...(sourceRange && options.isSourceLineHidden?.(sourceRange.startLine) ? { hidden: true } : {}),
    });
  };

  return SourcePositionElement;
};

export const createSourcePositionMarkdownRenderers = (
  lineMap?: SourceLineMap,
  isSourceLineHidden?: (line: number) => boolean,
) => ({
  p: renderSourcePositionElement('div', { className: 'aad-md-paragraph', isSourceLineHidden }, lineMap),
  div: renderSourcePositionElement('div', { isSourceLineHidden }, lineMap),
  blockquote: renderSourcePositionElement('blockquote', { isSourceLineHidden }, lineMap),
  ul: renderSourcePositionElement('ul', { isSourceLineHidden }, lineMap),
  ol: renderSourcePositionElement('ol', { isSourceLineHidden }, lineMap),
  li: renderSourcePositionElement('li', { isSourceLineHidden }, lineMap),
  table: renderSourcePositionElement('table', { isSourceLineHidden }, lineMap),
  thead: renderSourcePositionElement('thead', { isSourceLineHidden }, lineMap),
  tbody: renderSourcePositionElement('tbody', { isSourceLineHidden }, lineMap),
  tr: renderSourcePositionElement('tr', { isSourceLineHidden }, lineMap),
  td: renderSourcePositionElement('td', { isSourceLineHidden }, lineMap),
  th: renderSourcePositionElement('th', { isSourceLineHidden }, lineMap),
});
