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

/**
 * Locate browser-local bitmap data URLs using a deterministic linear scan.
 * HTML whitespace is accepted inside base64 because imported Markdown may
 * preserve folded URLs. Privacy takes precedence over retaining ambiguous
 * base64-looking prose after such a URL.
 */
export const collectPublicAiLocalImageDataUrlSpans = (value: string): PublicAiRedactedSpan[] => {
  const lowerValue = value.toLowerCase();
  const spans: PublicAiRedactedSpan[] = [];
  let searchFrom = 0;
  while (searchFrom < value.length) {
    const start = lowerValue.indexOf('data:image/', searchFrom);
    if (start < 0) break;
    const prefix = PUBLIC_AI_LOCAL_IMAGE_PREFIXES.find(candidate => lowerValue.startsWith(candidate, start));
    if (!prefix) {
      searchFrom = start + 'data:image/'.length;
      continue;
    }
    let cursor = start + prefix.length;
    let hasPayload = false;
    while (cursor < value.length) {
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
