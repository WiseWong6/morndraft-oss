const MAX_IMAGE_DELIMITER_DEPTH = 4096;
const MAX_BACKTICK_RUNS = 16_384;
const MAX_CHARACTER_ESCAPE_RUNS = 16_384;
const MAX_CHARACTER_REFERENCE_STARTS = 16_384;
const MAX_EMPHASIS_DELIMITER_RUNS = 16_384;
const MAX_INLINE_ANGLE_CANDIDATES = 16_384;
const MAX_INLINE_HTML_RANGES = 65_536;
const MAX_LIVE_LABEL_STARTS = 16_384;
const MAX_LOGICAL_LINES = 16_384;
const MAX_SHORT_HTML_VALIDATION_CACHE = 2_048;

export class PublicMarkdownImageDelimiterBudgetError extends Error {}

const isAsciiLetter = (character: string | undefined) => Boolean(character && /[A-Za-z]/u.test(character));

export type PublicMarkdownInlineSegment = { end: number; start: number };
export type PublicMarkdownInlineHtmlRanges = Uint32Array;

export const assertPublicMarkdownDocumentShapeBudget = (source: string) => {
  let logicalLines = 1;
  for (let cursor = 0; cursor < source.length; cursor += 1) {
    const character = source[cursor];
    if (character !== '\n' && character !== '\r') continue;
    logicalLines += 1;
    if (logicalLines > MAX_LOGICAL_LINES) {
      throw new PublicMarkdownImageDelimiterBudgetError(
        `Markdown source exceeds the ${MAX_LOGICAL_LINES}-line safety limit.`,
      );
    }
    if (character === '\r' && source[cursor + 1] === '\n') cursor += 1;
  }
};

const findInlineHtmlCandidateEnd = (source: string, start: number) => {
  if (source.startsWith('<!--', start)) {
    if (source[start + 4] === '>') return start + 5;
    if (source[start + 4] === '-' && source[start + 5] === '>') return start + 6;
    const closing = source.indexOf('-->', start + 4);
    return closing < 0 ? -1 : closing + 3;
  }
  if (source.startsWith('<![CDATA[', start)) {
    const closing = source.indexOf(']]>', start + 9);
    return closing < 0 ? -1 : closing + 3;
  }
  if (source.startsWith('<?', start)) {
    const closing = source.indexOf('?>', start + 2);
    return closing < 0 ? -1 : closing + 2;
  }
  if (source[start + 1] === '!' && isAsciiLetter(source[start + 2])) {
    const closing = source.indexOf('>', start + 3);
    return closing < 0 ? -1 : closing + 1;
  }
  let quote: '"' | "'" | null = null;
  for (let cursor = start + 1; cursor < source.length; cursor += 1) {
    const character = source[cursor];
    if (quote) {
      if (character === quote) quote = null;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '>') {
      return cursor + 1;
    }
  }
  return -1;
};

export const getPublicMarkdownInlineHtmlRanges = (
  source: string,
  inlineBlocks: readonly (readonly PublicMarkdownInlineSegment[])[],
  isTokenizerHtml: (candidateWithEscapeContext: string, htmlStart: number) => boolean,
) => {
  const ranges: number[] = [];
  const shortValidationCache = new Map<string, boolean>();
  let angleCandidateCount = 0;
  let lastRangeStart = -1;
  let rangesOrdered = true;
  for (const block of inlineBlocks) {
    const mappings: Array<{ logicalEnd: number; logicalStart: number; rawStart: number }> = [];
    const parts: string[] = [];
    let logicalLength = 0;
    for (const segment of block) {
      const part = source.slice(segment.start, segment.end);
      parts.push(part);
      mappings.push({ logicalStart: logicalLength, logicalEnd: logicalLength + part.length, rawStart: segment.start });
      logicalLength += part.length;
    }
    const logical = parts.join('');
    let candidateWork = 0;
    const rawOffsetAt = (offset: number) => {
      let low = 0;
      let high = mappings.length - 1;
      while (low <= high) {
        const middle = (low + high) >>> 1;
        const mapping = mappings[middle]!;
        if (offset < mapping.logicalStart) high = middle - 1;
        else if (offset >= mapping.logicalEnd) low = middle + 1;
        else return mapping.rawStart + offset - mapping.logicalStart;
      }
      return -1;
    };
    for (let cursor = 0; cursor < logical.length;) {
      if (logical[cursor] !== '<') {
        cursor += 1;
        continue;
      }
      const candidateEnd = findInlineHtmlCandidateEnd(logical, cursor);
      const inspectedEnd = candidateEnd < 0 ? logical.length : candidateEnd;
      candidateWork += inspectedEnd - cursor;
      if (candidateWork > logical.length * 4 + 32) {
        throw new PublicMarkdownImageDelimiterBudgetError('Markdown inline HTML exceeds the linear scan budget.');
      }
      if (candidateEnd < 0) {
        cursor += 1;
        continue;
      }
      angleCandidateCount += 1;
      if (angleCandidateCount > MAX_INLINE_ANGLE_CANDIDATES) {
        throw new PublicMarkdownImageDelimiterBudgetError(
          `Markdown source exceeds the ${MAX_INLINE_ANGLE_CANDIDATES}-angle-candidate safety limit.`,
        );
      }
      let contextStart = cursor;
      while (contextStart > 0 && logical[contextStart - 1] === '\\') contextStart -= 1;
      const candidateWithEscapeContext = logical.slice(contextStart, candidateEnd);
      let tokenizerConfirmed = shortValidationCache.get(candidateWithEscapeContext);
      if (tokenizerConfirmed === undefined) {
        tokenizerConfirmed = isTokenizerHtml(candidateWithEscapeContext, cursor - contextStart);
        if (
          candidateWithEscapeContext.length <= 256 &&
          shortValidationCache.size < MAX_SHORT_HTML_VALIDATION_CACHE
        ) {
          shortValidationCache.set(candidateWithEscapeContext, tokenizerConfirmed);
        }
      }
      if (tokenizerConfirmed) {
        const rawStart = rawOffsetAt(cursor);
        const rawEnd = rawOffsetAt(candidateEnd - 1);
        if (rawStart >= 0 && rawEnd >= rawStart) {
          if (ranges.length / 2 >= MAX_INLINE_HTML_RANGES) {
            throw new PublicMarkdownImageDelimiterBudgetError(
              `Markdown source exceeds the ${MAX_INLINE_HTML_RANGES}-inline-HTML safety limit.`,
            );
          }
          if (rawStart < lastRangeStart) rangesOrdered = false;
          ranges.push(rawStart, rawEnd + 1);
          lastRangeStart = rawStart;
        }
        cursor = candidateEnd;
      } else {
        cursor += 1;
      }
    }
  }
  if (!rangesOrdered) {
    const pairs = Array.from({ length: ranges.length / 2 }, (_, index) => (
      [ranges[index * 2]!, ranges[index * 2 + 1]!] as const
    )).sort((left, right) => left[0] - right[0]);
    return Uint32Array.from(pairs.flat());
  }
  return Uint32Array.from(ranges);
};

const indexNextMatchingBacktickRun = (
  source: string,
  inlineBlocks: readonly (readonly PublicMarkdownInlineSegment[])[],
) => {
  const nextRunStart = new Uint32Array(source.length);
  let runCount = 0;
  for (const block of inlineBlocks) {
    const latestRawStartByLength = new Map<number, number>();
    for (let segmentIndex = block.length - 1; segmentIndex >= 0; segmentIndex -= 1) {
      const segment = block[segmentIndex]!;
      for (let cursor = segment.end - 1; cursor >= segment.start;) {
        if (source[cursor] !== '`') {
          cursor -= 1;
          continue;
        }
        const runEnd = cursor + 1;
        while (cursor >= segment.start && source[cursor] === '`') cursor -= 1;
        runCount += 1;
        if (runCount > MAX_BACKTICK_RUNS) {
          throw new PublicMarkdownImageDelimiterBudgetError(
            `Markdown source exceeds the ${MAX_BACKTICK_RUNS}-backtick-run safety limit.`,
          );
        }
        const rawRunStart = cursor + 1;
        const rawRunLength = runEnd - rawRunStart;
        let backslashStart = cursor;
        while (backslashStart >= segment.start && source[backslashStart] === '\\') backslashStart -= 1;
        const firstBacktickEscaped = (cursor - backslashStart) % 2 === 1;
        const openerStart = rawRunStart + (firstBacktickEscaped ? 1 : 0);
        const openerLength = runEnd - openerStart;
        if (openerLength > 0) {
          const next = latestRawStartByLength.get(openerLength);
          if (next !== undefined) nextRunStart[openerStart] = next + 1;
        }
        // Backslashes have no escaping meaning once a code span is open. Only
        // the complete raw run can close an earlier opener; an escaped run tail
        // may be a new opener outside code, but never a prior closer.
        latestRawStartByLength.set(rawRunLength, rawRunStart);
      }
    }
  }
  return nextRunStart;
};

export const assertPublicMarkdownImageDelimiterBudget = (
  source: string,
  inlineBlocks: readonly (readonly PublicMarkdownInlineSegment[])[],
  inlineHtmlRanges: PublicMarkdownInlineHtmlRanges,
  inertBlockRanges: Uint32Array,
) => {
  let active = false;
  let characterEscapeRuns = 0;
  let characterReferenceStarts = 0;
  let pendingAfterLabel = false;
  const delimiterStack = new Uint8Array(MAX_IMAGE_DELIMITER_DEPTH);
  let delimiterDepth = 0;
  let emphasisDelimiterRuns = 0;
  let liveLabelStarts = 0;
  let steps = 0;
  const nextMatchingBacktickRun = source.includes('`')
    ? indexNextMatchingBacktickRun(source, inlineBlocks)
    : null;
  const inlineBlockStarts = Uint32Array.from(
    inlineBlocks.map(block => block[0]?.start).filter((start): start is number => start !== undefined),
  ).sort();
  let inlineBlockStartIndex = 0;
  let inlineHtmlRangeIndex = 0;
  let inertBlockRangeIndex = 0;
  for (let cursor = 0; cursor < source.length; cursor += 1) {
    steps += 1;
    const character = source[cursor];

    while (
      inlineBlockStartIndex < inlineBlockStarts.length &&
      inlineBlockStarts[inlineBlockStartIndex]! < cursor
    ) inlineBlockStartIndex += 1;
    if (inlineBlockStarts[inlineBlockStartIndex] === cursor) {
      active = false;
      pendingAfterLabel = false;
      delimiterDepth = 0;
    }

    while (
      inertBlockRangeIndex < inertBlockRanges.length &&
      inertBlockRanges[inertBlockRangeIndex]! < cursor
    ) inertBlockRangeIndex += 2;
    const inertBlockEnd = inertBlockRanges[inertBlockRangeIndex] === cursor
      ? inertBlockRanges[inertBlockRangeIndex + 1]!
      : -1;
    if (inertBlockEnd > cursor) {
      active = false;
      pendingAfterLabel = false;
      delimiterDepth = 0;
      steps += inertBlockEnd - cursor - 1;
      cursor = inertBlockEnd - 1;
      continue;
    }

    if (character === '`') {
      let runEnd = cursor + 1;
      while (source[runEnd] === '`') runEnd += 1;
      let backslashStart = cursor - 1;
      while (backslashStart >= 0 && source[backslashStart] === '\\') backslashStart -= 1;
      const firstBacktickEscaped = (cursor - 1 - backslashStart) % 2 === 1;
      const runStart = cursor + (firstBacktickEscaped ? 1 : 0);
      const runLength = runEnd - runStart;
      if (runLength === 0) {
        cursor = runEnd - 1;
        continue;
      }
      const closingStart = (nextMatchingBacktickRun?.[runStart] ?? 0) - 1;
      if (closingStart >= 0) {
        const closingEnd = closingStart + runLength;
        steps += closingEnd - cursor - 1;
        cursor = closingEnd - 1;
      } else {
        cursor = runEnd - 1;
      }
      continue;
    }
    if (character === '<') {
      while (
        inlineHtmlRangeIndex < inlineHtmlRanges.length &&
        inlineHtmlRanges[inlineHtmlRangeIndex]! < cursor
      ) inlineHtmlRangeIndex += 2;
      const inertEnd = inlineHtmlRanges[inlineHtmlRangeIndex] === cursor
        ? inlineHtmlRanges[inlineHtmlRangeIndex + 1]!
        : -1;
      if (inertEnd > cursor) {
        steps += inertEnd - cursor - 1;
        cursor = inertEnd - 1;
        continue;
      }
    }
    if (character === '\\' && cursor + 1 < source.length) {
      characterEscapeRuns += 1;
      if (characterEscapeRuns > MAX_CHARACTER_ESCAPE_RUNS) {
        throw new PublicMarkdownImageDelimiterBudgetError(
          `Markdown source exceeds the ${MAX_CHARACTER_ESCAPE_RUNS}-escape safety limit.`,
        );
      }
      cursor += 1;
      continue;
    }
    if (character === '&' && (source[cursor + 1] === '#' || isAsciiLetter(source[cursor + 1]))) {
      characterReferenceStarts += 1;
      if (characterReferenceStarts > MAX_CHARACTER_REFERENCE_STARTS) {
        throw new PublicMarkdownImageDelimiterBudgetError(
          `Markdown source exceeds the ${MAX_CHARACTER_REFERENCE_STARTS}-character-reference safety limit.`,
        );
      }
    }
    if (character === '*' || character === '_') {
      emphasisDelimiterRuns += 1;
      if (emphasisDelimiterRuns > MAX_EMPHASIS_DELIMITER_RUNS) {
        throw new PublicMarkdownImageDelimiterBudgetError(
          `Markdown source exceeds the ${MAX_EMPHASIS_DELIMITER_RUNS}-emphasis-run safety limit.`,
        );
      }
      let runEnd = cursor + 1;
      while (source[runEnd] === character) runEnd += 1;
      steps += runEnd - cursor - 1;
      cursor = runEnd - 1;
      continue;
    }
    if (character === '[') {
      liveLabelStarts += 1;
      if (liveLabelStarts > MAX_LIVE_LABEL_STARTS) {
        throw new PublicMarkdownImageDelimiterBudgetError(
          `Markdown source exceeds the ${MAX_LIVE_LABEL_STARTS}-label safety limit.`,
        );
      }
    }
    if (!active) {
      if (character === '!' && source[cursor + 1] === '[') {
        liveLabelStarts += 1;
        if (liveLabelStarts > MAX_LIVE_LABEL_STARTS) {
          throw new PublicMarkdownImageDelimiterBudgetError(
            `Markdown source exceeds the ${MAX_LIVE_LABEL_STARTS}-label safety limit.`,
          );
        }
        active = true;
        pendingAfterLabel = false;
        delimiterStack[0] = 91;
        delimiterDepth = 1;
        cursor += 1;
      }
      continue;
    }
    if (delimiterDepth > 0) {
      if (character === '[' || character === '(') {
        if (delimiterDepth >= MAX_IMAGE_DELIMITER_DEPTH) {
          throw new PublicMarkdownImageDelimiterBudgetError(
            `Markdown image syntax exceeds the ${MAX_IMAGE_DELIMITER_DEPTH}-delimiter safety limit.`,
          );
        }
        delimiterStack[delimiterDepth] = character === '[' ? 91 : 40;
        delimiterDepth += 1;
      } else if (
        (character === ']' && delimiterStack[delimiterDepth - 1] === 91) ||
        (character === ')' && delimiterStack[delimiterDepth - 1] === 40)
      ) {
        delimiterDepth -= 1;
        if (delimiterDepth === 0) {
          if (character === ']') pendingAfterLabel = true;
          else active = false;
        }
      }
    } else if (pendingAfterLabel) {
      pendingAfterLabel = false;
      if (character === '(' || character === '[') {
        delimiterStack[0] = character === '[' ? 91 : 40;
        delimiterDepth = 1;
      }
      else {
        active = false;
        if (character === '!' && source[cursor + 1] === '[') {
          active = true;
          delimiterStack[0] = 91;
          delimiterDepth = 1;
          cursor += 1;
        }
      }
    }
  }
  return steps;
};
