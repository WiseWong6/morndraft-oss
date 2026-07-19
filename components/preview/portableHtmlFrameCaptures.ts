import {
  captureHtmlFrameScreenshot,
  type HtmlCapture,
} from './htmlScreenshotCapture';
import {
  createHtmlCopySectionFromBody,
  makeCopyBodyInnerVisible,
  makeCopyBodyVisible,
  PRESERVE_LAYOUT_ATTR,
} from './portableHtmlCopySections';
import { getHtmlPreviewCaptureSource } from '../../utils/html-preview-capture-source.js';
import {
  createHtmlPreviewRichCopyFallbackHtml,
  createPortableRichBlockHtml,
} from '@morndraft/core';
import { getHtmlPreviewFrames } from './htmlCaptureFrames';
import type { HtmlFrameCaptureOptions } from './htmlCaptureLayout';
import { requestDeferredHtmlPreviewMount } from './htmlPreviewDeferredMount';

type InlineStyleApplier = (source: Element, target: Element) => void;
type PreviewTheme = 'dark' | 'light';
export type HtmlFrameStrategy = 'capture-image' | 'rich-copy' | 'rich-copy-image' | 'static-html';

const WECHAT_ARTICLE_WIDTH = 677;
const HTML_RICH_COPY_IMAGE_CROP_PADDING = 32;
const HTML_RICH_COPY_IMAGE_BODY_PADDING = '24px';
const HTML_RICH_COPY_LABEL = 'HTML Preview';
export const CAPTURED_HTML_IMAGE_SECTION_ATTR = 'data-morndraft-captured-html-image';

const getArtifactHeaderText = (
  block: Element | null,
  selector: '.aad-block-label' | '.aad-block-meta',
  fallback = '',
) => block?.querySelector(selector)?.textContent?.trim() || fallback;

const getPortableHtmlFrameLabel = (block: Element | null) =>
  getArtifactHeaderText(block, '.aad-block-label', HTML_RICH_COPY_LABEL);

const getHtmlFrameDeliveryWidth = (iframe: HTMLIFrameElement) => {
  const width = Number.parseFloat(iframe.dataset.htmlDeliveryWidth ?? '');
  return Number.isFinite(width) && width > 0 ? Math.ceil(width) : 0;
};

const withHtmlFrameDeliveryWidth = (
  iframe: HTMLIFrameElement,
  captureOptions: HtmlFrameCaptureOptions = {},
): HtmlFrameCaptureOptions => {
  const deliveryWidth = getHtmlFrameDeliveryWidth(iframe);
  if (!deliveryWidth) return captureOptions;
  return {
    ...captureOptions,
    minViewportWidth: Math.max(captureOptions.minViewportWidth ?? 0, deliveryWidth),
  };
};

const withRichCopyImageSafePadding = (
  captureOptions: HtmlFrameCaptureOptions = {},
): HtmlFrameCaptureOptions => ({
  ...captureOptions,
  cropPadding: Math.max(captureOptions.cropPadding ?? 0, HTML_RICH_COPY_IMAGE_CROP_PADDING),
});

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob'));
    reader.readAsDataURL(blob);
  });

const createHtmlSourceCopySection = (
  html: string,
  margin: string,
  inlineStyles: InlineStyleApplier,
  maxWidth = WECHAT_ARTICLE_WIDTH,
) => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return createHtmlCopySectionFromBody(doc.body, {
    margin,
    maxWidth,
    head: doc.head,
    fallbackBackground: '#ffffff',
    inlineStyles,
  });
};

const getHtmlFrameRenderedWidth = (iframe: HTMLIFrameElement) => {
  const rect = iframe.getBoundingClientRect();
  return Math.max(
    1,
    getHtmlFrameDeliveryWidth(iframe),
    Math.ceil(rect.width || iframe.clientWidth || iframe.offsetWidth || WECHAT_ARTICLE_WIDTH),
  );
};

const createHtmlFrameCopySection = (
  iframe: HTMLIFrameElement,
  margin: string,
  inlineStyles: InlineStyleApplier,
) => {
  const doc = iframe.contentDocument;
  if (!doc?.body) {
    return createHtmlSourceCopySection(getHtmlPreviewCaptureSource(iframe), margin, inlineStyles);
  }
  return createHtmlCopySectionFromBody(doc.body, {
    margin,
    maxWidth: getHtmlFrameRenderedWidth(iframe),
    head: doc.head,
    fallbackBackground: '#ffffff',
    inlineStyles,
  });
};

const createHtmlSourceUnavailableSection = () => {
  const section = document.createElement('section');
  section.style.cssText = [
    'width:100%',
    'max-width:100%',
    'box-sizing:border-box',
    'padding:16px',
    'border:1px solid #d8d4ca',
    'border-radius:8px',
    'background:#ffffff',
    'color:#6f6a60',
    'font:14px/1.6 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
  ].join(';');
  section.textContent = 'HTML preview source was not ready during export.';
  return section;
};

const createElementFromHtml = (html: string) => {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstElementChild as HTMLElement | null;
};

const getHtmlFrameSourceKind = (iframe: HTMLIFrameElement) =>
  iframe.dataset.htmlSourceKind === 'document' ? 'document' : 'fragment';

const isFullDocumentHtmlFrame = (iframe: HTMLIFrameElement) =>
  getHtmlFrameSourceKind(iframe) === 'document';

const createHtmlRichCopyFallbackSection = (
  block: Element | null,
  theme: PreviewTheme,
  message?: string,
) =>
  createElementFromHtml(
    createHtmlPreviewRichCopyFallbackHtml(
      getPortableHtmlFrameLabel(block),
      theme,
      message,
      getArtifactHeaderText(block, '.aad-block-meta'),
    ),
  ) ??
  createHtmlSourceUnavailableSection();

const FRAGMENT_RICH_COPY_UNSAFE_SELECTOR = [
  'audio',
  'button',
  'canvas',
  'embed',
  'form',
  'iframe',
  'input',
  'link[rel~="stylesheet"]',
  'object',
  'script',
  'select',
  'style',
  'textarea',
  'video',
].join(',');

const canUseHtmlFragmentForRichCopy = (iframe: HTMLIFrameElement) => {
  try {
    const doc = iframe.contentDocument;
    const body = doc?.body;
    return Boolean(body && !body.querySelector(FRAGMENT_RICH_COPY_UNSAFE_SELECTOR));
  } catch {
    return false;
  }
};

const createHtmlFragmentRichCopySection = (
  sourceFrame: HTMLIFrameElement,
  block: Element | null,
  inlineStyles: InlineStyleApplier,
  theme: PreviewTheme,
) => {
  const body = createHtmlFrameCopySection(sourceFrame, '0', inlineStyles);
  return createElementFromHtml(
    createPortableRichBlockHtml({
      label: getPortableHtmlFrameLabel(block),
      meta: getArtifactHeaderText(block, '.aad-block-meta'),
      theme,
      bodyHtml: body.outerHTML,
      bodyKind: 'content',
      bodyPadding: '12px 16px',
    }),
  ) ?? body;
};

const createCapturedHtmlImageElement = async (capture: HtmlCapture) => {
  const imageUrl = await blobToDataUrl(capture.blob);
  const imageWidth = Math.max(1, Math.round(capture.width));
  const imageHeight = Math.max(1, Math.round(capture.height));
  const image = document.createElement('img');
  image.setAttribute(PRESERVE_LAYOUT_ATTR, 'true');
  image.src = imageUrl;
  image.alt = '';
  image.width = imageWidth;
  image.height = imageHeight;
  image.style.cssText = [
    'display:block',
    `width:${imageWidth}px`,
    'max-width:100%',
    'height:auto',
    'margin-left:auto',
    'margin-right:auto',
    'border:0',
    'vertical-align:top',
  ].join(';');
  return image;
};

const createCapturedHtmlImageSection = async (capture: HtmlCapture, margin: string) => {
  const section = document.createElement('section');
  section.setAttribute(PRESERVE_LAYOUT_ATTR, 'true');
  section.setAttribute(CAPTURED_HTML_IMAGE_SECTION_ATTR, 'true');
  section.style.cssText = [
    'width:100%',
    'max-width:100%',
    `margin:${margin}`,
    'box-sizing:border-box',
    'background:transparent',
    'text-align:center',
  ].join(';');

  const image = await createCapturedHtmlImageElement(capture);
  section.appendChild(image);
  return section;
};

const createCapturedHtmlRichCopyImageSection = async (
  capture: HtmlCapture,
  block: Element | null,
  theme: PreviewTheme,
) => {
  const image = await createCapturedHtmlImageElement(capture);
  return createElementFromHtml(
    createPortableRichBlockHtml({
      label: getPortableHtmlFrameLabel(block),
      meta: getArtifactHeaderText(block, '.aad-block-meta'),
      theme,
      bodyHtml: image.outerHTML,
      bodyKind: 'media',
      bodyPadding: HTML_RICH_COPY_IMAGE_BODY_PADDING,
    }),
  ) ?? image;
};

const replaceArtifactBlockBody = (block: Element | null, replacement: HTMLElement) => {
  if (!block) return false;
  const body = block.querySelector<HTMLElement>(':scope > .aad-collapsible-body');
  const bodyInner = block.querySelector<HTMLElement>(
    ':scope > .aad-collapsible-body .aad-collapsible-body-inner',
  );
  const replaceTarget =
    bodyInner ??
    (block.parentElement?.tagName.toLowerCase() === 'pre' ? block.parentElement : block);
  const stretchStaticImageContainer = replacement.hasAttribute(PRESERVE_LAYOUT_ATTR);

  if (stretchStaticImageContainer) {
    [block, body, bodyInner, replaceTarget].forEach((element) => {
      if (!(element instanceof HTMLElement)) return;
      element.style.setProperty('width', '100%');
      element.style.setProperty('max-width', '100%');
      element.style.setProperty('box-sizing', 'border-box');
    });
  }

  makeCopyBodyVisible(body);

  if (bodyInner) {
    makeCopyBodyInnerVisible(bodyInner);
    bodyInner.replaceChildren(replacement);
    return true;
  }

  replaceTarget?.replaceWith(replacement);
  return true;
};

const waitForIframeReady = (iframe: HTMLIFrameElement, timeoutMs = 1500) =>
  new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      iframe.removeEventListener('load', finish);
      window.clearTimeout(timeoutId);
      resolve();
    };
    const isReady = () => {
      try {
        const doc = iframe.contentDocument;
        return Boolean(doc?.body && doc.readyState !== 'loading');
      } catch {
        return true;
      }
    };
    const timeoutId = window.setTimeout(finish, timeoutMs);

    if (isReady()) {
      finish();
      return;
    }

    iframe.addEventListener('load', finish, { once: true });
  });

const waitForAnimationFrame = () => new Promise<void>((resolve) => {
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => resolve());
    return;
  }
  window.setTimeout(resolve, 0);
});

export const waitForHtmlPreviewFrames = async (sourceRoot: HTMLElement) => {
  if (sourceRoot.querySelector('[data-html-preview-deferred="true"]')) {
    requestDeferredHtmlPreviewMount();
    await waitForAnimationFrame();
    await waitForAnimationFrame();
  }
  await Promise.all(getHtmlPreviewFrames(sourceRoot).map((frame) => waitForIframeReady(frame)));
};

const replaceHtmlPreviewWithSource = async (
  sourceFrame: HTMLIFrameElement,
  cloneFrame: HTMLIFrameElement,
  inlineStyles: InlineStyleApplier,
  strategy: HtmlFrameStrategy,
  theme: PreviewTheme,
  captureOptions: HtmlFrameCaptureOptions = {},
  richCopyFallbackMessage?: string,
): Promise<boolean> => {
  const copyBlock = cloneFrame.closest('[data-copy-role="html-preview"]');
  let replacement: HTMLElement;
  const frameCaptureOptions = withHtmlFrameDeliveryWidth(sourceFrame, captureOptions);
  try {
    if (strategy === 'rich-copy-image') {
      const capture = await captureHtmlFrameScreenshot(
        sourceFrame,
        withRichCopyImageSafePadding(frameCaptureOptions),
      );
      replacement = await createCapturedHtmlRichCopyImageSection(capture, copyBlock, theme);
    } else if (strategy === 'rich-copy' && isFullDocumentHtmlFrame(sourceFrame)) {
      replacement = createHtmlRichCopyFallbackSection(copyBlock, theme, richCopyFallbackMessage);
    } else if (strategy === 'rich-copy' && !canUseHtmlFragmentForRichCopy(sourceFrame)) {
      replacement = createHtmlRichCopyFallbackSection(copyBlock, theme, richCopyFallbackMessage);
    } else if (strategy === 'rich-copy') {
      replacement = createHtmlFragmentRichCopySection(sourceFrame, copyBlock, inlineStyles, theme);
    } else {
      replacement = createHtmlFrameCopySection(sourceFrame, '0 auto', inlineStyles);
    }
  } catch (error) {
    console.warn('HTML preview source fallback used for copy/export:', error);
    replacement = strategy === 'rich-copy' || strategy === 'rich-copy-image'
      ? createHtmlRichCopyFallbackSection(copyBlock, theme, richCopyFallbackMessage)
      : createHtmlSourceUnavailableSection();
  }
  if ((strategy === 'rich-copy' || strategy === 'rich-copy-image') && copyBlock) {
    copyBlock.replaceWith(replacement);
    return strategy === 'rich-copy-image' && replacement.querySelector('img[src^="data:image/png"]') !== null;
  }
  const replaced = replaceArtifactBlockBody(copyBlock, replacement);
  return strategy === 'rich-copy-image' && replaced && replacement.querySelector('img[src^="data:image/png"]') !== null;
};

const expandHtmlPreviews = async (
  sourceRoot: HTMLElement,
  cloneRoot: HTMLElement,
  inlineStyles: InlineStyleApplier,
  strategy: HtmlFrameStrategy,
  theme: PreviewTheme,
  captureOptions: HtmlFrameCaptureOptions = {},
  richCopyFallbackMessage?: string,
): Promise<boolean> => {
  const sourceFrames = getHtmlPreviewFrames(sourceRoot);
  const cloneFrames = getHtmlPreviewFrames(cloneRoot);

  const imageResults: boolean[] = [];
  for (let index = 0; index < sourceFrames.length; index += 1) {
      const sourceFrame = sourceFrames[index];
      if (!sourceFrame) continue;
      const cloneFrame = cloneFrames[index];
      if (!cloneFrame) {
        imageResults.push(false);
        continue;
      }

      const copyBlock = cloneFrame.closest('[data-copy-role="html-preview"]');
      if (strategy === 'rich-copy' || strategy === 'rich-copy-image' || strategy === 'static-html') {
        imageResults.push(await replaceHtmlPreviewWithSource(
          sourceFrame,
          cloneFrame,
          inlineStyles,
          strategy,
          theme,
          captureOptions,
          richCopyFallbackMessage,
        ));
        continue;
      }
      try {
        const capture = await captureHtmlFrameScreenshot(sourceFrame, withHtmlFrameDeliveryWidth(sourceFrame, captureOptions));
        const replacement = await createCapturedHtmlImageSection(capture, '0');
        imageResults.push(replaceArtifactBlockBody(copyBlock, replacement));
      } catch (error) {
        console.warn('HTML preview screenshot fallback used for copy/export:', error);
        const sourceHtml = getHtmlPreviewCaptureSource(sourceFrame);
        const replacement = createHtmlSourceCopySection(
          sourceHtml,
          '0 auto',
          inlineStyles,
          getHtmlFrameRenderedWidth(sourceFrame),
        );
        replaceArtifactBlockBody(copyBlock, replacement);
        imageResults.push(false);
      }
  }
  return imageResults.some(Boolean);
};

export const replaceHtmlFramesWithStaticCaptures = async (
  sourceRoot: HTMLElement,
  cloneRoot: HTMLElement,
  inlineStyles: InlineStyleApplier,
  options: {
    crop?: boolean;
    htmlFrameStrategy?: HtmlFrameStrategy;
    minViewportWidth?: number;
    richCopyFallbackMessage?: string;
    theme?: PreviewTheme;
  } = {},
): Promise<boolean> => {
  const htmlFrameStrategy = options.htmlFrameStrategy ?? 'capture-image';
  const hasHtmlPreviewImages = await expandHtmlPreviews(
    sourceRoot,
    cloneRoot,
    inlineStyles,
    htmlFrameStrategy,
    options.theme ?? 'light',
    { crop: options.crop, minViewportWidth: options.minViewportWidth },
    options.richCopyFallbackMessage,
  );
  if (htmlFrameStrategy === 'rich-copy' || htmlFrameStrategy === 'rich-copy-image') {
    return hasHtmlPreviewImages;
  }
  return hasHtmlPreviewImages;
};
