// Keep the established marker stable for downstream renderers and snapshots.
// The scanner now applies it to every data resource, not only image MIME types.
export const PUBLIC_AI_OMITTED_LOCAL_IMAGE_DATA = '[local image data omitted]';
export const PUBLIC_AI_MAX_RAW_SOURCE_CODE_UNITS = 16 * 1024 * 1024;
export const PUBLIC_AI_MAX_REDACTED_SPANS = 4_096;

export type PublicAiRedactedSpan = {
  start: number;
  end: number;
};

export type PublicAiSensitiveDataSpan = PublicAiRedactedSpan & {
  /** False means the surrounding grammar did not expose a safe resource end. */
  exact: boolean;
};

type DecodedUnit = {
  code: number;
  end: number;
};

const PUBLIC_AI_DATA_SCHEME_CODES = [0x64, 0x61, 0x74, 0x61, 0x3a] as const;
const PUBLIC_AI_MAX_DATA_URL_METADATA_CODE_UNITS = 4_096;

const isAsciiAlpha = (code: number) => (
  (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)
);

const isAsciiDigit = (code: number) => code >= 0x30 && code <= 0x39;

const isAsciiHexDigit = (code: number) => (
  isAsciiDigit(code)
  || (code >= 0x41 && code <= 0x46)
  || (code >= 0x61 && code <= 0x66)
);

const asciiHexValue = (code: number) => {
  if (isAsciiDigit(code)) return code - 0x30;
  if (code >= 0x41 && code <= 0x46) return code - 0x41 + 10;
  return code - 0x61 + 10;
};

const isAsciiWhitespace = (code: number) => (
  code === 0x09 || code === 0x0a || code === 0x0c || code === 0x0d || code === 0x20
);

const isUrlIgnoredWhitespace = (code: number) => code === 0x09 || code === 0x0a || code === 0x0d;

// Fetch permits U+0020 around the data URL `;base64` flag. Browser URL
// serializers differ for the other controls, so none may switch body grammar.
const isDataUrlMetadataSpace = (code: number) => code === 0x20;

const isAsciiSchemeCodeUnit = (code: number) => (
  isAsciiAlpha(code) || isAsciiDigit(code) || code === 0x2b || code === 0x2d || code === 0x2e
);

const toAsciiLowerCodeUnit = (code: number) => (
  code >= 0x41 && code <= 0x5a ? code + 0x20 : code
);

// Browser-relevant ASCII references that can participate in a data URL after
// HTML tokenization. Keep this fixed table small and longest-first so decoding
// remains deterministic and constant-bounded while original UTF-16 offsets are
// preserved.
const PUBLIC_AI_ASCII_NAMED_REFERENCES: ReadonlyArray<readonly [string, number]> = [
  ['&NewLine;', 0x0a],
  ['&equals;', 0x3d],
  ['&percnt;', 0x25],
  ['&colon;', 0x3a],
  ['&comma;', 0x2c],
  ['&num;', 0x23],
  ['&plus;', 0x2b],
  ['&bsol;', 0x5c],
  ['&semi;', 0x3b],
  ['&sol;', 0x2f],
  ['&Tab;', 0x09],
];

const readHtmlDecodedUnit = (value: string, start: number): DecodedUnit | null => {
  if (start >= value.length) return null;
  if (value.charCodeAt(start) !== 0x26) {
    return { code: value.charCodeAt(start), end: start + 1 };
  }

  // Numeric character references do not require a semicolon in browser URL
  // attributes. Only ASCII results matter to the data-scheme privacy check.
  if (value.charCodeAt(start + 1) === 0x23) {
    let cursor = start + 2;
    let radix = 10;
    if (value.charCodeAt(cursor) === 0x78 || value.charCodeAt(cursor) === 0x58) {
      radix = 16;
      cursor += 1;
    }
    const digitsStart = cursor;
    let decoded = 0;
    while (cursor < value.length) {
      const code = value.charCodeAt(cursor);
      const valid = radix === 16 ? isAsciiHexDigit(code) : isAsciiDigit(code);
      if (!valid) break;
      decoded = Math.min(0x11_0000, (decoded * radix) + (radix === 16 ? asciiHexValue(code) : code - 0x30));
      cursor += 1;
    }
    if (cursor > digitsStart) {
      if (value.charCodeAt(cursor) === 0x3b) cursor += 1;
      if (decoded === 0 || decoded > 0x10ffff || (decoded >= 0xd800 && decoded <= 0xdfff)) {
        decoded = 0xfffd;
      }
      return { code: decoded, end: cursor };
    }
  }

  for (const [entity, code] of PUBLIC_AI_ASCII_NAMED_REFERENCES) {
    if (value.startsWith(entity, start)) return { code, end: start + entity.length };
  }
  return { code: 0x26, end: start + 1 };
};

/**
 * HTML character references are decoded before a style attribute or style
 * element reaches the CSS tokenizer. Reading CSS escapes from the HTML-decoded
 * stream closes mixed encodings such as `&#92;64 ata&#58;` without allocating a
 * second copy of a potentially multi-megabyte document.
 */
const readCssDecodedUnit = (value: string, start: number): DecodedUnit | null => {
  const first = readHtmlDecodedUnit(value, start);
  if (!first || first.code !== 0x5c) return first;
  const second = readHtmlDecodedUnit(value, first.end);
  if (!second) return { code: 0xfffd, end: first.end };
  if (second.code === 0x0a || second.code === 0x0c) return { code: -1, end: second.end };
  if (second.code === 0x0d) {
    const third = readHtmlDecodedUnit(value, second.end);
    return { code: -1, end: third?.code === 0x0a ? third.end : second.end };
  }
  if (!isAsciiHexDigit(second.code)) return { code: second.code, end: second.end };

  let codePoint = 0;
  let digits = 0;
  let cursor = first.end;
  while (digits < 6) {
    const unit = readHtmlDecodedUnit(value, cursor);
    if (!unit || !isAsciiHexDigit(unit.code)) break;
    codePoint = (codePoint * 16) + asciiHexValue(unit.code);
    cursor = unit.end;
    digits += 1;
  }
  const trailing = readHtmlDecodedUnit(value, cursor);
  if (trailing && isAsciiWhitespace(trailing.code)) {
    cursor = trailing.end;
    if (trailing.code === 0x0d) {
      const lf = readHtmlDecodedUnit(value, cursor);
      if (lf?.code === 0x0a) cursor = lf.end;
    }
  }
  if (codePoint === 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
    codePoint = 0xfffd;
  }
  return { code: codePoint, end: cursor };
};

const readNextUrlUnit = (value: string, start: number) => {
  let cursor = start;
  while (cursor < value.length) {
    const unit = readCssDecodedUnit(value, cursor);
    if (!unit) return null;
    cursor = unit.end;
    if (unit.code === -1 || isUrlIgnoredWhitespace(unit.code)) continue;
    return { code: unit.code, end: cursor };
  }
  return null;
};

const matchDataSchemeAt = (value: string, start: number, previousDecodedCode = -1): number => {
  if (isAsciiSchemeCodeUnit(previousDecodedCode)) return -1;
  const first = readCssDecodedUnit(value, start);
  if (!first || toAsciiLowerCodeUnit(first.code) !== PUBLIC_AI_DATA_SCHEME_CODES[0]) return -1;
  let cursor = first.end;
  for (let index = 1; index < PUBLIC_AI_DATA_SCHEME_CODES.length; index += 1) {
    const unit = readNextUrlUnit(value, cursor);
    if (!unit || toAsciiLowerCodeUnit(unit.code) !== PUBLIC_AI_DATA_SCHEME_CODES[index]) return -1;
    cursor = unit.end;
  }
  return cursor;
};

const readDataUrlMetadata = (value: string, start: number) => {
  const rawEnd = Math.min(value.length, start + PUBLIC_AI_MAX_DATA_URL_METADATA_CODE_UNITS);
  let cursor = start;
  let normalized = '';
  while (cursor < rawEnd) {
    const unit = readCssDecodedUnit(value, cursor);
    if (!unit) break;
    cursor = unit.end;
    if (unit.code === -1) continue;
    if (unit.code === 0x23) {
      return { bodyStart: cursor, fragment: true, metadata: normalized, terminated: false };
    }
    if (unit.code === 0x2c) {
      return { bodyStart: cursor, fragment: false, metadata: normalized, terminated: true };
    }
    normalized += String.fromCharCode(unit.code <= 0x7f ? unit.code : 0xfffd);
  }
  return { bodyStart: cursor, fragment: false, metadata: normalized, terminated: false };
};

const metadataHasBase64Flag = (metadata: string) => {
  let end = metadata.length;
  while (end > 0 && isDataUrlMetadataSpace(metadata.charCodeAt(end - 1))) end -= 1;
  const flag = 'base64';
  const flagStart = end - flag.length;
  if (flagStart < 0) return false;
  for (let index = 0; index < flag.length; index += 1) {
    if (toAsciiLowerCodeUnit(metadata.charCodeAt(flagStart + index)) !== flag.charCodeAt(index)) return false;
  }
  let separator = flagStart;
  while (separator > 0 && isDataUrlMetadataSpace(metadata.charCodeAt(separator - 1))) separator -= 1;
  return separator > 0 && metadata.charCodeAt(separator - 1) === 0x3b;
};

const isBase64CodeUnit = (code: number) => (
  isAsciiAlpha(code) || isAsciiDigit(code) || code === 0x2b || code === 0x2f || code === 0x3d
);

const readPercentEncodedByte = (value: string, start: number) => {
  const percent = readCssDecodedUnit(value, start);
  if (percent?.code !== 0x25) return -1;
  const high = readCssDecodedUnit(value, percent.end);
  if (!high || !isAsciiHexDigit(high.code)) return -1;
  const low = readCssDecodedUnit(value, high.end);
  return low && isAsciiHexDigit(low.code) ? low.end : -1;
};

const readPreciseBase64BodyEnd = (value: string, bodyStart: number) => {
  let cursor = bodyStart;
  while (cursor < value.length) {
    if (matchDataSchemeAt(value, cursor) >= 0) break;
    const encodedEnd = readPercentEncodedByte(value, cursor);
    if (encodedEnd >= 0) {
      cursor = encodedEnd;
      continue;
    }
    const unit = readCssDecodedUnit(value, cursor);
    if (!unit) break;
    if (unit.code === 0x23) return { end: value.length, fragment: true };
    if (unit.code === -1 || isAsciiWhitespace(unit.code) || isBase64CodeUnit(unit.code)) {
      cursor = unit.end;
      continue;
    }
    break;
  }
  return { end: cursor, fragment: false };
};

const parseDataUrlAt = (
  value: string,
  start: number,
  previousDecodedCode = -1,
): PublicAiSensitiveDataSpan | null => {
  const metadataStart = matchDataSchemeAt(value, start, previousDecodedCode);
  if (metadataStart < 0) return null;
  const metadata = readDataUrlMetadata(value, metadataStart);
  if (metadata.fragment || !metadata.terminated || !metadataHasBase64Flag(metadata.metadata)) {
    return { start, end: value.length, exact: false };
  }
  const body = readPreciseBase64BodyEnd(value, metadata.bodyStart);
  return {
    start,
    end: body.end,
    exact: !body.fragment,
  };
};

/**
 * Finds every browser-relevant data scheme in one forward pass. The scanner
 * keeps original UTF-16 offsets while composing HTML character references, CSS
 * escapes and URL scheme normalization. Ambiguous non-base64 resources redact
 * the remaining field because no surrounding Markdown/HTML/CSS grammar is
 * available here to prove a safe end boundary.
 */
export const collectPublicAiSensitiveDataSpans = (value: string): PublicAiSensitiveDataSpan[] => {
  if (value.length > PUBLIC_AI_MAX_RAW_SOURCE_CODE_UNITS) {
    throw new RangeError('public_ai_raw_source_too_large');
  }
  const spans: PublicAiSensitiveDataSpan[] = [];
  let cursor = 0;
  let previousDecodedCode = -1;
  while (cursor < value.length) {
    const unit = readCssDecodedUnit(value, cursor);
    if (!unit) break;
    if (unit.code === -1) {
      cursor = unit.end;
      continue;
    }
    if (isUrlIgnoredWhitespace(unit.code)) {
      // Outside a candidate scheme, URL whitespace is also a field boundary:
      // consecutive Markdown/HTML resources are commonly separated by a new
      // line or tab. `matchDataSchemeAt` performs the whitespace removal only
      // after a boundary-qualified `d`, so folding inside `d\na\nta:` remains
      // supported without joining ordinary preceding text to the scheme.
      previousDecodedCode = -1;
      cursor = unit.end;
      continue;
    }
    const span = toAsciiLowerCodeUnit(unit.code) === PUBLIC_AI_DATA_SCHEME_CODES[0]
      ? parseDataUrlAt(value, cursor, previousDecodedCode)
      : null;
    if (!span) {
      previousDecodedCode = unit.code;
      cursor = unit.end;
      continue;
    }
    if (spans.length === PUBLIC_AI_MAX_REDACTED_SPANS) {
      const last = spans[PUBLIC_AI_MAX_REDACTED_SPANS - 1];
      spans[PUBLIC_AI_MAX_REDACTED_SPANS - 1] = {
        start: last?.start ?? span.start,
        end: value.length,
        exact: false,
      };
      break;
    }
    spans.push(span);
    if (!span.exact || span.end >= value.length) break;
    previousDecodedCode = -1;
    cursor = Math.max(unit.end, span.end);
  }
  return spans;
};

/** Backwards-compatible image-specific name retained for public consumers. */
export const collectPublicAiLocalImageDataUrlSpans = (value: string): PublicAiRedactedSpan[] => (
  collectPublicAiSensitiveDataSpans(value).map(({ start, end }) => ({ start, end }))
);

export const omitPublicAiLocalImageDataUrls = (value: string): string => {
  const spans = collectPublicAiSensitiveDataSpans(value);
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
