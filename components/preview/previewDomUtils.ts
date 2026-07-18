import { useEffect, useState } from 'react';
import {
  detectArtifactContent,
  extractStandaloneHtmlPreviewFence,
  preprocessResourceLinks,
} from '../../utils/content-detection.js';
import { pickAdaptiveTextColor } from '../../utils/html-theme.js';

export type PreviewTheme = 'dark' | 'light';

export const preprocessArtifactCode = (input: string) => {
  const standaloneHtmlFence = extractStandaloneHtmlPreviewFence(input);
  const source = standaloneHtmlFence?.html ?? input;
  const detected = detectArtifactContent(source);
  switch (detected.primaryType) {
    case 'json':
      return `\`\`\`json\n${source}\n\`\`\``;
    case 'html':
      return `\`\`\`html-preview\n${source}\n\`\`\``;
    case 'mermaid':
      return `\`\`\`mermaid\n${source}\n\`\`\``;
    default:
      return source.trim() ? preprocessResourceLinks(source) : '';
  }
};

const HTML_THEME_SKIP_TAGS = new Set(['code', 'iframe', 'img', 'pre', 'script', 'style', 'svg', 'template']);

const getDocumentTheme = (): PreviewTheme =>
  document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';

const isTransparentOrEmptyCssColor = (value: string | null | undefined) =>
  !value || value === 'transparent' || value === 'rgba(0, 0, 0, 0)' || value === 'rgba(0,0,0,0)';

const shouldSkipAdaptiveTextNode = (element: HTMLElement) => {
  const tagName = element.tagName.toLowerCase();
  return HTML_THEME_SKIP_TAGS.has(tagName) || Boolean(element.closest('code, pre, svg, iframe'));
};

export const adaptHtmlFragmentTextColors = (root: HTMLElement, theme: PreviewTheme) => {
  const elements = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))];

  for (const element of elements) {
    if (shouldSkipAdaptiveTextNode(element)) continue;
    if (!element.textContent?.trim()) continue;

    const computedStyle = window.getComputedStyle(element);
    if (isTransparentOrEmptyCssColor(computedStyle.backgroundColor)) continue;
    if (element.style.color) continue;

    const inheritedColor = element.parentElement
      ? window.getComputedStyle(element.parentElement).color
      : null;
    const adaptiveColor = pickAdaptiveTextColor({
      theme,
      backgroundColor: computedStyle.backgroundColor,
      computedColor: computedStyle.color,
      inheritedColor,
    });

    if (adaptiveColor) {
      element.style.color = adaptiveColor;
    }
  }
};

const ADAPTIVE_COLOR_CHUNK_SIZE = 150;

const scheduleIdleTask = (callback: () => void) => {
  if (typeof window === 'undefined') return 0;
  const requestIdle = (window as Window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
  }).requestIdleCallback;
  if (requestIdle) return requestIdle(callback, { timeout: 120 });
  return window.setTimeout(callback, 0);
};

const cancelIdleTask = (taskId: number) => {
  if (typeof window === 'undefined') return;
  const cancelIdle = (window as Window & {
    cancelIdleCallback?: (id: number) => void;
  }).cancelIdleCallback;
  if (cancelIdle) {
    cancelIdle(taskId);
    return;
  }
  window.clearTimeout(taskId);
};

export const scheduleAdaptHtmlFragmentTextColors = (root: HTMLElement, theme: PreviewTheme) => {
  const elements = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))];
  let index = 0;
  let cancelled = false;
  let taskId: number | null = null;

  const runChunk = () => {
    taskId = null;
    if (cancelled || !root.isConnected) return;

    const chunkEnd = Math.min(elements.length, index + ADAPTIVE_COLOR_CHUNK_SIZE);
    for (; index < chunkEnd; index += 1) {
      const element = elements[index];
      if (!element?.isConnected) continue;
      if (shouldSkipAdaptiveTextNode(element)) continue;
      if (!element.textContent?.trim()) continue;

      const computedStyle = window.getComputedStyle(element);
      if (isTransparentOrEmptyCssColor(computedStyle.backgroundColor)) continue;
      if (element.style.color) continue;

      const inheritedColor = element.parentElement
        ? window.getComputedStyle(element.parentElement).color
        : null;
      const adaptiveColor = pickAdaptiveTextColor({
        theme,
        backgroundColor: computedStyle.backgroundColor,
        computedColor: computedStyle.color,
        inheritedColor,
      });

      if (adaptiveColor) {
        element.style.color = adaptiveColor;
      }
    }

    if (index < elements.length) {
      taskId = scheduleIdleTask(runChunk);
    }
  };

  taskId = scheduleIdleTask(runChunk);

  return () => {
    cancelled = true;
    if (taskId !== null) {
      cancelIdleTask(taskId);
      taskId = null;
    }
  };
};

export const useDocumentTheme = () => {
  const [theme, setTheme] = useState<PreviewTheme>(() => getDocumentTheme());

  useEffect(() => {
    setTheme(getDocumentTheme());
    const themeRoot = document.documentElement;
    if (!themeRoot || themeRoot.nodeType !== Node.ELEMENT_NODE) return undefined;

    const observer = new MutationObserver(() => {
      setTheme(getDocumentTheme());
    });

    observer.observe(themeRoot, {
      attributeFilter: ['data-theme'],
      attributes: true,
    });

    return () => observer.disconnect();
  }, []);

  return theme;
};

const isDynamicModuleLoadError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
    message,
  );
};

export const isClipboardWriteError = (error: unknown) => {
  if (error instanceof DOMException) {
    return (
      error.name === 'NotAllowedError' ||
      error.name === 'SecurityError' ||
      error.name === 'NotSupportedError'
    );
  }
  const message = error instanceof Error ? error.message : String(error);
  return /clipboard|permission|denied|gesture|not allowed|not supported|document is not focused/i.test(
    message,
  );
};

export const getScreenshotCopyErrorMessage = (error: unknown, fallback: string) => {
  if (isDynamicModuleLoadError(error)) {
    return '截图组件加载失败，请刷新后重试';
  }
  if (isClipboardWriteError(error)) {
    return '浏览器没有授予剪贴板写入权限，请保持页面聚焦后重试。';
  }
  if (error instanceof Error && /[\u4e00-\u9fff]/.test(error.message)) {
    return error.message;
  }
  return fallback;
};
