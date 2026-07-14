import type { PDFDocument, PDFPage } from 'pdf-lib';

import {
  type DeliveryLibraryLoadOptions,
  withDeliveryLibraryLoadGuard,
} from './captureRuntime';
import { PublicDeliveryError } from './types';

const A4_PORTRAIT_WIDTH_PT = 595.28;
const A4_PORTRAIT_HEIGHT_PT = 841.89;
const DEFAULT_MARGIN_PT = 36;
const MINIMUM_NON_FINAL_PAGE_FILL_RATIO = 0.55;
export const PUBLIC_IMAGE_PDF_OPERATION_TIMEOUT_MS = 30_000;

export type ImagePdfPageCapture = {
  blob: Blob;
  height: number;
  orientation?: 'landscape' | 'portrait';
  pageHeightPt?: number;
  pageWidthPt?: number;
  width: number;
};

export type ImagePdfCapture = {
  blob: Blob;
  height: number;
  pageBreakHints?: readonly ImagePdfPageBreakHint[];
  pdfPages?: readonly ImagePdfPageCapture[];
  /** Optional authoritative encoded image width, in pixels. */
  pixelWidth?: number;
  /** Optional authoritative encoded image height, in pixels. */
  pixelHeight?: number;
  width: number;
};

export type ImagePdfPage = {
  clipHeight: number;
  clipWidth: number;
  clipX: number;
  clipY: number;
  index: number;
  drawX: number;
  drawY: number;
  sourceHeight: number;
  sourceY: number;
  visibleHeight: number;
};

export type ImagePdfLayoutInput = {
  imageWidth: number;
  imageHeight: number;
  pageBreakHints?: readonly ImagePdfPageBreakHint[];
  pageWidth?: number;
  pageHeight?: number;
  margin?: number;
};

export type ImagePdfPageBreakHint = {
  height: number;
  y: number;
};

export type ImagePdfLayout = {
  pageWidth: number;
  pageHeight: number;
  margin: number;
  pageContentWidth: number;
  pageContentHeight: number;
  scale: number;
  drawWidth: number;
  drawHeight: number;
  pages: ImagePdfPage[];
};

const assertPositiveDimension = (value: number, label: string) => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid PDF ${label}.`);
  }
};

const setA4PageBoxes = (page: PDFPage, width: number, height: number) => {
  page.setMediaBox(0, 0, width, height);
  page.setCropBox(0, 0, width, height);
  page.setBleedBox(0, 0, width, height);
  page.setTrimBox(0, 0, width, height);
  page.setArtBox(0, 0, width, height);
};

const getPdfPageBox = (pageCapture: ImagePdfPageCapture) => {
  const pageWidth = pageCapture.pageWidthPt ??
    (pageCapture.orientation === 'landscape' ? A4_PORTRAIT_HEIGHT_PT : A4_PORTRAIT_WIDTH_PT);
  const pageHeight = pageCapture.pageHeightPt ??
    (pageCapture.orientation === 'landscape' ? A4_PORTRAIT_WIDTH_PT : A4_PORTRAIT_HEIGHT_PT);
  assertPositiveDimension(pageWidth, 'page width');
  assertPositiveDimension(pageHeight, 'page height');
  return { pageHeight, pageWidth };
};

const normalizePageBreakHints = (
  hints: readonly ImagePdfPageBreakHint[] | undefined,
  imageHeight: number,
) => {
  if (!hints?.length) return [];
  const normalized = hints
    .map((hint) => {
      const y = Number(hint.y);
      const height = Number(hint.height);
      if (!Number.isFinite(y) || !Number.isFinite(height) || height <= 0) return null;
      const start = Math.max(0, Math.min(imageHeight, y));
      const end = Math.max(start, Math.min(imageHeight, y + height));
      return end > start ? { y: start, height: end - start } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.y - b.y) as ImagePdfPageBreakHint[];

  return normalized.reduce<ImagePdfPageBreakHint[]>((segments, segment) => {
    const previous = segments[segments.length - 1];
    if (!previous) {
      segments.push({ ...segment });
      return segments;
    }
    const previousEnd = previous.y + previous.height;
    if (segment.y < previousEnd) {
      const nextEnd = Math.max(previousEnd, segment.y + segment.height);
      previous.height = nextEnd - previous.y;
    } else {
      segments.push({ ...segment });
    }
    return segments;
  }, []);
};

const buildDefaultSourceRanges = (imageHeight: number, pageSourceHeight: number) => {
  const pageCount = Math.max(1, Math.ceil(imageHeight / pageSourceHeight));
  return Array.from({ length: pageCount }, (_, index) => {
    const sourceY = index * pageSourceHeight;
    return {
      sourceY,
      sourceHeight: Math.min(pageSourceHeight, Math.max(0, imageHeight - sourceY)),
    };
  });
};

const buildSegmentAwareSourceRanges = (
  imageHeight: number,
  pageSourceHeight: number,
  hints: readonly ImagePdfPageBreakHint[] | undefined,
) => {
  const segments = normalizePageBreakHints(hints, imageHeight);
  if (segments.length === 0) return buildDefaultSourceRanges(imageHeight, pageSourceHeight);
  const minimumPageSourceHeight = pageSourceHeight * MINIMUM_NON_FINAL_PAGE_FILL_RATIO;

  const units: ImagePdfPageBreakHint[] = [];
  let cursor = 0;
  segments.forEach((segment) => {
    if (segment.y > cursor) {
      units.push({ y: cursor, height: segment.y - cursor });
    }
    units.push(segment);
    cursor = Math.max(cursor, segment.y + segment.height);
  });
  if (cursor < imageHeight) {
    units.push({ y: cursor, height: imageHeight - cursor });
  }

  const ranges: Array<{ sourceHeight: number; sourceY: number }> = [];
  let active: { sourceY: number; sourceEnd: number } | null = null;
  const closeActive = () => {
    if (!active) return;
    const sourceHeight = active.sourceEnd - active.sourceY;
    if (sourceHeight > 0) ranges.push({ sourceY: active.sourceY, sourceHeight });
    active = null;
  };

  units.forEach((unit) => {
    let sourceY = unit.y;
    let remaining = unit.height;

    if (
      active &&
      active.sourceEnd - active.sourceY < minimumPageSourceHeight &&
      sourceY + remaining - active.sourceY > pageSourceHeight
    ) {
      const fillHeight = Math.min(pageSourceHeight - (active.sourceEnd - active.sourceY), remaining);
      active.sourceEnd += fillHeight;
      sourceY += fillHeight;
      remaining -= fillHeight;
      closeActive();
      if (remaining <= 0) return;
    }

    if (remaining > pageSourceHeight) {
      closeActive();
      while (remaining > pageSourceHeight) {
        ranges.push({ sourceY, sourceHeight: pageSourceHeight });
        sourceY += pageSourceHeight;
        remaining -= pageSourceHeight;
      }
      if (remaining > 0) {
        active = { sourceY, sourceEnd: sourceY + remaining };
      }
      return;
    }

    if (!active) {
      active = { sourceY, sourceEnd: sourceY + remaining };
      return;
    }

    if (sourceY + remaining - active.sourceY <= pageSourceHeight) {
      active.sourceEnd = sourceY + remaining;
      return;
    }

    closeActive();
    active = { sourceY, sourceEnd: sourceY + remaining };
  });

  closeActive();
  return ranges.length ? ranges : buildDefaultSourceRanges(imageHeight, pageSourceHeight);
};

export const calculateImagePdfPages = ({
  imageWidth,
  imageHeight,
  pageBreakHints,
  pageWidth = A4_PORTRAIT_WIDTH_PT,
  pageHeight = A4_PORTRAIT_HEIGHT_PT,
  margin = DEFAULT_MARGIN_PT,
}: ImagePdfLayoutInput): ImagePdfLayout => {
  assertPositiveDimension(imageWidth, 'image width');
  assertPositiveDimension(imageHeight, 'image height');
  assertPositiveDimension(pageWidth, 'page width');
  assertPositiveDimension(pageHeight, 'page height');

  const safeMargin = Math.max(0, Math.min(margin, (Math.min(pageWidth, pageHeight) - 1) / 2));
  const pageContentWidth = pageWidth - safeMargin * 2;
  const pageContentHeight = pageHeight - safeMargin * 2;
  assertPositiveDimension(pageContentWidth, 'content width');
  assertPositiveDimension(pageContentHeight, 'content height');

  const scale = pageContentWidth / imageWidth;
  const drawWidth = pageContentWidth;
  const drawHeight = imageHeight * scale;
  const pageSourceHeight = pageContentHeight / scale;
  const sourceRanges = buildSegmentAwareSourceRanges(imageHeight, pageSourceHeight, pageBreakHints);
  const drawX = (pageWidth - drawWidth) / 2;
  const firstPageDrawY = pageHeight - safeMargin - drawHeight;
  const pages = sourceRanges.map((range, index) => {
    const visibleHeight = Math.min(pageContentHeight, range.sourceHeight * scale);
    return {
      clipHeight: visibleHeight,
      clipWidth: drawWidth,
      clipX: drawX,
      clipY: pageHeight - safeMargin - visibleHeight,
      index,
      drawX,
      drawY: firstPageDrawY + range.sourceY * scale,
      sourceHeight: range.sourceHeight,
      sourceY: range.sourceY,
      visibleHeight,
    };
  });

  return {
    pageWidth,
    pageHeight,
    margin: safeMargin,
    pageContentWidth,
    pageContentHeight,
    scale,
    drawWidth,
    drawHeight,
    pages,
  };
};

const throwIfImagePdfAborted = (signal?: AbortSignal) => {
  if (!signal?.aborted) return;
  throw new PublicDeliveryError(
    'capture-failed',
    '文档已变化，已取消旧的交付任务。',
    { cause: signal.reason },
  );
};

const runImagePdfOperation = async <T>(
  operation: () => Promise<T> | T,
  options: DeliveryLibraryLoadOptions,
  timeoutMessage: string,
) => {
  throwIfImagePdfAborted(options.signal);
  const pending = Promise.resolve().then(operation);
  const result = await withDeliveryLibraryLoadGuard(pending, {
    signal: options.signal,
    timeoutMs: options.timeoutMs ?? PUBLIC_IMAGE_PDF_OPERATION_TIMEOUT_MS,
    timeoutMessage: options.timeoutMessage ?? timeoutMessage,
  });
  throwIfImagePdfAborted(options.signal);
  return result;
};

const drawFullA4ImagePage = async (
  pdfDoc: PDFDocument,
  pageCapture: ImagePdfPageCapture,
  options: DeliveryLibraryLoadOptions,
) => {
  assertPositiveDimension(pageCapture.width, 'page image width');
  assertPositiveDimension(pageCapture.height, 'page image height');
  const { pageHeight, pageWidth } = getPdfPageBox(pageCapture);
  const imageBytes = await runImagePdfOperation(
    () => pageCapture.blob.arrayBuffer(),
    options,
    'PDF 图片读取超时，未生成不完整的交付产物。',
  );
  const pngImage = await runImagePdfOperation(
    () => pdfDoc.embedPng(imageBytes),
    options,
    'PDF 图片解析超时，未生成不完整的交付产物。',
  );
  throwIfImagePdfAborted(options.signal);
  const page = pdfDoc.addPage([pageWidth, pageHeight]);
  setA4PageBoxes(page, pageWidth, pageHeight);
  page.drawImage(pngImage, {
    x: 0,
    y: 0,
    width: pageWidth,
    height: pageHeight,
  });
};

type ImagePdfLibrary = typeof import('pdf-lib');

type ImagePdfLibraryImporter = () => Promise<ImagePdfLibrary>;

export type ImagePdfLibraryLoader = (
  options?: DeliveryLibraryLoadOptions,
) => Promise<ImagePdfLibrary>;

export const createImagePdfLibraryLoader = (
  importer: ImagePdfLibraryImporter = () => import('pdf-lib'),
) => {
  let libraryPromise: Promise<ImagePdfLibrary> | null = null;
  return (options: DeliveryLibraryLoadOptions = {}) => {
    if (!libraryPromise) {
      const pendingImport = Promise.resolve().then(importer);
      libraryPromise = pendingImport;
      void pendingImport.catch(() => {
        if (libraryPromise === pendingImport) libraryPromise = null;
      });
    }
    const pending = libraryPromise;
    return withDeliveryLibraryLoadGuard(pending, {
      ...options,
      timeoutMessage: options.timeoutMessage ?? 'PDF 引擎加载超时，请检查网络后重试。',
    }, () => {
      if (libraryPromise === pending) libraryPromise = null;
    });
  };
};

const loadImagePdfLibrary = createImagePdfLibraryLoader();

export const createImagePdfBlobBuilder = (
  loadLibrary: ImagePdfLibraryLoader = createImagePdfLibraryLoader(),
) => async (
  capture: ImagePdfCapture,
  options: DeliveryLibraryLoadOptions = {},
) => {
  const {
    PDFDocument,
    clip,
    endPath,
    popGraphicsState,
    pushGraphicsState,
    rectangle,
  } = await loadLibrary(options);
  const pdfDoc = await runImagePdfOperation(
    () => PDFDocument.create(),
    options,
    'PDF 文档初始化超时，请重试。',
  );
  if (capture.pdfPages?.length) {
    for (const pageCapture of capture.pdfPages) {
      throwIfImagePdfAborted(options.signal);
      await drawFullA4ImagePage(pdfDoc, pageCapture, options);
    }
    const pdfBytes = await runImagePdfOperation(
      () => pdfDoc.save(),
      options,
      'PDF 文件保存超时，未生成不完整的交付产物。',
    );
    return new Blob([pdfBytes], { type: 'application/pdf' });
  }

  const imageBytes = await runImagePdfOperation(
    () => capture.blob.arrayBuffer(),
    options,
    'PDF 图片读取超时，未生成不完整的交付产物。',
  );
  const pngImage = await runImagePdfOperation(
    () => pdfDoc.embedPng(imageBytes),
    options,
    'PDF 图片解析超时，未生成不完整的交付产物。',
  );
  const imageWidth = capture.pixelWidth ?? (pngImage.width || capture.width);
  const imageHeight = capture.pixelHeight ?? (pngImage.height || capture.height);
  const hintScaleY = imageHeight / Math.max(1, capture.height);
  const pageBreakHints = capture.pageBreakHints?.map((hint) => ({
    y: hint.y * hintScaleY,
    height: hint.height * hintScaleY,
  }));
  const layout = calculateImagePdfPages({
    imageWidth,
    imageHeight,
    pageBreakHints,
  });

  for (const pageLayout of layout.pages) {
    throwIfImagePdfAborted(options.signal);
    const page = pdfDoc.addPage([layout.pageWidth, layout.pageHeight]);
    setA4PageBoxes(page, layout.pageWidth, layout.pageHeight);
    page.pushOperators(
      pushGraphicsState(),
      rectangle(pageLayout.clipX, pageLayout.clipY, pageLayout.clipWidth, pageLayout.clipHeight),
      clip(),
      endPath(),
    );
    page.drawImage(pngImage, {
      x: pageLayout.drawX,
      y: pageLayout.drawY,
      width: layout.drawWidth,
      height: layout.drawHeight,
    });
    page.pushOperators(popGraphicsState());
  }

  const pdfBytes = await runImagePdfOperation(
    () => pdfDoc.save(),
    options,
    'PDF 文件保存超时，未生成不完整的交付产物。',
  );
  return new Blob([pdfBytes], { type: 'application/pdf' });
};

export const buildImagePdfBlob = createImagePdfBlobBuilder(loadImagePdfLibrary);
