import type { PublicWorkspaceLocale } from './types';

const EMPTY_PUBLIC_TITLES: Record<PublicWorkspaceLocale, string> = {
  zh: '未命名文档',
  en: 'Untitled document',
};

const PUBLIC_TITLE_MAX_DISPLAY_WIDTH = 48;
const WIDE_GRAPHEME_PATTERN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Extended_Pictographic}]/u;

const getGraphemes = (value: string) => {
  if (typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    return Array.from(segmenter.segment(value), item => item.segment);
  }
  return Array.from(value);
};

const getGraphemeDisplayWidth = (value: string) => (
  WIDE_GRAPHEME_PATTERN.test(value) ? 2 : 1
);

const truncatePublicTitle = (value: string) => {
  const graphemes = getGraphemes(value);
  const totalWidth = graphemes.reduce(
    (width, grapheme) => width + getGraphemeDisplayWidth(grapheme),
    0,
  );
  if (totalWidth <= PUBLIC_TITLE_MAX_DISPLAY_WIDTH) return value;

  const result: string[] = [];
  let width = 0;
  for (const grapheme of graphemes) {
    const nextWidth = getGraphemeDisplayWidth(grapheme);
    if (width + nextWidth > PUBLIC_TITLE_MAX_DISPLAY_WIDTH - 1) break;
    result.push(grapheme);
    width += nextWidth;
  }
  return `${result.join('').trimEnd()}…`;
};

const normalizeTitleText = (value: string) => (
  value
    .replace(/\p{Cc}+/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ')
);

const normalizeSourceTitleLine = (line: string) => {
  const normalized = normalizeTitleText(line);
  const withoutMarkdownPrefix = normalized
    .replace(/^(?:#{1,6}|>+)\s+/u, '')
    .replace(/^(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/u, '')
    .trim();
  return withoutMarkdownPrefix || normalized;
};

export const derivePublicImportedDocumentTitle = (
  source: string,
  locale: PublicWorkspaceLocale,
  suggestedTitle?: string,
) => {
  const fileTitle = normalizeTitleText(suggestedTitle ?? '');
  if (fileTitle) return truncatePublicTitle(fileTitle);

  const firstContentLine = source.split(/\r?\n/u).find(line => line.trim());
  if (firstContentLine) {
    return truncatePublicTitle(normalizeSourceTitleLine(firstContentLine));
  }

  return EMPTY_PUBLIC_TITLES[locale];
};
