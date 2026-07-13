export type PublicStandaloneFence = Readonly<{
  closing: string;
  content: string;
  contentStart: number;
  info: string;
  language: string;
  marker: string;
  opening: string;
  openingLineBreak: '\n' | '\r\n';
  closingLineBreak: '\n' | '\r\n';
}>;

const isHorizontalFenceWhitespace = (character: string | undefined) => (
  character === ' ' || character === '\t'
);

const isTrailingFenceWhitespace = (character: string | undefined) => (
  isHorizontalFenceWhitespace(character) || character === '\r' || character === '\n'
);

const readFenceLineBreakLength = (value: string, index: number) => {
  if (value[index] === '\n') return 1;
  if (value[index] === '\r' && value[index + 1] === '\n') return 2;
  return 0;
};

const readStandaloneFenceOpening = (value: string) => {
  let index = 0;
  while (index < value.length) {
    while (isHorizontalFenceWhitespace(value[index])) index += 1;
    const blankLineBreakLength = readFenceLineBreakLength(value, index);
    if (blankLineBreakLength === 0) break;
    index += blankLineBreakLength;
  }

  const markerStart = index;
  const markerCharacter = value[index];
  if (markerCharacter !== '`' && markerCharacter !== '~') return null;
  while (value[index] === markerCharacter) index += 1;
  const marker = value.slice(markerStart, index);
  if (marker.length < 3) return null;
  while (isHorizontalFenceWhitespace(value[index])) index += 1;
  const infoStart = index;
  while (index < value.length && value[index] !== '\r' && value[index] !== '\n') index += 1;
  const openingLineBreakLength = readFenceLineBreakLength(value, index);
  if (openingLineBreakLength === 0) return null;
  return {
    contentStart: index + openingLineBreakLength,
    info: value.slice(infoStart, index),
    marker,
    openingEnd: index,
  };
};

const readStandaloneFenceClosing = (value: string, contentStart: number, openingMarker: string) => {
  let index = value.length - 1;
  while (index >= contentStart && isTrailingFenceWhitespace(value[index])) index -= 1;
  const markerCharacter = value[index];
  if (markerCharacter !== openingMarker[0]) return null;
  const markerEnd = index + 1;
  while (index >= contentStart && value[index] === markerCharacter) index -= 1;
  const markerStart = index + 1;
  if (markerEnd - markerStart < openingMarker.length) return null;
  while (index >= contentStart && isHorizontalFenceWhitespace(value[index])) index -= 1;
  if (value[index] !== '\n') return null;
  const closingLineBreakStart = index > contentStart && value[index - 1] === '\r'
    ? index - 1
    : index;
  if (closingLineBreakStart < contentStart) return null;
  return {
    closingLineBreakStart,
    closingStart: index + 1,
  };
};

export const normalizePublicFenceInfoLanguage = (value: string) => (
  value.trim().split(/\s+/u, 1)[0]?.toLowerCase() ?? ''
);

/**
 * Parses the one closed top-level fence contract used by browser-local
 * delivery. It remains self-contained so this framework-agnostic package has
 * no workspace dependency and can be projected into an OSS candidate alone.
 */
export const parsePublicStandaloneFence = (source: string): PublicStandaloneFence | null => {
  const value = String(source ?? '');
  const opening = readStandaloneFenceOpening(value);
  if (!opening) return null;
  const closing = readStandaloneFenceClosing(value, opening.contentStart, opening.marker);
  if (!closing) return null;
  return {
    closing: value.slice(closing.closingStart),
    content: value.slice(opening.contentStart, closing.closingLineBreakStart),
    contentStart: opening.contentStart,
    info: opening.info,
    language: normalizePublicFenceInfoLanguage(opening.info),
    marker: opening.marker,
    opening: value.slice(0, opening.openingEnd),
    openingLineBreak: value.slice(opening.openingEnd, opening.contentStart) as '\n' | '\r\n',
    closingLineBreak: value.slice(
      closing.closingLineBreakStart,
      closing.closingStart,
    ) as '\n' | '\r\n',
  };
};

export const extractPublicRawHtmlSource = (source: string) => {
  const fence = parsePublicStandaloneFence(source);
  return fence && (fence.language === 'html' || fence.language === 'html-preview')
    ? fence.content
    : source;
};
