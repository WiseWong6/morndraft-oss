export type PublicDocumentTitleOrigin = 'content' | 'fallback' | 'filename';

export type PublicDocumentTitleInference = Readonly<{
  fileStem: string;
  origin: PublicDocumentTitleOrigin;
  title: string;
}>;

const DEFAULT_MAX_GRAPHEMES = 80;
const DEFAULT_TITLE = 'MornDraft document';
const INVALID_FILE_NAME_CHARACTERS = /[<>:"/\\|?*]+/gu;
const BIDI_CONTROL_CHARACTERS = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu;
const MARK_OR_VARIATION = /^(?:\p{Mark}|\ufe0e|\ufe0f|\p{Emoji_Modifier})$/u;
const REGIONAL_INDICATOR = /^\p{Regional_Indicator}$/u;
const VALID_BODY_CHARACTER = /(?:\p{Letter}|\p{Number}|\p{Extended_Pictographic})/u;
const WINDOWS_RESERVED_STEM = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;

const normalizeWhitespace = (value: string) => value.replace(/\s+/gu, ' ').trim();

const replaceInvalidFileNameCharacters = (value: string) => Array.from(value, character => {
  const codePoint = character.codePointAt(0) ?? 0;
  return codePoint <= 31 || codePoint === 127 ? ' ' : character;
}).join('').replace(INVALID_FILE_NAME_CHARACTERS, ' ');

const fallbackGraphemes = (value: string) => {
  const codePoints = Array.from(value);
  const graphemes: string[] = [];
  let regionalCount = 0;

  for (const codePoint of codePoints) {
    const previous = graphemes.at(-1);
    const continuesJoinerSequence = previous?.endsWith('\u200d') || codePoint === '\u200d';
    const continuesRegionalPair = REGIONAL_INDICATOR.test(codePoint) && regionalCount % 2 === 1;
    if (previous && (MARK_OR_VARIATION.test(codePoint) || continuesJoinerSequence || continuesRegionalPair)) {
      graphemes[graphemes.length - 1] += codePoint;
    } else {
      graphemes.push(codePoint);
    }
    regionalCount = REGIONAL_INDICATOR.test(codePoint) ? regionalCount + 1 : 0;
  }
  return graphemes;
};

export const splitPublicTitleGraphemes = (value: string) => {
  const source = String(value ?? '');
  if (!source) return [];
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    return Array.from(segmenter.segment(source), segment => segment.segment);
  }
  return fallbackGraphemes(source);
};

export const truncatePublicTitle = (value: string, maxGraphemes = DEFAULT_MAX_GRAPHEMES) => {
  const normalized = normalizeWhitespace(String(value ?? '').normalize('NFC'));
  const limit = Math.max(1, Math.floor(maxGraphemes));
  const graphemes = splitPublicTitleGraphemes(normalized);
  if (graphemes.length <= limit) return normalized;
  if (limit === 1) return '…';
  return `${graphemes.slice(0, limit - 1).join('').trimEnd()}…`;
};

const cleanPublicDocumentFileStem = (value: string) => {
  const cleaned = normalizeWhitespace(String(value ?? '')
    .normalize('NFC')
    .replace(BIDI_CONTROL_CHARACTERS, ''));
  return normalizeWhitespace(replaceInvalidFileNameCharacters(cleaned))
    .replace(/^[. ]+|[. ]+$/gu, '');
};

const stripFileExtension = (fileName: string) => {
  const lastDot = fileName.lastIndexOf('.');
  return lastDot > 0 ? fileName.slice(0, lastDot) : fileName;
};

export const sanitizePublicDocumentFileStem = (
  value: string,
  options: Readonly<{ fallback?: string; maxGraphemes?: number }> = {},
) => {
  const safeCleaned = cleanPublicDocumentFileStem(value);
  const fallback = cleanPublicDocumentFileStem(options.fallback ?? DEFAULT_TITLE) || 'document';
  const safe = safeCleaned || fallback;
  const nonReserved = WINDOWS_RESERVED_STEM.test(safe) ? `_${safe}` : safe;
  return truncatePublicTitle(nonReserved, options.maxGraphemes ?? DEFAULT_MAX_GRAPHEMES)
    .replace(/[. ]+$/gu, '');
};

const getFileStem = (fileName: string | undefined) => {
  if (!fileName) return '';
  const baseName = fileName.replace(/\\/gu, '/').split('/').filter(Boolean).at(-1) ?? '';
  const cleaned = cleanPublicDocumentFileStem(stripFileExtension(baseName));
  if (!cleaned) return '';
  return WINDOWS_RESERVED_STEM.test(cleaned) ? `_${cleaned}` : cleaned;
};

const stripMarkdownLineDecorations = (line: string) => normalizeWhitespace(line
  .replace(/^\s{0,3}(?:#{1,6}\s+|>\s*|[-+*]\s+|\d+[.)]\s+)/u, '')
  .replace(/^\[(?: |x|X)\]\s*/u, '')
  .replace(/^(`+|\*\*|__)([\s\S]*?)\1$/u, '$2')
  .replace(/\s+#{1,6}\s*$/u, ''));

const getFirstBodyLine = (source: string) => {
  const lines = String(source ?? '').split(/\r?\n|\r/u);
  let frontmatter = false;
  let fenceMarker: { char: string; length: number } | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const trimmed = raw.trim();
    if (index === 0 && trimmed === '---') {
      frontmatter = true;
      continue;
    }
    if (frontmatter) {
      if (trimmed === '---' || trimmed === '...') frontmatter = false;
      continue;
    }
    if (fenceMarker) {
      if (new RegExp(`^${fenceMarker.char}{${fenceMarker.length},}[ \\t]*$`, 'u').test(trimmed)) {
        fenceMarker = null;
      }
      continue;
    }
    const fence = trimmed.match(/^(`{3,}|~{3,})/u);
    if (fence) {
      fenceMarker = { char: fence[1][0], length: fence[1].length };
      continue;
    }
    if (
      !trimmed
      || /^(?:[-*_]\s*){3,}$/u.test(trimmed)
      || /^<!--(?:[\s\S]*?)-->$/u.test(trimmed)
      || /^!\[[^\]]*\]\([^)]*\)$/u.test(trimmed)
      || /^\[[^\]]+\]:\s*\S+/u.test(trimmed)
      || /^(?:[{}(),;]|\[|\])+$/u.test(trimmed)
    ) continue;
    const candidate = stripMarkdownLineDecorations(trimmed);
    if (candidate && VALID_BODY_CHARACTER.test(candidate)) return candidate;
  }
  return '';
};

export const inferPublicDocumentTitle = (
  options: Readonly<{
    fallbackTitle?: string;
    fileName?: string;
    maxGraphemes?: number;
    source?: string;
  }>,
): PublicDocumentTitleInference => {
  const maxGraphemes = options.maxGraphemes ?? DEFAULT_MAX_GRAPHEMES;
  const fileStem = getFileStem(options.fileName);
  const contentTitle = getFirstBodyLine(options.source ?? '');
  const fallbackTitle = normalizeWhitespace(options.fallbackTitle ?? DEFAULT_TITLE) || DEFAULT_TITLE;
  const origin: PublicDocumentTitleOrigin = fileStem ? 'filename' : contentTitle ? 'content' : 'fallback';
  const title = truncatePublicTitle(fileStem || contentTitle || fallbackTitle, maxGraphemes);
  return {
    fileStem: sanitizePublicDocumentFileStem(title, { fallback: DEFAULT_TITLE, maxGraphemes }),
    origin,
    title,
  };
};
