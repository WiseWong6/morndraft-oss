export type HtmlFrameCaptureTarget = 'content-root' | 'document';
export type HtmlCaptureImageMimeType = 'image/png' | 'image/webp';

export type HtmlFrameCaptureOptions = {
  captureTarget?: HtmlFrameCaptureTarget;
  captureScale?: number;
  crop?: boolean;
  cropPadding?: number;
  imageMimeType?: HtmlCaptureImageMimeType;
  imageQuality?: number;
  minViewportWidth?: number;
  preserveMinViewportWidth?: boolean;
};

const WECHAT_ARTICLE_WIDTH = 677;

export const getHtmlFrameCaptureWidth = (
  iframe: HTMLIFrameElement,
  options: HtmlFrameCaptureOptions = {},
) => {
  const rect = iframe.getBoundingClientRect();
  const inlineWidth = iframe.style.width.trim();
  const styleWidth = inlineWidth.endsWith('px') ? Number.parseFloat(inlineWidth) : 0;
  const measuredWidth =
    styleWidth ||
      iframe.clientWidth ||
      iframe.offsetWidth ||
      rect.width ||
      WECHAT_ARTICLE_WIDTH;
  return Math.max(1, Math.ceil(measuredWidth), options.minViewportWidth ?? 0);
};

export const injectStableCaptureViewport = (html: string, width: number | null) => {
  if (!width || width <= 0) return html;
  const viewportStyle = `<style data-morndraft-portable-capture-viewport>html,body{width:${width}px!important;max-width:none!important;overflow:visible!important}.morndraft-html-fragment-viewport,.morndraft-html-fragment-content,[data-renderer="swiss-catalog"]{width:${width}px!important;max-width:none!important;box-sizing:border-box!important}.morndraft-html-fragment-content>:where(article,aside,canvas,div,figure,form,main,section,table){max-width:100%!important;box-sizing:border-box!important}.swiss-card{display:block!important;margin-left:auto!important;margin-right:auto!important}</style>`;
  if (/<head[\s>]/i.test(html)) return html.replace(/(<head[^>]*>)/i, `$1${viewportStyle}`);
  return `${viewportStyle}${html}`;
};

const asCaptureHTMLElement = (element: Element) => {
  const view = element.ownerDocument.defaultView;
  if (!view?.HTMLElement || !(element instanceof view.HTMLElement)) return null;
  return element;
};

const isCaptureContentElement = (element: Element) => {
  if (!asCaptureHTMLElement(element)) return false;
  if (element.matches('script, style, link, meta, title, base')) return false;
  if (element.hasAttribute('data-html-preview-anchor')) return false;
  if (element.hasAttribute('data-artifact-snapshot-bridge')) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
};

const getSingleMeaningfulChild = (element: HTMLElement) => {
  const children = Array.from(element.children).filter(isCaptureContentElement);
  return children.length === 1 ? asCaptureHTMLElement(children[0]) : null;
};

export const resolveContentRootCaptureTarget = (
  doc: Document | null,
  captureRoot: HTMLElement,
) => {
  const scopedTarget = captureRoot.querySelector<HTMLElement>(
    '[data-renderer="swiss-catalog"], .component-shell',
  );
  if (scopedTarget && isCaptureContentElement(scopedTarget)) return scopedTarget;

  const fragmentContent = captureRoot.querySelector<HTMLElement>('.morndraft-html-fragment-content');
  const fragmentChild = fragmentContent ? getSingleMeaningfulChild(fragmentContent) : null;
  if (fragmentChild) return fragmentChild;

  const singleRootChild = getSingleMeaningfulChild(captureRoot);
  if (singleRootChild) return singleRootChild;

  const body = doc?.body;
  if (body && body !== captureRoot) {
    const singleBodyChild = getSingleMeaningfulChild(body);
    if (singleBodyChild) return singleBodyChild;
  }

  return captureRoot;
};

export const createStableCaptureRoot = (doc: Document, width: number) => {
  const root = doc.createElement('main');
  root.setAttribute('data-morndraft-stable-capture-root', 'true');
  root.style.cssText = [
    `width:${width}px`,
    'max-width:none',
    'min-height:0',
    'box-sizing:border-box',
    'overflow:visible',
  ].join(';');

  while (doc.body.firstChild) {
    root.appendChild(doc.body.firstChild);
  }
  doc.body.appendChild(root);
  doc.body.style.width = `${width}px`;
  doc.body.style.maxWidth = 'none';
  doc.body.style.overflow = 'visible';
  doc.documentElement.style.width = `${width}px`;
  doc.documentElement.style.maxWidth = 'none';
  doc.documentElement.style.overflow = 'visible';
  return root;
};
