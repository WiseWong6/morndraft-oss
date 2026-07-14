import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PUBLIC_DELIVERY_LIBRARY_LOAD_TIMEOUT_MS,
  createDeliveryCaptureLibraryLoader,
  type DeliveryHtml2Canvas,
  type DeliveryModernScreenshot,
} from './captureRuntime';
import { PublicDeliveryError } from './types';

const fakeHtml2Canvas = (() => undefined) as unknown as DeliveryHtml2Canvas;
const fakeModernScreenshot = {
  createContext: (() => undefined),
  destroyContext: (() => undefined),
  domToCanvas: (() => undefined),
} as unknown as DeliveryModernScreenshot;

const asHtml2CanvasModule = (html2canvas: DeliveryHtml2Canvas) => ({
  default: html2canvas,
}) as unknown as typeof import('html2canvas');

const asModernScreenshotModule = (modernScreenshot: DeliveryModernScreenshot) => ({
  ...modernScreenshot,
}) as unknown as typeof import('modern-screenshot');

test('capture runtime shares concurrent engine imports and the combined library result', async () => {
  let html2CanvasImports = 0;
  let modernScreenshotImports = 0;
  const loader = createDeliveryCaptureLibraryLoader({
    importHtml2Canvas: async () => {
      html2CanvasImports += 1;
      return asHtml2CanvasModule(fakeHtml2Canvas);
    },
    importModernScreenshot: async () => {
      modernScreenshotImports += 1;
      return asModernScreenshotModule(fakeModernScreenshot);
    },
  });

  const [html2canvas, modernScreenshot, libraries, repeatedLibraries] = await Promise.all([
    loader.loadHtml2Canvas(),
    loader.loadModernScreenshot(),
    loader.loadCaptureLibraries(),
    loader.loadCaptureLibraries(),
  ]);

  assert.equal(html2CanvasImports, 1);
  assert.equal(modernScreenshotImports, 1);
  assert.equal(html2canvas, fakeHtml2Canvas);
  assert.equal(modernScreenshot.domToCanvas, fakeModernScreenshot.domToCanvas);
  assert.equal(libraries.html2canvas, fakeHtml2Canvas);
  assert.equal(libraries.domToCanvas, fakeModernScreenshot.domToCanvas);
  assert.equal(libraries, repeatedLibraries);
});

test('capture runtime clears a failed html2canvas import so the next request retries', async () => {
  const expectedError = new Error('html2canvas import failed');
  let html2CanvasImports = 0;
  let modernScreenshotImports = 0;
  const loader = createDeliveryCaptureLibraryLoader({
    importHtml2Canvas: async () => {
      html2CanvasImports += 1;
      if (html2CanvasImports === 1) throw expectedError;
      return asHtml2CanvasModule(fakeHtml2Canvas);
    },
    importModernScreenshot: async () => {
      modernScreenshotImports += 1;
      return asModernScreenshotModule(fakeModernScreenshot);
    },
  });

  await assert.rejects(loader.loadCaptureLibraries(), expectedError);
  const libraries = await loader.loadCaptureLibraries();

  assert.equal(html2CanvasImports, 2);
  assert.equal(modernScreenshotImports, 1);
  assert.equal(libraries.html2canvas, fakeHtml2Canvas);
});

test('capture runtime clears a failed modern-screenshot import so the next request retries', async () => {
  const expectedError = new Error('modern-screenshot import failed');
  let html2CanvasImports = 0;
  let modernScreenshotImports = 0;
  const loader = createDeliveryCaptureLibraryLoader({
    importHtml2Canvas: async () => {
      html2CanvasImports += 1;
      return asHtml2CanvasModule(fakeHtml2Canvas);
    },
    importModernScreenshot: async () => {
      modernScreenshotImports += 1;
      if (modernScreenshotImports === 1) throw expectedError;
      return asModernScreenshotModule(fakeModernScreenshot);
    },
  });

  await assert.rejects(loader.loadCaptureLibraries(), expectedError);
  const libraries = await loader.loadCaptureLibraries();

  assert.equal(html2CanvasImports, 1);
  assert.equal(modernScreenshotImports, 2);
  assert.equal(libraries.domToCanvas, fakeModernScreenshot.domToCanvas);
});

test('capture runtime times out a hanging engine import, clears its cache, and retries', async () => {
  let html2CanvasImports = 0;
  const loader = createDeliveryCaptureLibraryLoader({
    importHtml2Canvas: async () => {
      html2CanvasImports += 1;
      if (html2CanvasImports === 1) return new Promise<never>(() => undefined);
      return asHtml2CanvasModule(fakeHtml2Canvas);
    },
    importModernScreenshot: async () => asModernScreenshotModule(fakeModernScreenshot),
  });

  await assert.rejects(
    loader.loadHtml2Canvas({ timeoutMs: 1 }),
    (error: unknown) => error instanceof PublicDeliveryError && error.code === 'capture-failed',
  );
  const html2canvas = await loader.loadHtml2Canvas({ timeoutMs: 100 });

  assert.equal(PUBLIC_DELIVERY_LIBRARY_LOAD_TIMEOUT_MS, 20_000);
  assert.equal(html2CanvasImports, 2);
  assert.equal(html2canvas, fakeHtml2Canvas);
});

test('capture runtime aborts a hanging combined import and leaves the loader retryable', async () => {
  let modernScreenshotImports = 0;
  const loader = createDeliveryCaptureLibraryLoader({
    importHtml2Canvas: async () => asHtml2CanvasModule(fakeHtml2Canvas),
    importModernScreenshot: async () => {
      modernScreenshotImports += 1;
      if (modernScreenshotImports === 1) return new Promise<never>(() => undefined);
      return asModernScreenshotModule(fakeModernScreenshot);
    },
  });
  const controller = new AbortController();
  const pending = loader.loadCaptureLibraries({ signal: controller.signal, timeoutMs: 100 });
  controller.abort(new Error('document changed'));

  await assert.rejects(
    pending,
    (error: unknown) => error instanceof PublicDeliveryError && error.code === 'capture-failed',
  );
  const libraries = await loader.loadCaptureLibraries({ timeoutMs: 100 });

  assert.equal(modernScreenshotImports, 2);
  assert.equal(libraries.domToCanvas, fakeModernScreenshot.domToCanvas);
});

test('capture runtime rejects an already-aborted signal even when the engines are cached', async () => {
  const loader = createDeliveryCaptureLibraryLoader({
    importHtml2Canvas: async () => asHtml2CanvasModule(fakeHtml2Canvas),
    importModernScreenshot: async () => asModernScreenshotModule(fakeModernScreenshot),
  });
  await loader.loadCaptureLibraries();
  const controller = new AbortController();
  controller.abort(new Error('stale document'));

  await assert.rejects(
    loader.loadCaptureLibraries({ signal: controller.signal }),
    (error: unknown) => error instanceof PublicDeliveryError && error.code === 'capture-failed',
  );
});

test('a timed-out import rejection cannot evict the next successful engine generation', async () => {
  let html2CanvasImports = 0;
  let rejectFirstImport: ((error: Error) => void) | undefined;
  const loader = createDeliveryCaptureLibraryLoader({
    importHtml2Canvas: async () => {
      html2CanvasImports += 1;
      if (html2CanvasImports === 1) {
        return new Promise<never>((_, reject) => { rejectFirstImport = reject; });
      }
      return asHtml2CanvasModule(fakeHtml2Canvas);
    },
    importModernScreenshot: async () => asModernScreenshotModule(fakeModernScreenshot),
  });

  await assert.rejects(loader.loadHtml2Canvas({ timeoutMs: 1 }), PublicDeliveryError);
  assert.equal(await loader.loadHtml2Canvas({ timeoutMs: 100 }), fakeHtml2Canvas);
  rejectFirstImport?.(new Error('late import failure'));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(await loader.loadHtml2Canvas({ timeoutMs: 100 }), fakeHtml2Canvas);
  assert.equal(html2CanvasImports, 2);
});
