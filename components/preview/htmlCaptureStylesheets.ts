import { isNonBlockingRemoteFontStylesheetHref } from '../../utils/html-preview-capture-source.js';

const HTML_CAPTURE_STYLESHEET_TIMEOUT_MS = 3500;
const CSS_URL_RE = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
export const HTML_CAPTURE_INLINED_STYLESHEET_SOURCE_ATTR =
  'data-copy-inlined-stylesheet-source';

const shouldPreserveCssUrl = (url: string) => {
  const normalized = url.trim().toLowerCase();
  return (
    !normalized ||
    normalized.startsWith('#') ||
    normalized.startsWith('data:') ||
    normalized.startsWith('blob:') ||
    normalized.startsWith('about:')
  );
};

const resolveCssUrls = (cssText: string, stylesheetUrl: string) =>
  cssText.replace(CSS_URL_RE, (match, _quote: string, rawUrl: string) => {
    const url = rawUrl.trim();
    if (shouldPreserveCssUrl(url)) return match;

    try {
      return `url("${new URL(url, stylesheetUrl).href}")`;
    } catch {
      return match;
    }
  });

const canReadStylesheetRules = (sheet: CSSStyleSheet | null) => {
  if (!sheet) return false;

  try {
    void sheet.cssRules.length;
    return true;
  } catch {
    return false;
  }
};

const getFetchableStylesheetUrl = (link: HTMLLinkElement) => {
  try {
    const url = new URL(link.href, link.ownerDocument.baseURI);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.href;
  } catch {
    return null;
  }
};

export const isNonBlockingRemoteFontStylesheet = (link: HTMLLinkElement) =>
  isNonBlockingRemoteFontStylesheetHref(
    link.href || link.getAttribute('href'),
    link.ownerDocument.baseURI,
  );

export const isInlinedStylesheetSource = (link: HTMLLinkElement) =>
  link.getAttribute(HTML_CAPTURE_INLINED_STYLESHEET_SOURCE_ATTR) === 'true';

export const inlineUnreadableRemoteStylesheets = async (root: HTMLElement) => {
  const doc = root.ownerDocument;
  const head = doc.head;
  const fetcher = doc.defaultView?.fetch?.bind(doc.defaultView) ?? window.fetch.bind(window);
  if (!head || !fetcher) return;

  const links = Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"][href]'));

  await Promise.all(
    links.map(async (link) => {
      if (isNonBlockingRemoteFontStylesheet(link)) return;
      if (canReadStylesheetRules(link.sheet)) return;

      const stylesheetUrl = getFetchableStylesheetUrl(link);
      if (!stylesheetUrl) return;

      let timeoutId = 0;
      try {
        const controller = new AbortController();
        timeoutId = window.setTimeout(
          () => controller.abort(),
          HTML_CAPTURE_STYLESHEET_TIMEOUT_MS,
        );
        const response = await fetcher(stylesheetUrl, {
          cache: 'force-cache',
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const style = doc.createElement('style');
        style.setAttribute('data-copy-inlined-stylesheet', stylesheetUrl);
        style.textContent = resolveCssUrls(await response.text(), stylesheetUrl);

        if (link.parentNode) {
          link.parentNode.insertBefore(style, link.nextSibling);
        } else {
          head.appendChild(style);
        }
        link.setAttribute(HTML_CAPTURE_INLINED_STYLESHEET_SOURCE_ATTR, 'true');
      } catch (err) {
        console.warn('Failed to inline stylesheet for HTML screenshot:', stylesheetUrl, err);
      } finally {
        if (timeoutId) window.clearTimeout(timeoutId);
      }
    }),
  );
};
