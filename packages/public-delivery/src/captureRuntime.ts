import { PublicDeliveryError } from './types';

export type DeliveryHtml2Canvas = typeof import('html2canvas')['default'];

export type DeliveryModernScreenshot = Pick<
  typeof import('modern-screenshot'),
  'createContext' | 'destroyContext' | 'domToCanvas'
>;

export type DeliveryCaptureLibraries = DeliveryModernScreenshot & {
  html2canvas: DeliveryHtml2Canvas;
};

type DeliveryCaptureLibraryImporters = Readonly<{
  importHtml2Canvas: () => Promise<typeof import('html2canvas')>;
  importModernScreenshot: () => Promise<typeof import('modern-screenshot')>;
}>;

export type DeliveryLibraryLoadOptions = Readonly<{
  signal?: AbortSignal;
  timeoutMs?: number;
  timeoutMessage?: string;
}>;

export const PUBLIC_DELIVERY_LIBRARY_LOAD_TIMEOUT_MS = 20_000;

export const withDeliveryLibraryLoadGuard = async <T>(
  promise: Promise<T>,
  options: DeliveryLibraryLoadOptions = {},
  onInterrupt?: () => void,
) => {
  const timeoutMs = options.timeoutMs ?? PUBLIC_DELIVERY_LIBRARY_LOAD_TIMEOUT_MS;
  const timeoutMessage = options.timeoutMessage ?? '本地交付引擎加载超时，请检查网络后重试。';
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let abortListener: (() => void) | undefined;
  let interrupted = false;
  const interrupt = (error: PublicDeliveryError) => {
    if (!interrupted) {
      interrupted = true;
      try {
        onInterrupt?.();
      } catch {
        // Cache cleanup must never replace the timeout/cancellation result.
      }
    }
    return error;
  };
  if (options.signal?.aborted) {
    throw interrupt(new PublicDeliveryError(
      'capture-failed',
      '文档已变化，已取消旧的交付任务。',
      { cause: options.signal.reason },
    ));
  }
  const races: Array<Promise<T>> = [promise];

  if (timeoutMs > 0) {
    races.push(new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(interrupt(new PublicDeliveryError(
        'capture-failed',
        timeoutMessage,
      ))), timeoutMs);
    }));
  }

  if (options.signal) {
    races.push(new Promise<never>((_, reject) => {
      abortListener = () => reject(interrupt(new PublicDeliveryError(
        'capture-failed',
        '文档已变化，已取消旧的交付任务。',
        { cause: options.signal?.reason },
      )));
      options.signal?.addEventListener('abort', abortListener, { once: true });
    }));
  }

  try {
    return await Promise.race(races);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    if (abortListener) options.signal?.removeEventListener('abort', abortListener);
  }
};

const defaultImporters: DeliveryCaptureLibraryImporters = {
  importHtml2Canvas: () => import('html2canvas'),
  importModernScreenshot: () => import('modern-screenshot'),
};

/**
 * Creates a retryable loader for the framework-agnostic browser capture engines.
 * Product-specific capture policy and engine options remain with each caller.
 */
export const createDeliveryCaptureLibraryLoader = (
  importers: DeliveryCaptureLibraryImporters = defaultImporters,
) => {
  let html2CanvasPromise: Promise<DeliveryHtml2Canvas> | null = null;
  let modernScreenshotPromise: Promise<DeliveryModernScreenshot> | null = null;
  let captureLibrariesPromise: Promise<DeliveryCaptureLibraries> | null = null;
  let captureLibraryDependencies: Readonly<{
    html2canvas: Promise<DeliveryHtml2Canvas>;
    modernScreenshot: Promise<DeliveryModernScreenshot>;
  }> | null = null;

  const clearCaptureLibrariesUsing = (
    kind: 'html2canvas' | 'modernScreenshot',
    pending: Promise<DeliveryHtml2Canvas> | Promise<DeliveryModernScreenshot>,
  ) => {
    if (captureLibraryDependencies?.[kind] !== pending) return;
    captureLibrariesPromise = null;
    captureLibraryDependencies = null;
  };

  const ensureHtml2Canvas = () => {
    if (!html2CanvasPromise) {
      const pending = Promise.resolve()
        .then(() => importers.importHtml2Canvas())
        .then(module => module.default);
      html2CanvasPromise = pending;
      void pending.catch(() => {
        if (html2CanvasPromise === pending) html2CanvasPromise = null;
        clearCaptureLibrariesUsing('html2canvas', pending);
      });
    }
    return html2CanvasPromise;
  };

  const ensureModernScreenshot = () => {
    if (!modernScreenshotPromise) {
      const pending = Promise.resolve()
        .then(() => importers.importModernScreenshot())
        .then(({ createContext, destroyContext, domToCanvas }) => ({
          createContext,
          destroyContext,
          domToCanvas,
        }));
      modernScreenshotPromise = pending;
      void pending.catch(() => {
        if (modernScreenshotPromise === pending) modernScreenshotPromise = null;
        clearCaptureLibrariesUsing('modernScreenshot', pending);
      });
    }
    return modernScreenshotPromise;
  };

  const loadHtml2Canvas = (options: DeliveryLibraryLoadOptions = {}) => {
    const pending = ensureHtml2Canvas();
    return withDeliveryLibraryLoadGuard(pending, options, () => {
      if (html2CanvasPromise === pending) html2CanvasPromise = null;
      clearCaptureLibrariesUsing('html2canvas', pending);
    });
  };

  const loadModernScreenshot = (options: DeliveryLibraryLoadOptions = {}) => {
    const pending = ensureModernScreenshot();
    return withDeliveryLibraryLoadGuard(pending, options, () => {
      if (modernScreenshotPromise === pending) modernScreenshotPromise = null;
      clearCaptureLibrariesUsing('modernScreenshot', pending);
    });
  };

  const loadCaptureLibraries = (options: DeliveryLibraryLoadOptions = {}) => {
    if (!captureLibrariesPromise) {
      const dependencies = {
        html2canvas: ensureHtml2Canvas(),
        modernScreenshot: ensureModernScreenshot(),
      };
      const pending = Promise.all([
        dependencies.html2canvas,
        dependencies.modernScreenshot,
      ]).then(([html2canvas, modernScreenshot]) => ({
          ...modernScreenshot,
          html2canvas,
        }));
      captureLibrariesPromise = pending;
      captureLibraryDependencies = dependencies;
      void pending.catch(() => {
        if (captureLibrariesPromise !== pending) return;
        captureLibrariesPromise = null;
        if (captureLibraryDependencies === dependencies) captureLibraryDependencies = null;
      });
    }
    const pending = captureLibrariesPromise;
    const dependencies = captureLibraryDependencies;
    return withDeliveryLibraryLoadGuard(pending, options, () => {
      if (captureLibrariesPromise === pending) {
        captureLibrariesPromise = null;
        if (captureLibraryDependencies === dependencies) captureLibraryDependencies = null;
      }
      if (dependencies && html2CanvasPromise === dependencies.html2canvas) html2CanvasPromise = null;
      if (dependencies && modernScreenshotPromise === dependencies.modernScreenshot) modernScreenshotPromise = null;
    });
  };

  return Object.freeze({
    loadCaptureLibraries,
    loadHtml2Canvas,
    loadModernScreenshot,
  });
};

const sharedCaptureLibraryLoader = createDeliveryCaptureLibraryLoader();

export const loadDeliveryCaptureLibraries = sharedCaptureLibraryLoader.loadCaptureLibraries;
export const loadDeliveryHtml2Canvas = sharedCaptureLibraryLoader.loadHtml2Canvas;
export const loadDeliveryModernScreenshot = sharedCaptureLibraryLoader.loadModernScreenshot;
