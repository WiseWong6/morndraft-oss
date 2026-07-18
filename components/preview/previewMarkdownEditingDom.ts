import type { PreviewMarkdownTextFormat } from './previewMarkdownEditingTypes';

const getNodeElement = (node: Node | EventTarget | null) => {
  if (node instanceof HTMLElement) return node;
  if (node instanceof Node) return node.parentElement;
  return null;
};

export const isLexicalMarkdownIslandTarget = (target: EventTarget | null) =>
  Boolean(getNodeElement(target)?.closest('.aad-markdown-lexical-island'));

export const hasLexicalMarkdownIslandSelection = () => {
  const selection = document.getSelection();
  if (!selection || selection.isCollapsed) return false;
  const anchorIsland = getNodeElement(selection.anchorNode)?.closest('.aad-markdown-lexical-island');
  const focusIsland = getNodeElement(selection.focusNode)?.closest('.aad-markdown-lexical-island');
  return Boolean(anchorIsland && focusIsland && anchorIsland === focusIsland);
};

export const createInactiveTextFormats = (): Record<PreviewMarkdownTextFormat, boolean> => ({
  bold: false,
  highlight: false,
  inlineCode: false,
  italic: false,
  strikethrough: false,
  subscript: false,
  superscript: false,
  underline: false,
});
