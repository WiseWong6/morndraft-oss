import { useCallback, useRef } from 'react';
import { resolveMeasuredHtmlPreviewWidthReport } from '../../utils/html-preview-size.js';
import { measureHtmlDocumentContentHeight } from './htmlDocumentMeasurement';
import type { QueueHtmlPreviewSettledSize } from './useHtmlPreviewBridge';

const measureIframeSizeFromParent = (iframe: HTMLIFrameElement | null) => {
  try {
    const doc = iframe?.contentDocument;
    const body = doc?.body;
    const html = doc?.documentElement;
    const view = doc?.defaultView;
    if (!body || !html || !view) return null;
    const bodyRect = body.getBoundingClientRect();
    const htmlRect = html.getBoundingClientRect();
    const directBounds = Array.from(body.children).reduce(
      (bounds, element) => {
        const rect = element.getBoundingClientRect();
        if (!rect || (rect.width === 0 && rect.height === 0)) return bounds;
        return {
          contentWidth: Math.max(bounds.contentWidth, rect.width),
          minLeft: bounds.hasRect ? Math.min(bounds.minLeft, rect.left) : rect.left,
          maxRight: bounds.hasRect ? Math.max(bounds.maxRight, rect.right) : rect.right,
          hasRect: true,
        };
      },
      { contentWidth: 0, minLeft: 0, maxRight: 0, hasRect: false },
    );
    const widthReport = resolveMeasuredHtmlPreviewWidthReport({
      contentExtent: directBounds.contentWidth,
      scrollExtent: Math.max(body.scrollWidth, html.scrollWidth),
      rectExtent: Math.max(bodyRect.width, htmlRect.width),
      visualExtent: directBounds.hasRect ? directBounds.maxRight - directBounds.minLeft : 0,
      viewportExtent: view.innerWidth,
    });
    return {
      height: measureHtmlDocumentContentHeight(doc),
      width: widthReport.width,
      widthKind: widthReport.widthKind,
    };
  } catch {
    return null;
  }
};

export const useHtmlPreviewParentMeasurement = ({
  queueSettledSize,
}: {
  queueSettledSize: QueueHtmlPreviewSettledSize;
}) => {
  const parentMeasureCleanupRef = useRef<(() => void) | null>(null);

  const cleanupParentMeasurement = useCallback(() => {
    parentMeasureCleanupRef.current?.();
    parentMeasureCleanupRef.current = null;
  }, []);

  const reportIframeSizeFromParent = useCallback((iframe: HTMLIFrameElement | null, commitImmediately = false) => {
    const measured = measureIframeSizeFromParent(iframe);
    if (!measured) return false;
    queueSettledSize(
      measured.height,
      measured.width,
      commitImmediately,
      measured.widthKind === 'viewport-feedback' ? 'viewport-feedback' : 'content',
    );
    return true;
  }, [queueSettledSize]);

  const bindParentMeasurement = useCallback((iframe: HTMLIFrameElement | null) => {
    cleanupParentMeasurement();
    const doc = iframe?.contentDocument;
    const body = doc?.body;
    const html = doc?.documentElement;
    if (!iframe || !doc || !body || !html) return;

    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        reportIframeSizeFromParent(iframe);
      });
    };

    const observer = new ResizeObserver(schedule);
    observer.observe(body);
    observer.observe(html);
    const images = new Set<HTMLImageElement>();
    const bindImage = (image: HTMLImageElement) => {
      if (images.has(image)) return;
      images.add(image);
      image.addEventListener('load', schedule);
      image.addEventListener('error', schedule);
    };
    const bindImages = () => {
      Array.from(doc.querySelectorAll('img')).forEach(bindImage);
    };
    bindImages();
    const mutationObserver = new MutationObserver(() => {
      bindImages();
      schedule();
    });
    mutationObserver.observe(html, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ['class', 'height', 'src', 'style', 'width'],
    });
    // 首次测量走 settle（而非 commitImmediately），让 ResizeObserver 后续测量（字体/布局稳定后的真实值）
    // 与首次中间态在 settle 严格合并，避免首测中间态（如 272）被立即提交后又提交真实值（240）造成横跳。
    reportIframeSizeFromParent(iframe, false);
    const timeoutIds = [
      window.setTimeout(schedule, 50),
      window.setTimeout(schedule, 250),
      window.setTimeout(schedule, 1000),
    ];

    parentMeasureCleanupRef.current = () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer.disconnect();
      mutationObserver.disconnect();
      images.forEach((image) => {
        image.removeEventListener('load', schedule);
        image.removeEventListener('error', schedule);
      });
      timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
    };
  }, [cleanupParentMeasurement, reportIframeSizeFromParent]);

  return {
    bindParentMeasurement,
    cleanupParentMeasurement,
  };
};
