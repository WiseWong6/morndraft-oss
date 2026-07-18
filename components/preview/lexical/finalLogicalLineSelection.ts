import { $isListItemNode } from '@lexical/list';
import { $isHeadingNode, $isQuoteNode } from '@lexical/rich-text';
import { $isTableCellNode, $isTableNode, $isTableRowNode } from '@lexical/table';
import {
  $createRangeSelection,
  $isElementNode,
  $isParagraphNode,
  $setSelection,
  type ElementNode,
  type LexicalNode,
} from 'lexical';

export type FinalLogicalLineDoubleClickInput = Readonly<{
  altKey: boolean;
  button: number;
  ctrlKey: boolean;
  detail: number;
  isProtectedTarget: boolean;
  metaKey: boolean;
  pointerType: string;
  shiftKey: boolean;
}>;

const findAncestor = (
  node: LexicalNode | null | undefined,
  predicate: (candidate: LexicalNode) => boolean,
) => {
  let current = node ?? null;
  while (current) {
    if (predicate(current)) return current;
    current = current.getParent();
  }
  return null;
};

export const shouldHandleFinalLogicalLineDoubleClick = (
  input: FinalLogicalLineDoubleClickInput,
) => (
  input.pointerType === 'mouse' &&
  input.button === 0 &&
  input.detail === 2 &&
  !input.altKey &&
  !input.ctrlKey &&
  !input.metaKey &&
  !input.shiftKey &&
  !input.isProtectedTarget
);

export const $getFinalLogicalLineNode = (
  node: LexicalNode | null | undefined,
): ElementNode | null => {
  const tableAncestor = findAncestor(node, (candidate) => (
    $isTableNode(candidate) ||
    $isTableRowNode(candidate) ||
    $isTableCellNode(candidate)
  ));
  if (tableAncestor) return null;

  const logicalLine =
    findAncestor(node, $isListItemNode) ??
    findAncestor(node, $isHeadingNode) ??
    findAncestor(node, $isQuoteNode) ??
    findAncestor(node, $isParagraphNode);
  return $isElementNode(logicalLine) ? logicalLine : null;
};

export const $selectFinalLogicalLine = (node: LexicalNode | null | undefined) => {
  const logicalLine = $getFinalLogicalLineNode(node);
  if (!logicalLine) return false;
  const textNodes = logicalLine.getAllTextNodes().filter((textNode) => (
    textNode.getTextContentSize() > 0 &&
    $getFinalLogicalLineNode(textNode)?.is(logicalLine)
  ));
  const firstTextNode = textNodes[0];
  const lastTextNode = textNodes[textNodes.length - 1];
  if (!firstTextNode || !lastTextNode) return false;

  const selection = $createRangeSelection();
  selection.setTextNodeRange(
    firstTextNode,
    0,
    lastTextNode,
    lastTextNode.getTextContentSize(),
  );
  $setSelection(selection);
  return true;
};
