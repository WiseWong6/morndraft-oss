import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  resolveHtmlPreviewFitDimensions,
  resolveStableHtmlPreviewSize,
  shouldCommitHtmlPreviewSize,
} from '../../utils/html-preview-size.js';
import type { HtmlPreviewSelectionChange } from '../../utils/htmlPreviewBridge';
import type { HtmlPreviewRenderMode } from './htmlPreviewDocument';
import {
  HTML_PREVIEW_HEIGHT_EPSILON,
  HTML_PREVIEW_LOAD_TIMEOUT_MS,
  HTML_PREVIEW_MAX_HEIGHT,
  HTML_PREVIEW_MIN_HEIGHT,
  HTML_PREVIEW_SETTLE_MS,
  HTML_PREVIEW_WIDTH_EPSILON,
} from './htmlPreviewReporter';
import {
  buildHtmlPreviewSizeCacheKey,
  cacheHtmlPreviewSize,
  cacheRecentHtmlPreviewHeightByFrameId,
  normalizeHtmlPreviewHeight,
  normalizeHtmlPreviewWidth,
  readCachedHtmlPreviewSize,
  readRecentHtmlPreviewHeightByFrameId,
  shouldIgnoreMobilePreviewMinHeightFallback,
  type HtmlPreviewCachedSize,
} from './htmlPreviewSizeCache';
import { normalizePreviewDeliveryWidth } from './previewLayoutContract';
import { useHtmlPreviewMeasurements } from './useHtmlPreviewMeasurements';
import {
  isHtmlPreviewStageCollapsed,
  useHtmlPreviewStageWidth,
} from './useHtmlPreviewStageWidth';

type PreviewTheme = 'dark' | 'light';
type HtmlPreviewSourceKind = 'document' | 'fragment';
type HtmlPreviewSettledSize = {
  height: number;
  width: number | null;
  heightKind: 'content' | 'viewport-feedback';
  widthKind: 'content' | 'viewport-feedback';
};

export const HTML_PREVIEW_RAW_DOCUMENT_FALLBACK_HEIGHT = 720;

const normalizeCachedHtmlPreviewSize = (
  size: HtmlPreviewCachedSize | null,
  requiresStableReady: boolean,
) => {
  if (
    requiresStableReady &&
    size &&
    size.height <= HTML_PREVIEW_MIN_HEIGHT + HTML_PREVIEW_HEIGHT_EPSILON
  ) {
    return null;
  }
  return size;
};

export const useHtmlPreviewFrameSizeState = ({
  code,
  deliveryWidth,
  effectiveIsEditing,
  frameId,
  initialHeight,
  isMobilePreview,
  liveIframeMountEnabled = true,
  lockInitialHeight = false,
  onBlockActivate,
  onSelectionChange,
  renderMode,
  requiresStableReady,
  sourceKind,
  theme,
  wrappedCode,
  stageRef: externalStageRef,
}: {
  code: string;
  deliveryWidth?: number;
  effectiveIsEditing: boolean;
  frameId: string;
  initialHeight?: number;
  isMobilePreview: boolean;
  liveIframeMountEnabled?: boolean;
  lockInitialHeight?: boolean;
  onBlockActivate?: () => void;
  onSelectionChange?: (selection: HtmlPreviewSelectionChange) => void;
  renderMode: HtmlPreviewRenderMode;
  requiresStableReady: boolean;
  sourceKind: HtmlPreviewSourceKind;
  theme: PreviewTheme;
  wrappedCode: string;
  stageRef?: RefObject<HTMLDivElement | null>;
}) => {
  const normalizedDeliveryWidth = normalizePreviewDeliveryWidth(deliveryWidth);
  const normalizedInitialSize = useMemo<HtmlPreviewCachedSize | null>(() => {
    if (!Number.isFinite(initialHeight)) return null;
    return {
      height: normalizeHtmlPreviewHeight(initialHeight),
      width: normalizedDeliveryWidth ?? null,
    };
  }, [initialHeight, normalizedDeliveryWidth]);
  const sizeCacheKey = useMemo(
    () => buildHtmlPreviewSizeCacheKey({
      code,
      isMobilePreview,
      normalizedDeliveryWidth,
      renderMode,
      theme,
    }),
    [code, isMobilePreview, normalizedDeliveryWidth, renderMode, theme],
  );
  const cachedInitialSize = normalizeCachedHtmlPreviewSize(
    readCachedHtmlPreviewSize(sizeCacheKey),
    requiresStableReady,
  );
  const recentFrameHeight = readRecentHtmlPreviewHeightByFrameId(frameId);
  const recentFrameInitialSize = recentFrameHeight != null
    ? { height: recentFrameHeight, width: normalizedDeliveryWidth ?? null }
    : null;
  const lockedInitialSize = lockInitialHeight ? normalizedInitialSize : null;
  const resolvedInitialSize = lockedInitialSize ?? cachedInitialSize ?? recentFrameInitialSize ?? normalizedInitialSize ?? {
    height: HTML_PREVIEW_MIN_HEIGHT,
    width: null,
  };
  const hasAuthoritativeInitialHeight = Boolean(lockedInitialSize || cachedInitialSize || recentFrameInitialSize);
  const liveIframeRef = useRef<HTMLIFrameElement>(null);
  const staticCaptureIframeRef = useRef<HTMLIFrameElement>(null);
  const internalStageRef = useRef<HTMLDivElement>(null);
  const stageRef = externalStageRef ?? internalStageRef;
  const settleTimerRef = useRef<number | null>(null);
  const loadFallbackTimerRef = useRef<number | null>(null);
  const pendingSizeRef = useRef<HtmlPreviewSettledSize | null>(null);
  const committedSizeRef = useRef<HtmlPreviewCachedSize>(resolvedInitialSize);
  const hasSettledHeightRef = useRef(hasAuthoritativeInitialHeight);
  const [previewHeight, setPreviewHeight] = useState(resolvedInitialSize.height);
  const [previewWidth, setPreviewWidth] = useState<number | null>(resolvedInitialSize.width);
  const [iframeLoaded, setIframeLoaded] = useState(Boolean(cachedInitialSize));
  const [hasSettledHeight, setHasSettledHeight] = useState(hasAuthoritativeInitialHeight);
  const [hasLoadFallback, setHasLoadFallback] = useState(false);
  const stageAvailableWidth = useHtmlPreviewStageWidth(stageRef);
  const effectivePreviewWidth = normalizedDeliveryWidth
    ? Math.max(previewWidth ?? 0, normalizedDeliveryWidth)
    : previewWidth;
  const fallbackReadyMs = requiresStableReady
    ? HTML_PREVIEW_LOAD_TIMEOUT_MS + HTML_PREVIEW_SETTLE_MS
    : HTML_PREVIEW_LOAD_TIMEOUT_MS;
  const isIframeReady = liveIframeMountEnabled && iframeLoaded && hasSettledHeight;

  const clearSettleTimer = useCallback(() => {
    if (settleTimerRef.current) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
  }, []);

  const clearLoadFallbackTimer = useCallback(() => {
    if (loadFallbackTimerRef.current) {
      window.clearTimeout(loadFallbackTimerRef.current);
      loadFallbackTimerRef.current = null;
    }
  }, []);

  const commitSize = useCallback((nextSize: HtmlPreviewSettledSize) => {
    const stableNextSize = resolveStableHtmlPreviewSize({
      currentHeight: committedSizeRef.current.height,
      currentWidth: committedSizeRef.current.width,
      heightEpsilon: HTML_PREVIEW_HEIGHT_EPSILON,
      heightKind: nextSize.heightKind,
      hasSettled: hasSettledHeightRef.current,
      nextHeight: nextSize.height,
      nextWidth: nextSize.width,
      widthKind: nextSize.widthKind,
      widthEpsilon: HTML_PREVIEW_WIDTH_EPSILON,
    });
    const shouldCommit = shouldCommitHtmlPreviewSize({
      currentHeight: committedSizeRef.current.height,
      currentWidth: committedSizeRef.current.width,
      hasSettled: hasSettledHeightRef.current,
      heightEpsilon: HTML_PREVIEW_HEIGHT_EPSILON,
      nextHeight: stableNextSize.height,
      nextWidth: stableNextSize.width,
      widthEpsilon: HTML_PREVIEW_WIDTH_EPSILON,
    });

    if (shouldCommit) {
      committedSizeRef.current = stableNextSize;
      cacheHtmlPreviewSize(sizeCacheKey, stableNextSize);
      cacheRecentHtmlPreviewHeightByFrameId(frameId, stableNextSize.height);
      setPreviewHeight(stableNextSize.height);
      setPreviewWidth(stableNextSize.width);
      setHasLoadFallback(false);
    }

    if (!hasSettledHeightRef.current) {
      hasSettledHeightRef.current = true;
      setIframeLoaded(true);
      setHasSettledHeight(true);
    }
  }, [frameId, sizeCacheKey]);

  const markLoadFallbackReady = useCallback(() => {
    clearSettleTimer();
    clearLoadFallbackTimer();
    pendingSizeRef.current = null;
    const fallbackSize = {
      height: requiresStableReady ? HTML_PREVIEW_RAW_DOCUMENT_FALLBACK_HEIGHT : HTML_PREVIEW_MIN_HEIGHT,
      width: committedSizeRef.current.width,
    };
    committedSizeRef.current = fallbackSize;
    setPreviewHeight(fallbackSize.height);
    setPreviewWidth(fallbackSize.width);
    setIframeLoaded(true);
    hasSettledHeightRef.current = true;
    setHasSettledHeight(true);
    setHasLoadFallback(true);
  }, [clearLoadFallbackTimer, clearSettleTimer, requiresStableReady]);

  const queueSettledSize = useCallback(
    (
      height: number,
      width?: number | null,
      commitImmediately = false,
      widthKind: 'content' | 'viewport-feedback' = 'content',
      heightKind: 'content' | 'viewport-feedback' = 'content',
    ) => {
      if (effectiveIsEditing) return;
      if (isHtmlPreviewStageCollapsed(stageRef.current)) return;
      if (lockedInitialSize) {
        pendingSizeRef.current = null;
        clearSettleTimer();
        setIframeLoaded(true);
        setHasLoadFallback(false);
        if (!hasSettledHeightRef.current) {
          hasSettledHeightRef.current = true;
          setHasSettledHeight(true);
        }
        return;
      }

      const nextSize = {
        height: normalizeHtmlPreviewHeight(height),
        heightKind,
        width: widthKind === 'viewport-feedback'
          ? committedSizeRef.current.width
          : normalizeHtmlPreviewWidth(width),
        widthKind,
      };
      if (shouldIgnoreMobilePreviewMinHeightFallback({
        committedHeight: committedSizeRef.current.height,
        hasSettledHeight: hasSettledHeightRef.current,
        isMobilePreview,
        nextHeight: nextSize.height,
        requiresStableReady,
      })) {
        markLoadFallbackReady();
        return;
      }
      setIframeLoaded(true);
      clearSettleTimer();

      if (commitImmediately) {
        pendingSizeRef.current = null;
        commitSize(nextSize);
        return;
      }

      // 所有非立即测量一律走 settle timer 的 debounce：SETTLE_MS 内只要有新测量就 clearSettleTimer
      // 重设，超时才提交 pendingSizeRef 的最后一次测量值。
      // 不用「连续两次相等就立即 commit」——iframe bridge 启动时 report('ready') 紧接 schedule('size')
      // 会报告同一首屏中间态高度（字体未加载），被误判为稳定提前提交，随后 fonts.ready 报真实值仍会跳变。
      // 「稳定」是「一段时间无新测量」，不是「两次相等」。
      pendingSizeRef.current = nextSize;
      settleTimerRef.current = window.setTimeout(() => {
        settleTimerRef.current = null;
        const settledSize = pendingSizeRef.current ?? {
          height: HTML_PREVIEW_MIN_HEIGHT,
          heightKind: 'content',
          width: null,
          widthKind: 'content',
        };
        pendingSizeRef.current = null;
        commitSize(settledSize);
      }, HTML_PREVIEW_SETTLE_MS);
    },
    [
      clearSettleTimer,
      commitSize,
      effectiveIsEditing,
      isMobilePreview,
      lockedInitialSize,
      markLoadFallbackReady,
      requiresStableReady,
      stageRef,
    ],
  );

  const { bindParentMeasurement, cleanupParentMeasurement } = useHtmlPreviewMeasurements({
    frameId,
    iframeRef: liveIframeRef,
    onBlockActivate,
    onSelectionChange,
    queueSettledSize,
  });

  useEffect(() => {
    clearSettleTimer();
    clearLoadFallbackTimer();
    pendingSizeRef.current = null;
    const cachedSize = normalizeCachedHtmlPreviewSize(
      readCachedHtmlPreviewSize(sizeCacheKey),
      requiresStableReady,
    );
    const recentHeight = readRecentHtmlPreviewHeightByFrameId(frameId);
    const recentSize = recentHeight != null ? { height: recentHeight, width: null } : null;
    const nextLockedInitialSize = lockInitialHeight ? normalizedInitialSize : null;
    const nextInitialSize = nextLockedInitialSize ?? cachedSize ?? recentSize ?? normalizedInitialSize ?? {
      height: HTML_PREVIEW_MIN_HEIGHT,
      width: null,
    };
    const nextHasAuthoritativeInitialHeight = Boolean(nextLockedInitialSize || cachedSize || recentSize);
    committedSizeRef.current = nextInitialSize;
    hasSettledHeightRef.current = nextHasAuthoritativeInitialHeight;
    setHasLoadFallback(false);
    setIframeLoaded(Boolean(cachedSize));
    setHasSettledHeight(nextHasAuthoritativeInitialHeight);
    setPreviewHeight(nextInitialSize.height);
    setPreviewWidth(nextInitialSize.width);
  }, [
    clearLoadFallbackTimer,
    clearSettleTimer,
    frameId,
    lockInitialHeight,
    normalizedInitialSize,
    requiresStableReady,
    sizeCacheKey,
    wrappedCode,
  ]);

  useEffect(
    () => () => {
      clearSettleTimer();
      clearLoadFallbackTimer();
      cleanupParentMeasurement();
    },
    [cleanupParentMeasurement, clearLoadFallbackTimer, clearSettleTimer],
  );

  useEffect(() => {
    if (!liveIframeMountEnabled) return undefined;
    const timeoutId = window.setTimeout(() => {
      if (!hasSettledHeightRef.current) markLoadFallbackReady();
    }, fallbackReadyMs);
    return () => window.clearTimeout(timeoutId);
  }, [fallbackReadyMs, liveIframeMountEnabled, markLoadFallbackReady, wrappedCode]);

  const handlePreviewIframeLoad = useCallback(() => {
    setIframeLoaded(true);
    clearLoadFallbackTimer();
    bindParentMeasurement(liveIframeRef.current ?? staticCaptureIframeRef.current);
    loadFallbackTimerRef.current = window.setTimeout(() => {
      loadFallbackTimerRef.current = null;
      if (!hasSettledHeightRef.current) {
        markLoadFallbackReady();
      }
    }, requiresStableReady ? fallbackReadyMs : HTML_PREVIEW_SETTLE_MS * 3);
  }, [bindParentMeasurement, clearLoadFallbackTimer, fallbackReadyMs, markLoadFallbackReady, requiresStableReady]);

  const fit = useMemo(() => resolveHtmlPreviewFitDimensions({
    contentWidth: effectivePreviewWidth,
    contentHeight: previewHeight,
    availableWidth: stageAvailableWidth,
    minHeight: HTML_PREVIEW_MIN_HEIGHT,
    maxHeight: HTML_PREVIEW_MAX_HEIGHT,
    widthMode: renderMode === 'embedded' && sourceKind === 'fragment' ? 'fill' : 'natural',
  }), [effectivePreviewWidth, previewHeight, renderMode, sourceKind, stageAvailableWidth]);

  return {
    fit,
    handlePreviewIframeLoad,
    hasLoadFallback,
    isIframeReady,
    liveIframeRef,
    normalizedDeliveryWidth,
    previewHeight,
    previewWidth,
    stageAvailableWidth,
    stageRef,
    staticCaptureIframeRef,
  };
};
