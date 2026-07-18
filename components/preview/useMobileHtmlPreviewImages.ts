import { useEffect, useRef, useState, type RefObject } from 'react';
import { loadCaptureLibraries } from './captureLibraries';
import { captureHtmlFrameScreenshot } from './htmlScreenshotCapture';
import type { HtmlPreviewRenderMode } from './htmlPreviewDocument';
import { HTML_PREVIEW_SETTLE_MS, HTML_PREVIEW_WIDTH_EPSILON } from './htmlPreviewReporter';
import { blobToDataUrl } from './mobileStandaloneImagePreview';

type PreviewTheme = 'dark' | 'light';

export type MobileHtmlPreviewFallbackMode = 'render-with-image-fallback' | 'static-image' | 'none';
export type MobileStaticImageFailure = 'recoverable-capture' | 'source-unavailable';

export type MobileStaticImageState = {
  failure?: MobileStaticImageFailure;
  height?: number;
  key: string;
  retryCount?: number;
  src: string | null;
  status: 'capturing' | 'failed' | 'ready' | 'timed-out';
  width?: number;
};

const MOBILE_STATIC_IMAGE_CACHE_LIMIT = 24;
const MOBILE_STATIC_IMAGE_CONCURRENCY = 2;
const MOBILE_STATIC_IMAGE_CROP_PADDING = 18;
const MOBILE_STATIC_IMAGE_FORMAT = 'image/webp';
const MOBILE_STATIC_IMAGE_FORMAT_QUALITY = 0.84;
const MOBILE_STATIC_IMAGE_MIN_CAPTURE_WIDTH = 320;
const MOBILE_STATIC_IMAGE_MAX_CAPTURE_WIDTH = 1400;
const MOBILE_STATIC_IMAGE_IFRAME_WARMUP_MS = 120;
const MOBILE_STATIC_IMAGE_UI_DEADLINE_MS = 3600;
const MOBILE_STATIC_IMAGE_INTERSECTION_MARGIN = '1200px 0px';
const MOBILE_STATIC_IMAGE_PRELOAD_DELAY_MS = 650;
const MOBILE_STATIC_IMAGE_RETRY_DELAY_MS = 420;
const MOBILE_STATIC_IMAGE_MAX_RECOVERABLE_RETRIES = 4;

type CachedMobileStaticImage = {
  height: number;
  src: string;
  width: number;
};

const mobileStaticImageCache = new Map<string, CachedMobileStaticImage>();
const mobileStaticImageInFlight = new Map<string, Promise<CachedMobileStaticImage>>();
const mobileStaticImageQueue: Array<() => void> = [];
let activeMobileStaticImageCaptures = 0;

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error ?? '');

const getMobileStaticImageFailure = (error: unknown): MobileStaticImageFailure => (
  /HTML preview source is not ready/i.test(getErrorMessage(error))
    ? 'source-unavailable'
    : 'recoverable-capture'
);

const hasExhaustedRecoverableMobileStaticImageRetries = (
  image: MobileStaticImageState | null | undefined,
) =>
  image?.status === 'failed' &&
  image.failure === 'recoverable-capture' &&
  (image.retryCount ?? 0) > MOBILE_STATIC_IMAGE_MAX_RECOVERABLE_RETRIES;

export const shouldShowMobileStaticImageError = (image: MobileStaticImageState | null | undefined) =>
  image?.status === 'failed' &&
  (
    image.failure === 'source-unavailable' ||
    hasExhaustedRecoverableMobileStaticImageRetries(image)
  );

export const shouldShowMobileStaticImageLoading = (image: MobileStaticImageState | null | undefined) =>
  !image ||
    image.status === 'capturing' ||
    image.status === 'timed-out' ||
    (image.status === 'failed' && !shouldShowMobileStaticImageError(image));

export const isMobileStaticImageVisibleForConsumer = (image: MobileStaticImageState | null | undefined) =>
  image?.status === 'ready' || shouldShowMobileStaticImageError(image);

const clampMobileStaticCaptureWidth = (...widths: Array<number | null | undefined>) => {
  const width = Math.max(
    MOBILE_STATIC_IMAGE_MIN_CAPTURE_WIDTH,
    ...widths.map((value) => (
      typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.ceil(value) : 0
    )),
  );
  return Math.min(MOBILE_STATIC_IMAGE_MAX_CAPTURE_WIDTH, width);
};

const measureIframeContentWidth = (iframe: HTMLIFrameElement) => {
  try {
    const doc = iframe.contentDocument;
    const body = doc?.body;
    const html = doc?.documentElement;
    if (!body || !html) return 0;

    const bodyRect = body.getBoundingClientRect();
    const htmlRect = html.getBoundingClientRect();
    let visualWidth = 0;
    Array.from(body.children).forEach((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 || rect.height > 0) {
        visualWidth = Math.max(visualWidth, Math.ceil(rect.right - Math.min(0, rect.left)));
      }
    });
    return Math.max(
      body.scrollWidth,
      html.scrollWidth,
      Math.ceil(bodyRect.width),
      Math.ceil(htmlRect.width),
      visualWidth,
    );
  } catch {
    return 0;
  }
};

const readCachedMobileStaticImage = (key: string) => {
  const cached = mobileStaticImageCache.get(key);
  if (!cached) return null;
  mobileStaticImageCache.delete(key);
  mobileStaticImageCache.set(key, cached);
  return cached;
};

const cacheMobileStaticImage = (key: string, image: CachedMobileStaticImage) => {
  mobileStaticImageCache.set(key, image);
  while (mobileStaticImageCache.size > MOBILE_STATIC_IMAGE_CACHE_LIMIT) {
    const oldestKey = mobileStaticImageCache.keys().next().value;
    if (!oldestKey) break;
    mobileStaticImageCache.delete(oldestKey);
  }
};

const enqueueMobileStaticImageCapture = <T,>(task: () => Promise<T>) =>
  new Promise<T>((resolve, reject) => {
    const run = () => {
      activeMobileStaticImageCaptures += 1;
      void task()
        .then(resolve, reject)
        .finally(() => {
          activeMobileStaticImageCaptures = Math.max(0, activeMobileStaticImageCaptures - 1);
          const nextTask = mobileStaticImageQueue.shift();
          if (nextTask) window.setTimeout(nextTask, 0);
        });
    };

    if (activeMobileStaticImageCaptures < MOBILE_STATIC_IMAGE_CONCURRENCY) {
      run();
      return;
    }

    mobileStaticImageQueue.push(run);
  });

const getOrCreateMobileStaticImageCapture = (
  key: string,
  capture: () => Promise<CachedMobileStaticImage>,
) => {
  const cached = readCachedMobileStaticImage(key);
  if (cached) return Promise.resolve(cached);

  const inFlight = mobileStaticImageInFlight.get(key);
  if (inFlight) return inFlight;

  const promise = enqueueMobileStaticImageCapture(capture)
    .then((image) => {
      cacheMobileStaticImage(key, image);
      return image;
    })
    .finally(() => {
      mobileStaticImageInFlight.delete(key);
    });
  mobileStaticImageInFlight.set(key, promise);
  return promise;
};

export const useMobileHtmlPreviewImages = ({
  cacheKeySource,
  isIframeReady,
  isMobilePreview,
  liveIframeRef,
  mobileFallbackMode,
  previewHeight,
  previewWidth,
  renderMode,
  shouldUseMobileStaticImage,
  stageRef,
  stageAvailableWidth,
  staticCaptureIframeRef,
  theme,
}: {
  cacheKeySource: string;
  isIframeReady: boolean;
  isMobilePreview: boolean;
  liveIframeRef: RefObject<HTMLIFrameElement | null>;
  mobileFallbackMode: MobileHtmlPreviewFallbackMode;
  previewHeight: number;
  previewWidth: number | null;
  renderMode: HtmlPreviewRenderMode;
  shouldUseMobileStaticImage: boolean;
  stageRef: RefObject<HTMLDivElement | null>;
  stageAvailableWidth: number;
  staticCaptureIframeRef: RefObject<HTMLIFrameElement | null>;
  theme: PreviewTheme;
}) => {
  const [mobileFallbackImageSrc, setMobileFallbackImageSrc] = useState<string | null>(null);
  const [mobileStaticImage, setMobileStaticImage] = useState<MobileStaticImageState | null>(null);
  const [shouldActivateStaticCapture, setShouldActivateStaticCapture] = useState(false);
  const [staticImageRetryNonce, setStaticImageRetryNonce] = useState(0);
  const mobileFallbackKeyRef = useRef('');
  const mobileStaticImageKeyRef = useRef('');
  const mobileStaticImageInFlightKeyRef = useRef('');
  const mobileStaticImageRetryTimerRef = useRef<number | null>(null);
  const mobileStaticImageRecoverableRetryCountRef = useRef(0);
  const previewWidthRef = useRef<number | null>(previewWidth);
  const isIframeReadyRef = useRef(isIframeReady);
  const shouldUseMobileImageFallback =
    isMobilePreview &&
    mobileFallbackMode === 'render-with-image-fallback' &&
    !shouldUseMobileStaticImage &&
    isIframeReady &&
    stageAvailableWidth > 0 &&
    typeof previewWidth === 'number' &&
    previewWidth > stageAvailableWidth + HTML_PREVIEW_WIDTH_EPSILON;

  useEffect(() => {
    previewWidthRef.current = previewWidth;
  }, [previewWidth]);

  useEffect(() => {
    isIframeReadyRef.current = isIframeReady;
  }, [isIframeReady]);

  useEffect(() => () => {
    if (mobileStaticImageRetryTimerRef.current !== null) {
      window.clearTimeout(mobileStaticImageRetryTimerRef.current);
      mobileStaticImageRetryTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (mobileStaticImageRetryTimerRef.current !== null) {
      window.clearTimeout(mobileStaticImageRetryTimerRef.current);
      mobileStaticImageRetryTimerRef.current = null;
    }
    setMobileFallbackImageSrc(null);
    setMobileStaticImage(null);
    setShouldActivateStaticCapture(false);
    mobileFallbackKeyRef.current = '';
    mobileStaticImageKeyRef.current = '';
    mobileStaticImageInFlightKeyRef.current = '';
    mobileStaticImageRecoverableRetryCountRef.current = 0;
  }, [cacheKeySource, renderMode, theme]);

  useEffect(() => {
    if (!shouldUseMobileStaticImage) {
      setShouldActivateStaticCapture(false);
      return undefined;
    }

    const stage = stageRef.current;
    if (!stage || typeof IntersectionObserver === 'undefined') {
      setShouldActivateStaticCapture(true);
      return undefined;
    }

    let activated = false;
    let observer: IntersectionObserver | null = null;
    let preloadTimerId: number | null = null;
    const activate = () => {
      if (activated) return;
      activated = true;
      setShouldActivateStaticCapture(true);
      if (preloadTimerId !== null) {
        window.clearTimeout(preloadTimerId);
        preloadTimerId = null;
      }
      observer?.disconnect();
    };
    const scrollRoot = stage.closest<HTMLElement>('.aad-mobile-showcase-preview, .aad-preview-scroll');
    observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting || entry.intersectionRatio > 0)) {
        activate();
      }
    }, { root: scrollRoot, rootMargin: MOBILE_STATIC_IMAGE_INTERSECTION_MARGIN });

    observer.observe(stage);
    preloadTimerId = window.setTimeout(activate, MOBILE_STATIC_IMAGE_PRELOAD_DELAY_MS);
    return () => {
      if (preloadTimerId !== null) window.clearTimeout(preloadTimerId);
      observer?.disconnect();
    };
  }, [cacheKeySource, shouldUseMobileStaticImage, stageRef]);

  useEffect(() => {
    if (!shouldUseMobileImageFallback) {
      setMobileFallbackImageSrc(null);
      mobileFallbackKeyRef.current = '';
      return undefined;
    }

    const iframe = liveIframeRef.current;
    if (!iframe) return undefined;
    const fallbackKey = `${cacheKeySource}:${theme}:${previewWidth}:${previewHeight}:${stageAvailableWidth}`;
    if (mobileFallbackKeyRef.current === fallbackKey) return undefined;

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      void (async () => {
        try {
          const capture = await captureHtmlFrameScreenshot(iframe, {
            crop: false,
            minViewportWidth: Math.max(1, Math.ceil(stageAvailableWidth), Math.ceil(previewWidth ?? 0)),
          });
          if (cancelled) return;
          mobileFallbackKeyRef.current = fallbackKey;
          setMobileFallbackImageSrc(await blobToDataUrl(capture.blob));
        } catch (error) {
          if (!cancelled) {
            mobileFallbackKeyRef.current = fallbackKey;
            console.warn('Mobile HTML image fallback was not available:', error);
          }
        }
      })();
    }, HTML_PREVIEW_SETTLE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [cacheKeySource, liveIframeRef, previewHeight, previewWidth, shouldUseMobileImageFallback, stageAvailableWidth, theme]);

  useEffect(() => {
    if (!shouldUseMobileStaticImage) return undefined;
    if (!shouldActivateStaticCapture || stageAvailableWidth <= 0) return undefined;

    const stageCaptureWidth = clampMobileStaticCaptureWidth(stageAvailableWidth);
    const staticImageKey = `${cacheKeySource}:${theme}:${renderMode}:${stageCaptureWidth}`;
    const cachedImage = readCachedMobileStaticImage(staticImageKey);
    if (cachedImage) {
      mobileStaticImageKeyRef.current = staticImageKey;
      mobileStaticImageInFlightKeyRef.current = '';
      mobileStaticImageRecoverableRetryCountRef.current = 0;
      setMobileStaticImage({
        height: cachedImage.height,
        key: staticImageKey,
        src: cachedImage.src,
        status: 'ready',
        width: cachedImage.width,
      });
      return undefined;
    }

    if (
      mobileStaticImageKeyRef.current === staticImageKey ||
      mobileStaticImageInFlightKeyRef.current === staticImageKey
    ) {
      return undefined;
    }

    let cancelled = false;
    mobileStaticImageInFlightKeyRef.current = staticImageKey;
    setMobileStaticImage((current) => (
      current?.key === staticImageKey && current.status === 'ready'
        ? current
        : {
          key: staticImageKey,
          retryCount: mobileStaticImageRecoverableRetryCountRef.current,
          src: null,
          status: 'capturing',
        }
    ));

    const uiDeadlineId = window.setTimeout(() => {
      if (cancelled) return;
      setMobileStaticImage((current) => (
        current?.key === staticImageKey && current.status === 'capturing'
          ? {
            failure: 'recoverable-capture',
            key: staticImageKey,
            retryCount: mobileStaticImageRecoverableRetryCountRef.current,
            src: null,
            status: 'timed-out',
          }
          : current
      ));
    }, MOBILE_STATIC_IMAGE_UI_DEADLINE_MS);

    const startDelayMs = isIframeReadyRef.current
      ? HTML_PREVIEW_SETTLE_MS
      : MOBILE_STATIC_IMAGE_IFRAME_WARMUP_MS;

    const timeoutId = window.setTimeout(() => {
      void getOrCreateMobileStaticImageCapture(staticImageKey, async () => {
        const iframe = staticCaptureIframeRef.current;
        if (!iframe?.isConnected) throw new Error('Mobile HTML static capture frame was detached.');
        const captureWidth = clampMobileStaticCaptureWidth(
          stageCaptureWidth,
          previewWidthRef.current,
          measureIframeContentWidth(iframe),
        );
        const capture = await captureHtmlFrameScreenshot(iframe, {
          captureTarget: 'content-root',
          crop: true,
          cropPadding: MOBILE_STATIC_IMAGE_CROP_PADDING,
          imageMimeType: MOBILE_STATIC_IMAGE_FORMAT,
          imageQuality: MOBILE_STATIC_IMAGE_FORMAT_QUALITY,
          minViewportWidth: captureWidth,
          preserveMinViewportWidth: false,
        });
        return {
          height: capture.height,
          src: await blobToDataUrl(capture.blob),
          width: capture.width,
        };
      })
        .then((image) => {
          if (cancelled || mobileStaticImageInFlightKeyRef.current !== staticImageKey) return;
          mobileStaticImageKeyRef.current = staticImageKey;
          mobileStaticImageRecoverableRetryCountRef.current = 0;
          setMobileStaticImage({
            height: image.height,
            key: staticImageKey,
            src: image.src,
            status: 'ready',
            width: image.width,
          });
        })
        .catch((error) => {
          if (!cancelled) {
            const failure = getMobileStaticImageFailure(error);
            const retryCount = mobileStaticImageRecoverableRetryCountRef.current + 1;
            if (failure === 'source-unavailable') {
              mobileStaticImageKeyRef.current = staticImageKey;
            } else {
              mobileStaticImageRecoverableRetryCountRef.current = retryCount;
              if (retryCount <= MOBILE_STATIC_IMAGE_MAX_RECOVERABLE_RETRIES) {
                if (mobileStaticImageRetryTimerRef.current !== null) {
                  window.clearTimeout(mobileStaticImageRetryTimerRef.current);
                }
                mobileStaticImageRetryTimerRef.current = window.setTimeout(() => {
                  mobileStaticImageRetryTimerRef.current = null;
                  setStaticImageRetryNonce((value) => value + 1);
                }, MOBILE_STATIC_IMAGE_RETRY_DELAY_MS);
              }
            }
            setMobileStaticImage((current) => (
              current?.key === staticImageKey && current.status === 'ready'
                ? current
                : {
                  failure,
                  key: staticImageKey,
                  retryCount,
                  src: null,
                  status: 'failed',
                }
            ));
            console.warn('Mobile HTML static image capture was not available:', error);
          }
        })
        .finally(() => {
          window.clearTimeout(uiDeadlineId);
          if (mobileStaticImageInFlightKeyRef.current === staticImageKey) {
            mobileStaticImageInFlightKeyRef.current = '';
          }
        });
    }, startDelayMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      window.clearTimeout(uiDeadlineId);
    };
  }, [cacheKeySource, renderMode, shouldActivateStaticCapture, shouldUseMobileStaticImage, stageAvailableWidth, staticCaptureIframeRef, staticImageRetryNonce, theme]);

  useEffect(() => {
    if (!shouldUseMobileStaticImage) return;
    void loadCaptureLibraries().catch((error) => {
      console.warn('Mobile HTML static image capture library preload failed:', error);
    });
  }, [shouldUseMobileStaticImage]);

  return {
    mobileFallbackImageSrc,
    mobileStaticImage,
    shouldMountStaticCaptureFrame:
      shouldUseMobileStaticImage &&
      mobileStaticImage?.status !== 'ready' &&
      !shouldShowMobileStaticImageError(mobileStaticImage) &&
      shouldActivateStaticCapture,
  };
};
