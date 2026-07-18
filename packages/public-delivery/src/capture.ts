import {
  PublicDeliveryError,
  type PublicDeliveryInput,
  type PublicPngCapture,
} from './types';
import { extractPublicRawHtmlSource } from './rawHtml';
import {
  PUBLIC_CAPTURE_FAILED_RESOURCE_PLACEHOLDER,
  applyPublicCaptureResourceSnapshot,
  assertPublicCaptureResourcesEmbedded,
  createPublicCaptureResourceSnapshot,
  preparePublicRawHtmlCaptureResources,
  type PublicCaptureResourceSnapshot,
} from './captureResources';
import {
  loadDeliveryHtml2Canvas,
  loadDeliveryModernScreenshot,
} from './captureRuntime';
import {
  getPublicThemePaperColor,
  serializePublicThemeVariables,
} from './theme';
import { hasPublicDynamicCaptureMarkup } from './dynamicMarkup';
import { decodePortableCssEscapes } from './portableCss';

export const PUBLIC_CAPTURE_SCALE = 2 as const;
export const PUBLIC_CAPTURE_MAX_CANVAS_DIMENSION = 16_384;
export const PUBLIC_CAPTURE_MAX_CANVAS_PIXELS = 16_000_000;

const PUBLIC_CAPTURE_ASSET_TIMEOUT_MS = 10_000;
const PUBLIC_CAPTURE_RENDER_TIMEOUT_MS = 20_000;
export const PUBLIC_CANVAS_PNG_ENCODE_TIMEOUT_MS = 20_000;

export {
  PUBLIC_DYNAMIC_CAPTURE_HTML_MAX_BYTES,
  hasPublicDynamicCaptureMarkup,
} from './dynamicMarkup';

const assertStaticCaptureMarkup = async (html: string) => {
  if (await hasPublicDynamicCaptureMarkup(html)) {
    throw new PublicDeliveryError(
      'capture-failed',
      '当前 HTML 包含脚本或动态媒体，浏览器无法安全生成与 Final 一致的图片；请下载 HTML 交付。',
    );
  }
};

export const withPublicDeliveryTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
  onLateResolve?: (value: T) => void,
) => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let didTimeout = false;
  const observed = promise.then(value => {
    if (didTimeout) {
      try {
        onLateResolve?.(value);
      } catch {
        // Late cleanup is best-effort and must not surface as an unhandled rejection.
      }
    }
    return value;
  });
  void observed.catch(() => undefined);
  try {
    return await Promise.race([
      observed,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          didTimeout = true;
          reject(new PublicDeliveryError('capture-failed', message));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const getCaptureSize = (element: HTMLElement) => {
  const rect = element.getBoundingClientRect();
  const measuredHeight = Math.max(Math.ceil(rect.height), element.scrollHeight, element.offsetHeight, element.clientHeight);
  const measuredWidth = Math.max(Math.ceil(rect.width), element.scrollWidth, element.offsetWidth, element.clientWidth);
  if (measuredHeight <= 0 || measuredWidth <= 0) {
    throw new PublicDeliveryError('capture-not-ready', '预览尚未完成布局，请稍后重试。');
  }
  return {
    height: measuredHeight,
    width: measuredWidth,
  };
};

const validateCaptureSize = ({ height, width }: { height: number; width: number }) => {
  const outputHeight = height * PUBLIC_CAPTURE_SCALE;
  const outputWidth = width * PUBLIC_CAPTURE_SCALE;
  if (
    outputHeight > PUBLIC_CAPTURE_MAX_CANVAS_DIMENSION ||
    outputWidth > PUBLIC_CAPTURE_MAX_CANVAS_DIMENSION ||
    outputHeight * outputWidth > PUBLIC_CAPTURE_MAX_CANVAS_PIXELS
  ) {
    throw new PublicDeliveryError(
      'capture-too-large',
      '内容尺寸超过浏览器安全截图上限，请缩小内容后重试。',
    );
  }
};

const getScaledCapturePixels = ({ height, width }: { height: number; width: number }) => (
  height * width * PUBLIC_CAPTURE_SCALE * PUBLIC_CAPTURE_SCALE
);

const validateCaptureOperationSize = (sizes: readonly { height: number; width: number }[]) => {
  const totalPixels = sizes.reduce((total, size) => total + getScaledCapturePixels(size), 0);
  if (totalPixels > PUBLIC_CAPTURE_MAX_CANVAS_PIXELS) {
    throw new PublicDeliveryError(
      'capture-too-large',
      '内容尺寸超过浏览器安全截图上限，请缩小内容后重试。',
    );
  }
};

const throwIfCaptureAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) {
    throw new PublicDeliveryError('capture-failed', '文档已变化，已取消旧的交付任务。', {
      cause: signal.reason,
    });
  }
};

const withCaptureAbort = async <T>(
  promise: Promise<T>,
  signal?: AbortSignal,
  onLateResolve?: (value: T) => void,
) => {
  if (!signal) return promise;
  let didAbort = false;
  const observed = promise.then((value) => {
    if (didAbort) {
      try {
        onLateResolve?.(value);
      } catch {
        // Late cleanup is best-effort and must not surface as an unhandled rejection.
      }
    }
    return value;
  });
  void observed.catch(() => undefined);
  let abort: (() => void) | undefined;
  try {
    return await Promise.race([
      observed,
      new Promise<never>((_, reject) => {
        abort = () => {
          didAbort = true;
          reject(new PublicDeliveryError(
            'capture-failed',
            '文档已变化，已取消旧的交付任务。',
            { cause: signal.reason },
          ));
        };
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
      }),
    ]);
  } finally {
    if (abort) signal.removeEventListener('abort', abort);
  }
};

export const createPublicCaptureContextWithGuard = async <T>(
  createContext: () => Promise<T>,
  destroyContext: (context: T) => void,
  options: {
    signal?: AbortSignal;
    timeoutMessage?: string;
    timeoutMs?: number;
  } = {},
) => {
  throwIfCaptureAborted(options.signal);
  const pendingContext = Promise.resolve().then(() => {
    throwIfCaptureAborted(options.signal);
    return createContext();
  });
  return withPublicDeliveryTimeout(
    withCaptureAbort(pendingContext, options.signal, destroyContext),
    options.timeoutMs ?? PUBLIC_CAPTURE_RENDER_TIMEOUT_MS,
    options.timeoutMessage ?? '初始化图片生成环境超时，请检查远程资源后重试。',
    destroyContext,
  );
};

const waitForPreviewAssets = async (root: HTMLElement, signal?: AbortSignal) => {
  const cleanups: Array<() => void> = [];
  const imagePromises = Array.from(root.querySelectorAll('img')).map(image => {
    if (image.complete && image.naturalWidth > 0) return Promise.resolve();
    if (image.complete) {
      return Promise.reject(new PublicDeliveryError(
        'capture-failed',
        '预览图片加载失败，未生成不完整的交付产物。',
      ));
    }
    if (typeof image.decode === 'function') {
      return image.decode().then(() => {
        if (image.naturalWidth <= 0) throw new Error('Decoded image has no pixels.');
      }).catch(error => {
        throw new PublicDeliveryError(
          'capture-failed',
          '预览图片加载失败，未生成不完整的交付产物。',
          { cause: error },
        );
      });
    }
    return new Promise<void>((resolve, reject) => {
      const loaded = () => resolve();
      const failed = () => reject(new PublicDeliveryError(
        'capture-failed',
        '预览图片加载失败，未生成不完整的交付产物。',
      ));
      const cleanup = () => {
        image.removeEventListener('load', loaded);
        image.removeEventListener('error', failed);
      };
      cleanups.push(cleanup);
      image.addEventListener('load', loaded, { once: true });
      image.addEventListener('error', failed, { once: true });
    });
  });
  const fontPromise = root.ownerDocument.fonts?.ready.catch(() => undefined) ?? Promise.resolve();
  let firstFrame: number | undefined;
  let secondFrame: number | undefined;
  const paintPromise = new Promise<void>(resolve => {
    const view = root.ownerDocument.defaultView;
    if (!view) {
      resolve();
      return;
    }
    firstFrame = view.requestAnimationFrame(() => {
      secondFrame = view.requestAnimationFrame(() => resolve());
    });
  });
  try {
    await withPublicDeliveryTimeout(
      withCaptureAbort(
        Promise.all([...imagePromises, fontPromise, paintPromise]).then(() => undefined),
        signal,
      ),
      PUBLIC_CAPTURE_ASSET_TIMEOUT_MS,
      '等待图片或字体加载超时，请检查远程资源后重试。',
    );
  } finally {
    cleanups.forEach(cleanup => cleanup());
    const view = root.ownerDocument.defaultView;
    if (view && firstFrame !== undefined) view.cancelAnimationFrame(firstFrame);
    if (view && secondFrame !== undefined) view.cancelAnimationFrame(secondFrame);
  }
};

const waitForCaptureStylesheets = async (root: Document | ShadowRoot, signal?: AbortSignal) => {
  const links = Array.from(root.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]'));
  if (links.length === 0) return;
  const cleanups: Array<() => void> = [];
  const pending = links.map(link => {
    if (link.sheet) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        link.removeEventListener('load', loaded);
        link.removeEventListener('error', failed);
      };
      cleanups.push(cleanup);
      const loaded = () => {
        cleanup();
        resolve();
      };
      const failed = () => {
        cleanup();
        reject(new PublicDeliveryError(
          'capture-failed',
          '预览样式表加载失败，未生成未完成样式的交付产物。',
        ));
      };
      link.addEventListener('load', loaded, { once: true });
      link.addEventListener('error', failed, { once: true });
    });
  });
  try {
    await withPublicDeliveryTimeout(
      withCaptureAbort(Promise.all(pending).then(() => undefined), signal),
      PUBLIC_CAPTURE_ASSET_TIMEOUT_MS,
      '等待预览样式表加载超时，请检查远程资源后重试。',
    );
  } finally {
    cleanups.forEach(cleanup => cleanup());
  }
};

type PublicStaticFrameCapture = {
  canvas: HTMLCanvasElement;
  height: number;
  width: number;
};

type PublicPreparedStaticHtmlCapture = {
  captureRoot: HTMLElement;
  cleanup(): void;
  frame: HTMLIFrameElement;
  height: number;
  resourceSnapshot: PublicCaptureResourceSnapshot;
  width: number;
};

const waitForFrameLoad = async (frame: HTMLIFrameElement, signal?: AbortSignal) => {
  let loaded: (() => void) | undefined;
  try {
    await withPublicDeliveryTimeout(
      withCaptureAbort(new Promise<void>((resolve) => {
        loaded = () => resolve();
        frame.addEventListener('load', loaded, { once: true });
      }), signal),
      PUBLIC_CAPTURE_ASSET_TIMEOUT_MS,
      'HTML 截图环境加载超时，请重试。',
    );
  } finally {
    if (loaded) frame.removeEventListener('load', loaded);
  }
};

/**
 * Render static author HTML in its own same-origin capture document with
 * scripts disabled. Keeping the real html/body tree is important: flattening
 * body children into a section breaks common html{}, body{}, :root and
 * html,body layout rules and produces an export that does not match Final.
 */
const prepareStaticHtmlDocumentCapture = async (
  ownerDocument: Document,
  html: string,
  options: { initialHeight: number; signal?: AbortSignal; width: number },
): Promise<PublicPreparedStaticHtmlCapture> => {
  await assertStaticCaptureMarkup(html);
  throwIfCaptureAborted(options.signal);
  if (!ownerDocument.body) {
    throw new PublicDeliveryError('capture-not-ready', '当前环境无法初始化 HTML 截图。');
  }

  const frozenResources = await preparePublicRawHtmlCaptureResources(
    ownerDocument,
    html,
    options.signal,
  );

  const width = Math.max(1, Math.ceil(options.width));
  const initialHeight = Math.max(1, Math.ceil(options.initialHeight));
  const frame = ownerDocument.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('tabindex', '-1');
  // No allow-scripts: the capture document is readable but author scripts can
  // never execute in the app origin. Dynamic documents fail closed above.
  frame.setAttribute('sandbox', 'allow-same-origin');
  frame.style.cssText = [
    'position:fixed',
    'left:-100000px',
    'top:0',
    `width:${width}px`,
    `height:${initialHeight}px`,
    'border:0',
    'overflow:hidden',
    'pointer-events:none',
    'visibility:hidden',
    'z-index:-1',
  ].join(';');
  // Configure srcdoc while detached and subscribe before insertion so the
  // initial about:blank load cannot win the readiness race.
  frame.srcdoc = frozenResources.html;
  const loaded = waitForFrameLoad(frame, options.signal);
  try {
    ownerDocument.body.appendChild(frame);
    await loaded;
    throwIfCaptureAborted(options.signal);
    const captureDocument = frame.contentDocument;
    const captureRoot = captureDocument?.documentElement;
    if (!captureDocument?.body || !captureRoot) {
      throw new PublicDeliveryError('capture-not-ready', 'HTML 截图环境初始化失败，请重试。');
    }

    await waitForPreviewAssets(captureRoot, options.signal);
    let measuredWidth = Math.max(
      width,
      captureRoot.scrollWidth,
      captureRoot.offsetWidth,
      captureDocument.body.scrollWidth,
      captureDocument.body.offsetWidth,
    );
    let measuredHeight = Math.max(
      initialHeight,
      captureRoot.scrollHeight,
      captureRoot.offsetHeight,
      captureDocument.body.scrollHeight,
      captureDocument.body.offsetHeight,
    );
    validateCaptureSize({ height: measuredHeight, width: measuredWidth });
    frame.style.width = `${measuredWidth}px`;
    frame.style.height = `${measuredHeight}px`;
    await waitForPreviewAssets(captureRoot, options.signal);
    throwIfCaptureAborted(options.signal);
    // A viewport-height layout can change once the frame grows to its measured
    // content. Re-measure before allocating any canvas.
    measuredWidth = Math.max(
      measuredWidth,
      captureRoot.scrollWidth,
      captureRoot.offsetWidth,
      captureDocument.body.scrollWidth,
      captureDocument.body.offsetWidth,
    );
    measuredHeight = Math.max(
      measuredHeight,
      captureRoot.scrollHeight,
      captureRoot.offsetHeight,
      captureDocument.body.scrollHeight,
      captureDocument.body.offsetHeight,
    );
    validateCaptureSize({ height: measuredHeight, width: measuredWidth });
    frame.style.width = `${measuredWidth}px`;
    frame.style.height = `${measuredHeight}px`;
    return {
      captureRoot,
      cleanup: () => {
        frame.remove();
        frozenResources.snapshot.cleanup();
      },
      frame,
      height: measuredHeight,
      resourceSnapshot: frozenResources.snapshot,
      width: measuredWidth,
    };
  } catch (error) {
    frame.remove();
    frozenResources.snapshot.cleanup();
    throw error;
  }
};

const capturePreparedStaticHtmlDocument = async (
  prepared: PublicPreparedStaticHtmlCapture,
  options: { backgroundColor: string; signal?: AbortSignal },
): Promise<PublicStaticFrameCapture> => {
  throwIfCaptureAborted(options.signal);
  // modern-screenshot appends its own style-probing iframe to ownerDocument.body.
  // When the capture target is that document's <html> element, the helper
  // becomes a descendant of the target while it is being cloned and can make
  // the capture recursively include its own sandbox. html2canvas clones the
  // document before installing its helper container, so it is the safe engine
  // for a complete static html/body tree. Mixed-preview wrappers remain on the
  // modern-screenshot path below because their target is a body sibling.
  const canvas = await captureRegularElementToCanvas(prepared.captureRoot, {
    backgroundColor: options.backgroundColor,
    height: prepared.height,
    resourceSnapshot: prepared.resourceSnapshot,
    signal: options.signal,
    width: prepared.width,
  });
  return { canvas, height: prepared.height, width: prepared.width };
};

const captureStaticHtmlDocumentToCanvas = async (
  ownerDocument: Document,
  html: string,
  options: { backgroundColor: string; initialHeight: number; signal?: AbortSignal; width: number },
): Promise<PublicStaticFrameCapture> => {
  const prepared = await prepareStaticHtmlDocumentCapture(ownerDocument, html, options);
  try {
    validateCaptureOperationSize([prepared]);
    return await capturePreparedStaticHtmlDocument(prepared, options);
  } finally {
    prepared.cleanup();
  }
};

const escapePublicCaptureCssUrl = (value: string) => (
  value.replace(/["\\\n\r]/gu, character => `\\${character}`)
);

const resolvePublicCaptureCssUrl = (value: string, baseUrl: string) => {
  const normalized = decodePortableCssEscapes(value).trim();
  if (
    !normalized ||
    normalized.startsWith('#') ||
    /^(?:about|blob|data):/iu.test(normalized) ||
    /^(?:env|var)\(/iu.test(normalized)
  ) {
    return null;
  }
  try {
    return new URL(normalized, baseUrl).href;
  } catch {
    return null;
  }
};

export const rewritePublicCaptureCssUrls = (cssText: string, baseUrl: string) => {
  const rewrittenImport = cssText.replace(
    /^(\s*@import\s+)(["'])(.*?)\2/iu,
    (match, prefix: string, quote: string, value: string) => {
      const resolved = resolvePublicCaptureCssUrl(value, baseUrl);
      return resolved ? `${prefix}${quote}${escapePublicCaptureCssUrl(resolved)}${quote}` : match;
    },
  );
  const parts: string[] = [];
  let cursor = 0;
  let index = 0;
  while (index < rewrittenImport.length) {
    const character = rewrittenImport[index];
    if (character === '"' || character === "'") {
      const quote = character;
      index += 1;
      while (index < rewrittenImport.length) {
        if (rewrittenImport[index] === '\\') index += 2;
        else if (rewrittenImport[index] === quote) {
          index += 1;
          break;
        } else index += 1;
      }
      continue;
    }
    if (character === '/' && rewrittenImport[index + 1] === '*') {
      const commentEnd = rewrittenImport.indexOf('*/', index + 2);
      index = commentEnd === -1 ? rewrittenImport.length : commentEnd + 2;
      continue;
    }
    const isUrlFunction = rewrittenImport.slice(index, index + 4).toLowerCase() === 'url(';
    const previous = index > 0 ? rewrittenImport[index - 1] : '';
    if (!isUrlFunction || /[\w-]/u.test(previous)) {
      index += 1;
      continue;
    }

    let valueStart = index + 4;
    while (/\s/u.test(rewrittenImport[valueStart] ?? '')) valueStart += 1;
    let valueEnd = valueStart;
    let functionEnd = valueStart;
    const quote = rewrittenImport[valueStart];
    if (quote === '"' || quote === "'") {
      valueStart += 1;
      valueEnd = valueStart;
      while (valueEnd < rewrittenImport.length) {
        if (rewrittenImport[valueEnd] === '\\') valueEnd += 2;
        else if (rewrittenImport[valueEnd] === quote) break;
        else valueEnd += 1;
      }
      functionEnd = valueEnd + 1;
      while (/\s/u.test(rewrittenImport[functionEnd] ?? '')) functionEnd += 1;
    } else {
      while (valueEnd < rewrittenImport.length) {
        if (rewrittenImport[valueEnd] === '\\') valueEnd += 2;
        else if (rewrittenImport[valueEnd] === ')') break;
        else valueEnd += 1;
      }
      functionEnd = valueEnd;
    }
    if (rewrittenImport[functionEnd] !== ')') {
      index += 4;
      continue;
    }

    const resolved = resolvePublicCaptureCssUrl(
      rewrittenImport.slice(valueStart, valueEnd),
      baseUrl,
    );
    if (resolved) {
      parts.push(rewrittenImport.slice(cursor, index));
      parts.push(`url("${escapePublicCaptureCssUrl(resolved)}")`);
      cursor = functionEnd + 1;
    }
    index = functionEnd + 1;
  }
  parts.push(rewrittenImport.slice(cursor));
  return parts.join('');
};

export const appendReadableDocumentStyles = (
  doc: Document,
  target: ShadowRoot,
  snapshot?: PublicCaptureResourceSnapshot,
) => {
  const sheets = [
    ...Array.from(doc.styleSheets),
    ...Array.from(doc.adoptedStyleSheets ?? []),
  ];
  for (const sheet of sheets) {
    if (sheet.disabled) continue;
    const mediaText = sheet.media?.mediaText?.trim() ?? '';
    try {
      const baseUrl = sheet.href || doc.baseURI;
      const rules = Array.from(
        sheet.cssRules,
        rule => rewritePublicCaptureCssUrls(rule.cssText, baseUrl),
      ).join('\n');
      if (!rules) continue;
      const style = doc.createElement('style');
      if (mediaText) style.media = mediaText;
      style.textContent = snapshot ? snapshot.rewriteCss(rules, baseUrl) : rules;
      target.appendChild(style);
    } catch {
      if (!sheet.href) continue;
      const link = doc.createElement('link');
      link.rel = 'stylesheet';
      link.href = snapshot ? snapshot.resolve(sheet.href, doc.baseURI) : sheet.href;
      if (mediaText) link.media = mediaText;
      target.appendChild(link);
    }
  }
};

const PUBLIC_DELIVERY_EXCLUDE_SELECTOR = '[data-morndraft-delivery-exclude]';

const getPublicComposedCaptureElements = (root: ParentNode) => {
  const elements: Element[] = [];
  const initial = root.nodeType === 1 ? [root as Element] : Array.from(root.children ?? []);
  const pending = [...initial];
  while (pending.length > 0) {
    const element = pending.pop();
    if (!element) continue;
    elements.push(element);
    const lightChildren = Array.from(element.children ?? []);
    for (let index = lightChildren.length - 1; index >= 0; index -= 1) pending.push(lightChildren[index]);
    const shadowChildren = Array.from(element.shadowRoot?.children ?? []);
    for (let index = shadowChildren.length - 1; index >= 0; index -= 1) pending.push(shadowChildren[index]);
  }
  return elements;
};

const isInsidePublicDeliveryExcludedTree = (element: Element) => {
  let candidate: Element | null = element;
  while (candidate) {
    if (candidate.matches(PUBLIC_DELIVERY_EXCLUDE_SELECTOR)) return true;
    if (candidate.parentElement) {
      candidate = candidate.parentElement;
      continue;
    }
    const root = candidate.getRootNode?.();
    candidate = root && root.nodeType === 11 && 'host' in root
      ? (root as ShadowRoot).host
      : null;
  }
  return false;
};

const isInsidePublicCaptureInertFragment = (element: Element) => {
  const root = element.getRootNode?.();
  return Boolean(root && root.nodeType === 11 && !('host' in root));
};

export const getPublicCapturableIframes = (root: ParentNode) => (
  getPublicComposedCaptureElements(root).filter((element): element is HTMLIFrameElement => (
    element.tagName.toLowerCase() === 'iframe' && !isInsidePublicDeliveryExcludedTree(element)
  ))
);

const appendReadableAdoptedStyles = (
  source: DocumentOrShadowRoot,
  target: ParentNode,
  doc: Document,
  snapshot: PublicCaptureResourceSnapshot,
) => {
  for (const sheet of Array.from(source.adoptedStyleSheets ?? [])) {
    let cssText = '';
    try {
      cssText = Array.from(sheet.cssRules, rule => (
        rewritePublicCaptureCssUrls(rule.cssText, sheet.href || doc.baseURI)
      )).join('\n');
    } catch (error) {
      throw new PublicDeliveryError(
        'capture-failed',
        '预览样式无法安全冻结，未生成不完整的交付产物。',
        { cause: error },
      );
    }
    if (!cssText) continue;
    const style = doc.createElement('style');
    style.textContent = snapshot.rewriteCss(cssText, sheet.href || doc.baseURI);
    target.appendChild(style);
  }
};

type PublicCaptureElementRuntimeState =
  | Readonly<{
      bitmap: HTMLCanvasElement;
      height: number;
      kind: 'canvas';
      width: number;
    }>
  | Readonly<{
      checked: boolean;
      indeterminate: boolean;
      kind: 'input';
      value: string;
    }>
  | Readonly<{
      kind: 'textarea';
      value: string;
    }>
  | Readonly<{
      kind: 'select';
      multiple: boolean;
      selected: readonly boolean[];
      selectedIndex: number;
    }>
  | Readonly<{
      kind: 'option';
      selected: boolean;
    }>
  | Readonly<{
      kind: 'details' | 'dialog';
      open: boolean;
    }>
  | Readonly<{
      kind: 'output';
      value: string;
    }>
  | Readonly<{
      kind: 'progress';
      max: number;
      value: number;
    }>
  | Readonly<{
      high: number;
      kind: 'meter';
      low: number;
      max: number;
      min: number;
      optimum: number;
      value: number;
    }>;

type PublicCaptureRuntimeState = Readonly<{
  cleanup: () => void;
  elements: ReadonlyMap<Element, PublicCaptureElementRuntimeState>;
}>;

const throwUnsupportedPublicCaptureLiveState = (message: string) => {
  throw new PublicDeliveryError(
    'capture-failed',
    `${message}，浏览器无法生成确定的静态图片；请下载 HTML 交付。`,
  );
};

const createPublicCaptureRuntimeState = (root: ParentNode): PublicCaptureRuntimeState => {
  const states = new Map<Element, PublicCaptureElementRuntimeState>();
  const ownedCanvases: HTMLCanvasElement[] = [];
  let canvasPixels = 0;
  const cleanup = () => {
    for (const canvas of ownedCanvases) {
      canvas.width = 0;
      canvas.height = 0;
    }
    ownedCanvases.length = 0;
    states.clear();
  };

  try {
    for (const element of getPublicComposedCaptureElements(root)) {
      if (isInsidePublicDeliveryExcludedTree(element)) continue;
      const tagName = element.tagName.toLowerCase();
      if (tagName === 'video' || tagName === 'audio') {
        throwUnsupportedPublicCaptureLiveState('预览包含无法冻结当前帧的音视频');
      }
      if (tagName === 'input') {
        const input = element as HTMLInputElement;
        if (input.type.toLowerCase() === 'file' && (input.files?.length ?? 0) > 0) {
          throwUnsupportedPublicCaptureLiveState('预览包含无法复制的本地文件选择');
        }
        states.set(element, {
          checked: input.checked,
          indeterminate: input.indeterminate,
          kind: 'input',
          value: input.value,
        });
        continue;
      }
      if (tagName === 'textarea') {
        states.set(element, { kind: 'textarea', value: (element as HTMLTextAreaElement).value });
        continue;
      }
      if (tagName === 'select') {
        const select = element as HTMLSelectElement;
        states.set(element, {
          kind: 'select',
          multiple: select.multiple,
          selected: Array.from(select.options, option => option.selected),
          selectedIndex: select.selectedIndex,
        });
        continue;
      }
      if (tagName === 'option') {
        states.set(element, { kind: 'option', selected: (element as HTMLOptionElement).selected });
        continue;
      }
      if (tagName === 'details') {
        states.set(element, { kind: 'details', open: (element as HTMLDetailsElement).open });
        continue;
      }
      if (tagName === 'dialog') {
        states.set(element, { kind: 'dialog', open: (element as HTMLDialogElement).open });
        continue;
      }
      if (tagName === 'output') {
        states.set(element, { kind: 'output', value: (element as HTMLOutputElement).value });
        continue;
      }
      if (tagName === 'progress') {
        const progress = element as HTMLProgressElement;
        if (!progress.hasAttribute('value')) {
          throwUnsupportedPublicCaptureLiveState('预览包含持续变化的不确定进度条');
        }
        states.set(element, { kind: 'progress', max: progress.max, value: progress.value });
        continue;
      }
      if (tagName === 'meter') {
        const meter = element as HTMLMeterElement;
        states.set(element, {
          high: meter.high,
          kind: 'meter',
          low: meter.low,
          max: meter.max,
          min: meter.min,
          optimum: meter.optimum,
          value: meter.value,
        });
        continue;
      }
      if (tagName !== 'canvas') continue;

      const sourceCanvas = element as HTMLCanvasElement;
      const { height, width } = sourceCanvas;
      const pixels = height * width;
      if (
        height > PUBLIC_CAPTURE_MAX_CANVAS_DIMENSION
        || width > PUBLIC_CAPTURE_MAX_CANVAS_DIMENSION
        || pixels > PUBLIC_CAPTURE_MAX_CANVAS_PIXELS - canvasPixels
      ) {
        throw new PublicDeliveryError(
          'capture-too-large',
          '预览画布尺寸超过浏览器安全截图上限，请缩小内容后重试。',
        );
      }
      canvasPixels += pixels;
      const bitmap = sourceCanvas.ownerDocument.createElement('canvas');
      bitmap.width = width;
      bitmap.height = height;
      ownedCanvases.push(bitmap);
      if (width > 0 && height > 0) {
        const context = bitmap.getContext('2d');
        if (!context) throw new Error('Canvas 2D snapshot context is unavailable.');
        context.drawImage(sourceCanvas, 0, 0);
        // Canvas taint is global: reading one pixel proves the entire copied
        // bitmap is origin-clean before it reaches either screenshot runtime.
        context.getImageData(0, 0, 1, 1);
      }
      states.set(element, { bitmap, height, kind: 'canvas', width });
    }
    return { cleanup, elements: states };
  } catch (error) {
    cleanup();
    if (error instanceof PublicDeliveryError) throw error;
    throw new PublicDeliveryError(
      'capture-failed',
      '预览画布无法安全冻结，未生成不完整的交付产物。',
      { cause: error },
    );
  }
};

const restorePublicCaptureRuntimeState = (
  source: Element,
  target: Element,
  runtime: PublicCaptureRuntimeState,
) => {
  if (
    isInsidePublicDeliveryExcludedTree(source)
    || isInsidePublicCaptureInertFragment(source)
  ) return;
  const tagName = source.tagName.toLowerCase();
  const state = runtime.elements.get(source);
  const requireState = <T extends PublicCaptureElementRuntimeState['kind']>(kind: T) => {
    if (!state || state.kind !== kind) {
      throw new PublicDeliveryError(
        'capture-failed',
        '预览在截图准备期间发生变化，未生成不一致的交付产物。',
      );
    }
    return state as Extract<PublicCaptureElementRuntimeState, { kind: T }>;
  };

  if (tagName === 'canvas') {
    const canvasState = requireState('canvas');
    const canvas = target as HTMLCanvasElement;
    canvas.width = canvasState.width;
    canvas.height = canvasState.height;
    if (canvasState.width > 0 && canvasState.height > 0) {
      const context = canvas.getContext('2d');
      if (!context) throwUnsupportedPublicCaptureLiveState('预览画布无法复制');
      context.drawImage(canvasState.bitmap, 0, 0);
    }
    return;
  }
  if (tagName === 'input') {
    const inputState = requireState('input');
    const input = target as HTMLInputElement;
    input.setAttribute('value', inputState.value);
    if (input.type.toLowerCase() !== 'file') input.value = inputState.value;
    input.toggleAttribute('checked', inputState.checked);
    input.checked = inputState.checked;
    input.indeterminate = inputState.indeterminate;
    return;
  }
  if (tagName === 'textarea') {
    const textareaState = requireState('textarea');
    const textarea = target as HTMLTextAreaElement;
    textarea.textContent = textareaState.value;
    textarea.value = textareaState.value;
    return;
  }
  if (tagName === 'select') {
    const selectState = requireState('select');
    const select = target as HTMLSelectElement;
    if (select.options.length !== selectState.selected.length) {
      throw new PublicDeliveryError(
        'capture-failed',
        '预览选项在截图准备期间发生变化，未生成不一致的交付产物。',
      );
    }
    Array.from(select.options).forEach((option, index) => {
      const selected = selectState.selected[index] ?? false;
      option.toggleAttribute('selected', selected);
      option.selected = selected;
    });
    if (!selectState.multiple) select.selectedIndex = selectState.selectedIndex;
    return;
  }
  if (tagName === 'option') {
    const optionState = requireState('option');
    const option = target as HTMLOptionElement;
    option.toggleAttribute('selected', optionState.selected);
    option.selected = optionState.selected;
    return;
  }
  if (tagName === 'details' || tagName === 'dialog') {
    const openState = requireState(tagName);
    target.toggleAttribute('open', openState.open);
    (target as HTMLDetailsElement | HTMLDialogElement).open = openState.open;
    return;
  }
  if (tagName === 'output') {
    const outputState = requireState('output');
    const output = target as HTMLOutputElement;
    output.textContent = outputState.value;
    output.value = outputState.value;
    return;
  }
  if (tagName === 'progress') {
    const progressState = requireState('progress');
    const progress = target as HTMLProgressElement;
    progress.max = progressState.max;
    progress.value = progressState.value;
    return;
  }
  if (tagName === 'meter') {
    const meterState = requireState('meter');
    const meter = target as HTMLMeterElement;
    meter.min = meterState.min;
    meter.max = meterState.max;
    meter.low = meterState.low;
    meter.high = meterState.high;
    meter.optimum = meterState.optimum;
    meter.value = meterState.value;
  }
};

const PUBLIC_CAPTURE_CLONE_CSS_ATTRIBUTES = new Set([
  'background',
  'clip-path',
  'cursor',
  'fill',
  'filter',
  'marker',
  'marker-end',
  'marker-mid',
  'marker-start',
  'mask',
  'mask-image',
  'stroke',
  'style',
]);

const clonePublicCaptureNode = (
  source: Node,
  doc: Document,
  snapshot: PublicCaptureResourceSnapshot,
  runtime: PublicCaptureRuntimeState,
): Node | null => {
  if (source.nodeType === 3) return doc.createTextNode(source.nodeValue ?? '');
  if (source.nodeType === 8) return doc.createComment(source.nodeValue ?? '');
  if (source.nodeType !== 1) return null;
  const sourceElement = source as Element;
  const tagName = sourceElement.tagName.toLowerCase();
  if (tagName === 'script') return null;
  const isStylesheetLink = tagName === 'link'
    && /(?:^|\s)stylesheet(?:\s|$)/iu.test(sourceElement.getAttribute('rel') ?? '');
  // Resource hints have no visual output, but cloning even while detached can
  // start a second author request. Omit them from the operation-owned tree.
  if (tagName === 'link' && !isStylesheetLink) return null;
  if (isStylesheetLink && !sourceElement.getAttribute('href')) return null;
  const qualifiedName = sourceElement.prefix
    ? `${sourceElement.prefix}:${sourceElement.localName}`
    : sourceElement.localName;
  const cloneElement = doc.createElementNS(sourceElement.namespaceURI, qualifiedName);
  const baseUrl = sourceElement.baseURI || sourceElement.ownerDocument.baseURI;
  for (const attribute of Array.from(sourceElement.attributes)) {
    const attributeName = attribute.name.toLowerCase();
    if (
      (tagName === 'iframe' && (attributeName === 'src' || attributeName === 'srcdoc'))
      || ((tagName === 'audio' || tagName === 'video' || tagName === 'track' || tagName === 'embed') && attributeName === 'src')
      || (tagName === 'object' && attributeName === 'data')
    ) continue;
    let value = attribute.value;
    if (attributeName === 'srcset' && (tagName === 'img' || tagName === 'source')) {
      value = snapshot.rewriteSrcset(value, baseUrl);
    } else if (
      (attributeName === 'src' && (
        tagName === 'img'
        || tagName === 'source'
        || tagName === 'mglyph'
        || (tagName === 'input' && (sourceElement.getAttribute('type') ?? '').toLowerCase() === 'image')
      ))
      || (attributeName === 'poster' && tagName === 'video')
      || (attributeName === 'href' && (isStylesheetLink || tagName === 'image' || tagName === 'use' || tagName === 'feimage'))
      || (attributeName === 'xlink:href' && (tagName === 'image' || tagName === 'use' || tagName === 'feimage'))
    ) {
      value = snapshot.resolve(value, baseUrl);
    } else if (PUBLIC_CAPTURE_CLONE_CSS_ATTRIBUTES.has(attributeName)) {
      value = attributeName === 'background'
        ? snapshot.resolve(value, baseUrl)
        : snapshot.rewriteCss(value, baseUrl);
    }
    const attributeNamespaceUri = String(attribute.namespaceURI ?? '').trim();
    if (attributeNamespaceUri) {
      cloneElement.setAttributeNS(attributeNamespaceUri, attribute.name, value);
    } else {
      // Author/rendered SVG can contain literal colon-named attributes created
      // with setAttribute(). Replaying those through setAttributeNS(null, ...)
      // or setAttributeNS('', ...) is invalid in Chromium even though the
      // source DOM accepted them.
      cloneElement.setAttribute(attribute.name, value);
    }
  }
  if (tagName === 'style') {
    cloneElement.textContent = snapshot.rewriteCss(sourceElement.textContent ?? '', baseUrl);
  } else {
    for (const child of Array.from(source.childNodes)) {
      const childClone = clonePublicCaptureNode(child, doc, snapshot, runtime);
      if (childClone) cloneElement.appendChild(childClone);
    }
  }
  if (sourceElement.tagName.toLowerCase() === 'template' && 'content' in sourceElement && 'content' in cloneElement) {
    const sourceTemplate = sourceElement as HTMLTemplateElement;
    const cloneTemplate = cloneElement as HTMLTemplateElement;
    for (const child of Array.from(sourceTemplate.content.childNodes)) {
      const childClone = clonePublicCaptureNode(child, doc, snapshot, runtime);
      if (childClone) cloneTemplate.content.appendChild(childClone);
    }
  }
  if ('disabled' in sourceElement && 'disabled' in cloneElement) {
    (cloneElement as HTMLLinkElement | HTMLStyleElement).disabled = Boolean(
      (sourceElement as HTMLLinkElement | HTMLStyleElement).disabled,
    );
  }
  const sourceShadow = sourceElement.shadowRoot;
  if (sourceShadow) {
    let cloneShadow = cloneElement.shadowRoot;
    if (!cloneShadow) {
      try {
        cloneShadow = cloneElement.attachShadow({ mode: 'open' });
      } catch (error) {
        throw new PublicDeliveryError(
          'capture-failed',
          '预览开放 Shadow DOM 无法安全复制，未生成不完整的交付产物。',
          { cause: error },
        );
      }
    }
    cloneShadow.replaceChildren();
    for (const child of Array.from(sourceShadow.childNodes)) {
      const childClone = clonePublicCaptureNode(child, doc, snapshot, runtime);
      if (childClone) cloneShadow.appendChild(childClone);
    }
    appendReadableAdoptedStyles(sourceShadow, cloneShadow, doc, snapshot);
  }
  restorePublicCaptureRuntimeState(sourceElement, cloneElement, runtime);
  return cloneElement;
};

const appendOwnerShadowStyles = (
  source: HTMLElement,
  target: ShadowRoot,
  snapshot: PublicCaptureResourceSnapshot,
) => {
  const shadows: ShadowRoot[] = [];
  let owner: Node = source;
  while (owner.getRootNode) {
    const root = owner.getRootNode();
    if (root.nodeType !== 11 || !('host' in root)) break;
    shadows.push(root as ShadowRoot);
    owner = (root as ShadowRoot).host;
  }
  for (const shadow of shadows.reverse()) {
    for (const style of Array.from(shadow.querySelectorAll('style'))) {
      const clone = source.ownerDocument.createElement('style');
      clone.media = style.media;
      clone.disabled = style.disabled;
      clone.textContent = snapshot.rewriteCss(
        style.textContent ?? '',
        style.baseURI || source.ownerDocument.baseURI,
      );
      target.appendChild(clone);
    }
    for (const link of Array.from(shadow.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"]'))) {
      const clone = source.ownerDocument.createElement('link');
      clone.rel = 'stylesheet';
      clone.href = snapshot.resolve(link.getAttribute('href') ?? link.href, link.baseURI);
      clone.media = link.media;
      clone.disabled = link.disabled;
      target.appendChild(clone);
    }
    appendReadableAdoptedStyles(shadow, target, source.ownerDocument, snapshot);
  }
};

const createRenderedDocumentCaptureTarget = async (input: PublicDeliveryInput) => {
  const originalFrames = getPublicCapturableIframes(input.previewRoot);
  const doc = input.previewRoot.ownerDocument;
  if (!doc.defaultView || !doc.body) {
    throw new PublicDeliveryError('capture-not-ready', '当前环境无法初始化混合内容截图。');
  }
  const previewRect = input.previewRoot.getBoundingClientRect();
  const captureWidth = Math.max(1, Math.ceil(previewRect.width), input.previewRoot.clientWidth, 677);
  const host = doc.createElement('div');
  host.setAttribute('data-morndraft-public-capture-host', 'true');
  host.style.cssText = [
    'position:fixed',
    'left:-100000px',
    'top:0',
    `width:${captureWidth}px`,
    'min-height:1px',
    'overflow:visible',
    'pointer-events:none',
    'z-index:-1',
  ].join(';');
  const shadow = host.attachShadow({ mode: 'open' });
  const objectUrls: string[] = [];
  const preparedFrames: PublicPreparedStaticHtmlCapture[] = [];
  const reset = doc.createElement('style');
  const themeVariables = serializePublicThemeVariables(input.previewRoot, input.theme);
  const paperColor = getPublicThemePaperColor(input.theme);
  reset.textContent = `:host{all:initial;display:block;width:${captureWidth}px;background:${paperColor};${themeVariables};}*,*::before,*::after{box-sizing:border-box;animation:none!important;transition:none!important;caret-color:transparent!important;}img,svg,canvas,video,table{max-width:100%;}`;
  shadow.appendChild(reset);
  const replacements: HTMLImageElement[] = [];
  let resourceSnapshot: PublicCaptureResourceSnapshot | undefined;
  let runtimeState: PublicCaptureRuntimeState | undefined;
  try {
    for (const sourceFrame of originalFrames) {
      const srcDoc = sourceFrame.getAttribute('srcdoc') ?? sourceFrame.srcdoc ?? '';
      if (!srcDoc) {
        throw new PublicDeliveryError('capture-failed', '预览包含尚未完成的 iframe，未生成不完整的交付产物。');
      }
      await assertStaticCaptureMarkup(srcDoc);
    }
    // Snapshot every non-attribute visual state before awaiting author resource
    // fetches. The manual clone must preserve the exact click-time bitmap and
    // form state without ever invoking cloneNode on an author element.
    runtimeState = createPublicCaptureRuntimeState(input.previewRoot);
    // Freeze every author-controlled byte before creating any element clone.
    // Chromium can refetch a loaded image from cloneNode(true) even when the
    // clone is never connected, so a detached host is not itself isolation.
    resourceSnapshot = await createPublicCaptureResourceSnapshot(input.previewRoot, input.signal, {
      includeIframes: false,
    });
    appendReadableDocumentStyles(doc, shadow, resourceSnapshot);
    appendOwnerShadowStyles(input.previewRoot, shadow, resourceSnapshot);

    let targetNode: Node | null;
    try {
      targetNode = clonePublicCaptureNode(input.previewRoot, doc, resourceSnapshot, runtimeState);
    } finally {
      runtimeState.cleanup();
      runtimeState = undefined;
    }
    const target = targetNode;
    if (!(target instanceof doc.defaultView.HTMLElement)) {
      throw new PublicDeliveryError('capture-failed', '预览无法安全复制，未生成不完整的交付产物。');
    }
    getPublicComposedCaptureElements(target)
      .filter(node => node.matches(PUBLIC_DELIVERY_EXCLUDE_SELECTOR))
      .forEach(node => node.remove());
    target.removeAttribute('contenteditable');
    getPublicComposedCaptureElements(target)
      .filter(node => node.hasAttribute('contenteditable'))
      .forEach(node => node.removeAttribute('contenteditable'));
    shadow.appendChild(target);
    const clonedFrames = getPublicCapturableIframes(target);
    if (clonedFrames.length !== originalFrames.length) {
      throw new PublicDeliveryError('capture-failed', '预览 iframe 数量不一致，未生成不完整的交付产物。');
    }
    // This is now an idempotent assertion: every resource-bearing attribute was
    // written with an operation-owned Blob URL during manual clone creation.
    applyPublicCaptureResourceSnapshot(target, resourceSnapshot, { includeIframes: false });

    for (let index = 0; index < clonedFrames.length; index += 1) {
      throwIfCaptureAborted(input.signal);
      const frame = clonedFrames[index];
      const sourceFrame = originalFrames[index];
      if (!sourceFrame) {
        throw new PublicDeliveryError('capture-failed', '预览 iframe 数量不一致，未生成不完整的交付产物。');
      }
      const srcDoc = sourceFrame.getAttribute('srcdoc') ?? sourceFrame.srcdoc ?? '';
      if (!srcDoc) {
        throw new PublicDeliveryError('capture-failed', '预览包含尚未完成的 iframe，未生成不完整的交付产物。');
      }
      const frameRect = sourceFrame.getBoundingClientRect();
      const frameWidth = Math.max(1, Math.ceil(frameRect.width), sourceFrame.clientWidth);
      const frameHeight = Math.max(1, Math.ceil(frameRect.height), sourceFrame.clientHeight);
      const prepared = await prepareStaticHtmlDocumentCapture(doc, srcDoc, {
        initialHeight: frameHeight,
        signal: input.signal,
        width: frameWidth,
      });
      preparedFrames.push(prepared);
      const replacement = doc.createElement('img');
      replacement.setAttribute('data-morndraft-public-frame-snapshot', 'true');
      replacement.alt = '';
      replacement.style.cssText = `display:block;width:${prepared.width}px;height:${prepared.height}px;max-width:100%;object-fit:contain;object-position:top left;`;
      frame.replaceWith(replacement);
      replacements.push(replacement);
    }

    target.style.width = `${captureWidth}px`;
    doc.body.appendChild(host);
    await waitForCaptureStylesheets(shadow, input.signal);
    throwIfCaptureAborted(input.signal);

    // Budget the real measured iframe documents together with the final mixed
    // canvas before allocating the first large backing store. This prevents a
    // multi-frame document from accumulating blobs only to fail at the end.
    const finalSize = getCaptureSize(target);
    validateCaptureSize(finalSize);
    validateCaptureOperationSize([...preparedFrames, finalSize]);

    for (let index = 0; index < preparedFrames.length; index += 1) {
      const prepared = preparedFrames[index];
      const sourceFrame = originalFrames[index];
      const backgroundColor = sourceFrame.classList.contains('md-public-html-frame')
        ? '#ffffff'
        : paperColor;
      try {
        const snapshot = await capturePreparedStaticHtmlDocument(prepared, {
          backgroundColor,
          signal: input.signal,
        });
        const blob = await canvasToPngBlob(snapshot.canvas, { signal: input.signal });
        throwIfCaptureAborted(input.signal);
        const objectUrl = URL.createObjectURL(blob);
        objectUrls.push(objectUrl);
        replacements[index].src = objectUrl;
      } finally {
        prepared.cleanup();
      }
    }

    return {
      cleanup: () => {
        host.remove();
        objectUrls.forEach(url => URL.revokeObjectURL(url));
        resourceSnapshot?.cleanup();
      },
      resourceSnapshot,
      target,
    };
  } catch (error) {
    host.remove();
    preparedFrames.forEach(prepared => prepared.cleanup());
    objectUrls.forEach(url => URL.revokeObjectURL(url));
    runtimeState?.cleanup();
    resourceSnapshot?.cleanup();
    throw error;
  }
};

export type CanvasPngEncodeOptions = Readonly<{
  signal?: AbortSignal;
  timeoutMs?: number;
}>;

export const canvasToPngBlob = async (
  canvas: HTMLCanvasElement,
  options: CanvasPngEncodeOptions = {},
) => {
  try {
    const blob = await new Promise<Blob | null>((resolve, reject) => {
      const timeoutMs = options.timeoutMs ?? PUBLIC_CANVAS_PNG_ENCODE_TIMEOUT_MS;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      let settled = false;
      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
        options.signal?.removeEventListener('abort', handleAbort);
      };
      const settle = (complete: () => void) => {
        if (settled) return;
        settled = true;
        cleanup();
        complete();
      };
      const handleAbort = () => settle(() => reject(new PublicDeliveryError(
        'capture-failed',
        '文档已变化，已取消旧的交付任务。',
        { cause: options.signal?.reason },
      )));

      if (options.signal?.aborted) {
        handleAbort();
        return;
      }
      options.signal?.addEventListener('abort', handleAbort, { once: true });
      if (timeoutMs > 0) {
        timeoutId = setTimeout(() => settle(() => reject(new PublicDeliveryError(
          'capture-failed',
          '图片编码超时，未生成不完整的交付产物。',
        ))), timeoutMs);
      }
      try {
        canvas.toBlob(result => settle(() => resolve(result)), 'image/png');
      } catch (error) {
        settle(() => reject(error));
      }
    });
    if (!blob) throw new Error('Canvas returned an empty PNG blob.');
    return blob.type === 'image/png' ? blob : new Blob([blob], { type: 'image/png' });
  } catch (error) {
    if (error instanceof PublicDeliveryError) throw error;
    throw new PublicDeliveryError(
      'capture-failed',
      '图片生成失败；跨域图片可能阻止浏览器读取画布，请检查资源的 CORS 设置。',
      { cause: error },
    );
  } finally {
    // A scale-2 long canvas can retain tens of megabytes until the next GC.
    // Releasing its backing store here keeps repeated local delivery bounded
    // without invalidating the encoded Blob returned above.
    try {
      canvas.width = 0;
      canvas.height = 0;
    } catch {
      // Best-effort cleanup for non-browser canvas implementations.
    }
  }
};

const PUBLIC_CAPTURE_LIBRARY_NODE_SELECTOR = [
  '.html2canvas-container',
  'iframe[id^="__SANDBOX__"]',
].join(',');

const createCaptureLibraryDomGuard = (doc: Document) => {
  const view = doc.defaultView;
  const baseline = new Set(doc.querySelectorAll(PUBLIC_CAPTURE_LIBRARY_NODE_SELECTOR));
  const owned = new Set<Element>();
  let quarantine = false;
  let disposed = false;
  let disconnectTimer: number | undefined;

  const remember = (node: Node) => {
    if (node.nodeType !== 1) return;
    const element = node as Element;
    if (element.matches(PUBLIC_CAPTURE_LIBRARY_NODE_SELECTOR) && !baseline.has(element)) owned.add(element);
    element.querySelectorAll(PUBLIC_CAPTURE_LIBRARY_NODE_SELECTOR).forEach(candidate => {
      if (!baseline.has(candidate)) owned.add(candidate);
    });
    if (quarantine) owned.forEach(candidate => candidate.remove());
  };
  const observer = view?.MutationObserver && doc.documentElement
    ? new view.MutationObserver(records => {
        records.forEach(record => record.addedNodes.forEach(remember));
      })
    : null;
  observer?.observe(doc.documentElement, { childList: true, subtree: true });

  const collect = () => {
    doc.querySelectorAll(PUBLIC_CAPTURE_LIBRARY_NODE_SELECTOR).forEach(candidate => {
      if (!baseline.has(candidate)) owned.add(candidate);
    });
  };
  const cleanup = () => {
    collect();
    owned.forEach(candidate => candidate.remove());
    owned.clear();
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (disconnectTimer !== undefined) view?.clearTimeout(disconnectTimer);
    cleanup();
    observer?.disconnect();
  };
  const quarantineLateNodes = () => {
    if (disposed) return;
    quarantine = true;
    cleanup();
    // A timed-out library can settle one or two tasks later. Keep removing its
    // operation-owned nodes briefly, then release the observer even if a test
    // double deliberately returns a promise that never settles.
    if (view) disconnectTimer = view.setTimeout(dispose, 1_000);
    else dispose();
  };
  return { dispose, quarantineLateNodes };
};

const runCaptureLibraryOperation = async (
  doc: Document,
  createOperation: () => Promise<HTMLCanvasElement>,
  timeoutMessage: string,
  options: { onInterrupt?: () => void; signal?: AbortSignal } = {},
) => {
  const guard = createCaptureLibraryDomGuard(doc);
  let operation: Promise<HTMLCanvasElement>;
  try {
    operation = createOperation();
  } catch (error) {
    guard.dispose();
    throw error;
  }
  let settled = false;
  let interrupted = false;
  void operation.then(
    canvas => {
      settled = true;
      if (interrupted) {
        canvas.width = 0;
        canvas.height = 0;
      }
      guard.dispose();
    },
    () => {
      settled = true;
      guard.dispose();
    },
  );
  let removeAbortListener = () => undefined;
  const abortPromise = options.signal
    ? new Promise<never>((_, reject) => {
        const abort = () => {
          interrupted = true;
          reject(new PublicDeliveryError('capture-failed', '文档已变化，已取消旧的交付任务。', {
            cause: options.signal?.reason,
          }));
        };
        if (options.signal?.aborted) abort();
        else {
          options.signal?.addEventListener('abort', abort, { once: true });
          removeAbortListener = () => options.signal?.removeEventListener('abort', abort);
        }
      })
    : null;
  try {
    return await withPublicDeliveryTimeout(
      abortPromise ? Promise.race([operation, abortPromise]) : operation,
      PUBLIC_CAPTURE_RENDER_TIMEOUT_MS,
      timeoutMessage,
      lateCanvas => {
        lateCanvas.width = 0;
        lateCanvas.height = 0;
      },
    );
  } catch (error) {
    if (!settled) {
      interrupted = true;
      options.onInterrupt?.();
    }
    throw error;
  } finally {
    removeAbortListener();
    if (settled) guard.dispose();
    else guard.quarantineLateNodes();
  }
};

const captureRegularElementToCanvas = async (
  captureTarget: HTMLElement,
  {
    backgroundColor,
    height,
    resourceSnapshot,
    signal,
    width,
  }: {
    backgroundColor: string;
    height: number;
    resourceSnapshot: PublicCaptureResourceSnapshot;
    signal?: AbortSignal;
    width: number;
  },
) => {
  throwIfCaptureAborted(signal);
  // This function is intentionally limited to the operation-owned raw HTML
  // iframe. Its source tree was frozen before srcdoc insertion; applying the
  // snapshot again is an idempotent fail-closed assertion before html2canvas
  // performs its synchronous document clone. No late onclone callback is
  // allowed to reintroduce an author URL after timeout cleanup.
  applyPublicCaptureResourceSnapshot(captureTarget, resourceSnapshot, {
    materializeDocumentAdoptedStyles: true,
  });
  const html2canvas = await loadDeliveryHtml2Canvas({
    signal,
    timeoutMessage: '图片引擎加载超时，请检查网络后重试。',
  });
  const doc = captureTarget.ownerDocument;
  const view = doc.defaultView;
  return runCaptureLibraryOperation(
    doc,
    () => html2canvas(captureTarget, {
      allowTaint: false,
      backgroundColor,
      height,
      imageTimeout: PUBLIC_CAPTURE_ASSET_TIMEOUT_MS,
      logging: false,
      removeContainer: true,
      scale: PUBLIC_CAPTURE_SCALE,
      scrollX: view?.scrollX ?? 0,
      scrollY: view?.scrollY ?? 0,
      useCORS: false,
      width,
      windowHeight: Math.max(height, doc.documentElement?.scrollHeight ?? 0, view?.innerHeight ?? 0),
      windowWidth: Math.max(width, doc.documentElement?.scrollWidth ?? 0, view?.innerWidth ?? 0),
    }),
    '图片生成超时，请检查远程资源后重试。',
    { signal },
  );
};

const captureIsolatedElementToCanvas = async (
  captureTarget: HTMLElement,
  {
    backgroundColor,
    height,
    resourceSnapshot,
    signal,
    width,
  }: {
    backgroundColor: string;
    height: number;
    resourceSnapshot: PublicCaptureResourceSnapshot;
    signal?: AbortSignal;
    width: number;
  },
) => {
  throwIfCaptureAborted(signal);
  // createRenderedDocumentCaptureTarget already froze and rewrote this
  // detached clone before its host entered the document. Re-apply only as an
  // idempotent assertion; the screenshot callbacks never need author URLs.
  applyPublicCaptureResourceSnapshot(captureTarget, resourceSnapshot, { includeIframes: false });
  await waitForPreviewAssets(captureTarget, signal);
  const { createContext, destroyContext, domToCanvas } = await loadDeliveryModernScreenshot({
    signal,
    timeoutMessage: '图片引擎加载超时，请检查网络后重试。',
  });
  const context = await createPublicCaptureContextWithGuard(
    () => createContext(captureTarget, {
      autoDestruct: false,
      backgroundColor,
      fetchFn: resourceSnapshot.fetchFrozenImage,
      fetch: {
        placeholderImage: PUBLIC_CAPTURE_FAILED_RESOURCE_PLACEHOLDER,
        requestInit: {
          cache: 'force-cache',
          credentials: 'omit',
          mode: 'cors',
          signal,
        },
      },
      filter: node => {
        if (node.nodeType !== 1) return true;
        return !['LINK', 'SCRIPT', 'SOURCE', 'STYLE'].includes((node as Element).tagName);
      },
      height,
      onCreateForeignObjectSvg: assertPublicCaptureResourcesEmbedded,
      scale: PUBLIC_CAPTURE_SCALE,
      width,
      features: {
        copyScrollbar: false,
        fixSvgXmlDecode: true,
        removeAbnormalAttributes: true,
        removeControlCharacter: true,
        restoreScrollPosition: false,
      },
      timeout: PUBLIC_CAPTURE_RENDER_TIMEOUT_MS,
    }),
    destroyContext,
    { signal },
  );
  try {
    throwIfCaptureAborted(signal);
    return await runCaptureLibraryOperation(
      captureTarget.ownerDocument,
      () => domToCanvas(context),
      '图片生成超时，请检查远程资源后重试。',
      { onInterrupt: () => destroyContext(context), signal },
    );
  } finally {
    destroyContext(context);
  }
};

export const capturePublicPreviewPng = async (input: PublicDeliveryInput): Promise<PublicPngCapture> => {
  throwIfCaptureAborted(input.signal);
  if (!input.previewRoot?.isConnected) {
    throw new PublicDeliveryError('capture-not-ready', '预览尚未准备好，请稍后重试。');
  }

  await input.ensureRendered?.();
  input.assertCurrent?.();
  // The capture target is the Final paper itself, not the surrounding
  // workspace. If a renderer flattens transparent pixels, use the paper
  // palette as the fallback so dark exports remain identical to Final.
  const backgroundColor = getPublicThemePaperColor(input.theme);
  if (input.contentType === 'html') {
    const previewFrame = input.previewRoot.querySelector('iframe');
    const previewRect = input.previewRoot.getBoundingClientRect();
    const frameRect = previewFrame?.getBoundingClientRect();
    const captureWidth = Math.max(
      1,
      Math.ceil(frameRect?.width ?? 0),
      previewFrame?.clientWidth ?? 0,
      Math.ceil(previewRect.width),
      input.previewRoot.clientWidth,
      677,
    );
    const initialHeight = Math.max(
      1,
      Math.ceil(frameRect?.height ?? 0),
      previewFrame?.clientHeight ?? 0,
      Math.ceil(previewRect.height),
      input.previewRoot.clientHeight,
    );
    const capture = await captureStaticHtmlDocumentToCanvas(
      input.previewRoot.ownerDocument,
      extractPublicRawHtmlSource(input.source),
      {
        // Public raw HTML Final is intentionally a white iframe in both app
        // themes. Keep transparent author documents identical in delivery.
        backgroundColor: '#ffffff',
        initialHeight,
        signal: input.signal,
        width: captureWidth,
      },
    );
    try {
      input.assertCurrent?.();
      const blob = await canvasToPngBlob(capture.canvas, { signal: input.signal });
      input.assertCurrent?.();
      return { blob, height: capture.height, scale: PUBLIC_CAPTURE_SCALE, width: capture.width };
    } finally {
      capture.canvas.width = 0;
      capture.canvas.height = 0;
    }
  }

  const isolatedCapture = await createRenderedDocumentCaptureTarget(input);
  const captureTarget = isolatedCapture.target;

  try {
    await waitForPreviewAssets(captureTarget, input.signal);
    input.assertCurrent?.();
    const { height, width } = getCaptureSize(captureTarget);
    validateCaptureSize({ height, width });
    const canvas = await captureIsolatedElementToCanvas(captureTarget, {
      backgroundColor,
      height,
      resourceSnapshot: isolatedCapture.resourceSnapshot,
      signal: input.signal,
      width,
    });
    try {
      input.assertCurrent?.();
      const blob = await canvasToPngBlob(canvas, { signal: input.signal });
      input.assertCurrent?.();
      return { blob, height, scale: PUBLIC_CAPTURE_SCALE, width };
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  } catch (error) {
    if (error instanceof PublicDeliveryError) throw error;
    throw new PublicDeliveryError('capture-failed', '图片生成失败，请检查预览内容后重试。', { cause: error });
  } finally {
    isolatedCapture.cleanup();
  }
};
