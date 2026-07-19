import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Copy, Loader2, Share2 } from 'lucide-react';
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

type DeliveryMenuKind = 'copy' | 'export';

const MENU_ACTIONS: Record<DeliveryMenuKind, readonly DeliveryAction[]> = {
  copy: ['copyImage'],
  export: ['downloadImage', 'downloadPdf', 'downloadHtml'],
};

const MENU_SIDE_MARGIN_PX = 8;

const getLabels = (locale: PublicWorkspaceLocale) => locale === 'zh' ? {
  copyMenu: '复制', exportMenu: '导出',
  copyImage: '复制图片', downloadImage: '下载 PNG', downloadPdf: '下载 PDF', downloadHtml: '下载 HTML',
  working: '正在生成…', success: '本地交付已完成', failed: '无法生成交付产物，请检查预览内容后重试。', unavailable: '最终预览尚未准备好。',
} : {
  copyMenu: 'Copy', exportMenu: 'Export',
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
  const [activeMenu, setActiveMenu] = useState<DeliveryMenuKind | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number; maxWidth: number } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const copyButtonRef = useRef<HTMLButtonElement | null>(null);
  const exportButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuLayerRef = useRef<HTMLDivElement | null>(null);
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

  const closeMenu = useCallback(() => {
    setActiveMenu(null);
    setMenuPosition(null);
  }, []);

  const getMenuPosition = useCallback((menu: DeliveryMenuKind) => {
    if (typeof window === 'undefined') return null;
    const button = menu === 'copy' ? copyButtonRef.current : exportButtonRef.current;
    if (!button) return null;
    const rect = button.getBoundingClientRect();
    const right = Math.max(MENU_SIDE_MARGIN_PX, Math.round(window.innerWidth - rect.right));
    return {
      top: Math.round(rect.bottom),
      right,
      maxWidth: Math.max(1, Math.round(window.innerWidth - right - MENU_SIDE_MARGIN_PX)),
    };
  }, []);

  const toggleMenu = useCallback((menu: DeliveryMenuKind) => {
    if (activeMenu === menu) {
      closeMenu();
      return;
    }
    setMenuPosition(getMenuPosition(menu));
    setActiveMenu(menu);
  }, [activeMenu, closeMenu, getMenuPosition]);

  useEffect(() => {
    if (!activeMenu) return undefined;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      if (menuLayerRef.current?.contains(target)) return;
      closeMenu();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
    };
    const updateMenuPosition = () => {
      const position = getMenuPosition(activeMenu);
      if (position) setMenuPosition(position);
    };
    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [activeMenu, closeMenu, getMenuPosition]);

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

  const availableActions = (Object.keys(ACTION_TEST_IDS) as DeliveryAction[]).filter((action) => Boolean(adapter[action]));
  if (availableActions.length === 0) return null;
  const menus = (Object.keys(MENU_ACTIONS) as DeliveryMenuKind[])
    .map((menu) => ({ menu, actions: MENU_ACTIONS[menu].filter((action) => availableActions.includes(action)) }))
    .filter(({ actions }) => actions.length > 0);

  const runFromMenu = (action: DeliveryAction) => {
    closeMenu();
    void run(action);
  };

  const renderMenuButton = (menu: DeliveryMenuKind) => {
    const isCopy = menu === 'copy';
    const isBusy = busyAction !== null && MENU_ACTIONS[menu].includes(busyAction);
    const label = isCopy ? labels.copyMenu : labels.exportMenu;
    return (
      <button
        ref={isCopy ? copyButtonRef : exportButtonRef}
        type="button"
        className={`aad-action-button ${isCopy ? 'aad-preview-copy-button' : 'aad-preview-share-button'} ${isBusy ? 'is-loading' : ''}`.trim()}
        aria-haspopup="menu"
        aria-expanded={activeMenu === menu}
        aria-label={label}
        title={label}
        onClick={() => toggleMenu(menu)}
      >
        {isBusy
          ? <Loader2 size={14} className="animate-spin" />
          : isCopy ? <Copy size={14} /> : <Share2 size={14} />}
        <span>{label}</span>
        <ChevronDown size={12} className="aad-action-chevron" />
      </button>
    );
  };

  const renderMenuLayer = () => {
    if (!activeMenu || !menuPosition || typeof document === 'undefined') return null;
    const menu = menus.find(({ menu: kind }) => kind === activeMenu);
    if (!menu) return null;
    const style: React.CSSProperties = {
      position: 'fixed',
      top: menuPosition.top,
      right: menuPosition.right,
      maxWidth: menuPosition.maxWidth,
      zIndex: 70,
    };
    return createPortal(
      <div
        ref={menuLayerRef}
        className={`aad-toolbar-menu aad-preview-toolbar-menu-portal ${activeMenu === 'copy' ? 'aad-toolbar-menu--copy' : 'aad-toolbar-menu--share'}`}
        role="menu"
        style={style}
        data-preview-toolbar-menu-layer="top"
      >
        {menu.actions.map((action) => (
          <button
            key={action}
            type="button"
            role="menuitem"
            className="aad-toolbar-menu-item"
            data-testid={ACTION_TEST_IDS[action]}
            disabled={busyAction !== null}
            onClick={() => runFromMenu(action)}
          >
            {busyAction === action && <Loader2 size={14} className="animate-spin" />}
            <span>{busyAction === action ? labels.working : labels[action]}</span>
          </button>
        ))}
      </div>,
      document.body,
    );
  };

  return (
    <div
      ref={rootRef}
      className="md-public-delivery md-public-delivery-menus"
      aria-label={locale === 'zh' ? '本地交付' : 'Local delivery'}
    >
      {menus.map(({ menu }) => (
        <div key={menu} className="aad-toolbar-menu-wrapper">
          {renderMenuButton(menu)}
        </div>
      ))}
      {renderMenuLayer()}
      {status && typeof document !== 'undefined' && createPortal(
        <div
          className={`aad-editor-floating-toast aad-editor-import-toast aad-editor-import-toast-${status.kind}`}
          role={status.kind === 'error' ? 'alert' : 'status'}
        >
          {status.kind === 'success' && <Check size={13} />}
          <span>{status.text}</span>
        </div>,
        document.body,
      )}
    </div>
  );
};
