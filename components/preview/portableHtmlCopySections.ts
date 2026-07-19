export const PRESERVE_LAYOUT_ATTR = 'data-copy-preserve-layout';
const MORNDRAFT_FLAT_EDIT_PATH_ATTR = 'data-morndraft-edit-path';
const SWISS_CATALOG_SHELL_SELECTOR = '.component-shell[data-renderer="swiss-catalog"]';

type InlineStyleApplier = (source: Element, target: Element) => void;

const isMornDraftHtmlFragmentContent = (element: HTMLElement) =>
  element.classList.contains('morndraft-html-fragment-content') &&
  element.parentElement?.classList.contains('morndraft-html-fragment-viewport');

const findDirectChildByClass = (element: HTMLElement, className: string) =>
  Array.from(element.children).find(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && child.classList.contains(className),
  );

export const getHtmlCopySourceElement = (body: HTMLElement) => {
  const viewport = findDirectChildByClass(body, 'morndraft-html-fragment-viewport');
  const content = viewport ? findDirectChildByClass(viewport, 'morndraft-html-fragment-content') : null;
  return content ?? body;
};

export const isMornDraftHtmlFragmentCopySource = (element: HTMLElement) =>
  isMornDraftHtmlFragmentContent(element);

export const makeCopyBodyVisible = (body: HTMLElement | null | undefined) => {
  if (!body) return;
  body.style.setProperty('display', 'block');
  body.style.setProperty('grid-template-rows', 'none');
  body.style.setProperty('height', 'auto');
  body.style.setProperty('min-height', '0');
  body.style.setProperty('overflow', 'visible');
  body.style.setProperty('opacity', '1');
  body.style.setProperty('visibility', 'visible');
};

export const makeCopyBodyInnerVisible = (bodyInner: HTMLElement | null | undefined) => {
  if (!bodyInner) return;
  bodyInner.style.setProperty('display', 'block');
  bodyInner.style.setProperty('height', 'auto');
  bodyInner.style.setProperty('min-height', '0');
  bodyInner.style.setProperty('overflow', 'visible');
};

export const constrainHtmlCopySection = (section: HTMLElement) => {
  section.querySelectorAll<HTMLElement>(
    'article,aside,canvas,div,figure,form,img,main,section,svg,table,video,iframe',
  ).forEach((element) => {
    element.style.setProperty('max-width', '100%');
    element.style.setProperty('box-sizing', 'border-box');
    if (['img', 'svg', 'canvas', 'video', 'iframe'].includes(element.tagName.toLowerCase())) {
      element.style.setProperty('height', 'auto');
    }
  });
};

const hasDirectSwissCatalogShell = (element: HTMLElement) =>
  Array.from(element.children).some(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && child.matches(SWISS_CATALOG_SHELL_SELECTOR),
  );

const removeDirectWhitespaceTextNodes = (element: HTMLElement) => {
  Array.from(element.childNodes).forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE && !node.textContent?.trim()) {
      node.remove();
    }
  });
};

const applySwissCatalogStandaloneSectionBodyPadding = (
  section: HTMLElement,
  sourceElement: HTMLElement,
) => {
  const sourceStyles = sourceElement.ownerDocument.defaultView?.getComputedStyle(sourceElement);
  const paddingTop = sourceStyles?.paddingTop || sourceElement.style.paddingTop;
  const paddingBottom = sourceStyles?.paddingBottom || sourceElement.style.paddingBottom;
  if (paddingTop) section.style.setProperty('padding-top', paddingTop);
  if (paddingBottom) section.style.setProperty('padding-bottom', paddingBottom);
};

const removeInternalHtmlCopyAttributes = (root: HTMLElement) => {
  root.querySelectorAll<HTMLElement>(`[${MORNDRAFT_FLAT_EDIT_PATH_ATTR}]`).forEach((element) => {
    element.removeAttribute(MORNDRAFT_FLAT_EDIT_PATH_ATTR);
  });
  root.removeAttribute(MORNDRAFT_FLAT_EDIT_PATH_ATTR);
};

export const appendHeadStylesForFullHtml = (
  section: HTMLElement,
  head: HTMLHeadElement | null | undefined,
  isRawFragment: boolean,
) => {
  if (isRawFragment) return;
  head?.querySelectorAll('style').forEach((styleElement) => {
    section.appendChild(styleElement.cloneNode(true));
  });
};

export const createHtmlCopySectionFromBody = (
  body: HTMLElement,
  options: {
    margin: string;
    maxWidth: number;
    head?: HTMLHeadElement | null;
    inlineStyles?: InlineStyleApplier;
    fallbackBackground?: string;
    fallbackColor?: string;
    fallbackFontFamily?: string;
  },
) => {
  const sourceElement = getHtmlCopySourceElement(body);
  const isRawFragment = isMornDraftHtmlFragmentCopySource(sourceElement);
  const bodyClone = sourceElement.cloneNode(true) as HTMLElement;
  removeInternalHtmlCopyAttributes(bodyClone);
  options.inlineStyles?.(sourceElement, bodyClone);
  const isSwissCatalogFullDocument = !isRawFragment && hasDirectSwissCatalogShell(bodyClone);

  const sourceStyle = isRawFragment ? null : bodyClone.getAttribute('style');
  const section = document.createElement('section');
  section.setAttribute(PRESERVE_LAYOUT_ATTR, 'true');
  section.style.cssText = [
    sourceStyle ?? '',
    'width:100%',
    `max-width:${options.maxWidth}px`,
    `margin:${options.margin}`,
    'box-sizing:border-box',
    `background:${options.fallbackBackground ?? '#ffffff'}`,
    `color:${options.fallbackColor ?? 'inherit'}`,
    options.fallbackFontFamily ? `font-family:${options.fallbackFontFamily}` : '',
  ]
    .filter(Boolean)
    .join(';');

  appendHeadStylesForFullHtml(section, options.head, isRawFragment);

  while (bodyClone.firstChild) {
    section.appendChild(bodyClone.firstChild);
  }
  if (isSwissCatalogFullDocument) {
    removeDirectWhitespaceTextNodes(section);
    applySwissCatalogStandaloneSectionBodyPadding(section, sourceElement);
    section.style.setProperty('white-space', 'normal');
  }
  constrainHtmlCopySection(section);

  return section;
};
