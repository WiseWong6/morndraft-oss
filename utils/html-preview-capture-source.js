const EVENT_HANDLER_ATTR_RE = /(?<![a-z0-9-])on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const MORNDRAFT_EDIT_PATH_ATTR_RE = /\s+data-morndraft-edit-path\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const INLINE_SCRIPT_TAG_RE = /<script\b(?![^>]*\bsrc\s*=)[^>]*>[\s\S]*?<\/script\s*>/gi;
const SCRIPT_TAG_RE = /<script\b[\s\S]*?<\/script>/gi;
const META_REFRESH_RE = /<meta\b[^>]*http-equiv\s*=\s*(?:"refresh"|'refresh'|refresh)[^>]*>/gi;
const UNSANDBOXED_IFRAME_RE = /<iframe\b(?![^>]*\bsandbox\s*=)([^>]*)>/gi;
const LINK_TAG_RE = /<link\b[^>]*>/gi;
const HTML_ATTRIBUTE_RE = /\s([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
const MAX_SNAPSHOT_LENGTH = 2_000_000;
const MORNDRAFT_FLAT_EDIT_PATH_ATTR = 'data-morndraft-edit-path';

const NAVIGATION_URL_ATTRIBUTES = new Set(['href', 'src', 'xlink:href', 'action', 'formaction']);
const NAVIGATION_URL_ATTR_RE =
  /\s+(?:href|src|xlink:href|action|formaction)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
// data: URLs are only safe for inert media; anything else (data:text/html,
// data:image/svg+xml, data:text/javascript ...) can smuggle a script context.
const SAFE_DATA_URL_PREFIX_RE =
  /^data:(?:image\/(?:png|jpe?g|gif|webp|avif|bmp|apng)|font\/|audio\/|video\/|application\/(?:octet-stream|pdf|json|xml)|text\/plain)(?:[;,]|$)/i;

const isUnsafeNavigationUrlValue = (value) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized.startsWith('javascript:') || normalized.startsWith('vbscript:')) return true;
  if (!normalized.startsWith('data:')) return false;
  return !SAFE_DATA_URL_PREFIX_RE.test(normalized);
};

const stripUnsafeNavigationUrlAttributes = (markup) =>
  String(markup ?? '').replace(NAVIGATION_URL_ATTR_RE, (match) => {
    const quoted = match.match(/=\s*(["'])([\s\S]*?)\1/i);
    const bare = match.match(/=\s*([^\s>]+)/i);
    const value = quoted ? quoted[2] : bare ? bare[1] : '';
    return isUnsafeNavigationUrlValue(value) ? '' : match;
  });

const sanitizeUnsafeElementAttributes = (element) => {
  Array.from(element.attributes).forEach((attribute) => {
    const name = attribute.name.toLowerCase();
    if (name.startsWith('on')) {
      element.removeAttribute(attribute.name);
      return;
    }
    if (NAVIGATION_URL_ATTRIBUTES.has(name) && isUnsafeNavigationUrlValue(attribute.value)) {
      element.removeAttribute(attribute.name);
      return;
    }
    if (name === MORNDRAFT_FLAT_EDIT_PATH_ATTR) {
      element.removeAttribute(attribute.name);
    }
  });
  if (element.tagName.toLowerCase() === 'iframe') {
    element.setAttribute('sandbox', '');
  }
};

const readIframeSrcDoc = (iframe) => iframe?.srcdoc || iframe?.getAttribute?.('srcdoc') || '';

const clampSnapshotHtml = (html) =>
  html.length > MAX_SNAPSHOT_LENGTH ? html.slice(0, MAX_SNAPSHOT_LENGTH) : html;

const getHtmlAttribute = (tag, attributeName) => {
  HTML_ATTRIBUTE_RE.lastIndex = 0;
  const normalizedName = attributeName.toLowerCase();
  let match = HTML_ATTRIBUTE_RE.exec(tag);
  while (match) {
    if (match[1].toLowerCase() === normalizedName) {
      return match[2] ?? match[3] ?? match[4] ?? '';
    }
    match = HTML_ATTRIBUTE_RE.exec(tag);
  }
  return '';
};

export const isNonBlockingRemoteFontStylesheetHref = (href, baseHref = globalThis.location?.href ?? 'about:blank') => {
  if (!href) return false;

  try {
    const url = new globalThis.URL(href, baseHref);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    return url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  } catch {
    return false;
  }
};

export const stripNonBlockingRemoteFontStylesheets = (html) =>
  String(html ?? '').replace(LINK_TAG_RE, (tag) => {
    const rel = getHtmlAttribute(tag, 'rel');
    const href = getHtmlAttribute(tag, 'href');
    if (/\bstylesheet\b/i.test(rel) && isNonBlockingRemoteFontStylesheetHref(href)) {
      return '';
    }
    return tag;
  });

export const sanitizeHtmlForStaticCapture = (html) => {
  if (typeof globalThis.DOMParser === 'undefined') {
    return stripUnsafeNavigationUrlAttributes(stripNonBlockingRemoteFontStylesheets(html))
      .replace(SCRIPT_TAG_RE, '')
      .replace(META_REFRESH_RE, '')
      .replace(EVENT_HANDLER_ATTR_RE, '')
      .replace(MORNDRAFT_EDIT_PATH_ATTR_RE, '')
      .replace(UNSANDBOXED_IFRAME_RE, '<iframe sandbox=""$1>');
  }

  const doc = new globalThis.DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, meta[http-equiv="refresh"]').forEach((element) => {
    element.remove();
  });
  doc.querySelectorAll('link[rel~="stylesheet"][href]').forEach((element) => {
    if (isNonBlockingRemoteFontStylesheetHref(element.getAttribute('href'), doc.baseURI)) {
      element.remove();
    }
  });
  doc.querySelectorAll('*').forEach((element) => {
    sanitizeUnsafeElementAttributes(element);
  });

  return `<!doctype html>\n${doc.documentElement.outerHTML}`;
};

/**
 * Sanitizer for public live previews (publicStrict): keeps author-authored
 * external <script src> tags and remote font stylesheets in the srcdoc so
 * CDN-driven samples (Tailwind, Google Fonts, Font Awesome) can render, while
 * still stripping inline (src-less) scripts, inline event handlers, unsafe
 * navigation URLs, meta refresh, and forcing sandbox on iframes. The
 * relaxed-but-nonced CSP then decides what actually executes: whitelisted CDN
 * scripts run, arbitrary inline scripts do not.
 */
export const sanitizeHtmlForPublicLivePreview = (html) => {
  if (typeof globalThis.DOMParser === 'undefined') {
    return stripUnsafeNavigationUrlAttributes(String(html ?? ''))
      .replace(INLINE_SCRIPT_TAG_RE, '')
      .replace(META_REFRESH_RE, '')
      .replace(EVENT_HANDLER_ATTR_RE, '')
      .replace(MORNDRAFT_EDIT_PATH_ATTR_RE, '')
      .replace(UNSANDBOXED_IFRAME_RE, '<iframe sandbox=""$1>');
  }

  const doc = new globalThis.DOMParser().parseFromString(String(html ?? ''), 'text/html');
  doc.querySelectorAll('script:not([src]), meta[http-equiv="refresh"]').forEach((element) => {
    element.remove();
  });
  doc.querySelectorAll('*').forEach((element) => {
    sanitizeUnsafeElementAttributes(element);
  });

  return `<!doctype html>\n${doc.documentElement.outerHTML}`;
};

export const getHtmlPreviewCaptureSource = (iframe) => {
  const srcDoc = readIframeSrcDoc(iframe);
  if (!srcDoc.trim()) {
    throw new Error('HTML preview source is not ready');
  }

  return sanitizeHtmlForStaticCapture(srcDoc);
};

const getHtmlPreviewSnapshotSourceFromHtml = async (html, options = {}) => {
  const srcDoc = String(html ?? '');
  if (!srcDoc.trim()) {
    throw new Error('HTML preview source is not ready');
  }
  void options;
  return sanitizeHtmlForStaticCapture(clampSnapshotHtml(srcDoc));
};

export const getHtmlPreviewSnapshotSource = async (iframe, options = {}) =>
  getHtmlPreviewSnapshotSourceFromHtml(readIframeSrcDoc(iframe), options);
