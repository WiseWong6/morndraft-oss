import { getHtmlPreviewSnapshotSource } from '../../utils/html-preview-capture-source.js';
import { cropCanvasToContent } from './htmlCanvasCrop';
import { loadCaptureLibraries } from './captureLibraries';
import { inlineUnreadableRemoteStylesheets } from './htmlCaptureStylesheets';
import {
  createStableCaptureRoot,
  getHtmlFrameCaptureWidth,
  type HtmlCaptureImageMimeType,
  injectStableCaptureViewport,
  resolveContentRootCaptureTarget,
  type HtmlFrameCaptureOptions,
} from './htmlCaptureLayout';
import { HTML_PREVIEW_FRAME_SELECTOR } from './htmlCaptureFrames';
import { resolvePreviewCapturePagePlan } from './capturePixelBudget';
import { captureElementInSequentialPages } from './htmlScreenshotPagedCapture';
import {
  createStaticHtmlCaptureFrame,
  getElementCaptureSize,
  resizeStaticCaptureFrameToContent,
  suppressCaptureScrollbars,
  waitForElementAssets,
} from './htmlScreenshotCaptureFrame';
export { inlineUnreadableRemoteStylesheets } from './htmlCaptureStylesheets';
export {
  createStaticHtmlCaptureFrame,
  resizeStaticCaptureFrameToContent,
  waitForElementAssets,
} from './htmlScreenshotCaptureFrame';

export type HtmlCapturePageBreakHint = { height: number; y: number };
export type HtmlCapturePdfPage = {
  blob: Blob;
  height: number;
  orientation?: 'landscape' | 'portrait';
  pageHeightPt?: number;
  pageWidthPt?: number;
  width: number;
};
export type HtmlCapture = {
  blob: Blob;
  height: number;
  imagePages?: readonly HtmlCapturePdfPage[];
  pageBreakHints?: readonly HtmlCapturePageBreakHint[];
  pdfPages?: readonly HtmlCapturePdfPage[];
  width: number;
};

const HTML_CAPTURE_SNAPSHOT_TIMEOUT_MS = 6000;
const HTML_CAPTURE_SCREENSHOT_TIMEOUT_MS = 15000;
const HTML_CAPTURE_EDGE_SAFE_CROP_PADDING = 8;
const HTML_CAPTURE_DEFAULT_IMAGE_MIME_TYPE: HtmlCaptureImageMimeType = 'image/png';
const HTML_CAPTURE_PDF_A4_WIDTH_PX = 794;
const HTML_CAPTURE_PDF_A4_HEIGHT_PX = Math.ceil(HTML_CAPTURE_PDF_A4_WIDTH_PX * 841.89 / 595.28);

const canvasToBlob = (canvas: HTMLCanvasElement, imageMimeType: HtmlCaptureImageMimeType, imageQuality?: number) =>
  new Promise<Blob | null>((resolve) => { canvas.toBlob(resolve, imageMimeType, imageQuality); });

const canvasToPreferredBlob = async (
  canvas: HTMLCanvasElement,
  imageMimeType: HtmlCaptureImageMimeType = HTML_CAPTURE_DEFAULT_IMAGE_MIME_TYPE,
  imageQuality?: number,
) => {
  const preferredBlob = await canvasToBlob(canvas, imageMimeType, imageQuality);
  if (preferredBlob && (imageMimeType === HTML_CAPTURE_DEFAULT_IMAGE_MIME_TYPE || preferredBlob.type === imageMimeType)) {
    return preferredBlob;
  }
  if (imageMimeType !== HTML_CAPTURE_DEFAULT_IMAGE_MIME_TYPE) {
    return canvasToBlob(canvas, HTML_CAPTURE_DEFAULT_IMAGE_MIME_TYPE);
  }
  return preferredBlob;
};

export const captureHtmlFrameWithModernScreenshot = async (
  element: HTMLElement,
  backgroundColor = '#ffffff',
  options: {
    crop?: boolean;
    cropPadding?: number;
    captureHeight?: number;
    captureScale?: number;
    captureWidth?: number;
    imageMimeType?: HtmlCaptureImageMimeType;
    imageQuality?: number;
  } = {},
): Promise<HtmlCapture> => {
  const shouldCrop = options.crop ?? true;
  const cropPadding = Math.max(0, options.cropPadding ?? 0);
  const imageMimeType = options.imageMimeType ?? HTML_CAPTURE_DEFAULT_IMAGE_MIME_TYPE;
  const { domToCanvas } = await loadCaptureLibraries();
  const elementSize = getElementCaptureSize(element);
  const captureHeight = Math.max(1, Math.ceil(options.captureHeight ?? elementSize.height));
  const captureWidth = Math.max(1, Math.ceil(options.captureWidth ?? elementSize.width));
  const capturePlan = resolvePreviewCapturePagePlan({
    captureScale: options.captureScale,
    height: captureHeight,
    width: captureWidth,
  });
  const { scale } = capturePlan;

  const captureSinglePage = async (
    target: HTMLElement,
    pageWidth: number,
    pageHeight: number,
    crop: boolean,
  ): Promise<HtmlCapturePdfPage> => {
    const canvas = await domToCanvas(target, {
      backgroundColor,
      height: pageHeight,
      scale,
      width: pageWidth,
      features: {
        removeAbnormalAttributes: true,
        removeControlCharacter: true,
        fixSvgXmlDecode: true,
        copyScrollbar: false,
        restoreScrollPosition: false,
      },
      timeout: HTML_CAPTURE_SCREENSHOT_TIMEOUT_MS,
    });
    const outputCanvas = crop ? cropCanvasToContent(canvas, cropPadding * scale) : canvas;
    const outputWidth = Math.max(1, Math.ceil(outputCanvas.width / scale));
    const outputHeight = Math.max(1, Math.ceil(outputCanvas.height / scale));
    const blob = await canvasToPreferredBlob(outputCanvas, imageMimeType, options.imageQuality);
    if (!blob) throw new Error('Failed to create blob');
    return { blob, width: outputWidth, height: outputHeight };
  };

  if (capturePlan.pageCount > 1) {
    const pages = await captureElementInSequentialPages({
      backgroundColor,
      captureHeight,
      capturePage: (stage, pageHeight) => captureSinglePage(stage, captureWidth, pageHeight, false),
      captureWidth,
      element,
      pageCount: capturePlan.pageCount,
      pageHeight: capturePlan.pageHeight,
    });
    const firstPage = pages[0];
    if (!firstPage) throw new Error('Failed to create paged capture');
    return { ...firstPage, imagePages: pages };
  }

  return captureSinglePage(element, captureWidth, captureHeight, shouldCrop);
};

const CAPTURE_UNSUPPORTED_COLOR_FUNCTION_RE = /\b(?:oklch|oklab|lch|lab|color-mix)\(/i;

// html2canvas cannot parse modern CSS color functions and throws before
// producing a canvas; strip them from the cloned capture document only.
const sanitizeCaptureDocumentColorFunctions = (clonedDocument: Document) => {
  for (const sheet of Array.from(clonedDocument.styleSheets)) {
    let rules: CSSRuleList | null = null;
    try {
      rules = sheet.cssRules;
    } catch {
      rules = null;
    }
    if (!rules) continue;
    for (const rule of Array.from(rules)) {
      if (rule.type !== CSSRule.STYLE_RULE) continue;
      const style = (rule as CSSStyleRule).style;
      for (let index = style.length - 1; index >= 0; index -= 1) {
        const property = style.item(index);
        if (CAPTURE_UNSUPPORTED_COLOR_FUNCTION_RE.test(style.getPropertyValue(property))) {
          style.removeProperty(property);
        }
      }
    }
  }
  for (const element of Array.from(clonedDocument.querySelectorAll<HTMLElement>('[style]'))) {
    for (let index = element.style.length - 1; index >= 0; index -= 1) {
      const property = element.style.item(index);
      if (CAPTURE_UNSUPPORTED_COLOR_FUNCTION_RE.test(element.style.getPropertyValue(property))) {
        element.style.removeProperty(property);
      }
    }
  }
};

export const captureHtmlElementWithHtml2Canvas = async (
  element: HTMLElement,
  backgroundColor = '#ffffff',
  options: {
    crop?: boolean;
    cropPadding?: number;
    captureScale?: number;
    imageMimeType?: HtmlCaptureImageMimeType;
    imageQuality?: number;
  } = {},
): Promise<HtmlCapture> => {
  const shouldCrop = options.crop ?? true;
  const cropPadding = Math.max(0, options.cropPadding ?? 0);
  const imageMimeType = options.imageMimeType ?? HTML_CAPTURE_DEFAULT_IMAGE_MIME_TYPE;
  const { html2canvas } = await loadCaptureLibraries();
  const { height: captureHeight, width: captureWidth } = getElementCaptureSize(element);
  const capturePlan = resolvePreviewCapturePagePlan({
    captureScale: options.captureScale,
    height: captureHeight,
    width: captureWidth,
  });
  if (capturePlan.pageCount > 1) {
    return captureHtmlFrameWithModernScreenshot(element, backgroundColor, options);
  }
  const { scale } = capturePlan;
  const doc = element.ownerDocument;
  const view = doc.defaultView;
  const canvas = await html2canvas(element, {
    allowTaint: true,
    backgroundColor,
    height: captureHeight,
    logging: false,
    onclone: sanitizeCaptureDocumentColorFunctions,
    removeContainer: true,
    scale,
    scrollX: view?.scrollX ?? 0,
    scrollY: view?.scrollY ?? 0,
    useCORS: true,
    width: captureWidth,
    windowHeight: Math.max(captureHeight, doc.documentElement?.scrollHeight ?? 0, view?.innerHeight ?? 0),
    windowWidth: Math.max(captureWidth, doc.documentElement?.scrollWidth ?? 0, view?.innerWidth ?? 0),
  });
  const outputCanvas = shouldCrop ? cropCanvasToContent(canvas, cropPadding * scale) : canvas;
  const outputWidth = Math.max(1, Math.ceil(outputCanvas.width / scale));
  const outputHeight = Math.max(1, Math.ceil(outputCanvas.height / scale));
  const blob = await canvasToPreferredBlob(outputCanvas, imageMimeType, options.imageQuality);
  if (!blob) throw new Error('Failed to create blob');
  return {
    blob,
    width: outputWidth,
    height: outputHeight,
  };
};

const capturePreparedHtmlSource = async (
  captureSource: string,
  captureWidth: number,
  captureHeight: number,
  options: HtmlFrameCaptureOptions = {},
) => {
  const stableSource = injectStableCaptureViewport(
    captureSource,
    options.minViewportWidth ? captureWidth : null,
  );
  const captureFrame = await createStaticHtmlCaptureFrame(
    stableSource,
    captureWidth,
    captureHeight,
  );
  const captureDocument = captureFrame.contentDocument;
  const captureRoot = options.minViewportWidth && captureDocument?.body
    ? createStableCaptureRoot(captureDocument, captureWidth)
    : captureDocument?.body;

  try {
    if (!captureRoot) throw new Error('HTML 截图环境初始化失败，请重试。');
    captureRoot.style.minHeight = '0';
    captureDocument?.body?.style.setProperty('min-height', '0');
    captureDocument?.documentElement?.style.setProperty('min-height', '0');
    suppressCaptureScrollbars(captureRoot.ownerDocument, captureRoot);
    await inlineUnreadableRemoteStylesheets(captureRoot);
    await waitForElementAssets(captureRoot);
    await resizeStaticCaptureFrameToContent(captureFrame, captureRoot, {
      stableWidth: options.minViewportWidth ? captureWidth : undefined,
    });
    const captureTarget = options.captureTarget === 'content-root'
      ? resolveContentRootCaptureTarget(captureDocument, captureRoot)
      : captureRoot;
    const isRootCapture = captureTarget === captureRoot;
    const capture = await captureHtmlFrameWithModernScreenshot(captureTarget, '#ffffff', {
      crop: options.crop ?? isRootCapture,
      cropPadding: options.cropPadding,
      captureScale: options.captureScale,
      imageMimeType: options.imageMimeType,
      imageQuality: options.imageQuality,
    });
    return options.minViewportWidth && options.preserveMinViewportWidth !== false
      ? { ...capture, width: Math.max(capture.width, captureWidth) }
      : capture;
  } finally {
    captureFrame.remove();
  }
};

const getHtmlPdfContentHeight = (doc: Document, captureRoot: HTMLElement) => {
  const rootRect = captureRoot.getBoundingClientRect();
  return Math.max(
    HTML_CAPTURE_PDF_A4_HEIGHT_PX,
    captureRoot.scrollHeight,
    captureRoot.offsetHeight,
    Math.ceil(rootRect.height),
    doc.body?.scrollHeight ?? 0,
    doc.documentElement?.scrollHeight ?? 0,
  );
};

const copyElementIdentity = (from: HTMLElement, to: HTMLElement) => {
  if (from.className) to.className = String(from.className);
  if (from.getAttribute('style')) to.setAttribute('style', from.getAttribute('style') ?? '');
  to.style.width = `${HTML_CAPTURE_PDF_A4_WIDTH_PX}px`;
  to.style.maxWidth = 'none';
  to.style.minHeight = '0';
};

const createHtmlPdfPageFrame = (
  doc: Document,
  captureRoot: HTMLElement,
  pageIndex: number,
) => {
  const pageFrame = doc.createElement('section');
  pageFrame.setAttribute('data-morndraft-html-pdf-page', String(pageIndex + 1));
  pageFrame.style.cssText = [
    'position:relative',
    'display:block',
    `width:${HTML_CAPTURE_PDF_A4_WIDTH_PX}px`,
    `height:${HTML_CAPTURE_PDF_A4_HEIGHT_PX}px`,
    'min-width:0',
    'min-height:0',
    'overflow:hidden',
    'box-sizing:border-box',
    'background:#ffffff',
  ].join(';');

  const pageContent = doc.createElement('div');
  pageContent.setAttribute('data-morndraft-html-pdf-content', 'true');
  copyElementIdentity(captureRoot, pageContent);
  pageContent.style.position = 'absolute';
  pageContent.style.left = '0';
  pageContent.style.top = `${-pageIndex * HTML_CAPTURE_PDF_A4_HEIGHT_PX}px`;
  pageContent.style.margin = '0';
  pageContent.style.transform = '';
  pageContent.style.transformOrigin = '0 0';

  for (const child of Array.from(captureRoot.childNodes)) {
    pageContent.appendChild(child.cloneNode(true));
  }

  pageFrame.appendChild(pageContent);
  return pageFrame;
};

const capturePreparedHtmlPdfPages = async (
  captureSource: string,
  captureScale?: number,
) => {
  const stableSource = injectStableCaptureViewport(captureSource, HTML_CAPTURE_PDF_A4_WIDTH_PX);
  const captureFrame = await createStaticHtmlCaptureFrame(
    stableSource,
    HTML_CAPTURE_PDF_A4_WIDTH_PX,
    HTML_CAPTURE_PDF_A4_HEIGHT_PX,
  );
  const captureDocument = captureFrame.contentDocument;
  const captureRoot = captureDocument?.body;

  try {
    if (!captureDocument || !captureRoot) throw new Error('HTML 截图环境初始化失败，请重试。');
    captureRoot.style.minHeight = '0';
    captureRoot.style.width = `${HTML_CAPTURE_PDF_A4_WIDTH_PX}px`;
    captureRoot.style.maxWidth = 'none';
    captureDocument.documentElement.style.setProperty('width', `${HTML_CAPTURE_PDF_A4_WIDTH_PX}px`);
    captureDocument.documentElement.style.setProperty('max-width', 'none');
    captureDocument.body.style.setProperty('min-height', '0');
    suppressCaptureScrollbars(captureDocument, captureRoot);
    await inlineUnreadableRemoteStylesheets(captureRoot);
    await waitForElementAssets(captureRoot);
    await resizeStaticCaptureFrameToContent(captureFrame, captureRoot, {
      minHeight: HTML_CAPTURE_PDF_A4_HEIGHT_PX,
      stableWidth: HTML_CAPTURE_PDF_A4_WIDTH_PX,
    });

    const contentHeight = getHtmlPdfContentHeight(captureDocument, captureRoot);
    const pageCount = Math.max(1, Math.ceil(contentHeight / HTML_CAPTURE_PDF_A4_HEIGHT_PX));
    const pages: HtmlCapturePdfPage[] = [];

    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
      const pageFrame = createHtmlPdfPageFrame(captureDocument, captureRoot, pageIndex);
      captureRoot.appendChild(pageFrame);
      try {
        await waitForElementAssets(pageFrame);
        const capture = await captureHtmlFrameWithModernScreenshot(pageFrame, '#ffffff', {
          crop: false,
          captureHeight: HTML_CAPTURE_PDF_A4_HEIGHT_PX,
          captureScale,
          captureWidth: HTML_CAPTURE_PDF_A4_WIDTH_PX,
        });
        pages.push({
          blob: capture.blob,
          height: HTML_CAPTURE_PDF_A4_HEIGHT_PX,
          orientation: 'portrait',
          pageHeightPt: 841.89,
          pageWidthPt: 595.28,
          width: HTML_CAPTURE_PDF_A4_WIDTH_PX,
        });
      } finally {
        pageFrame.remove();
      }
    }

    const firstPage = pages[0];
    if (!firstPage) throw new Error('HTML PDF 截图生成失败，请重试。');
    return {
      ...firstPage,
      pdfPages: pages,
    };
  } finally {
    captureFrame.remove();
  }
};

export const captureHtmlFrameScreenshot = async (
  iframe: HTMLIFrameElement,
  options: HtmlFrameCaptureOptions = {},
): Promise<HtmlCapture> => {
  const captureWidth = getHtmlFrameCaptureWidth(iframe, options);
  let captureSource: string;
  try {
    captureSource = await getHtmlPreviewSnapshotSource(iframe, {
      timeoutMs: HTML_CAPTURE_SNAPSHOT_TIMEOUT_MS,
      viewportWidth: captureWidth,
      viewportHeight: Math.max(1, iframe.clientHeight),
    });
  } catch (error) {
    console.error('HTML preview iframe snapshot failed:', error);
    throw error;
  }
  return capturePreparedHtmlSource(
    captureSource,
    captureWidth,
    iframe.clientHeight,
    options,
  );
};

export const captureHtmlPreviewScreenshot = async (
  sourceRoot: HTMLElement,
  notReadyMessage: string,
  options: Pick<HtmlFrameCaptureOptions, 'captureScale'> = {},
): Promise<HtmlCapture> => {
  const htmlPreviewFrame = sourceRoot.querySelector<HTMLIFrameElement>(HTML_PREVIEW_FRAME_SELECTOR);
  if (!htmlPreviewFrame) throw new Error(notReadyMessage);
  return captureHtmlFrameScreenshot(htmlPreviewFrame, {
    captureScale: options.captureScale,
    cropPadding: HTML_CAPTURE_EDGE_SAFE_CROP_PADDING,
  });
};

export const captureHtmlPreviewPdfScreenshot = async (
  sourceRoot: HTMLElement,
  notReadyMessage: string,
  options: Pick<HtmlFrameCaptureOptions, 'captureScale'> = {},
): Promise<HtmlCapture> => {
  const htmlPreviewFrame = sourceRoot.querySelector<HTMLIFrameElement>(HTML_PREVIEW_FRAME_SELECTOR);
  if (!htmlPreviewFrame) throw new Error(notReadyMessage);
  let captureSource: string;
  try {
    captureSource = await getHtmlPreviewSnapshotSource(htmlPreviewFrame, {
      timeoutMs: HTML_CAPTURE_SNAPSHOT_TIMEOUT_MS,
      viewportWidth: HTML_CAPTURE_PDF_A4_WIDTH_PX,
      viewportHeight: HTML_CAPTURE_PDF_A4_HEIGHT_PX,
    });
  } catch (error) {
    console.error('HTML preview iframe PDF snapshot failed:', error);
    throw error;
  }
  return capturePreparedHtmlPdfPages(captureSource, options.captureScale);
};
