import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Check, ChevronDown, Copy, Loader2 } from 'lucide-react';
import type { ArtifactPreviewTranslations } from '../../i18n';
import { copyPlainText } from './clipboardWriters';

export type BlockCopyContentKind = 'code' | 'json' | 'html' | 'morndraft' | 'mermaid';

export type BlockHeaderCopyContextValue = {
  copyBlockImage?: (element: HTMLElement, contentKind: BlockCopyContentKind) => Promise<void> | void;
  copySource?: (text: string, contentKind: BlockCopyContentKind) => Promise<void> | void;
  copySvgSource?: (svg: string) => Promise<void> | void;
};

export const BlockHeaderCopyContext = React.createContext<BlockHeaderCopyContextValue | null>(null);

type BlockHeaderCopyActionTranslations = Pick<
  ArtifactPreviewTranslations,
  | 'copied'
  | 'copyFailed'
  | 'copyImageOption'
  | 'copyMenu'
  | 'copySourceOption'
  | 'copySvgCopied'
  | 'copySvgFailed'
  | 'copySvgOption'
  | 'generating'
>;

type BlockCopyMenuPosition = {
  top: number;
  right: number;
};

type BlockCopyFeedbackAction = 'image' | 'source' | 'svg';
type BlockCopyFeedbackStatus = 'idle' | 'loading' | 'success' | 'warning' | 'error';
type BlockCopyFeedback = {
  action: BlockCopyFeedbackAction | null;
  message: string | null;
  status: BlockCopyFeedbackStatus;
};

const COPY_MENU_SIDE_MARGIN_PX = 8;
const BLOCK_COPY_MIN_LOADING_MS = 320;
const BLOCK_COPY_MENU_OPEN_ATTR = 'data-block-copy-menu-open';

const waitForDelay = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });

const readButtonPaddingPx = (button: HTMLButtonElement, side: 'left' | 'right') => {
  if (typeof window === 'undefined') return 0;
  const value = window.getComputedStyle(button)[side === 'left' ? 'paddingLeft' : 'paddingRight'];
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const BlockHeaderCopyAction: React.FC<{
  className?: string;
  contentKind?: BlockCopyContentKind;
  imageDisabled?: boolean;
  svgText?: string | null;
  text: string;
  t?: BlockHeaderCopyActionTranslations;
}> = ({ className = '', contentKind = 'code', imageDisabled = false, svgText, text, t }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<BlockCopyMenuPosition | null>(null);
  const [feedback, setFeedback] = useState<BlockCopyFeedback>({
    action: null,
    message: null,
    status: 'idle',
  });
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const feedbackResetTimerRef = useRef<number | null>(null);
  const copyContext = React.useContext(BlockHeaderCopyContext);
  const canCopySource = Boolean(text.trim());
  const canCopyImage = Boolean(copyContext?.copyBlockImage && !imageDisabled);
  const canCopySvg = contentKind === 'mermaid' && Boolean(svgText?.trim());
  const label = t?.copyMenu ?? 'Copy';
  const sourceLabel = t?.copySourceOption ?? 'Source';
  const imageLabel = t?.copyImageOption ?? 'Image';
  const svgLabel = t?.copySvgOption ?? 'SVG';
  const generatingLabel = t?.generating ?? 'Copying...';
  const copiedLabel = t?.copied ?? 'Copied';
  const copyFailedLabel = t?.copyFailed ?? 'Copy failed';
  const isFeedbackBusy = feedback.status === 'loading';

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setMenuPosition(null);
  }, []);

  const clearFeedbackResetTimer = useCallback(() => {
    if (feedbackResetTimerRef.current !== null) {
      window.clearTimeout(feedbackResetTimerRef.current);
      feedbackResetTimerRef.current = null;
    }
  }, []);

  const queueFeedbackReset = useCallback((delayMs: number) => {
    clearFeedbackResetTimer();
    feedbackResetTimerRef.current = window.setTimeout(() => {
      setFeedback({ action: null, message: null, status: 'idle' });
      feedbackResetTimerRef.current = null;
    }, delayMs);
  }, [clearFeedbackResetTimer]);

  const setFeedbackState = useCallback((
    action: BlockCopyFeedbackAction,
    status: Exclude<BlockCopyFeedbackStatus, 'idle'>,
    message: string | null,
    resetDelayMs?: number,
  ) => {
    clearFeedbackResetTimer();
    setFeedback({ action, message, status });
    if (typeof resetDelayMs === 'number') queueFeedbackReset(resetDelayMs);
  }, [clearFeedbackResetTimer, queueFeedbackReset]);

  const getMenuPosition = useCallback((): BlockCopyMenuPosition | null => {
    if (typeof window === 'undefined') return null;
    const button = buttonRef.current;
    if (!button) return null;
    const rect = button.getBoundingClientRect();
    const top = Math.round(rect.bottom);
    // 右对齐到触发按钮内 ▾ 箭头的右边缘（箭头是按钮最后一个子元素，右 padding 即箭头右边距按钮右边）。
    const right = Math.max(
      COPY_MENU_SIDE_MARGIN_PX,
      Math.round(window.innerWidth - rect.right + readButtonPaddingPx(button, 'right')),
    );
    return { top, right };
  }, []);

  const updateMenuPosition = useCallback(() => {
    if (!menuOpen) return;
    setMenuPosition(getMenuPosition());
  }, [getMenuPosition, menuOpen]);

  useEffect(() => {
    const blockElement = wrapperRef.current?.closest<HTMLElement>('.aad-artifact-block');
    if (!blockElement) return undefined;
    if (menuOpen) blockElement.setAttribute(BLOCK_COPY_MENU_OPEN_ATTR, 'true');
    else blockElement.removeAttribute(BLOCK_COPY_MENU_OPEN_ATTR);
    return () => blockElement.removeAttribute(BLOCK_COPY_MENU_OPEN_ATTR);
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      if (wrapperRef.current?.contains(event.target as Node)) return;
      const target = event.target;
      if (target instanceof Element && target.closest('.aad-block-copy-menu')) return;
      closeMenu();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [closeMenu, menuOpen]);

  // 滚动或视口变化时重新定位；无法稳定重算时直接关闭，避免菜单脱离触发按钮。
  useEffect(() => {
    if (!menuOpen) return undefined;
    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [menuOpen, updateMenuPosition]);

  useEffect(() => () => clearFeedbackResetTimer(), [clearFeedbackResetTimer]);

  const stopMenuEvent = (event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleToggle = (event: React.MouseEvent<HTMLButtonElement>) => {
    stopMenuEvent(event);
    if (isFeedbackBusy) return;
    setMenuOpen((value) => {
      const next = !value;
      if (next) setMenuPosition(getMenuPosition());
      else setMenuPosition(null);
      return next;
    });
  };

  const getFeedbackSuccessMessage = useCallback((action: BlockCopyFeedbackAction) => {
    if (action === 'svg') return t?.copySvgCopied ?? copiedLabel;
    return copiedLabel;
  }, [copiedLabel, t?.copySvgCopied]);

  const getFeedbackErrorMessage = useCallback((action: BlockCopyFeedbackAction) => {
    if (action === 'svg') return t?.copySvgFailed ?? copyFailedLabel;
    return copyFailedLabel;
  }, [copyFailedLabel, t?.copySvgFailed]);

  const runCopyAction = useCallback(async (
    action: BlockCopyFeedbackAction,
    copy: () => Promise<void> | void,
    logLabel: string,
  ) => {
    const loadingStartedAt = Date.now();
    closeMenu();
    setFeedbackState(action, 'loading', generatingLabel);
    try {
      await copy();
      const remainingMs = BLOCK_COPY_MIN_LOADING_MS - (Date.now() - loadingStartedAt);
      if (remainingMs > 0) await waitForDelay(remainingMs);
      setFeedbackState(action, 'success', getFeedbackSuccessMessage(action), 1600);
    } catch (error) {
      setFeedbackState(action, 'error', getFeedbackErrorMessage(action), 4200);
      console.error(logLabel, error);
    }
  }, [
    closeMenu,
    generatingLabel,
    getFeedbackErrorMessage,
    getFeedbackSuccessMessage,
    setFeedbackState,
  ]);

  const handleCopySource = async (event: React.MouseEvent<HTMLButtonElement>) => {
    stopMenuEvent(event);
    if (!canCopySource || isFeedbackBusy) return;
    await runCopyAction('source', async () => {
      if (copyContext?.copySource) {
        await copyContext.copySource(text, contentKind);
      } else {
        await copyPlainText(text);
      }
    }, 'Failed to copy block text:');
  };

  const handleCopyImage = async (event: React.MouseEvent<HTMLButtonElement>) => {
    stopMenuEvent(event);
    if (!canCopyImage || isFeedbackBusy) return;
    const blockElement = wrapperRef.current?.closest<HTMLElement>('.aad-artifact-block');
    if (!blockElement) return;
    await runCopyAction('image', async () => {
      await copyContext?.copyBlockImage?.(blockElement, contentKind);
    }, 'Failed to copy block image:');
  };

  const handleCopySvg = async (event: React.MouseEvent<HTMLButtonElement>) => {
    stopMenuEvent(event);
    const svgSource = svgText?.trim() ?? '';
    if (!canCopySvg || !svgSource || isFeedbackBusy) return;
    await runCopyAction('svg', async () => {
      if (copyContext?.copySvgSource) {
        await copyContext.copySvgSource(svgSource);
      } else {
        await copyPlainText(svgSource);
      }
    }, 'Failed to copy Mermaid SVG source:');
  };

  const buttonTitle =
    feedback.status === 'loading'
      ? feedback.message ?? generatingLabel
      : feedback.status === 'success'
        ? feedback.message ?? copiedLabel
        : feedback.status === 'error' || feedback.status === 'warning'
          ? feedback.message ?? copyFailedLabel
          : label;
  const feedbackClass = feedback.status === 'idle' ? '' : `is-${feedback.status}`;
  const buttonIcon = feedback.status === 'loading'
    ? <Loader2 size={13} className="animate-spin" />
    : feedback.status === 'success'
      ? <Check size={13} />
      : feedback.status === 'error' || feedback.status === 'warning'
        ? <AlertCircle size={13} />
        : <Copy size={13} />;

  const menuLayer = menuOpen && menuPosition ? (
    <div
      className="aad-toolbar-menu aad-block-copy-menu aad-block-copy-menu-portal"
      role="menu"
      aria-label={label}
      style={{
        position: 'fixed',
        top: `${menuPosition.top}px`,
        right: `${menuPosition.right}px`,
        zIndex: 70,
      }}
      onClick={stopMenuEvent}
    >
      <button
        type="button"
        className="aad-toolbar-menu-item"
        role="menuitem"
        disabled={!canCopyImage || isFeedbackBusy}
        onClick={handleCopyImage}
      >
        <span>{imageLabel}</span>
      </button>
      <button
        type="button"
        className="aad-toolbar-menu-item"
        role="menuitem"
        disabled={!canCopySource || isFeedbackBusy}
        onClick={handleCopySource}
      >
        <span>{sourceLabel}</span>
      </button>
      {contentKind === 'mermaid' && (
        <button
          type="button"
          className="aad-toolbar-menu-item"
          role="menuitem"
          disabled={!canCopySvg || isFeedbackBusy}
          onClick={handleCopySvg}
        >
          <span>{svgLabel}</span>
        </button>
      )}
    </div>
  ) : null;

  return (
    <>
      <div
        ref={wrapperRef}
        className={`aad-block-copy-menu-wrapper ${className}`.trim()}
        data-copy-remove="true"
      >
        <button
          ref={buttonRef}
          type="button"
          className={`aad-block-copy-action ${feedbackClass}`.trim()}
          title={buttonTitle}
          aria-label={buttonTitle}
          aria-busy={isFeedbackBusy ? 'true' : undefined}
          disabled={isFeedbackBusy}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          onClick={handleToggle}
        >
          {buttonIcon}
          <span>{label}</span>
          <ChevronDown size={12} />
        </button>
      </div>
      {menuLayer && typeof document !== 'undefined' ? createPortal(menuLayer, document.body) : menuLayer}
    </>
  );
};
