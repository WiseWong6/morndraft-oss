const BLOCKING_EXTERNAL_STYLESHEET_RE =
  /<link\b(?=[^>]*\brel\s*=\s*(['"]?)stylesheet\1)(?=[^>]*\bhref\s*=)(?![^>]*\bmedia\s*=)[^>]*>/gi;
const PREVIEW_DEFERABLE_STYLESHEET_RE =
  /\b(?:fonts\.googleapis\.com|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com)\b/i;
const BLOCKING_EXTERNAL_SCRIPT_RE =
  /<script\b(?=[^>]*\bsrc\s*=)(?![^>]*\b(?:async|defer)\b)[^>]*>\s*<\/script>/gi;
const SCRIPT_TAG_WITH_SRC_RE =
  /<script\b(?=[^>]*\bsrc\s*=)[^>]*>\s*<\/script>/gi;
const INLINE_SCRIPT_TAG_RE =
  /^<script\b(?![^>]*\bsrc\s*=)[^>]*>[\s\S]*?<\/script>/i;
const TAILWIND_RUNTIME_GAP_RE =
  /^(?:\s+|<!--[\s\S]*?-->|<link\b[^>]*>|<script\b(?=[^>]*\bsrc\s*=)[^>]*>\s*<\/script>)/i;
const PREVIEW_LAYOUT_CRITICAL_SCRIPT_RE = /\bcdn\.tailwindcss\.com\b/i;
const TAILWIND_CDN_SCRIPT_RE = /\bcdn\.tailwindcss\.com\b/i;
const TAILWIND_CONFIG_SCRIPT_RE = /\btailwind\s*\.\s*config\b/;
const META_REFRESH_TAG_RE =
  /<meta\b(?=[^>]*\bhttp-equiv\s*=\s*(?:"refresh"|'refresh'|refresh))[^>]*>/gi;
const SCRIPT_TAG_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const MOBILE_PREVIEW_NAVIGATION_SCRIPT_RE =
  /\b(?:window\s*\.\s*)?(?:top|parent)\s*\.\s*location\b|\b(?:window\s*\.\s*)?location\s*(?:=|\.|\[)|\bdocument\s*\.\s*location\b|\bhistory\s*\.\s*(?:go|back|forward)\s*\(|\b(?:location|window\.location)\s*\.\s*(?:reload|replace|assign)\s*\(/i;
const MOBILE_PREVIEW_NAVIGATION_EVENT_ATTR_RE =
  /\s+on[a-z]+\s*=\s*(?:"[^"]*(?:location|history\.(?:go|back|forward))[^"]*"|'[^']*(?:location|history\.(?:go|back|forward))[^']*'|[^\s>]*(?:location|history\.(?:go|back|forward))[^\s>]*)/gi;
const JAVASCRIPT_URL_ATTR_RE =
  /\s+(href|src)\s*=\s*(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*'|javascript:[^\s>]*)/gi;

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

export const applyMobileHtmlStabilityPolicy = (html: string) =>
  html
    .replace(META_REFRESH_TAG_RE, '')
    .replace(SCRIPT_TAG_RE, (tag, attributes, body) => (
      MOBILE_PREVIEW_NAVIGATION_SCRIPT_RE.test(`${attributes}\n${body}`) ? '' : tag
    ))
    .replace(MOBILE_PREVIEW_NAVIGATION_EVENT_ATTR_RE, '')
    .replace(JAVASCRIPT_URL_ATTR_RE, (_attr, name) => ` ${name}="#"`);

export const stabilizeMobileHtmlPreviewSource = applyMobileHtmlStabilityPolicy;
