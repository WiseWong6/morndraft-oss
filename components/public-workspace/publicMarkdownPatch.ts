export type PublicMarkdownSourceRange = { start: number; end: number };

type VisibleUnit = {
  character: string;
  sourceStart: number;
  sourceEnd: number;
};

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: '\u00a0',
  quot: '"',
};

const decodeEntity = (source: string, start: number) => {
  const match = /^&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/iu.exec(source.slice(start));
  if (!match) return null;
  let character: string | undefined;
  if (match[1]) {
    const codePoint = Number.parseInt(match[1], 10);
    if (Number.isFinite(codePoint) && codePoint <= 0x10ffff) character = String.fromCodePoint(codePoint);
  } else if (match[2]) {
    const codePoint = Number.parseInt(match[2], 16);
    if (Number.isFinite(codePoint) && codePoint <= 0x10ffff) character = String.fromCodePoint(codePoint);
  } else if (match[3]) {
    character = NAMED_ENTITIES[match[3].toLowerCase()];
  }
  return character ? { character, length: match[0].length } : null;
};

const skipLinePrefix = (source: string, cursor: number, end: number) => {
  const rest = source.slice(cursor, end);
  const heading = /^(?: {0,3})#{1,6}[\t ]+/u.exec(rest);
  if (heading) return cursor + heading[0].length;
  const quote = /^(?: {0,3}>[\t ]?)+/u.exec(rest);
  if (quote) return cursor + quote[0].length;
  return cursor;
};

/**
 * Tokenize only the deterministic inline Markdown subset rendered by the
 * public Final editor. Every visible code point keeps the exact UTF-16 source
 * span that produced it, so emoji and decoded entities cannot split a source
 * token. Unsupported/ambiguous Markdown is rejected by the final visible-text
 * equality check instead of being guessed at.
 */
const mapMarkdownToVisibleUnits = (markdown: string): VisibleUnit[] | null => {
  const units: VisibleUnit[] = [];
  const cursor = skipLinePrefix(markdown, 0, markdown.length);

  const appendRange = (start: number, end: number): boolean => {
    let index = start;
    while (index < end) {
      if (index === start || markdown[index - 1] === '\n') {
        index = skipLinePrefix(markdown, index, end);
        if (index >= end) break;
      }

      const character = markdown[index];
      if (character === '<') return false;

      if (character === '\\' && index + 1 < end) {
        const escaped = String.fromCodePoint(markdown.codePointAt(index + 1) ?? 0);
        units.push({ character: escaped, sourceStart: index, sourceEnd: index + 1 + escaped.length });
        index += 1 + escaped.length;
        continue;
      }

      if (character === '&') {
        const entity = decodeEntity(markdown, index);
        if (entity) {
          for (const decodedCharacter of Array.from(entity.character)) {
            units.push({
              character: decodedCharacter,
              sourceStart: index,
              sourceEnd: index + entity.length,
            });
          }
          index += entity.length;
          continue;
        }
      }

      if (character === '`') {
        let markerLength = 1;
        while (markdown[index + markerLength] === '`') markerLength += 1;
        const marker = '`'.repeat(markerLength);
        const close = markdown.indexOf(marker, index + markerLength);
        if (close < 0 || close >= end) return false;
        if (!appendRange(index + markerLength, close)) return false;
        index = close + markerLength;
        continue;
      }

      if (character === '[') {
        const labelEnd = markdown.indexOf('](', index + 1);
        if (labelEnd >= 0 && labelEnd < end) {
          const destinationEnd = markdown.indexOf(')', labelEnd + 2);
          if (destinationEnd < 0 || destinationEnd >= end) return false;
          if (!appendRange(index + 1, labelEnd)) return false;
          index = destinationEnd + 1;
          continue;
        }
      }

      // Formatting delimiters are not visible. If one is literal, the exact
      // visible-text check below fails and the edit is safely rejected.
      if (character === '*' || character === '_' || character === '~') {
        index += 1;
        continue;
      }

      const codePointCharacter = String.fromCodePoint(markdown.codePointAt(index) ?? 0);
      units.push({
        character: codePointCharacter,
        sourceStart: index,
        sourceEnd: index + codePointCharacter.length,
      });
      index += codePointCharacter.length;
    }
    return true;
  };

  const firstLineEnd = markdown.indexOf('\n');
  if (firstLineEnd >= 0) {
    const opening = /^ {0,3}(`{3,}|~{3,})/u.exec(markdown.slice(0, firstLineEnd));
    const closingLineStart = markdown.lastIndexOf('\n') + 1;
    const closingLine = markdown.slice(closingLineStart);
    if (opening) {
      const markerCharacter = opening[1][0];
      const closing = new RegExp(`^ {0,3}${markerCharacter}{${opening[1].length},}[ \\t]*$`, 'u');
      if (closing.test(closingLine)) {
        return appendRange(firstLineEnd + 1, closingLineStart) ? units : null;
      }
    }
  }
  return appendRange(cursor, markdown.length) ? units : null;
};

export const resolvePublicMarkdownVisibleSourceRange = ({
  source,
  range,
  visibleText,
  visibleStart,
  visibleEnd,
}: {
  source: string;
  range: PublicMarkdownSourceRange;
  visibleText: string;
  visibleStart: number;
  visibleEnd: number;
}) => {
  if (
    range.start < 0 || range.end < range.start || range.end > source.length ||
    visibleStart < 0 || visibleEnd <= visibleStart || visibleEnd > visibleText.length
  ) return null;
  const units = mapMarkdownToVisibleUnits(source.slice(range.start, range.end));
  if (!units || units.map(unit => unit.character).join('') !== visibleText) return null;

  const start = resolvePublicMarkdownVisibleSourceOffset({
    source,
    range,
    visibleText,
    visibleOffset: visibleStart,
    edge: 'start',
  });
  const end = resolvePublicMarkdownVisibleSourceOffset({
    source,
    range,
    visibleText,
    visibleOffset: visibleEnd,
    edge: 'end',
  });
  if (start === null || end === null || end <= start) return null;
  return { start, end, sourceText: source.slice(start, end) };
};

export const resolvePublicMarkdownVisibleSourceOffset = ({
  source,
  range,
  visibleText,
  visibleOffset,
  edge,
}: {
  source: string;
  range: PublicMarkdownSourceRange;
  visibleText: string;
  visibleOffset: number;
  edge: 'start' | 'end';
}) => {
  if (
    range.start < 0 || range.end < range.start || range.end > source.length
    || visibleOffset < 0 || visibleOffset > visibleText.length
  ) return null;
  const units = mapMarkdownToVisibleUnits(source.slice(range.start, range.end));
  if (!units || units.map(unit => unit.character).join('') !== visibleText || units.length === 0) return null;
  const codePointOffset = Array.from(visibleText.slice(0, visibleOffset)).length;
  if (edge === 'start') {
    const unit = units[Math.min(codePointOffset, units.length - 1)];
    return range.start + (codePointOffset >= units.length ? units[units.length - 1].sourceEnd : unit.sourceStart);
  }
  const unit = units[Math.max(0, Math.min(codePointOffset - 1, units.length - 1))];
  return range.start + (codePointOffset <= 0 ? units[0].sourceStart : unit.sourceEnd);
};

const getCommonPrefixLength = (left: readonly string[], right: readonly string[]) => {
  const limit = Math.min(left.length, right.length);
  let index = 0;
  while (index < limit && left[index] === right[index]) index += 1;
  return index;
};

const getCommonSuffixLength = (
  left: readonly string[],
  right: readonly string[],
  prefixLength: number,
) => {
  const limit = Math.min(left.length, right.length) - prefixLength;
  let length = 0;
  while (length < limit && left[left.length - 1 - length] === right[right.length - 1 - length]) length += 1;
  return length;
};

const getInsertionBoundary = (units: readonly VisibleUnit[], visibleBoundary: number) => {
  if (units.length === 0) return 0;
  if (visibleBoundary <= 0) return units[0].sourceStart;
  return units[Math.min(visibleBoundary, units.length) - 1].sourceEnd;
};

export const patchPublicMarkdownVisibleText = ({
  source,
  range,
  previousVisibleText,
  nextVisibleText,
}: {
  source: string;
  range: PublicMarkdownSourceRange;
  previousVisibleText: string;
  nextVisibleText: string;
}) => {
  if (previousVisibleText === nextVisibleText) return source;
  if (range.start < 0 || range.end < range.start || range.end > source.length) return null;

  const markdown = source.slice(range.start, range.end);
  const units = mapMarkdownToVisibleUnits(markdown);
  const previousCharacters = Array.from(previousVisibleText);
  const nextCharacters = Array.from(nextVisibleText);
  if (!units || units.map(unit => unit.character).join('') !== previousVisibleText) return null;

  const prefixLength = getCommonPrefixLength(previousCharacters, nextCharacters);
  const suffixLength = getCommonSuffixLength(previousCharacters, nextCharacters, prefixLength);
  const previousEnd = previousCharacters.length - suffixLength;
  const nextMiddle = nextCharacters.slice(prefixLength, nextCharacters.length - suffixLength).join('');
  const isInsertion = prefixLength === previousEnd;
  const markdownStart = isInsertion
    ? getInsertionBoundary(units, prefixLength)
    : (units[prefixLength]?.sourceStart ?? getInsertionBoundary(units, prefixLength));
  const markdownEnd = isInsertion
    ? markdownStart
    : (units[previousEnd - 1]?.sourceEnd ?? markdownStart);

  return `${source.slice(0, range.start + markdownStart)}${nextMiddle}${source.slice(range.start + markdownEnd)}`;
};
