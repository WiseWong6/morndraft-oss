import { useCallback, useLayoutEffect, useRef } from 'react';
import {
  clearPreviewA4PaginationLayout,
  layoutPreviewA4Pagination,
} from './previewA4PaginationLayout';

export const usePreviewA4Pagination = ({
  enabled,
  surface,
  resetKey,
}: {
  enabled: boolean;
  surface: HTMLElement | null;
  resetKey: string;
}) => {
  const frameRef = useRef<number | null>(null);
  const isApplyingRef = useRef(false);
  const pendingLayoutRef = useRef(false);
  const releaseTimerRef = useRef<number | null>(null);
  const enabledRef = useRef(enabled);
  const runLayoutNowRef = useRef<(target?: HTMLElement | null) => void>(() => undefined);
  const surfaceRef = useRef<HTMLElement | null>(surface);
  enabledRef.current = enabled;
  surfaceRef.current = surface;

  const cancelScheduledLayout = useCallback(() => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    pendingLayoutRef.current = false;
    if (releaseTimerRef.current !== null) {
      window.clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = null;
    }
  }, []);

  const queueFrameLayout = useCallback((target: HTMLElement | null = surfaceRef.current) => {
    if (!enabledRef.current || !target || !target.isConnected) return;
    if (frameRef.current !== null) return;

    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      runLayoutNowRef.current(target);
    });
  }, []);

  const releaseApplyingSoon = useCallback(() => {
    if (releaseTimerRef.current !== null) {
      window.clearTimeout(releaseTimerRef.current);
    }
    releaseTimerRef.current = window.setTimeout(() => {
      isApplyingRef.current = false;
      releaseTimerRef.current = null;
      if (pendingLayoutRef.current) {
        pendingLayoutRef.current = false;
        queueFrameLayout(surfaceRef.current);
      }
    }, 80);
  }, [queueFrameLayout]);

  const runLayoutNow = useCallback((target: HTMLElement | null = surface) => {
    if (!enabled || !target || !target.isConnected) return;
    if (isApplyingRef.current && releaseTimerRef.current === null) return;

    cancelScheduledLayout();
    isApplyingRef.current = true;
    try {
      layoutPreviewA4Pagination(target);
    } finally {
      releaseApplyingSoon();
    }
  }, [cancelScheduledLayout, enabled, releaseApplyingSoon, surface]);
  runLayoutNowRef.current = runLayoutNow;

  const scheduleLayout = useCallback(() => {
    if (!enabled || !surface || !surface.isConnected) return;
    if (isApplyingRef.current) {
      pendingLayoutRef.current = true;
      return;
    }
    queueFrameLayout(surface);
  }, [enabled, queueFrameLayout, surface]);

  useLayoutEffect(() => {
    if (!surface) return undefined;

    if (!enabled) {
      cancelScheduledLayout();
      isApplyingRef.current = false;
      clearPreviewA4PaginationLayout(surface, { reason: 'disabled' });
      return undefined;
    }

    runLayoutNow(surface);

    const resizeObserver = new ResizeObserver(() => {
      scheduleLayout();
    });
    resizeObserver.observe(surface);
    Array.from(surface.children).forEach((child) => {
      if (child instanceof HTMLElement) {
        resizeObserver.observe(child);
      }
    });

    const mutationObserver = new MutationObserver(() => {
      if (isApplyingRef.current) return;
      scheduleLayout();
    });
    mutationObserver.observe(surface, { childList: true, characterData: true, subtree: true });

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      cancelScheduledLayout();
      isApplyingRef.current = false;
      pendingLayoutRef.current = false;
    };
  }, [cancelScheduledLayout, enabled, runLayoutNow, scheduleLayout, surface]);

  useLayoutEffect(() => {
    if (!enabled || !surface) return;
    runLayoutNow(surface);
  }, [enabled, resetKey, runLayoutNow, surface]);
};
