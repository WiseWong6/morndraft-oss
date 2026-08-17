const LINK_TAG_RE = /<link\b[^>]*>/gi;
const HTML_ATTRIBUTE_RE = /\s([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
const MAX_SNAPSHOT_LENGTH = 2_000_000;
const MORNDRAFT_FLAT_EDIT_PATH_ATTR = 'data-morndraft-edit-path';

const NAVIGATION_URL_ATTRIBUTES = new Set(['href', 'src', 'xlink:href', 'action', 'formaction']);
// data: URLs are only safe for inert media; anything else (data:text/html,
// data:image/svg+xml, data:text/javascript ...) can smuggle a script context.
const SAFE_DATA_URL_PREFIX_RE =
  /^data:(?:image\/(?:png|jpe?g|gif|webp|avif|bmp|apng)|font\/|audio\/|video\/|application\/(?:octet-stream|pdf|json|xml)|text\/plain)(?:[;,]|$)/i;

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

const isUnsafeNavigationUrlValue = (value) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized.startsWith('javascript:') || normalized.startsWith('vbscript:')) return true;
  if (!normalized.startsWith('data:')) return false;
  return !SAFE_DATA_URL_PREFIX_RE.test(normalized);
};

/**
 * DOM-based attribute sanitization shared by the capture and live-preview
 * sanitizers. Only browser DOM APIs are used so CodeQL models the removal as a
 * complete sanitization boundary.
 */
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

const requireHtmlDomParser = () => {
  if (typeof globalThis.DOMParser === 'undefined') {
    throw new Error('HTML preview sanitization requires DOMParser.');
  }
  return globalThis.DOMParser;
};

const collectHtmlElements = (doc, tagName) => Array.from(doc.getElementsByTagName(tagName));

export const sanitizeHtmlForStaticCapture = (html) => {
  const DocumentParser = requireHtmlDomParser();
  const doc = new DocumentParser().parseFromString(html, 'text/html');
  collectHtmlElements(doc, 'script').forEach((element) => {
    element.remove();
  });
  collectHtmlElements(doc, 'meta').forEach((element) => {
    if (String(element.getAttribute('http-equiv') ?? '').trim().toLowerCase() === 'refresh') {
      element.remove();
    }
  });
  collectHtmlElements(doc, 'link').forEach((element) => {
    if (
      /\bstylesheet\b/i.test(String(element.getAttribute('rel') ?? '')) &&
      isNonBlockingRemoteFontStylesheetHref(element.getAttribute('href'), doc.baseURI)
    ) {
      element.remove();
    }
  });
  collectHtmlElements(doc, '*').forEach((element) => {
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
  const DocumentParser = requireHtmlDomParser();
  const doc = new DocumentParser().parseFromString(String(html ?? ''), 'text/html');
  collectHtmlElements(doc, 'script').forEach((element) => {
    if (!element.getAttribute('src')) element.remove();
  });
  collectHtmlElements(doc, 'meta').forEach((element) => {
    if (String(element.getAttribute('http-equiv') ?? '').trim().toLowerCase() === 'refresh') {
      element.remove();
    }
  });
  collectHtmlElements(doc, '*').forEach((element) => {
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
