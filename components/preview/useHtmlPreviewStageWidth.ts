import { useEffect, useRef, useState, type RefObject } from 'react';
import { HTML_PREVIEW_WIDTH_EPSILON } from './htmlPreviewReporter';

export const isHtmlPreviewStageCollapsed = (
  stage: HTMLElement | null | undefined,
) => stage?.closest<HTMLElement>('.aad-collapsible-block')?.dataset.collapsed === 'true';

export const useHtmlPreviewStageWidth = (
  stageRef: RefObject<HTMLDivElement | null>,
) => {
  const [stageAvailableWidth, setStageAvailableWidth] = useState(0);
  const stageWidthRafRef = useRef<number | null>(null);
  const lastPositiveStageWidthRef = useRef(0);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;

    const readStageWidth = () => {
      const parent = stage.closest<HTMLElement>('.aad-collapsible-body-inner') ?? stage.parentElement;
      const parentRect = parent?.getBoundingClientRect();
      const rect = stage.getBoundingClientRect();
      const candidates = [
        parent?.clientWidth,
        parentRect?.width,
        stage.clientWidth,
        rect.width,
      ];
      const nextWidth = candidates.find((value) => (
        typeof value === 'number' && Number.isFinite(value) && value > 0
      ));
      return Math.ceil(nextWidth ?? 0);
    };

    const commitStageWidth = () => {
      stageWidthRafRef.current = null;
      if (isHtmlPreviewStageCollapsed(stage)) return;
      const measuredWidth = readStageWidth();
      const nextWidth = measuredWidth > 0
        ? measuredWidth
        : lastPositiveStageWidthRef.current;
      if (nextWidth <= 0) return;
      lastPositiveStageWidthRef.current = nextWidth;
      setStageAvailableWidth((currentWidth) => (
        Math.abs(nextWidth - currentWidth) > HTML_PREVIEW_WIDTH_EPSILON ? nextWidth : currentWidth
      ));
    };

    const updateStageWidth = () => {
      if (stageWidthRafRef.current !== null) return;
      stageWidthRafRef.current = window.requestAnimationFrame(commitStageWidth);
    };

    updateStageWidth();
    window.addEventListener('resize', updateStageWidth);
    window.visualViewport?.addEventListener('resize', updateStageWidth);
    window.visualViewport?.addEventListener('scroll', updateStageWidth);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(updateStageWidth);
      resizeObserver.observe(stage);
      const parent = stage.closest<HTMLElement>('.aad-collapsible-body-inner') ?? stage.parentElement;
      if (parent) resizeObserver.observe(parent);
    }

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateStageWidth);
      window.visualViewport?.removeEventListener('resize', updateStageWidth);
      window.visualViewport?.removeEventListener('scroll', updateStageWidth);
      if (stageWidthRafRef.current !== null) {
        window.cancelAnimationFrame(stageWidthRafRef.current);
        stageWidthRafRef.current = null;
      }
    };
  }, [stageRef]);

  return stageAvailableWidth;
};
