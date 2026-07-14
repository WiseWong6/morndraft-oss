export const PUBLIC_AI_OMITTED_LOCAL_IMAGE_DATA = '[local image data omitted]';

export type PublicAiRedactedSpan = {
  start: number;
  end: number;
};

const PUBLIC_AI_DATA_SCHEME = 'data:';
const PUBLIC_AI_IMAGE_MEDIA_TYPE = 'image/';
const PUBLIC_AI_BASE64_FLAG = 'base64';
const PUBLIC_AI_MAX_DATA_URL_METADATA_CODE_UNITS = 4_096;

const isAsciiWhitespace = (code: number) => (
  code === 0x09 || code === 0x0a || code === 0x0c || code === 0x0d || code === 0x20
);

const isBase64CodeUnit = (code: number) => (
  (code >= 0x30 && code <= 0x39)
  || (code >= 0x41 && code <= 0x5a)
  || (code >= 0x61 && code <= 0x7a)
  || code === 0x2b
  || code === 0x2f
  || code === 0x3d
);

const isAsciiHexDigit = (code: number) => (
  (code >= 0x30 && code <= 0x39)
  || (code >= 0x41 && code <= 0x46)
  || (code >= 0x61 && code <= 0x66)
);

const isPercentEncodedByteAt = (value: string, index: number) => (
  value.charCodeAt(index) === 0x25
  && index + 2 < value.length
  && isAsciiHexDigit(value.charCodeAt(index + 1))
  && isAsciiHexDigit(value.charCodeAt(index + 2))
);

const toAsciiLowerCodeUnit = (code: number) => (
  code >= 0x41 && code <= 0x5a ? code + 0x20 : code
);

const startsWithAsciiCaseInsensitive = (value: string, candidate: string, start: number) => {
  if (start < 0 || start + candidate.length > value.length) return false;
  for (let offset = 0; offset < candidate.length; offset += 1) {
    if (toAsciiLowerCodeUnit(value.charCodeAt(start + offset)) !== candidate.charCodeAt(offset)) {
      return false;
    }
  }
  return true;
};

const findAsciiCaseInsensitive = (value: string, candidate: string, searchFrom: number) => {
  const lastStart = value.length - candidate.length;
  for (let start = Math.max(0, searchFrom); start <= lastStart; start += 1) {
    if (startsWithAsciiCaseInsensitive(value, candidate, start)) return start;
  }
  return -1;
};

const trimAsciiWhitespaceStart = (value: string, start: number, end: number) => {
  let cursor = start;
  while (cursor < end && isAsciiWhitespace(value.charCodeAt(cursor))) cursor += 1;
  return cursor;
};

const trimAsciiWhitespaceEnd = (value: string, start: number, end: number) => {
  let cursor = end;
  while (cursor > start && isAsciiWhitespace(value.charCodeAt(cursor - 1))) cursor -= 1;
  return cursor;
};

const readImageMediaType = (value: string, metadataStart: number, metadataEnd: number) => {
  const start = trimAsciiWhitespaceStart(value, metadataStart, metadataEnd);
  let end = metadataEnd;
  for (let cursor = start; cursor < metadataEnd; cursor += 1) {
    if (value.charCodeAt(cursor) === 0x3b) {
      end = cursor;
      break;
    }
  }
  end = trimAsciiWhitespaceEnd(value, start, end);
  return startsWithAsciiCaseInsensitive(value, PUBLIC_AI_IMAGE_MEDIA_TYPE, start)
    && start + PUBLIC_AI_IMAGE_MEDIA_TYPE.length < end;
};

const metadataHasBase64Flag = (value: string, metadataStart: number, metadataEnd: number) => {
  const end = trimAsciiWhitespaceEnd(value, metadataStart, metadataEnd);
  const flagStart = end - PUBLIC_AI_BASE64_FLAG.length;
  if (
    flagStart < metadataStart
    || !startsWithAsciiCaseInsensitive(value, PUBLIC_AI_BASE64_FLAG, flagStart)
  ) return false;
  let separator = flagStart;
  while (separator > metadataStart && isAsciiWhitespace(value.charCodeAt(separator - 1))) separator -= 1;
  return separator > metadataStart && value.charCodeAt(separator - 1) === 0x3b;
};

type ParsedImageDataUrl = {
  bodyStart: number;
  isBase64: boolean;
  metadataTerminated: boolean;
};

/**
 * Parse only the Fetch data URL fields needed for privacy classification. The
 * metadata scan is capped so adversarial repeated `data:` text remains linear.
 * Once an `image/*` media type is visible, missing or excessively long
 * metadata is treated as unsafe instead of being sent onward.
 */
const parseImageDataUrlAt = (value: string, start: number): ParsedImageDataUrl | null => {
  if (!startsWithAsciiCaseInsensitive(value, PUBLIC_AI_DATA_SCHEME, start)) return null;
  const metadataStart = start + PUBLIC_AI_DATA_SCHEME.length;
  const scanEnd = Math.min(value.length, metadataStart + PUBLIC_AI_MAX_DATA_URL_METADATA_CODE_UNITS);
  let comma = -1;
  for (let cursor = metadataStart; cursor < scanEnd; cursor += 1) {
    if (value.charCodeAt(cursor) === 0x2c) {
      comma = cursor;
      break;
    }
  }
  if (comma < 0) {
    return readImageMediaType(value, metadataStart, scanEnd)
      ? { bodyStart: scanEnd, isBase64: false, metadataTerminated: false }
      : null;
  }
  if (!readImageMediaType(value, metadataStart, comma)) return null;
  return {
    bodyStart: comma + 1,
    isBase64: metadataHasBase64Flag(value, metadataStart, comma),
    metadataTerminated: true,
  };
};

const findNextImageDataUrl = (value: string, searchFrom: number) => {
  let cursor = searchFrom;
  while (cursor < value.length) {
    const candidate = findAsciiCaseInsensitive(value, PUBLIC_AI_DATA_SCHEME, cursor);
    if (candidate < 0) return -1;
    if (parseImageDataUrlAt(value, candidate)) return candidate;
    cursor = candidate + PUBLIC_AI_DATA_SCHEME.length;
  }
  return -1;
};

/**
 * Locate browser-local image data URLs using a deterministic bounded scan.
 * Metadata accepts arbitrary image subtypes, MIME parameters and the optional
 * whitespace before a case-insensitive `base64` flag. Base64 payloads can be
 * delimited precisely; non-base64 or unterminated image data is redacted through
 * the remaining input because its body cannot be separated safely from prose
 * without parsing the surrounding Markdown/HTML/CSS grammar. Privacy takes
 * precedence over retaining that ambiguous context.
 */
export const collectPublicAiLocalImageDataUrlSpans = (value: string): PublicAiRedactedSpan[] => {
  const spans: PublicAiRedactedSpan[] = [];
  let searchFrom = 0;
  while (searchFrom < value.length) {
    const start = findNextImageDataUrl(value, searchFrom);
    if (start < 0) break;
    const parsed = parseImageDataUrlAt(value, start);
    if (!parsed) {
      searchFrom = start + PUBLIC_AI_DATA_SCHEME.length;
      continue;
    }
    if (!parsed.metadataTerminated || !parsed.isBase64) {
      spans.push({ start, end: value.length });
      break;
    }
    let cursor = parsed.bodyStart;
    let hasPayload = false;
    while (cursor < value.length) {
      if (
        startsWithAsciiCaseInsensitive(value, PUBLIC_AI_DATA_SCHEME, cursor)
        && parseImageDataUrlAt(value, cursor)
      ) break;
      const code = value.charCodeAt(cursor);
      if (isBase64CodeUnit(code)) {
        hasPayload = true;
        cursor += 1;
        continue;
      }
      if (isAsciiWhitespace(code)) {
        cursor += 1;
        continue;
      }
      if (isPercentEncodedByteAt(value, cursor)) {
        hasPayload = true;
        cursor += 3;
        continue;
      }
      break;
    }
    spans.push({ start, end: hasPayload ? cursor : value.length });
    if (!hasPayload) break;
    searchFrom = Math.max(cursor, parsed.bodyStart);
  }
  return spans;
};

export const omitPublicAiLocalImageDataUrls = (value: string): string => {
  const spans = collectPublicAiLocalImageDataUrlSpans(value);
  if (spans.length === 0) return value;
  let cursor = 0;
  let result = '';
  for (const span of spans) {
    result += value.slice(cursor, span.start);
    result += PUBLIC_AI_OMITTED_LOCAL_IMAGE_DATA;
    cursor = span.end;
  }
  return result + value.slice(cursor);
};
