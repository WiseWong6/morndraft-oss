import { parse, serialize } from 'parse5';

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

/** DOM-based attribute sanitization shared by the capture and live-preview sanitizers. */
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

// ---- parse5-based fallback for non-browser environments (no DOMParser) ----

const getParsedTagName = (node) =>
  node && typeof node.tagName === 'string' ? node.tagName.toLowerCase() : '';

const getParsedAttributes = (node) => (Array.isArray(node?.attrs) ? node.attrs : []);

const removeParsedChildNode = (node) => {
  const parent = node?.parentNode;
  const siblings = parent && Array.isArray(parent.childNodes) ? parent.childNodes : null;
  if (!siblings) return;
  const index = siblings.indexOf(node);
  if (index >= 0) siblings.splice(index, 1);
};

const sanitizeParsedElement = (node) => {
  const attributes = getParsedAttributes(node);
  for (let index = attributes.length - 1; index >= 0; index -= 1) {
    const attribute = attributes[index];
    const name = attribute && typeof attribute.name === 'string' ? attribute.name.toLowerCase() : '';
    if (name.startsWith('on')) {
      attributes.splice(index, 1);
      continue;
    }
    if (NAVIGATION_URL_ATTRIBUTES.has(name) && isUnsafeNavigationUrlValue(attribute.value)) {
      attributes.splice(index, 1);
      continue;
    }
    if (name === MORNDRAFT_FLAT_EDIT_PATH_ATTR) {
      attributes.splice(index, 1);
    }
  }
  if (
    getParsedTagName(node) === 'iframe' &&
    !attributes.some(attribute => typeof attribute?.name === 'string' && attribute.name.toLowerCase() === 'sandbox')
  ) {
    attributes.push({ name: 'sandbox', value: '' });
  }
};

const sanitizeParsedDocument = (documentNode, options) => {
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    const tagName = getParsedTagName(node);
    if (tagName === 'script') {
      const hasSource = getParsedAttributes(node).some(
        attribute => typeof attribute?.name === 'string' && attribute.name.toLowerCase() === 'src',
      );
      if (options.removeScripts === 'all' || (options.removeScripts === 'inline-only' && !hasSource)) {
        removeParsedChildNode(node);
        return;
      }
    } else if (tagName === 'meta') {
      const httpEquiv = getParsedAttributes(node).find(
        attribute => typeof attribute?.name === 'string' && attribute.name.toLowerCase() === 'http-equiv',
      );
      if (httpEquiv && String(httpEquiv.value ?? '').trim().toLowerCase() === 'refresh') {
        removeParsedChildNode(node);
        return;
      }
    } else if (tagName === 'link' && options.removeRemoteFontStylesheets) {
      const rel = getParsedAttributes(node).find(
        attribute => typeof attribute?.name === 'string' && attribute.name.toLowerCase() === 'rel',
      );
      const href = getParsedAttributes(node).find(
        attribute => typeof attribute?.name === 'string' && attribute.name.toLowerCase() === 'href',
      );
      if (
        /\bstylesheet\b/i.test(String(rel?.value ?? '')) &&
        isNonBlockingRemoteFontStylesheetHref(String(href?.value ?? ''), 'about:blank')
      ) {
        removeParsedChildNode(node);
        return;
      }
    }
    sanitizeParsedElement(node);
    if (Array.isArray(node.childNodes)) {
      // Iterate a copy: removeParsedChildNode splices the live array, which
      // would otherwise skip the sibling right after a removed node.
      for (const child of [...node.childNodes]) visit(child);
    }
  };
  visit(documentNode);
  return serialize(documentNode);
};

export const sanitizeHtmlForStaticCapture = (html) => {
  if (typeof globalThis.DOMParser === 'undefined') {
    return sanitizeParsedDocument(parse(String(html ?? ''), { scriptingEnabled: true }), {
      removeRemoteFontStylesheets: true,
      removeScripts: 'all',
    });
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
    return sanitizeParsedDocument(parse(String(html ?? ''), { scriptingEnabled: true }), {
      removeScripts: 'inline-only',
    });
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
