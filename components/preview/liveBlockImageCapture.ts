import {
  captureHtmlElementWithHtml2Canvas,
  captureHtmlFrameScreenshot,
  createStaticHtmlCaptureFrame,
  resizeStaticCaptureFrameToContent,
  type HtmlCapture,
  waitForElementAssets,
} from './htmlScreenshotCapture';
import { HTML_PREVIEW_FRAME_SELECTOR } from './htmlCaptureFrames';
import { getMermaidSvgs, getRenderedMermaidTrimRect, svgToPngCapture } from './mermaidCapture';
import type { BlockCopyContentKind } from './BlockHeaderCopyAction';

type PreviewTheme = 'dark' | 'light';

const BLOCK_IMAGE_CAPTURE_ATTR = 'data-block-image-capture';
const BLOCK_IMAGE_CAPTURE_BODY_ATTR = 'data-block-image-capture-body';
const BLOCK_IMAGE_CAPTURE_REPLACEMENT_ATTR = 'data-block-image-capture-replacement';
const BLOCK_IMAGE_CAPTURE_REPLACEMENT_FRAME_ATTR = 'data-block-image-capture-replacement-frame';
const BLOCK_IMAGE_CAPTURE_STATIC_ROOT_ATTR = 'data-block-image-capture-static-root';

const INTERACTION_CHROME_SELECTOR = [
  '[data-copy-remove="true"]:not(.aad-block-header)',
  '.aad-collapsible-toggle',
  '.aad-block-header-actions',
  '.aad-block-meta',
  '.aad-block-copy-menu-wrapper',
  '.aad-block-controls',
  '.aad-mermaid-toolbar',
  '.aad-toolbar-menu',
  '.aad-preview-edit-tools',
].join(',');

type AttributeSnapshot = {
  element: HTMLElement;
  name: string;
  value: string | null;
};

type HiddenElementSnapshot = {
  display: string;
  element: HTMLElement;
  pointerEvents: string;
  visibility: string;
};

type ScrollSnapshot = {
  left: number;
  target: HTMLElement | Window;
  top: number;
};

export const getLiveBlockImageCaptureTarget = (
  blockRoot: HTMLElement,
  includeCodeChrome: boolean,
) => {
  if (blockRoot.dataset.collapsed === 'true') {
    throw new Error('Block image is not ready.');
  }

  if (includeCodeChrome) return blockRoot;

  const bodyTarget = blockRoot.querySelector<HTMLElement>(
    ':scope > .aad-collapsible-body > .aad-collapsible-body-inner',
  );
  if (!bodyTarget) throw new Error('Block image is not ready.');
  return bodyTarget;
};

export const prepareLiveBlockImageCapture = (
  blockRoot: HTMLElement,
  includeCodeChrome: boolean,
) => {
  const target = getLiveBlockImageCaptureTarget(blockRoot, includeCodeChrome);
  const attributeSnapshots = [
    takeAttributeSnapshot(blockRoot, BLOCK_IMAGE_CAPTURE_ATTR),
    takeAttributeSnapshot(blockRoot, BLOCK_IMAGE_CAPTURE_BODY_ATTR),
  ];
  if (target !== blockRoot) {
    attributeSnapshots.push(takeAttributeSnapshot(target, BLOCK_IMAGE_CAPTURE_BODY_ATTR));
  }

  if (includeCodeChrome) {
    blockRoot.setAttribute(BLOCK_IMAGE_CAPTURE_ATTR, 'true');
  } else {
    blockRoot.setAttribute(BLOCK_IMAGE_CAPTURE_BODY_ATTR, 'true');
    target.setAttribute(BLOCK_IMAGE_CAPTURE_BODY_ATTR, 'true');
  }

  const restoreHiddenChrome = hideInteractionChrome(blockRoot, target);
  return {
    target,
    restore: () => {
      restoreHiddenChrome();
      attributeSnapshots.forEach(restoreAttributeSnapshot);
    },
  };
};

const findScopedHtmlPreviewFrame = (blockRoot: HTMLElement) =>
  blockRoot.querySelector<HTMLIFrameElement>(HTML_PREVIEW_FRAME_SELECTOR) ??
  blockRoot.querySelector<HTMLIFrameElement>('iframe[data-html-preview-live="true"]');

const getCaptureBackground = (element: HTMLElement, theme: PreviewTheme) => {
  const view = element.ownerDocument.defaultView;
  const background = view?.getComputedStyle(element).backgroundColor.trim();
  if (background && !/^rgba?\(\s*0\s*,\s*0\s*,\s*0\s*(?:,\s*0\s*)?\)$/i.test(background) && background !== 'transparent') {
    return background;
  }
  return theme === 'dark' ? '#1c1c1e' : '#ffffff';
};

const takeAttributeSnapshot = (element: HTMLElement, name: string): AttributeSnapshot => ({
  element,
  name,
  value: element.getAttribute(name),
});

const restoreAttributeSnapshot = ({ element, name, value }: AttributeSnapshot) => {
  if (value === null) {
    element.removeAttribute(name);
  } else {
    element.setAttribute(name, value);
  }
};

const hideInteractionChrome = (blockRoot: HTMLElement, target: HTMLElement) => {
  const hiddenElements = new Map<HTMLElement, HiddenElementSnapshot>();
  const candidates = new Set<HTMLElement>([
    ...Array.from(blockRoot.querySelectorAll<HTMLElement>(INTERACTION_CHROME_SELECTOR)),
    ...Array.from(target.querySelectorAll<HTMLElement>(INTERACTION_CHROME_SELECTOR)),
  ]);

  candidates.delete(blockRoot);
  candidates.delete(target);
  candidates.forEach((element) => {
    if (element.classList.contains('aad-block-header')) return;
    hiddenElements.set(element, {
      display: element.style.display,
      element,
      pointerEvents: element.style.pointerEvents,
      visibility: element.style.visibility,
    });
    element.style.setProperty('display', 'none', 'important');
    element.style.setProperty('visibility', 'hidden', 'important');
    element.style.setProperty('pointer-events', 'none', 'important');
  });

  return () => {
    hiddenElements.forEach(({ display, element, pointerEvents, visibility }) => {
      if (display) {
        element.style.display = display;
      } else {
        element.style.removeProperty('display');
      }
      if (visibility) {
        element.style.visibility = visibility;
      } else {
        element.style.removeProperty('visibility');
      }
      if (pointerEvents) {
        element.style.pointerEvents = pointerEvents;
      } else {
        element.style.removeProperty('pointer-events');
      }
    });
  };
};

const waitForCaptureStyles = (view: Window | null) =>
  new Promise<void>((resolve) => {
    if (!view?.requestAnimationFrame) {
      resolve();
      return;
    }
    view.requestAnimationFrame(() => resolve());
  });

const getElementCaptureWidth = (element: HTMLElement) => {
  const candidates: number[] = [];
  const pushCandidate = (value: number | undefined) => {
    if (Number.isFinite(value) && value && value > 1) {
      candidates.push(Math.ceil(value));
    }
  };

  let current: HTMLElement | null = element;
  for (let depth = 0; current && depth < 4; depth += 1) {
    const rect = current.getBoundingClientRect();
    const styles = current.ownerDocument.defaultView?.getComputedStyle(current);
    const styleWidth = styles?.width ? Number.parseFloat(styles.width) : 0;
    pushCandidate(rect.width);
    pushCandidate(current.clientWidth);
    pushCandidate(current.offsetWidth);
    pushCandidate(current.scrollWidth);
    pushCandidate(styleWidth);
    current = current.parentElement;
  }

  return Math.max(1, ...candidates);
};

export const getLiveBlockImageCaptureWidth = (blockRoot: HTMLElement) =>
  getElementCaptureWidth(blockRoot);

const escapeHtmlAttribute = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const serializeOptionalAttribute = (name: string, value: string | null | undefined) =>
  value ? ` ${name}="${escapeHtmlAttribute(value)}"` : '';

const copyComputedCssVariables = (source: HTMLElement, clone: HTMLElement) => {
  const view = source.ownerDocument.defaultView;
  if (!view) return;
  const styles = view.getComputedStyle(source);
  for (let index = 0; index < styles.length; index += 1) {
    const name = styles.item(index);
    if (!name.startsWith('--')) continue;
    const value = styles.getPropertyValue(name);
    if (value) clone.style.setProperty(name, value.trim());
  }
};

const serializeScopedCaptureStyles = (doc: Document) =>
  Array.from(doc.head?.querySelectorAll<HTMLLinkElement | HTMLStyleElement>('link[rel="stylesheet"], style') ?? [])
    .map((element) => element.outerHTML)
    .join('\n');

const buildScopedCloneCaptureHtml = ({
  background,
  clone,
  sourceDocument,
  width,
}: {
  background: string;
  clone: HTMLElement;
  sourceDocument: Document;
  width: number;
}) => {
  const html = sourceDocument.documentElement;
  const body = sourceDocument.body;
  const themeAttr = serializeOptionalAttribute('data-theme', html.getAttribute('data-theme') ?? body?.getAttribute('data-theme'));
  const bodyClass = serializeOptionalAttribute('class', body?.className);
  return [
    '<!doctype html>',
    `<html${themeAttr}>`,
    '<head>',
    `<base href="${escapeHtmlAttribute(sourceDocument.baseURI)}">`,
    serializeScopedCaptureStyles(sourceDocument),
    '<style data-block-image-capture-static>',
    [
      `html,body{margin:0!important;padding:0!important;width:${width}px!important;max-width:none!important;min-height:0!important;overflow:visible!important;background:${background}!important;}`,
      `[${BLOCK_IMAGE_CAPTURE_STATIC_ROOT_ATTR}]{display:block!important;width:${width}px!important;max-width:none!important;min-height:0!important;margin:0!important;padding:0!important;overflow:visible!important;background:${background}!important;}`,
      `[${BLOCK_IMAGE_CAPTURE_STATIC_ROOT_ATTR}]>*{margin:0!important;max-width:none!important;box-sizing:border-box!important;}`,
      `[${BLOCK_IMAGE_CAPTURE_STATIC_ROOT_ATTR}]>.aad-artifact-block{width:${width}px!important;}`,
      `[${BLOCK_IMAGE_CAPTURE_STATIC_ROOT_ATTR}]>.aad-collapsible-body-inner{width:${width}px!important;}`,
      `[${BLOCK_IMAGE_CAPTURE_STATIC_ROOT_ATTR}] .aad-artifact-block[data-block-image-capture="true"] .aad-block-header{box-sizing:border-box!important;height:44px!important;min-height:44px!important;padding:0 12px!important;align-items:center!important;overflow:visible!important;line-height:1!important;}`,
      `[${BLOCK_IMAGE_CAPTURE_STATIC_ROOT_ATTR}] .aad-artifact-block[data-block-image-capture="true"] .aad-block-header-main{height:100%!important;align-items:center!important;}`,
      `[${BLOCK_IMAGE_CAPTURE_STATIC_ROOT_ATTR}] .aad-artifact-block[data-block-image-capture="true"] .aad-block-header-main::before{content:""!important;width:8px!important;height:8px!important;flex:0 0 8px!important;border-radius:999px!important;background:var(--aad-accent)!important;}`,
      `[${BLOCK_IMAGE_CAPTURE_STATIC_ROOT_ATTR}] .aad-artifact-block[data-block-image-capture="true"] .aad-block-label{overflow:visible!important;line-height:1!important;align-items:center!important;gap:0!important;transform:translateY(-3.75px)!important;}`,
      `[${BLOCK_IMAGE_CAPTURE_STATIC_ROOT_ATTR}] .aad-artifact-block[data-block-image-capture="true"] .aad-block-label::before{content:none!important;display:none!important;}`,
      `[${BLOCK_IMAGE_CAPTURE_STATIC_ROOT_ATTR}] .aad-artifact-block[data-block-image-capture="true"] .aad-block-header-actions,`,
      `[${BLOCK_IMAGE_CAPTURE_STATIC_ROOT_ATTR}] .aad-artifact-block[data-block-image-capture="true"] .aad-block-controls,`,
      `[${BLOCK_IMAGE_CAPTURE_STATIC_ROOT_ATTR}] .aad-artifact-block[data-block-image-capture="true"] .aad-block-meta,`,
      `[${BLOCK_IMAGE_CAPTURE_STATIC_ROOT_ATTR}] .aad-artifact-block[data-block-image-capture="true"] .aad-mermaid-toolbar{display:none!important;visibility:hidden!important;pointer-events:none!important;}`,
      `[${BLOCK_IMAGE_CAPTURE_STATIC_ROOT_ATTR}] [${BLOCK_IMAGE_CAPTURE_REPLACEMENT_FRAME_ATTR}="mermaid"]{display:flex!important;align-items:center!important;justify-content:center!important;width:100%!important;box-sizing:border-box!important;overflow:hidden!important;background:var(--aad-surface)!important;}`,
      `[${BLOCK_IMAGE_CAPTURE_STATIC_ROOT_ATTR}] img[${BLOCK_IMAGE_CAPTURE_REPLACEMENT_ATTR}="true"]{display:block!important;}`,
      `[${BLOCK_IMAGE_CAPTURE_STATIC_ROOT_ATTR}] [${BLOCK_IMAGE_CAPTURE_REPLACEMENT_FRAME_ATTR}="mermaid"] img[${BLOCK_IMAGE_CAPTURE_REPLACEMENT_ATTR}="true"]{max-width:100%!important;max-height:100%!important;object-fit:contain!important;margin:auto!important;}`,
    ].join(''),
    '</style>',
    '</head>',
    `<body${bodyClass}>`,
    `<main ${BLOCK_IMAGE_CAPTURE_STATIC_ROOT_ATTR}="true">${clone.outerHTML}</main>`,
    '</body>',
    '</html>',
  ].join('');
};

const removeCloneInteractionChrome = (clone: HTMLElement) => {
  clone.querySelectorAll<HTMLElement>(INTERACTION_CHROME_SELECTOR).forEach((element) => {
    if (element.classList.contains('aad-block-header')) return;
    element.remove();
  });
};

const createReplacementImage = (
  doc: Document,
  contentCapture: HtmlCapture,
  cleanupCallbacks: Array<() => void>,
  options: {
    availableWidth?: number;
    layout?: 'default' | 'mermaid';
  } = {},
) => {
  const sourceWidth = Math.max(1, Math.ceil(contentCapture.width));
  const sourceHeight = Math.max(1, Math.ceil(contentCapture.height));
  const isMermaidLayout = options.layout === 'mermaid';
  const availableWidth = Math.max(1, Math.floor(options.availableWidth ?? sourceWidth));
  const maxMermaidHeight = 820;
  const fitScale = isMermaidLayout
    ? Math.min(1, availableWidth / sourceWidth, maxMermaidHeight / sourceHeight)
    : 1;
  const displayWidth = Math.max(1, Math.round(sourceWidth * fitScale));
  const displayHeight = Math.max(1, Math.round(sourceHeight * fitScale));
  const image = doc.createElement('img');
  const urlApi = doc.defaultView?.URL ?? URL;
  const url = urlApi.createObjectURL(contentCapture.blob);
  cleanupCallbacks.push(() => urlApi.revokeObjectURL(url));
  image.src = url;
  image.alt = '';
  image.setAttribute(BLOCK_IMAGE_CAPTURE_REPLACEMENT_ATTR, 'true');
  image.style.cssText = [
    'display:block',
    `width:${displayWidth}px`,
    isMermaidLayout ? `height:${displayHeight}px` : 'height:auto',
    'max-width:100%',
    isMermaidLayout ? 'max-height:100%' : '',
    isMermaidLayout ? 'object-fit:contain' : '',
    'margin:0',
    'border:0',
  ].filter(Boolean).join(';');

  if (!isMermaidLayout) return image;

  const frame = doc.createElement('div');
  frame.setAttribute(BLOCK_IMAGE_CAPTURE_REPLACEMENT_FRAME_ATTR, 'mermaid');
  frame.style.cssText = [
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'width:100%',
    `min-height:${Math.max(160, displayHeight)}px`,
    'box-sizing:border-box',
    'overflow:hidden',
    'background:var(--aad-surface)',
  ].join(';');
  frame.replaceChildren(image);
  return frame;
};

const captureDetachedCloneImage = async ({
  captureScale,
  configureClone,
  currentTheme,
  crop = false,
  expectedWidth,
  source,
}: {
  captureScale?: number;
  configureClone?: (clone: HTMLElement, cleanupCallbacks: Array<() => void>) => void;
  crop?: boolean;
  currentTheme: PreviewTheme;
  expectedWidth?: number;
  source: HTMLElement;
}) => {
  const doc = source.ownerDocument;
  if (!doc.body) throw new Error('Block image is not ready.');
  const cleanupCallbacks: Array<() => void> = [];
  const clone = source.cloneNode(true) as HTMLElement;
  const width = Math.max(1, Math.ceil(expectedWidth ?? 0), getElementCaptureWidth(source));
  removeCloneInteractionChrome(clone);
  clone.style.setProperty('width', `${width}px`, 'important');
  clone.style.setProperty('max-width', 'none', 'important');
  clone.style.setProperty('box-sizing', 'border-box', 'important');
  configureClone?.(clone, cleanupCallbacks);

  copyComputedCssVariables(source, clone);
  const background = getCaptureBackground(source, currentTheme);
  const staticHtml = buildScopedCloneCaptureHtml({
    background,
    clone,
    sourceDocument: doc,
    width,
  });
  const frame = await createStaticHtmlCaptureFrame(staticHtml, width, undefined, { hidden: false });

  try {
    const captureDocument = frame.contentDocument;
    const staticRoot = captureDocument?.querySelector<HTMLElement>(`[${BLOCK_IMAGE_CAPTURE_STATIC_ROOT_ATTR}]`);
    const captureTarget = staticRoot?.firstElementChild instanceof HTMLElement
      ? staticRoot.firstElementChild
      : staticRoot;
    if (!staticRoot || !captureTarget) throw new Error('Block image is not ready.');
    await resizeStaticCaptureFrameToContent(frame, staticRoot, { stableWidth: width });
    await waitForElementAssets(captureTarget);
    return await captureHtmlElementWithHtml2Canvas(captureTarget, background, {
      captureScale,
      crop,
    });
  } finally {
    frame.remove();
    cleanupCallbacks.forEach((cleanup) => cleanup());
  }
};

const findCloneBodyTarget = (clone: HTMLElement) => {
  if (clone.classList.contains('aad-collapsible-body-inner')) return clone;
  return clone.querySelector<HTMLElement>(
    ':scope > .aad-collapsible-body > .aad-collapsible-body-inner',
  ) ?? clone.querySelector<HTMLElement>('.aad-collapsible-body-inner');
};

const isScrollableElement = (element: HTMLElement) => {
  const view = element.ownerDocument.defaultView;
  if (!view) return false;
  const style = view.getComputedStyle(element);
  const overflow = `${style.overflow} ${style.overflowX} ${style.overflowY}`;
  return /(auto|scroll)/.test(overflow) &&
    (element.scrollHeight > element.clientHeight ||
      element.scrollWidth > element.clientWidth ||
      element.scrollTop !== 0 ||
      element.scrollLeft !== 0);
};

export const captureBlockImageScrollAndFocusRestore = (blockRoot: HTMLElement) => {
  const doc = blockRoot.ownerDocument;
  const view = doc.defaultView;
  if (!view) return () => {};

  const snapshots: ScrollSnapshot[] = [];
  const seen = new Set<HTMLElement | Window>();
  const activeElement = doc.activeElement instanceof HTMLElement ? doc.activeElement : null;
  const addTarget = (target: HTMLElement | Window | null) => {
    if (!target || seen.has(target)) return;
    seen.add(target);
    snapshots.push({
      left: target instanceof Window ? target.scrollX : target.scrollLeft,
      target,
      top: target instanceof Window ? target.scrollY : target.scrollTop,
    });
  };

  addTarget(view);
  addTarget(blockRoot.closest<HTMLElement>('.aad-preview-scroll'));
  let ancestor = blockRoot.parentElement;
  while (ancestor && ancestor !== doc.body) {
    if (isScrollableElement(ancestor)) addTarget(ancestor);
    ancestor = ancestor.parentElement;
  }

  const restore = () => {
    for (const snapshot of snapshots) {
      if (snapshot.target instanceof Window) {
        snapshot.target.scrollTo(snapshot.left, snapshot.top);
      } else if (snapshot.target.isConnected) {
        snapshot.target.scrollLeft = snapshot.left;
        snapshot.target.scrollTop = snapshot.top;
      }
    }
    if (activeElement && activeElement.isConnected && activeElement !== doc.body) {
      try {
        activeElement.focus({ preventScroll: true });
      } catch {
        activeElement.focus();
      }
    }
  };

  return () => {
    restore();
    view.requestAnimationFrame(restore);
    view.setTimeout(restore, 0);
  };
};

export const captureLiveBlockImageWithContentCapture = async ({
  blockRoot,
  captureScale,
  contentCapture,
  currentTheme,
  expectedBlockWidth,
  includeCodeChrome,
  replacementLayout = 'default',
}: {
  blockRoot: HTMLElement;
  captureScale?: number;
  contentCapture: HtmlCapture;
  currentTheme: PreviewTheme;
  expectedBlockWidth?: number;
  includeCodeChrome: boolean;
  replacementLayout?: 'default' | 'mermaid';
}): Promise<HtmlCapture> => {
  getLiveBlockImageCaptureTarget(blockRoot, includeCodeChrome);
  if (!includeCodeChrome) return contentCapture;
  const blockWidth = Math.max(1, Math.ceil(expectedBlockWidth ?? 0), getElementCaptureWidth(blockRoot));

  return captureDetachedCloneImage({
    captureScale,
    currentTheme,
    expectedWidth: blockWidth,
    source: blockRoot,
    configureClone: (clone, cleanupCallbacks) => {
      clone.setAttribute(BLOCK_IMAGE_CAPTURE_ATTR, 'true');
      const bodyTarget = findCloneBodyTarget(clone);
      if (!bodyTarget) throw new Error('Block image is not ready.');
      bodyTarget.replaceChildren(createReplacementImage(
        clone.ownerDocument,
        contentCapture,
        cleanupCallbacks,
        {
          availableWidth: blockWidth,
          layout: replacementLayout,
        },
      ));
    },
  });
};

const captureScopedHtmlPreviewBlockImage = async ({
  blockRoot,
  captureScale,
  currentTheme,
  expectedBlockWidth,
  includeCodeChrome,
}: {
  blockRoot: HTMLElement;
  captureScale?: number;
  currentTheme: PreviewTheme;
  expectedBlockWidth?: number;
  includeCodeChrome: boolean;
}) => {
  const frame = findScopedHtmlPreviewFrame(blockRoot);
  if (!frame) return null;
  const bodyTarget = getLiveBlockImageCaptureTarget(blockRoot, false);
  const contentWidth = Math.max(
    getElementCaptureWidth(frame),
    getElementCaptureWidth(bodyTarget),
    Math.ceil(expectedBlockWidth ?? 0),
  );
  const frameCapture = await captureHtmlFrameScreenshot(frame, {
    captureScale,
    crop: false,
    minViewportWidth: contentWidth,
    preserveMinViewportWidth: true,
  });
  return captureLiveBlockImageWithContentCapture({
    blockRoot,
    captureScale,
    contentCapture: frameCapture,
    currentTheme,
    expectedBlockWidth,
    includeCodeChrome,
  });
};

export const captureLiveBlockImage = async ({
  blockRoot,
  captureScale,
  contentKind,
  currentTheme,
  includeCodeChrome,
}: {
  blockRoot: HTMLElement;
  captureScale?: number;
  contentKind: BlockCopyContentKind;
  currentTheme: PreviewTheme;
  includeCodeChrome: boolean;
}): Promise<HtmlCapture> => {
  const blockWidth = getElementCaptureWidth(blockRoot);
  const target = getLiveBlockImageCaptureTarget(blockRoot, includeCodeChrome);
  if (contentKind === 'html' || contentKind === 'morndraft') {
    const scopedFrameCapture = await captureScopedHtmlPreviewBlockImage({
      blockRoot,
      captureScale,
      currentTheme,
      expectedBlockWidth: blockWidth,
      includeCodeChrome,
    });
    if (scopedFrameCapture) return scopedFrameCapture;
  }

  const view = blockRoot.ownerDocument.defaultView;
  await waitForCaptureStyles(view);
  await waitForElementAssets(target);
  const targetWidth = Math.max(getElementCaptureWidth(target), includeCodeChrome ? blockWidth : 0);
  return await captureDetachedCloneImage({
    captureScale,
    currentTheme,
    expectedWidth: targetWidth,
    source: target,
    configureClone: (clone) => {
      clone.setAttribute(
        includeCodeChrome ? BLOCK_IMAGE_CAPTURE_ATTR : BLOCK_IMAGE_CAPTURE_BODY_ATTR,
        'true',
      );
    },
  });
};

type BlockCapturePolicy = { captureScale: number };

export type CaptureBlockImageForCopyResult = {
  capture: HtmlCapture;
  policy: BlockCapturePolicy;
};

export const captureBlockImageForCopy = async ({
  blockRoot,
  blockContentKind,
  currentTheme,
  includeCodeChrome,
  authorizeDelivery,
  ensureMermaidRendered,
  noMermaidReadyMessage,
}: {
  blockRoot: HTMLElement;
  blockContentKind: BlockCopyContentKind;
  currentTheme: PreviewTheme;
  includeCodeChrome: boolean;
  authorizeDelivery: () => Promise<BlockCapturePolicy>;
  ensureMermaidRendered: () => Promise<void>;
  noMermaidReadyMessage: string;
}): Promise<CaptureBlockImageForCopyResult> => {
  const policy = await authorizeDelivery();
  if (blockContentKind === 'mermaid') {
    const expectedBlockWidth = getLiveBlockImageCaptureWidth(blockRoot);
    await ensureMermaidRendered();
    const svg = getMermaidSvgs(blockRoot)[0];
    if (!svg) throw new Error(noMermaidReadyMessage);
    const trimRect = getRenderedMermaidTrimRect(svg);
    const mermaidCapture = await svgToPngCapture(svg, currentTheme, trimRect, policy.captureScale);
    const capture = await captureLiveBlockImageWithContentCapture({
      blockRoot,
      captureScale: policy.captureScale,
      contentCapture: mermaidCapture,
      currentTheme,
      expectedBlockWidth,
      includeCodeChrome,
      replacementLayout: 'mermaid',
    });
    return { capture, policy };
  }
  const capture = await captureLiveBlockImage({
    blockRoot,
    captureScale: policy.captureScale,
    contentKind: blockContentKind,
    currentTheme,
    includeCodeChrome,
  });
  return { capture, policy };
};
