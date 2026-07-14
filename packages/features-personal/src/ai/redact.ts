export const PUBLIC_AI_OMITTED_LOCAL_IMAGE_DATA = '[local image data omitted]';

export type PublicAiRedactedSpan = {
  start: number;
  end: number;
};

const PUBLIC_AI_LOCAL_IMAGE_PREFIXES = [
  'data:image/avif;base64,',
  'data:image/gif;base64,',
  'data:image/jpeg;base64,',
  'data:image/png;base64,',
  'data:image/webp;base64,',
] as const;

const PUBLIC_AI_LOCAL_IMAGE_START = 'data:image/';

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

/**
 * Locate browser-local bitmap data URLs using a deterministic linear scan.
 * HTML whitespace and percent-encoded bytes are accepted inside base64 because
 * the Fetch data URL processor percent-decodes the body before forgiving-base64
 * decode, and imported Markdown may preserve folded URLs. Prefix matching stays
 * on the original string with ASCII-only case folding so span offsets cannot
 * drift, and a new image prefix always starts a separate redaction span. Privacy
 * takes precedence over retaining ambiguous base64-looking prose after such a URL.
 */
export const collectPublicAiLocalImageDataUrlSpans = (value: string): PublicAiRedactedSpan[] => {
  const spans: PublicAiRedactedSpan[] = [];
  let searchFrom = 0;
  while (searchFrom < value.length) {
    const start = findAsciiCaseInsensitive(value, PUBLIC_AI_LOCAL_IMAGE_START, searchFrom);
    if (start < 0) break;
    const prefix = PUBLIC_AI_LOCAL_IMAGE_PREFIXES.find(candidate => (
      startsWithAsciiCaseInsensitive(value, candidate, start)
    ));
    if (!prefix) {
      searchFrom = start + 'data:image/'.length;
      continue;
    }
    let cursor = start + prefix.length;
    let hasPayload = false;
    while (cursor < value.length) {
      if (startsWithAsciiCaseInsensitive(value, PUBLIC_AI_LOCAL_IMAGE_START, cursor)) break;
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
    if (hasPayload) spans.push({ start, end: cursor });
    searchFrom = Math.max(cursor, start + prefix.length);
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
