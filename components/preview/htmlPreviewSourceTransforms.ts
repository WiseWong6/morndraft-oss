type HtmlPatch = {
  end: number;
  replacement: string;
  start: number;
};
type HtmlAttributeScan = HtmlPatch & {
  name: string;
  value: string;
};

const BLOCKING_EXTERNAL_STYLESHEET_RE =
  /<link\b(?=[^>]*\brel\s*=\s*(['"]?)stylesheet\1)(?=[^>]*\bhref\s*=)(?![^>]*\bmedia\s*=)[^>]*>/gi;
const PREVIEW_DEFERABLE_STYLESHEET_RE =
  /\b(?:fonts\.googleapis\.com|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com)\b/i;
const BLOCKING_EXTERNAL_SCRIPT_RE =
  /<script\b(?=[^>]*\bsrc\s*=)(?![^>]*\b(?:async|defer)\b)[^>]*>\s*<\/script\s*>/gi;
const SCRIPT_TAG_WITH_SRC_RE =
  /<script\b(?=[^>]*\bsrc\s*=)[^>]*>\s*<\/script\s*>/gi;
const INLINE_SCRIPT_TAG_RE =
  /^<script\b(?![^>]*\bsrc\s*=)[^>]*>[\s\S]*?<\/script\s*>/i;
const TAILWIND_RUNTIME_GAP_RE =
  /^(?:\s+|<!--[\s\S]*?-->|<link\b[^>]*>|<script\b(?=[^>]*\bsrc\s*=)[^>]*>\s*<\/script\s*>)/i;
const PREVIEW_LAYOUT_CRITICAL_SCRIPT_RE = /\bcdn\.tailwindcss\.com\b/i;
const TAILWIND_CDN_SCRIPT_RE = /\bcdn\.tailwindcss\.com\b/i;
const TAILWIND_CONFIG_SCRIPT_RE = /\btailwind\s*\.\s*config\b/;
const MOBILE_PREVIEW_NAVIGATION_SCRIPT_RE =
  /\b(?:window\s*\.\s*)?(?:top|parent)\s*\.\s*location\b|\b(?:window\s*\.\s*)?location\s*(?:=|\.|\[)|\bdocument\s*\.\s*location\b|\bhistory\s*\.\s*(?:go|back|forward)\s*\(|\b(?:location|window\.location)\s*\.\s*(?:reload|replace|assign)\s*\(/i;

const deferExternalScriptTag = (tag: string) => {
  if (PREVIEW_LAYOUT_CRITICAL_SCRIPT_RE.test(tag)) return tag;
  return tag.replace(/<script\b([^>]*)>/i, '<script$1 async defer>');
};

const removeAsyncDeferAttributes = (tag: string) => (
  tag.replace(/\s+\b(?:async|defer)\b(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, '')
);

const insertBeforeBodyClose = (html: string, markup: string) => {
  if (/<\/body\s*>/i.test(html)) return html.replace(/<\/body\s*>/i, `${markup}</body>`);
  return `${html}${markup}`;
};

const findTailwindConfigRuntimeScript = (html: string, startIndex: number) => {
  let preservedGap = '';
  let offset = startIndex;

  while (offset < html.length) {
    const remaining = html.slice(offset);
    const inlineScript = remaining.match(INLINE_SCRIPT_TAG_RE)?.[0] ?? '';
    if (inlineScript) {
      if (!TAILWIND_CONFIG_SCRIPT_RE.test(inlineScript)) return null;
      return {
        preservedGap,
        script: inlineScript,
        endIndex: offset + inlineScript.length,
      };
    }

    const gap = remaining.match(TAILWIND_RUNTIME_GAP_RE)?.[0] ?? '';
    if (!gap) return null;
    preservedGap += gap;
    offset += gap.length;
  }

  return null;
};

export const relocateTailwindCdnScriptsToBodyEnd = (html: string) => {
  const runtimeGroups: string[] = [];
  let withoutTailwindRuntimeGroups = '';
  let cursor = 0;
  SCRIPT_TAG_WITH_SRC_RE.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = SCRIPT_TAG_WITH_SRC_RE.exec(html)) !== null) {
    const tag = match[0];
    if (!TAILWIND_CDN_SCRIPT_RE.test(tag)) continue;

    const scriptStart = match.index;
    const scriptEnd = scriptStart + tag.length;
    const tailwindRuntimeScript = removeAsyncDeferAttributes(tag);
    const configRuntimeScript = findTailwindConfigRuntimeScript(html, scriptEnd);
    const configScript = configRuntimeScript?.script ?? '';
    const groupEnd = configRuntimeScript?.endIndex ?? scriptEnd;

    withoutTailwindRuntimeGroups += html.slice(cursor, scriptStart);
    withoutTailwindRuntimeGroups += configRuntimeScript?.preservedGap ?? '';
    runtimeGroups.push(`${tailwindRuntimeScript}${configScript}`);
    cursor = groupEnd;
    SCRIPT_TAG_WITH_SRC_RE.lastIndex = groupEnd;
  }

  if (runtimeGroups.length === 0) return html;
  withoutTailwindRuntimeGroups += html.slice(cursor);
  return insertBeforeBodyClose(withoutTailwindRuntimeGroups, runtimeGroups.join(''));
};

export const deferPreviewBlockingExternalScripts = (html: string) =>
  relocateTailwindCdnScriptsToBodyEnd(html)
    .replace(BLOCKING_EXTERNAL_STYLESHEET_RE, (tag) =>
      PREVIEW_DEFERABLE_STYLESHEET_RE.test(tag)
        ? tag.replace(/\s*\/?>$/, (close) => ` media="print" onload="this.media='all'"${close}`)
        : tag,
    )
    .replace(BLOCKING_EXTERNAL_SCRIPT_RE, deferExternalScriptTag);

const isHtmlWhitespaceCode = (code: number) =>
  code === 0x09 || code === 0x0a || code === 0x0c || code === 0x0d || code === 0x20;

const isHtmlNameStopCode = (code: number) =>
  isHtmlWhitespaceCode(code) || code === 0x2f || code === 0x3d || code === 0x3e;

const isRawTextTagName = (tagName: string) =>
  tagName === 'script' ||
  tagName === 'style' ||
  tagName === 'title' ||
  tagName === 'textarea' ||
  tagName === 'xmp';

const startsWithIgnoreCase = (source: string, offset: number, expected: string) => {
  if (offset + expected.length > source.length) return false;
  for (let index = 0; index < expected.length; index += 1) {
    if (source.charCodeAt(offset + index) === expected.charCodeAt(index)) continue;
    if (source[offset + index]?.toLowerCase() !== expected[index]?.toLowerCase()) return false;
  }
  return true;
};

const findHtmlTagEnd = (html: string, start: number) => {
  let quote = '';
  for (let offset = start + 1; offset < html.length; offset += 1) {
    const char = html[offset];
    if (quote) {
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '>') return offset;
  }
  return -1;
};

const findRawTextTagClose = (html: string, start: number, tagName: string) => {
  let cursor = start;
  while (cursor < html.length) {
    const marker = html.indexOf('</', cursor);
    if (marker < 0) {
      return { bodyEnd: html.length, end: html.length };
    }
    const nameStart = marker + 2;
    if (!startsWithIgnoreCase(html, nameStart, tagName)) {
      cursor = marker + 2;
      continue;
    }
    let afterName = nameStart + tagName.length;
    const nextCode = html.charCodeAt(afterName);
    if (!Number.isNaN(nextCode) && !isHtmlWhitespaceCode(nextCode) && nextCode !== 0x3e) {
      cursor = marker + 2;
      continue;
    }
    while (afterName < html.length && isHtmlWhitespaceCode(html.charCodeAt(afterName))) {
      afterName += 1;
    }
    if (html[afterName] === '>') {
      return { bodyEnd: marker, end: afterName + 1 };
    }
    cursor = marker + 2;
  }
  return { bodyEnd: html.length, end: html.length };
};

const skipHtmlWhitespace = (html: string, start: number, end: number) => {
  let offset = start;
  while (offset < end && isHtmlWhitespaceCode(html.charCodeAt(offset))) offset += 1;
  return offset;
};

const scanHtmlAttributes = (html: string, start: number, end: number) => {
  const attributes: HtmlAttributeScan[] = [];
  let cursor = start;
  while (cursor < end) {
    cursor = skipHtmlWhitespace(html, cursor, end);
    if (cursor >= end || html[cursor] === '/') break;

    const nameStart = cursor;
    while (cursor < end && !isHtmlNameStopCode(html.charCodeAt(cursor))) cursor += 1;
    const nameEnd = cursor;
    if (nameEnd <= nameStart) {
      cursor += 1;
      continue;
    }

    cursor = skipHtmlWhitespace(html, cursor, end);
    let value = '';
    let attributeEnd = cursor;
    if (html[cursor] === '=') {
      cursor = skipHtmlWhitespace(html, cursor + 1, end);
      const quote = html[cursor];
      if (quote === '"' || quote === "'") {
        const valueStart = cursor + 1;
        const quoteEnd = html.indexOf(quote, valueStart);
        const valueEnd = quoteEnd >= 0 && quoteEnd < end ? quoteEnd : end;
        value = html.slice(valueStart, valueEnd);
        attributeEnd = quoteEnd >= 0 && quoteEnd < end ? quoteEnd + 1 : valueEnd;
        cursor = attributeEnd;
      } else {
        const valueStart = cursor;
        while (
          cursor < end &&
          !isHtmlWhitespaceCode(html.charCodeAt(cursor)) &&
          html[cursor] !== '>'
        ) {
          cursor += 1;
        }
        value = html.slice(valueStart, cursor);
        attributeEnd = cursor;
      }
    } else {
      attributeEnd = nameEnd;
    }

    attributes.push({
      end: attributeEnd,
      name: html.slice(nameStart, nameEnd),
      replacement: '',
      start: nameStart,
      value,
    });
  }
  return attributes;
};

const scanHtmlStartTag = (html: string, start: number) => {
  if (html[start] !== '<') return null;
  if (html.startsWith('<!--', start)) {
    const commentEnd = html.indexOf('-->', start + 4);
    return {
      end: commentEnd >= 0 ? commentEnd + 3 : html.length,
      kind: 'skip' as const,
    };
  }

  const firstCode = html.charCodeAt(start + 1);
  if (firstCode === 0x21 || firstCode === 0x3f) {
    const declarationEnd = findHtmlTagEnd(html, start);
    return {
      end: declarationEnd >= 0 ? declarationEnd + 1 : html.length,
      kind: 'skip' as const,
    };
  }

  let cursor = start + 1;
  const closing = html[cursor] === '/';
  if (closing) cursor += 1;
  cursor = skipHtmlWhitespace(html, cursor, html.length);
  const nameStart = cursor;
  while (cursor < html.length && !isHtmlNameStopCode(html.charCodeAt(cursor))) cursor += 1;
  if (cursor <= nameStart) return null;

  const tagEnd = findHtmlTagEnd(html, start);
  if (tagEnd < 0) return null;
  return {
    attributeStart: cursor,
    closing,
    end: tagEnd + 1,
    kind: 'tag' as const,
    name: html.slice(nameStart, cursor).toLowerCase(),
    tagEnd,
  };
};

const normalizeAttributeProtocolValue = (value: string) => {
  let normalized = '';
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code <= 0x20 || code === 0x7f) continue;
    normalized += char;
  }
  return normalized.toLowerCase();
};

const decodeHtmlProtocolEntities = (value: string) => {
  let decoded = '';
  for (let offset = 0; offset < value.length; offset += 1) {
    const char = value[offset];
    if (char !== '&') {
      decoded += char;
      continue;
    }

    const semicolon = value.indexOf(';', offset + 1);
    if (semicolon < 0 || semicolon - offset > 16) {
      decoded += char;
      continue;
    }

    const entity = value.slice(offset + 1, semicolon).toLowerCase();
    if (entity.startsWith('#x')) {
      const codePoint = Number.parseInt(entity.slice(2), 16);
      decoded += Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : char;
      offset = semicolon;
      continue;
    }
    if (entity.startsWith('#')) {
      const codePoint = Number.parseInt(entity.slice(1), 10);
      decoded += Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : char;
      offset = semicolon;
      continue;
    }
    if (entity === 'colon') {
      decoded += ':';
      offset = semicolon;
      continue;
    }
    if (entity === 'tab') {
      decoded += '\t';
      offset = semicolon;
      continue;
    }
    if (entity === 'newline') {
      decoded += '\n';
      offset = semicolon;
      continue;
    }

    decoded += char;
  }
  return decoded;
};

const UNSAFE_NAVIGATION_PROTOCOLS = ['javascript:', 'data:', 'vbscript:'] as const;

const isUnsafeNavigationUrlValue = (value: string) => {
  const protocolValue = normalizeAttributeProtocolValue(decodeHtmlProtocolEntities(value));
  return UNSAFE_NAVIGATION_PROTOCOLS.some((protocol) => protocolValue.startsWith(protocol));
};

const makeAttributeReplacement = (name: string, value: string) => {
  const escaped = value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return `${name}="${escaped}"`;
};

const collectPreviewNavigationAttributePatches = (
  attributes: HtmlAttributeScan[],
  patches: HtmlPatch[],
) => {
  for (const attr of attributes) {
    const name = attr.name.toLowerCase();
    if (name.startsWith('on')) {
      patches.push({
        end: attr.end,
        replacement: '',
        start: attr.start,
      });
      continue;
    }

    if ((name === 'href' || name === 'src') && isUnsafeNavigationUrlValue(attr.value)) {
      patches.push({
        end: attr.end,
        replacement: makeAttributeReplacement(attr.name, '#'),
        start: attr.start,
      });
    }
  }
};

const getScannedAttributeValue = (attributes: HtmlAttributeScan[], name: string) => {
  const normalizedName = name.toLowerCase();
  return attributes.find((attr) => attr.name.toLowerCase() === normalizedName)?.value;
};

const isMetaRefreshTag = (attributes: HtmlAttributeScan[]) =>
  normalizeAttributeProtocolValue(
    decodeHtmlProtocolEntities(getScannedAttributeValue(attributes, 'http-equiv') ?? ''),
  ) === 'refresh';

const collectMobileHtmlStabilityPatches = (html: string) => {
  const patches: HtmlPatch[] = [];
  let cursor = 0;

  while (cursor < html.length) {
    const tagStart = html.indexOf('<', cursor);
    if (tagStart < 0) break;
    const tag = scanHtmlStartTag(html, tagStart);
    if (!tag) break;
    cursor = tag.end;
    if (tag.kind === 'skip' || tag.closing) continue;

    const attributes = scanHtmlAttributes(html, tag.attributeStart, tag.tagEnd);
    if (tag.name === 'meta' && isMetaRefreshTag(attributes)) {
      patches.push({
        end: tag.end,
        replacement: '',
        start: tagStart,
      });
      continue;
    }

    if (tag.name === 'script') {
      const close = findRawTextTagClose(html, tag.end, tag.name);
      const scriptSource = `${attributes.map((attr) => `${attr.name}=${attr.value}`).join('\n')}\n${html.slice(tag.end, close.bodyEnd)}`;
      if (MOBILE_PREVIEW_NAVIGATION_SCRIPT_RE.test(scriptSource)) {
        patches.push({
          end: close.end,
          replacement: '',
          start: tagStart,
        });
      } else {
        collectPreviewNavigationAttributePatches(attributes, patches);
      }
      cursor = close.end;
      continue;
    }

    collectPreviewNavigationAttributePatches(attributes, patches);
    if (isRawTextTagName(tag.name)) {
      cursor = findRawTextTagClose(html, tag.end, tag.name).end;
    }
  }

  return patches;
};

const applyHtmlPatches = (html: string, patches: HtmlPatch[]) => {
  const sortedPatches = [...patches].sort((left, right) => {
    if (left.start !== right.start) return left.start - right.start;
    return right.end - left.end;
  });
  const nonOverlappingPatches: HtmlPatch[] = [];
  let currentEnd = -1;
  for (const patch of sortedPatches) {
    if (patch.start < currentEnd) continue;
    nonOverlappingPatches.push(patch);
    currentEnd = patch.end;
  }

  let output = '';
  let cursor = 0;
  for (const patch of nonOverlappingPatches) {
    output += html.slice(cursor, patch.start);
    output += patch.replacement;
    cursor = patch.end;
  }
  output += html.slice(cursor);
  return output;
};

export const applyMobileHtmlStabilityPolicy = (html: string) => {
  const patches = collectMobileHtmlStabilityPatches(html);
  return applyHtmlPatches(html, patches);
};

export const stabilizeMobileHtmlPreviewSource = applyMobileHtmlStabilityPolicy;
