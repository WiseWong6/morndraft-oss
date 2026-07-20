import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckCircle2,
  ChevronDown,
  Globe,
  Info,
  Palette,
  Settings2,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type { Locale } from '../i18n';
import type { MornDraftReleaseConfig } from '../utils/releaseConfigTypes';

type MornDraftThemeMode = 'dark' | 'light';
import {
  getPublicAiSettingsSaveErrorKind,
  savePublicAiSettings,
} from '@morndraft/features-personal/ai';
import {
  clearOssAiConfig,
  DEFAULT_OSS_AI_CONFIG,
  getOssAiRequestOrigin,
  OSS_AI_CONFIG_REQUEST_EVENT,
  OSS_AI_DEEPSEEK_PRESET,
  OSS_AI_MODEL_PLACEHOLDERS,
  readOssAiConfig,
  type OssAiConfig,
  type OssAiModelRole,
} from '../utils/ossAiConfig';

type OssMoreMenuProps = {
  locale: Locale;
  onAboutOpen: () => void;
  onLocaleChange: (locale: Locale) => void;
  onThemeModeChange: (mode: MornDraftThemeMode) => void;
  releaseConfig: MornDraftReleaseConfig;
  themeMode: MornDraftThemeMode;
  buttonLabel?: string;
};

type MoreMenuPosition = {
  top: number;
  maxWidth: number;
  right: number;
};

const AI_MODEL_ROLES = ['generate', 'modify', 'summarize'] satisfies OssAiModelRole[];
const MORE_MENU_SIDE_MARGIN_PX = 8;
// TEMP: AI 配置入口临时下线（恢复时改回 true）。
const OSS_AI_CONFIG_ENTRY_ENABLED = false;

const cloneDefaultOssAiConfig = (): OssAiConfig => ({
  ...DEFAULT_OSS_AI_CONFIG,
  models: { ...DEFAULT_OSS_AI_CONFIG.models },
});

const readButtonPaddingPx = (button: HTMLButtonElement, side: 'right') => {
  if (typeof window === 'undefined') return 0;
  const value = window.getComputedStyle(button)[side === 'right' ? 'paddingRight' : 'paddingLeft'];
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getNextThemeMode = (mode: MornDraftThemeMode): MornDraftThemeMode => (
  mode === 'light' ? 'dark' : 'light'
);

const getMoreLabels = (locale: Locale) => {
  const zh = locale === 'zh';
  return {
    aiConfig: zh ? 'AI 配置' : 'AI config',
    about: zh ? '关于' : 'About',
    apiKey: zh ? 'API Key' : 'API Key',
    apiKeyPlaceholder: zh
      ? '默认仅保存在当前会话，关闭标签页后清空。'
      : 'Session-only by default and cleared after this tab closes.',
    baseUrl: zh ? 'Base URL（OpenAI）' : 'Base URL (OpenAI)',
    cleared: zh ? '已清除' : 'Cleared',
    clear: zh ? '清除' : 'Clear',
    close: zh ? '关闭' : 'Close',
    deepSeekPreset: zh ? '使用 DeepSeek 预设' : 'Use DeepSeek preset',
    invalidUrl: zh ? 'Base URL 必须使用 HTTPS；仅 localhost 可使用 HTTP。' : 'Base URL must use HTTPS; only localhost may use HTTP.',
    required: zh ? '请填写 Base URL、API Key 和三个模型。' : 'Enter a Base URL, API Key, and all three models.',
    storage: zh ? '浏览器拒绝保存设置，请允许本页面使用本地存储后重试。' : 'The browser blocked settings storage. Allow site storage and try again.',
    language: zh ? '语言' : 'Language',
    model: {
      generate: zh ? '生成模型' : 'Generate model',
      modify: zh ? '修改模型' : 'Modify model',
      summarize: zh ? '总结模型' : 'Summarize model',
    } satisfies Record<OssAiModelRole, string>,
    more: zh ? '更多' : 'More',
    persistApiKey: zh ? '在此浏览器长期保存 API Key' : 'Persist API Key in this browser',
    requestOrigin: zh ? '请求将发送到' : 'Requests will be sent to',
    saved: zh ? '已保存' : 'Saved',
    save: zh ? '保存' : 'Save',
    theme: zh ? '主题' : 'Theme',
  };
};

const getThemeLabel = (locale: Locale, mode: MornDraftThemeMode) => {
  if (locale === 'zh') {
    return mode === 'light' ? '浅色' : '深色';
  }
  return mode === 'light' ? 'Light' : 'Dark';
};

export const OssMoreMenu: React.FC<OssMoreMenuProps> = ({
  locale,
  onAboutOpen,
  onLocaleChange,
  onThemeModeChange,
  releaseConfig,
  themeMode,
  buttonLabel,
}) => {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuLayerRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MoreMenuPosition | null>(null);
  const [isAiConfigDialogOpen, setIsAiConfigDialogOpen] = useState(false);
  const [aiConfig, setAiConfig] = useState<OssAiConfig>(() => cloneDefaultOssAiConfig());
  const [aiToast, setAiToast] = useState<{ id: number; kind: 'error' | 'success'; text: string } | null>(null);
  const labels = getMoreLabels(locale);
  // TEMP: AI 配置入口临时下线（恢复时改回 true）；release 契约保持
  // showOssAiConfig: true 不变，仅在 UI 层隐藏入口。
  const showAiConfigEntry = releaseConfig.showOssAiConfig && OSS_AI_CONFIG_ENTRY_ENABLED;

  useEffect(() => {
    if (!showAiConfigEntry) return;
    setAiConfig(readOssAiConfig());
  }, [showAiConfigEntry]);

  const closeMenu = useCallback(() => {
    setIsOpen(false);
    setMenuPosition(null);
  }, []);

  const getMenuPosition = useCallback((): MoreMenuPosition | null => {
    if (typeof window === 'undefined') return null;
    const button = buttonRef.current;
    if (!button) return null;
    const rect = button.getBoundingClientRect();
    const right = Math.max(
      MORE_MENU_SIDE_MARGIN_PX,
      Math.round(window.innerWidth - (rect.right - readButtonPaddingPx(button, 'right'))),
    );
    return {
      top: Math.round(rect.bottom),
      maxWidth: Math.max(1, Math.round(window.innerWidth - right - MORE_MENU_SIDE_MARGIN_PX)),
      right,
    };
  }, []);

  const updateMenuPosition = useCallback(() => {
    if (!isOpen) return;
    setMenuPosition(getMenuPosition());
  }, [getMenuPosition, isOpen]);

  const toggleMenu = useCallback(() => {
    if (isOpen) {
      closeMenu();
      return;
    }
    setMenuPosition(getMenuPosition());
    setAiToast(null);
    setIsOpen(true);
  }, [closeMenu, getMenuPosition, isOpen]);

  const openAiConfigDialog = useCallback(() => {
    setAiConfig(readOssAiConfig());
    setAiToast(null);
    closeMenu();
    setIsAiConfigDialogOpen(true);
  }, [closeMenu]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (wrapperRef.current?.contains(target)) return;
      if (menuLayerRef.current?.contains(target)) return;
      closeMenu();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
    };
    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeMenu, isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [isOpen, updateMenuPosition]);

  useEffect(() => {
    if (!isAiConfigDialogOpen) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsAiConfigDialogOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAiConfigDialogOpen]);

  useEffect(() => {
    if (!showAiConfigEntry) return undefined;
    window.addEventListener(OSS_AI_CONFIG_REQUEST_EVENT, openAiConfigDialog);
    return () => window.removeEventListener(OSS_AI_CONFIG_REQUEST_EVENT, openAiConfigDialog);
  }, [openAiConfigDialog, showAiConfigEntry]);

  useEffect(() => {
    if (!aiToast) return undefined;
    const timer = window.setTimeout(() => setAiToast(null), 2000);
    return () => window.clearTimeout(timer);
  }, [aiToast]);

  const closeThenRun = (callback: () => void) => {
    closeMenu();
    callback();
  };

  const showAiConfigToast = useCallback((text: string, kind: 'error' | 'success' = 'success') => {
    setAiToast({ id: Date.now(), kind, text });
  }, []);

  const updateAiConfig = useCallback((next: Partial<Omit<OssAiConfig, 'models'>> & {
    models?: Partial<OssAiConfig['models']>;
  }) => {
    setAiToast(null);
    setAiConfig((current) => ({
      ...current,
      ...next,
      models: next.models ? { ...current.models, ...next.models } : current.models,
    }));
  }, []);

  const handleSaveAiConfig = () => {
    try {
      const saved = savePublicAiSettings(aiConfig);
      setAiConfig(saved);
      showAiConfigToast(labels.saved);
    } catch (error) {
      const errorKind = getPublicAiSettingsSaveErrorKind(error);
      showAiConfigToast(
        errorKind === 'storage_error' ? labels.storage : errorKind === 'required' ? labels.required : labels.invalidUrl,
        'error',
      );
    }
  };

  const handleClearAiConfig = () => {
    try {
      clearOssAiConfig();
      setAiConfig(cloneDefaultOssAiConfig());
      showAiConfigToast(labels.cleared);
    } catch {
      showAiConfigToast(labels.storage, 'error');
    }
  };

  const renderAiConfigFields = () => (
    <div className="aad-header-ai-fields">
      <label className="aad-header-ai-field">
        <span>{labels.baseUrl}</span>
        <input
          value={aiConfig.baseUrl}
          onChange={(event) => updateAiConfig({ baseUrl: event.currentTarget.value })}
          placeholder="https://api.example.com/v1"
          spellCheck={false}
        />
      </label>
      <button
        type="button"
        className="aad-action-button aad-header-ai-preset"
        onClick={() => updateAiConfig(OSS_AI_DEEPSEEK_PRESET)}
      >
        {labels.deepSeekPreset}
      </button>
      {getOssAiRequestOrigin(aiConfig.baseUrl) && (
        <p className="aad-header-ai-origin">{labels.requestOrigin}: <strong>{getOssAiRequestOrigin(aiConfig.baseUrl)}</strong></p>
      )}
      <label className="aad-header-ai-field">
        <span>{labels.apiKey}</span>
        <input
          type="password"
          value={aiConfig.apiKey}
          onChange={(event) => updateAiConfig({ apiKey: event.currentTarget.value })}
          placeholder={labels.apiKeyPlaceholder}
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <label className="aad-header-ai-persist">
        <input
          type="checkbox"
          checked={aiConfig.persistApiKey}
          onChange={(event) => updateAiConfig({ persistApiKey: event.currentTarget.checked })}
        />
        <span>{labels.persistApiKey}</span>
      </label>
      {AI_MODEL_ROLES.map((role) => (
        <label key={role} className="aad-header-ai-field">
          <span>{labels.model[role]}</span>
          <input
            value={aiConfig.models[role]}
            onChange={(event) => updateAiConfig({
              models: { [role]: event.currentTarget.value } as Partial<OssAiConfig['models']>,
            })}
            placeholder={OSS_AI_MODEL_PLACEHOLDERS[role]}
            spellCheck={false}
          />
        </label>
      ))}
    </div>
  );

  const renderMoreMenu = () => {
    if (!isOpen || !menuPosition || typeof document === 'undefined') return null;
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
        className="aad-toolbar-menu aad-preview-toolbar-menu-portal aad-oss-more-menu"
        role="menu"
        aria-label={labels.more}
        style={style}
        data-oss-more-menu-layer="top"
      >
        <button
          type="button"
          className="aad-toolbar-menu-item aad-oss-more-row"
          role="menuitem"
          onClick={() => closeThenRun(onAboutOpen)}
        >
          <Info size={14} aria-hidden="true" />
          <span>{labels.about}</span>
        </button>
        <button
          type="button"
          className="aad-toolbar-menu-item aad-oss-more-row"
          role="menuitem"
          aria-label={`${labels.language}: ${locale === 'zh' ? '中文' : 'English'}`}
          onClick={() => closeThenRun(() => onLocaleChange(locale === 'zh' ? 'en' : 'zh'))}
        >
          <Globe size={14} aria-hidden="true" />
          <span>{locale === 'zh' ? '中文' : 'English'}</span>
        </button>
        <button
          type="button"
          className="aad-toolbar-menu-item aad-oss-more-row"
          role="menuitem"
          aria-label={`${labels.theme}: ${getThemeLabel(locale, themeMode)}`}
          onClick={() => closeThenRun(() => onThemeModeChange(getNextThemeMode(themeMode)))}
        >
          <Palette size={14} aria-hidden="true" />
          <span>{getThemeLabel(locale, themeMode)}</span>
        </button>
        {showAiConfigEntry && (
          <button
            type="button"
            className="aad-toolbar-menu-item aad-oss-more-row"
            role="menuitem"
            aria-label={labels.aiConfig}
            onClick={openAiConfigDialog}
          >
            <Sparkles size={14} aria-hidden="true" />
            <span>{labels.aiConfig}</span>
          </button>
        )}
      </div>,
      document.body,
    );
  };

  const renderAiConfigDialog = () => {
    if (!showAiConfigEntry || !isAiConfigDialogOpen || typeof document === 'undefined') return null;
    const titleId = 'aad-oss-more-ai-config-title';
    return createPortal(
      <div
        className="aad-header-ai-dialog-backdrop"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) setIsAiConfigDialogOpen(false);
        }}
      >
        <section
          className="aad-header-ai-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <header className="aad-header-ai-dialog-header">
            <div>
              <h2 id={titleId}>{labels.aiConfig}</h2>
            </div>
            <button
              type="button"
              className="aad-header-ai-dialog-close"
              onClick={() => setIsAiConfigDialogOpen(false)}
              aria-label={labels.close}
            >
              <X size={16} />
            </button>
          </header>
          <div className="aad-header-ai-dialog-body">
            {renderAiConfigFields()}
          </div>
          <footer className="aad-header-ai-dialog-actions">
            <button type="button" className="aad-action-button aad-header-ai-save" onClick={handleSaveAiConfig}>
              <span>{labels.save}</span>
            </button>
            <button type="button" className="aad-action-button" onClick={handleClearAiConfig}>
              <Trash2 size={14} />
              <span>{labels.clear}</span>
            </button>
          </footer>
        </section>
      </div>,
      document.body,
    );
  };

  const renderAiConfigToast = () => {
    if (!aiToast || typeof document === 'undefined') return null;
    return createPortal(
      <div
        className="aad-editor-floating-toast aad-editor-applied-fix-toast aad-header-ai-toast"
        role={aiToast.kind === 'error' ? 'alert' : 'status'}
      >
        {aiToast.kind === 'error' ? <X size={13} /> : <CheckCircle2 size={13} />}
        <span>{aiToast.text}</span>
      </div>,
      document.body,
    );
  };

  return (
    <div className="aad-toolbar-menu-wrapper aad-oss-more-menu-wrapper" ref={wrapperRef}>
      <button
        ref={buttonRef}
        type="button"
        className="aad-action-button aad-preview-more-button"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={labels.more}
        title={labels.more}
        onClick={toggleMenu}
      >
        <Settings2 size={14} />
        <span>{buttonLabel ?? labels.more}</span>
        <ChevronDown size={12} className="aad-action-chevron" />
      </button>
      {renderMoreMenu()}
      {renderAiConfigDialog()}
      {renderAiConfigToast()}
    </div>
  );
};
