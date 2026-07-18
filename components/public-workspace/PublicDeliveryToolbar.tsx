import React, { useEffect, useRef, useState } from 'react';
import { getPublicContentType } from './publicDocument';
import type {
  PublicDeliveryAdapter,
  PublicDeliveryInput,
  PublicWorkspaceLocale,
  PublicWorkspaceTheme,
} from './types';

type PublicDeliveryToolbarProps = {
  adapter: PublicDeliveryAdapter;
  source: string;
  documentEpoch: number;
  locale: PublicWorkspaceLocale;
  theme: PublicWorkspaceTheme;
  title: string;
  getPreviewRoot(): HTMLElement | null;
};

type DeliveryAction = 'copyImage' | 'downloadImage' | 'downloadPdf' | 'downloadHtml';

const getLabels = (locale: PublicWorkspaceLocale) => locale === 'zh' ? {
  copyImage: '复制图片', downloadImage: '下载 PNG', downloadPdf: '下载 PDF', downloadHtml: '下载 HTML',
  working: '正在生成…', success: '本地交付已完成', failed: '无法生成交付产物，请检查预览内容后重试。', unavailable: '最终预览尚未准备好。',
} : {
  copyImage: 'Copy image', downloadImage: 'Download PNG', downloadPdf: 'Download PDF', downloadHtml: 'Download HTML',
  working: 'Generating…', success: 'Local delivery complete', failed: 'Unable to create the deliverable. Check the preview and try again.', unavailable: 'Final preview is not ready.',
};

const ACTION_TEST_IDS: Record<DeliveryAction, string> = {
  copyImage: 'oss-delivery-copy-image',
  downloadImage: 'oss-delivery-download-png',
  downloadPdf: 'oss-delivery-download-pdf',
  downloadHtml: 'oss-delivery-download-html',
};

const ENGLISH_DELIVERY_ERRORS: Record<string, string> = {
  'capture-not-ready': 'The final preview is not ready. No incomplete file was created.',
  'capture-too-large': 'This preview exceeds the browser-safe image size. Download HTML instead.',
  'capture-failed': 'The browser could not capture every preview resource. No incomplete file was created.',
  'clipboard-unavailable': 'Image copy failed. Use “Download PNG” instead.',
  'download-unavailable': 'The browser could not create the local download. Please try again.',
  'invalid-png': 'The clipboard image is not a valid PNG.',
};

export const getPublicDeliveryErrorMessage = (
  error: unknown,
  fallback: string,
  locale: PublicWorkspaceLocale = 'zh',
) => {
  if (locale === 'en' && error && typeof error === 'object' && 'code' in error) {
    const code = String((error as { code?: unknown }).code ?? '');
    if (ENGLISH_DELIVERY_ERRORS[code]) return ENGLISH_DELIVERY_ERRORS[code];
  }
  if (locale === 'en') return fallback;
  return error instanceof Error && error.message.trim() ? error.message : fallback;
};

const waitForPaint = (root: HTMLElement, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const view = root.ownerDocument.defaultView;
  if (!view) {
    resolve();
    return;
  }
  const handles: { fallbackTimer?: number; firstFrame?: number; secondFrame?: number } = {};
  let settled = false;
  const finish = (error?: Error) => {
    if (settled) return;
    settled = true;
    if (handles.firstFrame !== undefined) view.cancelAnimationFrame(handles.firstFrame);
    if (handles.secondFrame !== undefined) view.cancelAnimationFrame(handles.secondFrame);
    if (handles.fallbackTimer !== undefined) view.clearTimeout(handles.fallbackTimer);
    signal?.removeEventListener('abort', abort);
    if (error) reject(error);
    else resolve();
  };
  const abort = () => finish(new Error('文档已变化，已取消旧的交付任务。'));
  if (signal?.aborted) {
    abort();
    return;
  }
  signal?.addEventListener('abort', abort, { once: true });
  handles.firstFrame = view.requestAnimationFrame(() => {
    handles.secondFrame = view.requestAnimationFrame(() => finish());
  });
  // requestAnimationFrame can be suspended indefinitely in a background tab.
  handles.fallbackTimer = view.setTimeout(() => finish(), 250);
});

export const waitForPublicPreviewRender = async (
  root: HTMLElement,
  timeoutMs = 20_000,
  signal?: AbortSignal,
) => {
  const view = root.ownerDocument.defaultView;
  if (!view?.MutationObserver) throw new Error('当前环境无法确认预览是否渲染完成。');

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      view.clearTimeout(timeout);
      observer.disconnect();
      signal?.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve();
    };
    const abort = () => finish(new Error('文档已变化，已取消旧的交付任务。'));
    const check = () => {
      if (!root.isConnected) {
        finish(new Error('预览已切换，请重新生成交付产物。'));
        return;
      }
      if (root.querySelector('[data-public-render-state="error"]')) {
        finish(new Error('预览渲染失败，未生成不完整的交付产物。'));
        return;
      }
      if (!root.querySelector('[data-public-render-state="pending"]')) finish();
    };
    const observer = new view.MutationObserver(check);
    const timeout = view.setTimeout(
      () => finish(new Error('等待预览渲染超时，未生成不完整的交付产物。')),
      timeoutMs,
    );
    observer.observe(root, { attributes: true, childList: true, subtree: true });
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener('abort', abort, { once: true });
    check();
  });

  await waitForPaint(root, signal);
  if (root.querySelector('[data-public-render-state="pending"], [data-public-render-state="error"]')) {
    throw new Error('预览尚未完成，未生成不完整的交付产物。');
  }
};

export const PublicDeliveryToolbar: React.FC<PublicDeliveryToolbarProps> = ({
  adapter,
  source,
  documentEpoch,
  locale,
  theme,
  title,
  getPreviewRoot,
}) => {
  const labels = getLabels(locale);
  const [busyAction, setBusyAction] = useState<DeliveryAction | null>(null);
  const [status, setStatus] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const documentEpochRef = useRef(documentEpoch);
  const sourceRef = useRef(source);
  const themeRef = useRef(theme);
  const titleRef = useRef(title);
  const actionGenerationRef = useRef(0);
  const actionAbortRef = useRef<AbortController | null>(null);
  documentEpochRef.current = documentEpoch;
  sourceRef.current = source;
  themeRef.current = theme;
  titleRef.current = title;

  useEffect(() => {
    actionGenerationRef.current += 1;
    actionAbortRef.current?.abort();
    actionAbortRef.current = null;
    setBusyAction(null);
    setStatus(null);
  }, [documentEpoch, source, theme, title]);

  useEffect(() => () => {
    actionGenerationRef.current += 1;
    actionAbortRef.current?.abort();
    actionAbortRef.current = null;
  }, []);

  useEffect(() => {
    if (!status) return undefined;
    const timer = window.setTimeout(() => setStatus(null), 2400);
    return () => window.clearTimeout(timer);
  }, [status]);

  const run = async (action: DeliveryAction) => {
    const handler = adapter[action];
    if (!handler || busyAction) return;
    const previewRoot = getPreviewRoot();
    if (!previewRoot) {
      setStatus({ kind: 'error', text: labels.unavailable });
      return;
    }
    const requestedDocumentEpoch = documentEpochRef.current;
    const requestedSource = sourceRef.current;
    const requestedTheme = themeRef.current;
    const requestedTitle = titleRef.current;
    const generation = actionGenerationRef.current + 1;
    actionGenerationRef.current = generation;
    actionAbortRef.current?.abort();
    const controller = new AbortController();
    actionAbortRef.current = controller;
    const assertCurrent = () => {
      if (
        controller.signal.aborted ||
        actionGenerationRef.current !== generation ||
        documentEpochRef.current !== requestedDocumentEpoch ||
        sourceRef.current !== requestedSource ||
        themeRef.current !== requestedTheme ||
        titleRef.current !== requestedTitle
      ) {
        throw new Error('文档已变化，已取消旧的交付任务。');
      }
    };
    const input: PublicDeliveryInput = {
      previewRoot,
      source: requestedSource,
      contentType: getPublicContentType(requestedSource),
      theme: requestedTheme,
      title: requestedTitle,
      assertCurrent,
      signal: controller.signal,
      ensureRendered: async () => {
        assertCurrent();
        await waitForPublicPreviewRender(previewRoot, 20_000, controller.signal);
        assertCurrent();
      },
    };
    setBusyAction(action);
    setStatus(null);
    try {
      await handler(input);
      assertCurrent();
      setStatus({ kind: 'success', text: labels.success });
    } catch (error) {
      const canReportFailure = actionGenerationRef.current === generation && !controller.signal.aborted;
      if (canReportFailure) {
        setStatus({ kind: 'error', text: getPublicDeliveryErrorMessage(error, labels.failed, locale) });
      }
      // Clipboard APIs may reject synchronously while their ClipboardItem PNG
      // promise is still capturing in the background. Abort before releasing
      // the ref so that failed actions cannot accumulate detached canvases.
      if (!controller.signal.aborted) controller.abort(error);
    } finally {
      if (actionGenerationRef.current === generation) {
        actionAbortRef.current = null;
        setBusyAction(null);
      }
    }
  };

  const actions = (Object.keys(ACTION_TEST_IDS) as DeliveryAction[]).filter((action) => Boolean(adapter[action]));
  if (actions.length === 0) return null;

  return (
    <div className="md-public-delivery" aria-label={locale === 'zh' ? '本地交付' : 'Local delivery'}>
      {actions.map((action) => (
        <button
          key={action}
          type="button"
          data-testid={ACTION_TEST_IDS[action]}
          disabled={busyAction !== null}
          onClick={() => void run(action)}
        >
          {busyAction === action ? labels.working : labels[action]}
        </button>
      ))}
      {status && <span className={status.kind === 'error' ? 'md-public-inline-error' : ''} role={status.kind === 'error' ? 'alert' : 'status'}>{status.text}</span>}
    </div>
  );
};
