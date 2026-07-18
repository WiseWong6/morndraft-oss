import { stripNonBlockingRemoteFontStylesheets } from '../../utils/html-preview-capture-source.js';
import {
  isInlinedStylesheetSource,
  isNonBlockingRemoteFontStylesheet,
} from './htmlCaptureStylesheets';
import { resolveCaptureFontFamilies } from './htmlCaptureFonts';

type StaticHtmlCaptureFrameOptions = {
  hidden?: boolean;
};

const HTML_CAPTURE_FRAME_PADDING = 8;
const HTML_CAPTURE_FRAME_LOAD_TIMEOUT_MS = 3500;
const HTML_CAPTURE_ASSET_TIMEOUT_MS = 6000;
const HTML_CAPTURE_SCROLLBAR_RESET_STYLE_ATTR = 'data-morndraft-capture-scrollbar-reset';

export const createStaticHtmlCaptureFrame = async (
  html: string,
  width: number,
  height?: number,
  options: StaticHtmlCaptureFrameOptions = {},
) => {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('tabindex', '-1');
  frame.setAttribute('sandbox', 'allow-same-origin');
  const frameHeight = height && height > 0 ? height : 900;
  const hidden = options.hidden !== false;
  frame.style.cssText = [
    'position:fixed',
    hidden ? 'left:-100000px' : 'left:0',
    'top:0',
    `width:${width}px`,
    `height:${frameHeight}px`,
    'box-sizing:border-box',
    'pointer-events:none',
    hidden ? 'visibility:hidden' : 'visibility:visible',
    hidden ? 'opacity:0' : 'opacity:1',
    'border:0',
    'background:#ffffff',
    'z-index:-1',
  ]
    .filter(Boolean)
    .join(';');

  document.body.appendChild(frame);

  await new Promise<void>((resolve) => {
    const finish = () => {
      frame.removeEventListener('load', finish);
      resolve();
    };

    frame.addEventListener('load', finish, { once: true });
    frame.srcdoc = stripNonBlockingRemoteFontStylesheets(html);
    window.setTimeout(finish, HTML_CAPTURE_FRAME_LOAD_TIMEOUT_MS);
  });

  return frame;
};

export const getElementCaptureSize = (element: HTMLElement) => {
  const rect = element.getBoundingClientRect();
  return {
    height: Math.max(
      1,
      Math.ceil(rect.height || 0),
      element.scrollHeight,
      element.offsetHeight,
      element.clientHeight,
    ),
    width: Math.max(
      1,
      Math.ceil(rect.width || 0),
      element.scrollWidth,
      element.offsetWidth,
      element.clientWidth,
    ),
  };
};

export const resizeStaticCaptureFrameToContent = async (
  frame: HTMLIFrameElement,
  captureRoot: HTMLElement,
  options: { minHeight?: number; stableWidth?: number } = {},
) => {
  await new Promise<void>((resolve) => {
    frame.contentWindow?.requestAnimationFrame(() => resolve());
    window.setTimeout(resolve, 100);
  });

  const doc = frame.contentDocument;
  const frameWidth = Math.max(1, Math.ceil(frame.clientWidth || frame.getBoundingClientRect().width));
  captureRoot.style.transform = '';
  if (options.stableWidth) {
    captureRoot.style.width = `${options.stableWidth}px`;
    captureRoot.style.maxWidth = 'none';
    doc?.documentElement?.style.setProperty('width', `${options.stableWidth}px`);
    doc?.documentElement?.style.setProperty('max-width', 'none');
  } else {
    captureRoot.style.width = '';
  }
  const contentWidth = Math.max(captureRoot.scrollWidth, doc?.documentElement?.scrollWidth ?? 0);
  if (contentWidth > frameWidth + 1) {
    const scale = Math.max(0.25, Math.min(1, frameWidth / contentWidth));
    captureRoot.style.cssText += `;width:${contentWidth}px;transform-origin:0 0;transform:scale(${scale})`;
  }
  const rect = captureRoot.getBoundingClientRect();
  const fullHeight = Math.max(
    captureRoot.scrollHeight,
    captureRoot.offsetHeight,
    Math.ceil(rect.height),
    doc?.body?.scrollHeight ?? 0,
    doc?.documentElement?.scrollHeight ?? 0,
  );

  if (fullHeight > 0) {
    frame.style.height = `${Math.ceil(Math.max(fullHeight + HTML_CAPTURE_FRAME_PADDING * 2, options.minHeight ?? 0))}px`;
  }
};

export const waitForElementAssets = async (element: HTMLElement, timeoutMs = HTML_CAPTURE_ASSET_TIMEOUT_MS) => {
  const images = Array.from(element.querySelectorAll('img'));
  const imagePromises = images.map((image) => {
    if (image.complete && image.naturalWidth > 0) return Promise.resolve();
    if (typeof image.decode === 'function') {
      return image.decode().catch(() => undefined);
    }
    return new Promise<void>((resolve) => {
      image.onload = () => resolve();
      image.onerror = () => resolve();
    });
  });

  const links = Array.from(element.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))
    .filter((link) => !isNonBlockingRemoteFontStylesheet(link) && !isInlinedStylesheetSource(link));
  const stylesheetPromises = links.map((link) => {
    try {
      if (link.sheet && link.sheet.cssRules.length >= 0) return Promise.resolve();
    } catch {
      // Cross-origin stylesheets are handled by the capture-time stylesheet inliner.
    }
    return new Promise<void>((resolve) => {
      const onLoad = () => {
        link.removeEventListener('load', onLoad);
        link.removeEventListener('error', onLoad);
        resolve();
      };
      link.addEventListener('load', onLoad, { once: true });
      link.addEventListener('error', onLoad, { once: true });
    });
  });

  const scripts = Array.from(element.querySelectorAll<HTMLScriptElement>('script[src]'));
  const scriptPromises = scripts.map((script) => {
    if ((script as any).readyState === 'complete' || (script as any).readyState === 'loaded') {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      const onLoad = () => {
        script.removeEventListener('load', onLoad);
        script.removeEventListener('error', onLoad);
        resolve();
      };
      script.addEventListener('load', onLoad, { once: true });
      script.addEventListener('error', onLoad, { once: true });
    });
  });

  const fontPromise = (async () => {
    const doc = element.ownerDocument;
    if (!doc?.fonts) return;

    await doc.fonts.ready.catch(() => undefined);

    const fontFamilies = resolveCaptureFontFamilies(element);

    if (fontFamilies.size > 0) {
      await Promise.all(
        Array.from(fontFamilies).map((family) =>
          doc.fonts.load(`1em "${family}"`).catch(() => undefined),
        ),
      );
      await doc.fonts.ready.catch(() => undefined);
    }
  })();
  const paintPromise = new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });

  const dynamicStylePromise = new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.setTimeout(() => resolve(), 180);
    });
  });

  await Promise.race([
    Promise.all([
      ...imagePromises,
      ...stylesheetPromises,
      ...scriptPromises,
      fontPromise,
      paintPromise,
      dynamicStylePromise,
    ]),
    new Promise<void>((resolve) => window.setTimeout(resolve, timeoutMs)),
  ]);
};

export const suppressCaptureScrollbars = (doc: Document, captureRoot: HTMLElement) => {
  let style = doc.querySelector<HTMLStyleElement>(`style[${HTML_CAPTURE_SCROLLBAR_RESET_STYLE_ATTR}]`);
  if (!style) {
    style = doc.createElement('style');
    style.setAttribute(HTML_CAPTURE_SCROLLBAR_RESET_STYLE_ATTR, 'true');
    style.textContent = [
      'html,body,[data-morndraft-stable-capture-root]{scrollbar-width:none!important;-ms-overflow-style:none!important;}',
      'html::-webkit-scrollbar,body::-webkit-scrollbar,[data-morndraft-stable-capture-root]::-webkit-scrollbar{display:none!important;width:0!important;height:0!important;}',
    ].join('');
    (doc.head ?? doc.documentElement).appendChild(style);
  }

  for (const target of new Set([doc.documentElement, doc.body, captureRoot])) {
    target?.style.setProperty('scrollbar-width', 'none', 'important');
    target?.style.setProperty('-ms-overflow-style', 'none', 'important');
  }
};
