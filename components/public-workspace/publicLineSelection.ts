export type PublicLineDoubleClickInput = Readonly<{
  altKey: boolean;
  button: number;
  ctrlKey: boolean;
  detail: number;
  metaKey: boolean;
  pointerType: string | null;
  shiftKey: boolean;
}>;

export const shouldHandlePublicLineDoubleClick = (
  input: PublicLineDoubleClickInput,
) => (
  input.pointerType === 'mouse' &&
  input.button === 0 &&
  input.detail === 2 &&
  !input.altKey &&
  !input.ctrlKey &&
  !input.metaKey &&
  !input.shiftKey
);

export const getPublicSourceLineSelectionRange = (
  value: string,
  offset: number,
) => {
  const anchor = Number.isFinite(offset)
    ? Math.min(Math.max(0, Math.trunc(offset)), value.length)
    : 0;
  const previousLineBreak = anchor > 0 ? value.lastIndexOf('\n', anchor - 1) : -1;
  const start = previousLineBreak + 1;
  const nextLineBreak = value.indexOf('\n', start);
  let end = nextLineBreak < 0 ? value.length : nextLineBreak;
  if (end > start && value[end - 1] === '\r') end -= 1;
  return { start, end };
};

const PUBLIC_FINAL_LOGICAL_LINE_TAGS = new Set([
  'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'P',
]);

const PUBLIC_FINAL_PROTECTED_DESCENDANTS = [
  'audio', 'br', 'button', 'canvas', 'embed', 'hr', 'iframe', 'img',
  'input', 'object', 'select', 'svg', 'table', 'textarea', 'video',
].join(',');

const collectPublicLogicalLineTextNodes = (
  root: HTMLElement,
  node: Node,
  output: Text[],
) => {
  if (node.nodeType === 3) {
    const text = node as Text;
    if (text.data.trim().length > 0) output.push(text);
    return;
  }
  if (node.nodeType !== 1) return;
  const element = node as HTMLElement;
  if (
    element !== root &&
    (
      element.matches('ol, ul')
      || element.matches('[data-public-final-block="true"]')
    )
  ) return;
  for (const child of element.childNodes) {
    collectPublicLogicalLineTextNodes(root, child, output);
  }
};

/**
 * Select one rendered Markdown logical line without including a nested list
 * item. Special artifacts remain owned by their dedicated editors.
 */
export const selectPublicFinalLogicalLine = (root: HTMLElement) => {
  if (
    !PUBLIC_FINAL_LOGICAL_LINE_TAGS.has(root.tagName)
    || root.closest('pre, table, td, th')
    || root.querySelector(PUBLIC_FINAL_PROTECTED_DESCENDANTS)
  ) return false;

  const textNodes: Text[] = [];
  collectPublicLogicalLineTextNodes(root, root, textNodes);
  const first = textNodes[0];
  const last = textNodes[textNodes.length - 1];
  if (!first || !last) return false;

  const range = root.ownerDocument.createRange();
  range.setStart(first, 0);
  range.setEnd(last, last.data.length);
  const selection = root.ownerDocument.defaultView?.getSelection();
  if (!selection) return false;
  selection.removeAllRanges();
  selection.addRange(range);
  return !selection.isCollapsed;
};
