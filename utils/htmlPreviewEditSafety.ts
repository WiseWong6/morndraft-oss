const ACTIVE_HTML_ELEMENT_PATTERN = /<\s*\/?\s*(?:applet|base|embed|fencedframe|frame|frameset|iframe|link|math|meta|object|portal|script|svg)\b/i;
const INLINE_EVENT_HANDLER_PATTERN = /[\s/]+on[a-z][a-z0-9:_-]*\s*=/i;
const ACTIVE_URL_ATTRIBUTE_PATTERN = /[\s/]+(?:action|formaction|href|src|xlink:href)\s*=\s*(?:"\s*(?:javascript|data|blob)\s*:|'\s*(?:javascript|data|blob)\s*:|(?:javascript|data|blob)\s*:)/i;
const SRCDOC_ATTRIBUTE_PATTERN = /[\s/]+srcdoc\s*=/i;

const decodeCodePoint = (raw: string, radix: 10 | 16, fallback: string) => {
  const codePoint = Number.parseInt(raw, radix);
  return Number.isFinite(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
    ? String.fromCodePoint(codePoint)
    : fallback;
};

const decodeSecurityRelevantHtmlEntities = (source: string) => source
  .replace(/&#x([0-9a-f]+);?/gi, (_match, value: string) => {
    return decodeCodePoint(value, 16, _match);
  })
  .replace(/&#([0-9]+);?/g, (_match, value: string) => {
    return decodeCodePoint(value, 10, _match);
  })
  .replace(/&(colon|tab|newline);/gi, (_match, entity: string) => {
    if (entity.toLowerCase() === 'colon') return ':';
    if (entity.toLowerCase() === 'tab') return '\t';
    return '\n';
  });

const stripUrlIgnoredAsciiWhitespace = (source: string) => source.replace(/\s/g, (value) => {
  const codePoint = value.charCodeAt(0);
  return codePoint >= 9 && codePoint <= 13 ? '' : value;
});

/**
 * The live HTML preview intentionally executes user scripts in an opaque-origin
 * sandbox. The editing bridge is injected into that same document, so scripts
 * in the artifact can impersonate bridge messages. Until editing runs in a
 * separate trusted document, fail closed for every active-content primitive.
 */
export const isHtmlTrustedEditingSafe = (source: string) => {
  const normalized = stripUrlIgnoredAsciiWhitespace(
    decodeSecurityRelevantHtmlEntities(source.replace(/\0/g, '')),
  )
    .replace(/\u0020+/g, ' ');
  return !ACTIVE_HTML_ELEMENT_PATTERN.test(normalized) &&
    !INLINE_EVENT_HANDLER_PATTERN.test(normalized) &&
    !ACTIVE_URL_ATTRIBUTE_PATTERN.test(normalized) &&
    !SRCDOC_ATTRIBUTE_PATTERN.test(normalized);
};
