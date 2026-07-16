export type PublicMarkdownSourceRange = { start: number; end: number };

type VisibleUnit = {
  character: string;
  sourceStart: number;
  sourceEnd: number;
};

type PublicMarkdownScanMetrics = { steps: number };
const countScanStep = (metrics: PublicMarkdownScanMetrics | undefined, count = 1) => {
  if (metrics) metrics.steps += count;
};

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: '\u00a0',
  quot: '"',
};

const PUBLIC_BROWSER_ENTITY_CACHE_MAX = 2_048;
const decodedBrowserEntities = new Map<string, string>();
let browserEntityDecoder: HTMLTextAreaElement | null = null;

/** Test-only reset for deterministic browser entity decoder coverage. */
export const resetPublicMarkdownEntityStateForTest = () => {
  decodedBrowserEntities.clear();
  browserEntityDecoder = null;
};

const decodeNumericCharacterReference = (value: string, base: number) => {
  const codePoint = Number.parseInt(value, base);
  if (
    codePoint < 9 || codePoint === 11 || (codePoint > 13 && codePoint < 32) ||
    (codePoint > 126 && codePoint < 160) ||
    (codePoint > 55_295 && codePoint < 57_344) ||
    (codePoint > 64_975 && codePoint < 65_008) ||
    codePoint % 65_536 === 65_535 || codePoint % 65_536 === 65_534 ||
    codePoint > 1_114_111
  ) return '\uFFFD';
  return String.fromCodePoint(codePoint);
};

const decodeNamedBrowserEntity = (rawEntity: string) => {
  if (typeof document === 'undefined') return null;
  const cached = decodedBrowserEntities.get(rawEntity);
  if (cached !== undefined) return cached;
  browserEntityDecoder ??= document.createElement('textarea');
  browserEntityDecoder.innerHTML = rawEntity;
  const decoded = browserEntityDecoder.value === rawEntity ? null : browserEntityDecoder.value;
  // Named references are a finite vocabulary. Unknown attacker-controlled
  // spellings must not accumulate in a process-wide cache.
  if (decoded !== null && decodedBrowserEntities.size < PUBLIC_BROWSER_ENTITY_CACHE_MAX) {
    decodedBrowserEntities.set(rawEntity, decoded);
  }
  return decoded;
};

// CommonMark bounds numeric references to seven decimal / six hexadecimal
// digits and named references to the finite HTML name vocabulary. Sticky
// matching avoids allocating `source.slice(start)` for every literal `&`.
const PUBLIC_MARKDOWN_ENTITY = /&(?:#(\d{1,7})|#x([\da-f]{1,6})|([a-z][a-z\d]{0,31}));/iyu;

const decodeEntity = (source: string, start: number) => {
  PUBLIC_MARKDOWN_ENTITY.lastIndex = start;
  const match = PUBLIC_MARKDOWN_ENTITY.exec(source);
  if (!match) return null;
  let character: string | undefined;
  if (match[1]) {
    character = decodeNumericCharacterReference(match[1], 10);
  } else if (match[2]) {
    character = decodeNumericCharacterReference(match[2], 16);
  } else if (match[3]) {
    character = NAMED_ENTITIES[match[3]] ?? decodeNamedBrowserEntity(match[0]) ?? undefined;
  }
  return character ? { character, length: match[0].length } : null;
};

const skipUpToThreeSpaces = (
  source: string,
  start: number,
  end: number,
  metrics?: PublicMarkdownScanMetrics,
) => {
  let cursor = start;
  while (cursor < end && cursor - start < 3 && source[cursor] === ' ') {
    countScanStep(metrics);
    cursor += 1;
  }
  return cursor;
};

/**
 * Skip the block marker rendered outside a Final editable node. This stays on
 * the original string: slicing the remaining tail on every short line turns a
 * 2 MiB document into quadratic allocation work.
 */
const skipLinePrefix = (
  source: string,
  start: number,
  end: number,
  metrics?: PublicMarkdownScanMetrics,
) => {
  let cursor = skipUpToThreeSpaces(source, start, end, metrics);
  if (source[cursor] === '#') {
    let markerEnd = cursor;
    while (markerEnd < end && markerEnd - cursor < 6 && source[markerEnd] === '#') {
      countScanStep(metrics);
      markerEnd += 1;
    }
    if (
      source[markerEnd] !== '#' &&
      (source[markerEnd] === ' ' || source[markerEnd] === '\t')
    ) {
      while (markerEnd < end && (source[markerEnd] === ' ' || source[markerEnd] === '\t')) {
        countScanStep(metrics);
        markerEnd += 1;
      }
      return markerEnd;
    }
  }

  cursor = start;
  let matchedQuote = false;
  while (cursor < end) {
    const markerStart = cursor;
    cursor = skipUpToThreeSpaces(source, cursor, end, metrics);
    if (source[cursor] !== '>') {
      cursor = markerStart;
      break;
    }
    countScanStep(metrics);
    cursor += 1;
    if (source[cursor] === ' ' || source[cursor] === '\t') {
      countScanStep(metrics);
      cursor += 1;
    }
    matchedQuote = true;
  }
  return matchedQuote ? cursor : start;
};

type ParsedInlineLink = {
  labelStart: number;
  labelEnd: number;
  sourceEnd: number;
};

type ParsedAutolink = { textStart: number; textEnd: number; sourceEnd: number };
type PublicMarkdownSyntaxIndex = {
  autolinks: Map<number, ParsedAutolink>;
  codeRunEnds: Map<number, number>;
  codeSpanEnds: Map<number, number>;
  links: Map<number, ParsedInlineLink>;
};

type ParenthesisFrame = {
  angleDestination: boolean;
  atDestinationStart: boolean;
  invalid: boolean;
  open: number;
  quote: '"' | "'" | null;
};

const isAsciiAlpha = (codeUnit: number) => (
  (codeUnit >= 65 && codeUnit <= 90) || (codeUnit >= 97 && codeUnit <= 122)
);
const isAsciiAlphaNumeric = (codeUnit: number) => isAsciiAlpha(codeUnit) || (codeUnit >= 48 && codeUnit <= 57);

const isUriAutolinkRange = (source: string, start: number, end: number) => {
  if (end - start < 3 || !isAsciiAlpha(source.charCodeAt(start))) return false;
  let cursor = start + 1;
  const schemeLimit = Math.min(end, start + 32);
  while (cursor < schemeLimit && source[cursor] !== ':') {
    const codeUnit = source.charCodeAt(cursor);
    if (!isAsciiAlphaNumeric(codeUnit) && source[cursor] !== '+' && source[cursor] !== '.' && source[cursor] !== '-') return false;
    cursor += 1;
  }
  if (cursor >= end || source[cursor] !== ':' || cursor - start < 2) return false;
  for (cursor += 1; cursor < end; cursor += 1) {
    const codeUnit = source.charCodeAt(cursor);
    if (codeUnit <= 0x20 || source[cursor] === '<' || source[cursor] === '>') return false;
  }
  return true;
};

const isEmailAutolinkRange = (source: string, start: number, end: number) => {
  let at = -1;
  let dotAfterAt = -1;
  for (let cursor = start; cursor < end; cursor += 1) {
    const character = source[cursor];
    if (/\s/u.test(character) || character === '<' || character === '>') return false;
    if (character === '@') {
      if (at >= 0) return false;
      at = cursor;
    } else if (character === '.' && at >= 0) {
      dotAfterAt = cursor;
    }
  }
  return at > start && dotAfterAt > at + 1 && dotAfterAt < end - 1;
};

/**
 * Pre-index the exact-run code spans, balanced labels/destinations, and
 * autolinks in forward/backward linear passes. Mapping can then decide each
 * source character once instead of rescanning the remaining 2 MiB tail for
 * every unmatched `[`, `<`, or backtick run.
 */
const createPublicMarkdownSyntaxIndex = (
  source: string,
  metrics?: PublicMarkdownScanMetrics,
): PublicMarkdownSyntaxIndex => {
  const codeRuns: Array<{ start: number; end: number; length: number }> = [];
  for (let cursor = 0; cursor < source.length;) {
    countScanStep(metrics);
    if (source[cursor] !== '`') {
      cursor += 1;
      continue;
    }
    const start = cursor;
    while (cursor < source.length && source[cursor] === '`') {
      countScanStep(metrics);
      cursor += 1;
    }
    codeRuns.push({ start, end: cursor, length: cursor - start });
  }
  const nextCodeRunByLength = new Map<number, number>();
  const codeRunEnds = new Map<number, number>();
  const codeSpanEnds = new Map<number, number>();
  for (let index = codeRuns.length - 1; index >= 0; index -= 1) {
    countScanStep(metrics);
    const run = codeRuns[index];
    codeRunEnds.set(run.start, run.end);
    const nextIndex = nextCodeRunByLength.get(run.length);
    if (nextIndex !== undefined) codeSpanEnds.set(run.start, codeRuns[nextIndex].end);
    nextCodeRunByLength.set(run.length, index);
  }

  const bracketStack: number[] = [];
  const bracketEnds = new Map<number, number>();
  for (let cursor = 0; cursor < source.length;) {
    countScanStep(metrics);
    const codeEnd = codeSpanEnds.get(cursor);
    if (codeEnd !== undefined) {
      cursor = codeEnd;
      continue;
    }
    if (source[cursor] === '\\' && cursor + 1 < source.length) {
      cursor += 2;
      continue;
    }
    if (source[cursor] === '[') bracketStack.push(cursor);
    if (source[cursor] === ']' && bracketStack.length > 0) {
      const opening = bracketStack.pop();
      if (opening !== undefined) bracketEnds.set(opening, cursor);
    }
    cursor += 1;
  }

  const parenthesisStack: ParenthesisFrame[] = [];
  const parenthesisEnds = new Map<number, number>();
  for (let cursor = 0; cursor < source.length; cursor += 1) {
    countScanStep(metrics);
    const frame = parenthesisStack.at(-1);
    const character = source[cursor];
    if (character === '\\' && cursor + 1 < source.length) {
      if (frame) frame.atDestinationStart = false;
      cursor += 1;
      continue;
    }
    if (frame?.quote) {
      if (character === frame.quote) frame.quote = null;
      continue;
    }
    if (frame?.angleDestination) {
      if (character === '>') frame.angleDestination = false;
      else if (character === '\n' || character === '\r' || character === '<') {
        frame.angleDestination = false;
        frame.invalid = true;
      }
      continue;
    }
    if (frame?.atDestinationStart && (character === ' ' || character === '\t' || character === '\n' || character === '\r')) {
      continue;
    }
    if (frame?.atDestinationStart && character === '<') {
      frame.angleDestination = true;
      frame.atDestinationStart = false;
      continue;
    }
    if (frame) frame.atDestinationStart = false;
    if (frame && (character === '"' || character === "'") && /\s/u.test(source[cursor - 1] ?? '')) {
      frame.quote = character;
      continue;
    }
    if (character === '(') {
      parenthesisStack.push({
        angleDestination: false,
        atDestinationStart: true,
        invalid: false,
        open: cursor,
        quote: null,
      });
    } else if (character === ')' && parenthesisStack.length > 0) {
      const closingFrame = parenthesisStack.pop();
      if (closingFrame && !closingFrame.invalid) parenthesisEnds.set(closingFrame.open, cursor + 1);
    }
  }

  const links = new Map<number, ParsedInlineLink>();
  for (const [labelStart, labelEnd] of bracketEnds) {
    countScanStep(metrics);
    const destinationStart = labelEnd + 1;
    if (source[destinationStart] !== '(') continue;
    const sourceEnd = parenthesisEnds.get(destinationStart);
    if (sourceEnd !== undefined) links.set(labelStart, { labelStart: labelStart + 1, labelEnd, sourceEnd });
  }

  const autolinks = new Map<number, ParsedAutolink>();
  let autolinkStart = -1;
  for (let cursor = 0; cursor < source.length; cursor += 1) {
    countScanStep(metrics);
    const character = source[cursor];
    if (character === '<') {
      autolinkStart = cursor;
      continue;
    }
    if (autolinkStart < 0) continue;
    if (character === '>' && cursor > autolinkStart + 1) {
      const textStart = autolinkStart + 1;
      if (isUriAutolinkRange(source, textStart, cursor) || isEmailAutolinkRange(source, textStart, cursor)) {
        autolinks.set(autolinkStart, { textStart, textEnd: cursor, sourceEnd: cursor + 1 });
      }
      autolinkStart = -1;
    } else if (/\s/u.test(character)) {
      autolinkStart = -1;
    }
  }
  return { autolinks, codeRunEnds, codeSpanEnds, links };
};

const PUBLIC_INLINE_HTML_START = /<(?:\/?[a-z][a-z\d-]*(?:\s|\/?>)|!--|!\[CDATA\[|\?)/iyu;
const looksLikeInlineHtmlStart = (source: string, start: number) => {
  PUBLIC_INLINE_HTML_START.lastIndex = start;
  return PUBLIC_INLINE_HTML_START.test(source);
};

const PUBLIC_SAFE_INLINE_FORMAT_TAG = /^(?:<\/?(?:em|mark|strong|u)>|<\/span>|<span style="[^"<>]+">)/iu;
const getSafePublicInlineFormatTagEnd = (source: string, start: number) => {
  const match = PUBLIC_SAFE_INLINE_FORMAT_TAG.exec(source.slice(start));
  return match ? start + match[0].length : null;
};

const getFencedCodeContentRange = (markdown: string) => {
  const firstCr = markdown.indexOf('\r');
  const firstLf = markdown.indexOf('\n');
  const firstLineEnd = firstCr < 0 ? firstLf : firstLf < 0 ? firstCr : Math.min(firstCr, firstLf);
  if (firstLineEnd < 0) return null;
  const firstLineBreakEnd = markdown[firstLineEnd] === '\r' && markdown[firstLineEnd + 1] === '\n'
    ? firstLineEnd + 2
    : firstLineEnd + 1;
  const opening = /^ {0,3}(`{3,}|~{3,})/u.exec(markdown.slice(0, firstLineEnd));
  if (!opening) return null;
  const closingLineStart = Math.max(markdown.lastIndexOf('\r'), markdown.lastIndexOf('\n')) + 1;
  if (closingLineStart < firstLineBreakEnd) return null;
  const closingLine = markdown.slice(closingLineStart);
  const markerCharacter = opening[1][0];
  const closing = new RegExp(`^ {0,3}${markerCharacter}{${opening[1].length},}[ \\t]*$`, 'u');
  return closing.test(closingLine)
    ? { start: firstLineBreakEnd, end: closingLineStart }
    : null;
};

const createLiteralVisibleUnits = (
  source: string,
  start: number,
  end: number,
  lineBreak: '\n' | ' ',
) => {
  const literal: VisibleUnit[] = [];
  let index = start;
  while (index < end) {
    if (source[index] === '\r' || source[index] === '\n') {
      const sourceEnd = source[index] === '\r' && source[index + 1] === '\n' ? index + 2 : index + 1;
      literal.push({ character: lineBreak, sourceStart: index, sourceEnd });
      index = sourceEnd;
      continue;
    }
    const character = String.fromCodePoint(source.codePointAt(index) ?? 0);
    literal.push({ character, sourceStart: index, sourceEnd: index + character.length });
    index += character.length;
  }
  return literal;
};

const getInlineCodeVisibleUnits = (source: string, start: number, end: number) => {
  const units = createLiteralVisibleUnits(source, start, end, ' ');
  return units.length > 1 && units[0].character === ' ' && units.at(-1)?.character === ' '
    && units.some(unit => unit.character !== ' ')
    ? units.slice(1, -1)
    : units;
};

const appendVisibleUnits = (target: VisibleUnit[], additions: VisibleUnit[]) => {
  for (const unit of additions) target.push(unit);
};

/**
 * Tokenize only the deterministic inline Markdown subset rendered by the
 * public Final editor. Every visible code point keeps the exact UTF-16 source
 * span that produced it, so emoji and decoded entities cannot split a source
 * token. Unsupported/ambiguous Markdown is rejected by the final visible-text
 * equality check instead of being guessed at.
 */
const mapMarkdownToVisibleUnits = (
  markdown: string,
  expectedVisibleText: string,
  metrics?: PublicMarkdownScanMetrics,
): VisibleUnit[] | null => {
  const units: VisibleUnit[] = [];
  const expectedCharacters = Array.from(expectedVisibleText);
  const fencedCode = getFencedCodeContentRange(markdown);
  if (fencedCode) {
    appendVisibleUnits(units, createLiteralVisibleUnits(markdown, fencedCode.start, fencedCode.end, '\n'));
    countScanStep(metrics, markdown.length);
    return units;
  }
  const syntax = createPublicMarkdownSyntaxIndex(markdown, metrics);
  const cursor = skipLinePrefix(markdown, 0, markdown.length, metrics);

  const appendRange = (start: number, end: number, skipBlockPrefixes = false, nestingDepth = 0): boolean => {
    if (nestingDepth > 64) return false;
    let index = start;
    while (index < end) {
      countScanStep(metrics);
      if (skipBlockPrefixes && (index === start || markdown[index - 1] === '\n' || markdown[index - 1] === '\r')) {
        index = skipLinePrefix(markdown, index, end, metrics);
        if (index >= end) break;
      }

      const character = markdown[index];

      if (character === '<') {
        const autolink = syntax.autolinks.get(index);
        if (autolink && autolink.sourceEnd <= end) {
          if (!appendRange(autolink.textStart, autolink.textEnd, false, nestingDepth + 1)) return false;
          index = autolink.sourceEnd;
          continue;
        }
        const safeInlineFormatTagEnd = getSafePublicInlineFormatTagEnd(markdown, index);
        if (safeInlineFormatTagEnd !== null && safeInlineFormatTagEnd <= end) {
          index = safeInlineFormatTagEnd;
          continue;
        }
        if (looksLikeInlineHtmlStart(markdown, index)) return false;
        if (expectedCharacters[units.length] !== '<') return false;
      }

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
        const markerEnd = syntax.codeRunEnds.get(index);
        const markerLength = markerEnd === undefined ? 1 : markerEnd - index;
        const codeSpanEnd = syntax.codeSpanEnds.get(index);
        if (codeSpanEnd !== undefined && codeSpanEnd <= end) {
          const close = codeSpanEnd - markerLength;
          appendVisibleUnits(units, getInlineCodeVisibleUnits(markdown, index + markerLength, close));
          index = codeSpanEnd;
          continue;
        }
        if (markerEnd !== undefined && markerEnd <= end) {
          appendVisibleUnits(units, createLiteralVisibleUnits(markdown, index, markerEnd, ' '));
          countScanStep(metrics, markerEnd - index);
          index = markerEnd;
          continue;
        }
      }

      if (character === '[') {
        const link = syntax.links.get(index);
        if (link && link.sourceEnd <= end) {
          if (!appendRange(link.labelStart, link.labelEnd, false, nestingDepth + 1)) return false;
          index = link.sourceEnd;
          continue;
        }
      }

      // Formatting delimiters are hidden only when the rendered text does not
      // expect the same character here. Literal arithmetic stars and in-word
      // underscores therefore keep exact source spans.
      if (character === '*' || character === '_' || character === '~') {
        if (expectedCharacters[units.length] !== character) {
          index += 1;
          continue;
        }
      }

      if (character === '\r' || character === '\n') {
        const sourceEnd = character === '\r' && markdown[index + 1] === '\n' ? index + 2 : index + 1;
        units.push({ character: '\n', sourceStart: index, sourceEnd });
        index = sourceEnd;
      } else {
        const codePointCharacter = String.fromCodePoint(markdown.codePointAt(index) ?? 0);
        units.push({
          character: codePointCharacter,
          sourceStart: index,
          sourceEnd: index + codePointCharacter.length,
        });
        index += codePointCharacter.length;
      }
    }
    return true;
  };

  return appendRange(cursor, markdown.length, true) ? units : null;
};

/** Test-only complexity probe; tree-shaken from production entry chunks. */
export const inspectPublicMarkdownMappingWorkForTest = (markdown: string, expectedVisibleText: string) => {
  const metrics: PublicMarkdownScanMetrics = { steps: 0 };
  const units = mapMarkdownToVisibleUnits(markdown, expectedVisibleText, metrics);
  return { mappedUnits: units?.length ?? -1, scanSteps: metrics.steps };
};

const splitsSharedSourceSpan = (units: readonly VisibleUnit[], visibleBoundary: number) => {
  if (visibleBoundary <= 0 || visibleBoundary >= units.length) return false;
  const before = units[visibleBoundary - 1];
  const after = units[visibleBoundary];
  return before.sourceStart === after.sourceStart && before.sourceEnd === after.sourceEnd;
};

const isUtf16CodePointBoundary = (text: string, boundary: number) => {
  if (boundary <= 0 || boundary >= text.length) return true;
  const before = text.charCodeAt(boundary - 1);
  const after = text.charCodeAt(boundary);
  return !(before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff);
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
    visibleStart < 0 || visibleEnd <= visibleStart || visibleEnd > visibleText.length ||
    !isUtf16CodePointBoundary(visibleText, visibleStart) || !isUtf16CodePointBoundary(visibleText, visibleEnd)
  ) return null;
  const units = mapMarkdownToVisibleUnits(source.slice(range.start, range.end), visibleText);
  if (!units || units.map(unit => unit.character).join('') !== visibleText) return null;

  const startIndex = Array.from(visibleText.slice(0, visibleStart)).length;
  const endIndex = startIndex + Array.from(visibleText.slice(visibleStart, visibleEnd)).length;
  // A named character reference can decode to multiple visible code points.
  // They are one indivisible source token; mapping only a subset would make a
  // later replacement silently delete or duplicate the remaining code point.
  if (splitsSharedSourceSpan(units, startIndex) || splitsSharedSourceSpan(units, endIndex)) return null;
  const first = units[startIndex];
  const last = units[endIndex - 1];
  if (!first || !last) return null;
  const start = range.start + first.sourceStart;
  const end = range.start + last.sourceEnd;
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
    || !isUtf16CodePointBoundary(visibleText, visibleOffset)
  ) return null;
  const units = mapMarkdownToVisibleUnits(source.slice(range.start, range.end), visibleText);
  if (!units || units.map(unit => unit.character).join('') !== visibleText || units.length === 0) return null;
  const codePointOffset = Array.from(visibleText.slice(0, visibleOffset)).length;
  // A named character reference can decode to multiple visible code points.
  // It remains one indivisible source token at either selection boundary.
  if (splitsSharedSourceSpan(units, codePointOffset)) return null;
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

const expandEmptyInlineCodeDeletion = (
  markdown: string,
  start: number,
  end: number,
  syntax: PublicMarkdownSyntaxIndex,
) => {
  let cursor = 0;
  while (cursor < markdown.length) {
    if (markdown[cursor] !== '`') {
      cursor += 1;
      continue;
    }
    let markerLength = 1;
    while (markdown[cursor + markerLength] === '`') markerLength += 1;
    const codeSpanEnd = syntax.codeSpanEnds.get(cursor);
    if (codeSpanEnd === undefined) {
      cursor += markerLength;
      continue;
    }
    const close = codeSpanEnd - markerLength;
    const visibleUnits = getInlineCodeVisibleUnits(markdown, cursor + markerLength, close);
    if (
      visibleUnits.length > 0
      && visibleUnits[0].sourceStart === start
      && visibleUnits.at(-1)?.sourceEnd === end
    ) return { start: cursor, end: codeSpanEnd };
    cursor = codeSpanEnd;
  }
  return null;
};

const expandEmptyInlineWrapperDeletion = (
  markdown: string,
  initialStart: number,
  initialEnd: number,
) => {
  const syntax = createPublicMarkdownSyntaxIndex(markdown);
  let start = initialStart;
  let end = initialEnd;
  let changed = true;
  while (changed) {
    changed = false;

    const codeSpan = expandEmptyInlineCodeDeletion(markdown, start, end, syntax);
    if (codeSpan) {
      start = codeSpan.start;
      end = codeSpan.end;
      changed = true;
      continue;
    }

    if (start > 0 && markdown[start - 1] === '[') {
      const link = syntax.links.get(start - 1);
      if (link?.labelStart === start && link.labelEnd === end) {
        start -= 1;
        end = link.sourceEnd;
        changed = true;
        continue;
      }
    }

    if (start > 0 && markdown[start - 1] === '<') {
      const autolink = syntax.autolinks.get(start - 1);
      if (autolink?.textStart === start && autolink.textEnd === end) {
        start -= 1;
        end = autolink.sourceEnd;
        changed = true;
        continue;
      }
    }

    const marker = markdown[start - 1];
    if (marker !== '*' && marker !== '_' && marker !== '~' && marker !== '`') continue;
    let openingStart = start;
    while (openingStart > 0 && markdown[openingStart - 1] === marker) openingStart -= 1;
    let closingEnd = end;
    while (closingEnd < markdown.length && markdown[closingEnd] === marker) closingEnd += 1;
    const openingLength = start - openingStart;
    const closingLength = closingEnd - end;
    const validMarkerLength = marker === '~' ? openingLength >= 2 : openingLength >= 1;
    if (validMarkerLength && openingLength === closingLength) {
      start = openingStart;
      end = closingEnd;
      changed = true;
    }
  }
  return { start, end };
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
  const units = mapMarkdownToVisibleUnits(markdown, previousVisibleText);
  const previousCharacters = Array.from(previousVisibleText);
  const nextCharacters = Array.from(nextVisibleText);
  if (!units || units.map(unit => unit.character).join('') !== previousVisibleText) return null;

  const prefixLength = getCommonPrefixLength(previousCharacters, nextCharacters);
  const suffixLength = getCommonSuffixLength(previousCharacters, nextCharacters, prefixLength);
  const previousEnd = previousCharacters.length - suffixLength;
  if (splitsSharedSourceSpan(units, prefixLength) || splitsSharedSourceSpan(units, previousEnd)) return null;
  let nextMiddle = nextCharacters.slice(prefixLength, nextCharacters.length - suffixLength).join('');
  const sourceLineBreak = /\r\n|\r|\n/u.exec(markdown)?.[0];
  if (sourceLineBreak && /[\r\n]/u.test(nextMiddle)) {
    nextMiddle = nextMiddle.replace(/\r\n|\r|\n/gu, sourceLineBreak);
  }
  const isInsertion = prefixLength === previousEnd;
  let markdownStart = isInsertion
    ? getInsertionBoundary(units, prefixLength)
    : (units[prefixLength]?.sourceStart ?? getInsertionBoundary(units, prefixLength));
  let markdownEnd = isInsertion
    ? markdownStart
    : (units[previousEnd - 1]?.sourceEnd ?? markdownStart);

  if (!isInsertion && nextMiddle.length === 0 && !getFencedCodeContentRange(markdown)) {
    const expanded = expandEmptyInlineWrapperDeletion(markdown, markdownStart, markdownEnd);
    markdownStart = expanded.start;
    markdownEnd = expanded.end;
  }

  return `${source.slice(0, range.start + markdownStart)}${nextMiddle}${source.slice(range.start + markdownEnd)}`;
};
