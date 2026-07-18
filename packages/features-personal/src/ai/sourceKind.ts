import {
  CODE_FENCE_LANGUAGE_KINDS,
  getCodeFenceLanguageKind,
} from '@morndraft/core/oss-public';
import { parse, postprocess, preprocess } from 'micromark';
import { decodeString } from 'micromark-util-decode-string';
import { PUBLIC_AI_MAX_RAW_SOURCE_CODE_UNITS } from './redact';
import type { PublicAiSourceKind } from './types';

const isAsciiAlpha = (code: number) => (
  (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)
);

// Keep headroom for callers that construct an exact 2 MiB fixture by repeating
// a whole Markdown token, while still preventing the 16 MiB source ceiling
// from becoming an equally large tokenizer allocation.
const PUBLIC_AI_MAX_MARKDOWN_TOKENIZER_CODE_UNITS = 4 * 1024 * 1024;
const PUBLIC_AI_MAX_MARKDOWN_TOKENIZER_CANDIDATES = 16_384;

const isPotentialBacktickFenceAt = (source: string, start: number, runLength: number) => {
  if (runLength < 3) return false;
  let cursor = start;
  let spaces = 0;
  while (cursor > 0 && spaces < 4 && source.charCodeAt(cursor - 1) === 0x20) {
    cursor -= 1;
    spaces += 1;
  }
  if (spaces > 3) return false;
  return cursor === 0 || source.charCodeAt(cursor - 1) === 0x0a || source.charCodeAt(cursor - 1) === 0x0d;
};

const findMatchingBacktickRunEnd = (source: string, start: number, runLength: number) => {
  let cursor = start;
  while (cursor < source.length) {
    const next = source.indexOf('`', cursor);
    if (next < 0) return -1;
    let runEnd = next + 1;
    while (source.charCodeAt(runEnd) === 0x60) runEnd += 1;
    if (runEnd - next === runLength) return runEnd;
    cursor = runEnd;
  }
  return -1;
};

const hasOddPrecedingBackslashRun = (source: string, start: number) => {
  let count = 0;
  for (let cursor = start - 1; cursor >= 0 && source.charCodeAt(cursor) === 0x5c; cursor -= 1) {
    count += 1;
  }
  return count % 2 === 1;
};

const containsLineBreak = (source: string, start: number, end: number) => {
  for (let cursor = start; cursor < end; cursor += 1) {
    const code = source.charCodeAt(cursor);
    if (code === 0x0a || code === 0x0d) return true;
  }
  return false;
};

/**
 * micromark is linear for ordinary text, but adversarial delimiter, entity,
 * escape, autolink and logical-line floods can allocate hundreds of megabytes
 * before the renderer semantics are known. Source classification is a privacy
 * gate, so inputs outside this deterministic preflight fail closed instead of
 * entering the tokenizer.
 */
const markdownFitsTokenizerBudget = (source: string) => {
  if (source.length > PUBLIC_AI_MAX_MARKDOWN_TOKENIZER_CODE_UNITS) return false;
  let characterEscapes = 0;
  let characterReferences = 0;
  let emphasisRuns = 0;
  let labelOrDestinationDelimiters = 0;
  let logicalLines = 1;
  let preprocessingCandidates = 0;
  let rawMarkupCandidates = 0;
  let pendingCodeSpanTokenizerCandidates = 0;
  let codeSpanDelimiterLength = 0;
  let consecutiveBackslashes = 0;
  let previous = -1;
  for (let cursor = 0; cursor < source.length; cursor += 1) {
    const code = source.charCodeAt(cursor);
    if (code === 0x60) {
      let runEnd = cursor + 1;
      while (source.charCodeAt(runEnd) === 0x60) runEnd += 1;
      const runLength = runEnd - cursor;
      if (codeSpanDelimiterLength > 0) {
        if (runLength === codeSpanDelimiterLength) {
          codeSpanDelimiterLength = 0;
          pendingCodeSpanTokenizerCandidates = 0;
        }
      } else if (
        consecutiveBackslashes % 2 === 0
        && !isPotentialBacktickFenceAt(source, cursor, runLength)
      ) {
        // Markdown tokenizer candidates inside a matched code span are inert.
        // Hold their budget provisionally until an equal-length closer is
        // seen; if the opener remains unmatched they are ordinary Markdown
        // again and are charged at EOF.
        codeSpanDelimiterLength = runLength;
        pendingCodeSpanTokenizerCandidates = 0;
      }
      cursor = runEnd - 1;
      consecutiveBackslashes = 0;
      previous = code;
      continue;
    }
    if (codeSpanDelimiterLength > 0) {
      const isLineBreak = code === 0x0a || code === 0x0d;
      const isEmphasisRunStart = (code === 0x2a || code === 0x5f) && code !== previous;
      if (
        isLineBreak
        || code === 0x21
        || code === 0x26
        || code === 0x3c
        || code === 0x3e
        || code === 0x5b
        || code === 0x5c
        || code === 0x5d
        || code === 0x00
        || code === 0x09
        || isEmphasisRunStart
      ) {
        pendingCodeSpanTokenizerCandidates = Math.min(
          PUBLIC_AI_MAX_MARKDOWN_TOKENIZER_CANDIDATES + 1,
          pendingCodeSpanTokenizerCandidates + 1,
        );
      }
      if (code === 0x0d && source.charCodeAt(cursor + 1) === 0x0a) cursor += 1;
      previous = code;
      continue;
    }
    if (code === 0x0a || code === 0x0d) {
      logicalLines += 1;
      if (logicalLines > PUBLIC_AI_MAX_MARKDOWN_TOKENIZER_CANDIDATES) return false;
      if (code === 0x0d && source.charCodeAt(cursor + 1) === 0x0a) cursor += 1;
      consecutiveBackslashes = 0;
      previous = code;
      continue;
    }
    if (code === 0x00 || code === 0x09) {
      // micromark preprocessing replaces NUL and expands TAB into virtual
      // spaces. Dense floods therefore allocate far beyond the source size
      // before tokenization even starts.
      preprocessingCandidates += 1;
      if (preprocessingCandidates > PUBLIC_AI_MAX_MARKDOWN_TOKENIZER_CANDIDATES) return false;
    }
    if (code === 0x5c) {
      characterEscapes += 1;
      if (characterEscapes > PUBLIC_AI_MAX_MARKDOWN_TOKENIZER_CANDIDATES) return false;
      consecutiveBackslashes += 1;
    } else if (code === 0x26) {
      characterReferences += 1;
      if (characterReferences > PUBLIC_AI_MAX_MARKDOWN_TOKENIZER_CANDIDATES) return false;
      consecutiveBackslashes = 0;
    } else if (code === 0x21 || code === 0x5b || code === 0x5d) {
      labelOrDestinationDelimiters += 1;
      if (labelOrDestinationDelimiters > PUBLIC_AI_MAX_MARKDOWN_TOKENIZER_CANDIDATES) return false;
      consecutiveBackslashes = 0;
    } else {
      consecutiveBackslashes = 0;
    }
    if (code === 0x3c || code === 0x3e) {
      rawMarkupCandidates += 1;
      if (rawMarkupCandidates > PUBLIC_AI_MAX_MARKDOWN_TOKENIZER_CANDIDATES) return false;
    } else if (
      (code === 0x2a || code === 0x5f)
      && code !== previous
    ) {
      emphasisRuns += 1;
      if (emphasisRuns > PUBLIC_AI_MAX_MARKDOWN_TOKENIZER_CANDIDATES) return false;
    }
    previous = code;
  }
  if (
    codeSpanDelimiterLength > 0
    && pendingCodeSpanTokenizerCandidates > PUBLIC_AI_MAX_MARKDOWN_TOKENIZER_CANDIDATES
  ) return false;
  return true;
};

const asciiEqualsAt = (source: string, start: number, expected: string) => {
  if (start + expected.length > source.length) return false;
  for (let index = 0; index < expected.length; index += 1) {
    const code = source.charCodeAt(start + index);
    const lower = code >= 0x41 && code <= 0x5a ? code + 0x20 : code;
    if (lower !== expected.charCodeAt(index)) return false;
  }
  return true;
};

const looksLikeRawHtmlAt = (source: string, start: number) => {
  if (source.charCodeAt(start) !== 0x3c) return false;
  const next = source.charCodeAt(start + 1);
  if (next === 0x3f || next === 0x21) return true;
  const closing = next === 0x2f;
  return isAsciiAlpha(source.charCodeAt(start + (closing ? 2 : 1)));
};

const isHtmlFenceLanguage = (source: string, start: number, end: number) => {
  // mdast decodes the info string, mdast-util-to-hast takes its first
  // whitespace-separated language, and MarkdownCodeBlockRenderer then reads
  // the leading `[a-zA-Z0-9_-]+` class fragment. Mirror that complete chain:
  // `html!`, `html.preview`, encoded whitespace, and alias punctuation must not
  // become an executable iframe while escaping this source gate.
  const decodedInfo = decodeString(source.slice(start, end)).trim();
  const rendererLanguage = decodedInfo.split(/\s+/u, 1)[0]?.match(/^[a-zA-Z0-9_-]+/u)?.[0] ?? '';
  return getCodeFenceLanguageKind(rendererLanguage) === CODE_FENCE_LANGUAGE_KINDS.HTML_PREVIEW;
};

/**
 * Avoid invoking the full tokenizer when a document cannot contain either a
 * tag-like HTML start or an HTML-labelled fence. Classification still belongs
 * exclusively to micromark events; this pass is only a conservative linear
 * candidate filter for multi-megabyte plain text.
 */
const markdownCouldContainUnsafeHtmlSource = (source: string) => {
  let hasFenceMarker = false;
  let hasFenceInfoCandidate = false;
  let hasUnresolvedMultiBacktickRun = false;
  for (let cursor = 0; cursor < source.length; cursor += 1) {
    const code = source.charCodeAt(cursor);
    if (code === 0x60) {
      let runEnd = cursor + 1;
      while (source.charCodeAt(runEnd) === 0x60) runEnd += 1;
      const runLength = runEnd - cursor;
      const escapedRunStart = hasOddPrecedingBackslashRun(source, cursor);
      if (!escapedRunStart && isPotentialBacktickFenceAt(source, cursor, runLength)) {
        hasFenceMarker = true;
        cursor = runEnd - 1;
        continue;
      }
      const activeRunLength = escapedRunStart ? runLength - 1 : runLength;
      if (activeRunLength > 1) {
        hasUnresolvedMultiBacktickRun = true;
      }
      const closingRunEnd = (
        activeRunLength === 1
        && !(escapedRunStart && hasUnresolvedMultiBacktickRun)
      )
        ? findMatchingBacktickRunEnd(source, runEnd, activeRunLength)
        : -1;
      const closingStart = closingRunEnd - activeRunLength;
      if (
        closingRunEnd > 0
        && !containsLineBreak(source, runEnd, closingStart)
      ) {
        cursor = closingRunEnd - 1;
        continue;
      }
      cursor = runEnd - 1;
      continue;
    }
    if (code === 0x3c && looksLikeRawHtmlAt(source, cursor)) return true;
    if (code === 0x7e) hasFenceMarker = true;
    if (
      code === 0x26
      || code === 0x5c
      || ((code === 0x48 || code === 0x68) && asciiEqualsAt(source, cursor, 'html'))
    ) hasFenceInfoCandidate = true;
  }
  return hasFenceMarker && hasFenceInfoCandidate;
};

/**
 * Detects provider-unsafe raw HTML from the same CommonMark tokenizer events
 * that drive the renderer. HTML fences are unsafe even without an active tag;
 * ordinary fenced/inline code stays inert. Micromark points retain original
 * UTF-16 offsets, including across CRLF and multiline code spans.
 */
const markdownHasUnsafeRawHtmlSource = (source: string): boolean => {
  if (source.length > PUBLIC_AI_MAX_RAW_SOURCE_CODE_UNITS) return true;
  if (!markdownCouldContainUnsafeHtmlSource(source)) return false;
  if (!markdownFitsTokenizerBudget(source)) return true;
  try {
    const events = postprocess(parse().document().write(preprocess()(source, undefined, true)));
    for (const [phase, token] of events) {
      if (phase !== 'enter') continue;
      if (token.type === 'htmlFlow' || token.type === 'htmlText') return true;
      if (
        token.type === 'codeFencedFenceInfo'
        && isHtmlFenceLanguage(source, token.start.offset, token.end.offset)
      ) return true;
    }
    return false;
  } catch {
    return true;
  }
};

const textHasUnsafeRawHtmlSource = (source: string) => {
  for (let cursor = 0; cursor < source.length; cursor += 1) {
    if (source.charCodeAt(cursor) === 0x3c && looksLikeRawHtmlAt(source, cursor)) return true;
  }
  return false;
};

/**
 * Applies the renderer's authoritative source semantics. Markdown is the only
 * mode allowed to treat inline/fenced code as inert; plain text scans tag-like
 * input conservatively, and HTML is always provider-unsafe.
 */
export const hasPublicAiUnsafeHtmlSource = (
  source: string,
  sourceKind: PublicAiSourceKind,
): boolean => {
  if (source.length > PUBLIC_AI_MAX_RAW_SOURCE_CODE_UNITS) return true;
  if (sourceKind === 'html') return true;
  if (sourceKind === 'markdown') return markdownHasUnsafeRawHtmlSource(source);
  return textHasUnsafeRawHtmlSource(source);
};

/** Map the renderer content type to the explicit AI source semantics. */
export const getPublicAiSourceKindForContentType = (contentType: string): PublicAiSourceKind => {
  if (contentType === 'html') return 'html';
  if (contentType === 'markdown' || contentType === 'mixed') return 'markdown';
  return 'text';
};
