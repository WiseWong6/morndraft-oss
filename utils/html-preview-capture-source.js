const EVENT_HANDLER_ATTR_RE = /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const MORNDRAFT_EDIT_PATH_ATTR_RE = /\s+data-morndraft-edit-path\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const JAVASCRIPT_URL_ATTR_RE =
  /\s+(href|src|xlink:href)\s*=\s*(["'])\s*javascript:[\s\S]*?\2/gi;
const SCRIPT_TAG_RE = /<script\b[\s\S]*?<\/script>/gi;
const META_REFRESH_RE = /<meta\b[^>]*http-equiv\s*=\s*(?:"refresh"|'refresh'|refresh)[^>]*>/gi;
const UNSANDBOXED_IFRAME_RE = /<iframe\b(?![^>]*\bsandbox\s*=)([^>]*)>/gi;
const LINK_TAG_RE = /<link\b[^>]*>/gi;
const HTML_ATTRIBUTE_RE = /\s([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
const MAX_SNAPSHOT_LENGTH = 2_000_000;
const MORNDRAFT_FLAT_EDIT_PATH_ATTR = 'data-morndraft-edit-path';

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
    return stripNonBlockingRemoteFontStylesheets(html)
      .replace(SCRIPT_TAG_RE, '')
      .replace(META_REFRESH_RE, '')
      .replace(EVENT_HANDLER_ATTR_RE, '')
      .replace(MORNDRAFT_EDIT_PATH_ATTR_RE, '')
      .replace(JAVASCRIPT_URL_ATTR_RE, '')
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
    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();

      if (name.startsWith('on') || value.startsWith('javascript:')) {
        element.removeAttribute(attribute.name);
      } else if (name === MORNDRAFT_FLAT_EDIT_PATH_ATTR) {
        element.removeAttribute(attribute.name);
      }
    });

    if (element.tagName.toLowerCase() === 'iframe') {
      element.setAttribute('sandbox', '');
    }
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
