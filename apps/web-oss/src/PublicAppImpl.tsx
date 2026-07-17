import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  PublicDialog,
  PublicWorkspace,
  type PublicWorkspaceLocale,
  type PublicWorkspaceTheme,
  type SourceChangeMeta,
} from '../../../components/public-workspace';
import {
  PUBLIC_AI_CONFIG_REQUEST_EVENT,
  PublicAiSettingsForm,
  readPublicAiConfig,
  type PublicAiConfig,
} from '@morndraft/features-personal/ai';
import { createOssReleaseAdapters } from './releaseAdapters';
import './release.css';

const LOCALE_KEY = 'morndraft.oss.locale';
const THEME_KEY = 'morndraft.oss.theme';

const readPreference = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
  if (typeof window === 'undefined') return fallback;
  try {
    const value = window.localStorage.getItem(key) as T | null;
    return value && allowed.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
};

export const PublicAppImpl: React.FC = () => {
  const adapters = useMemo(() => createOssReleaseAdapters(), []);
  const [locale, setLocale] = useState<PublicWorkspaceLocale>(() => readPreference(LOCALE_KEY, ['zh', 'en'], 'zh'));
  const [theme, setTheme] = useState<PublicWorkspaceTheme>(() => readPreference(THEME_KEY, ['light', 'dark'], 'light'));
  const [source, setSource] = useState(() => adapters.persistence.readInitialSource());
  const [documentEpoch, setDocumentEpoch] = useState(0);
  const [isAiSettingsOpen, setIsAiSettingsOpen] = useState(false);
  const [aiConfig, setAiConfig] = useState<PublicAiConfig>(() => readPublicAiConfig());

  const openAiSettings = useCallback(() => {
    setAiConfig(readPublicAiConfig());
    setIsAiSettingsOpen(true);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try { window.localStorage.setItem(THEME_KEY, theme); } catch { /* Browser storage may be unavailable. */ }
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
    try { window.localStorage.setItem(LOCALE_KEY, locale); } catch { /* Browser storage may be unavailable. */ }
  }, [locale]);

  useEffect(() => {
    window.addEventListener(PUBLIC_AI_CONFIG_REQUEST_EVENT, openAiSettings);
    return () => window.removeEventListener(PUBLIC_AI_CONFIG_REQUEST_EVENT, openAiSettings);
  }, [openAiSettings]);

  const handleSourceChange = useCallback((next: string, meta: SourceChangeMeta) => {
    setSource(next);
    if (meta.resetDocument) setDocumentEpoch((value) => value + 1);
  }, []);

  return (
    <div
      className="oss-app"
      data-auth-mode={adapters.auth.mode}
      data-build-profile="oss-full"
      data-link-sharing-mode={adapters.linkSharing.mode}
      data-persistence-mode={adapters.persistence.mode}
      data-public-release-app="true"
      data-telemetry-mode={adapters.telemetry.mode}
    >
      <PublicWorkspace
        aiAdapter={adapters.ai}
        deliveryAdapter={adapters.delivery}
        documentEpoch={documentEpoch}
        importAdapter={adapters.import}
        locale={locale}
        source={source}
        theme={theme}
        title="MornDraft"
        onLocaleChange={setLocale}
        onAiSettingsOpen={openAiSettings}
        onSourceChange={handleSourceChange}
        onThemeChange={setTheme}
      />
      <PublicDialog
        className="md-public-ai-settings-dialog"
        isOpen={isAiSettingsOpen}
        labelledBy="oss-ai-settings-title"
        onClose={() => setIsAiSettingsOpen(false)}
      >
        <h2 id="oss-ai-settings-title">{locale === 'zh' ? 'AI 配置' : 'AI settings'}</h2>
        <PublicAiSettingsForm
          initialConfig={aiConfig}
          locale={locale}
          onCancel={() => setIsAiSettingsOpen(false)}
          onSave={(saved) => {
            setAiConfig(saved);
            setIsAiSettingsOpen(false);
          }}
        />
      </PublicDialog>
    </div>
  );
};

export default PublicAppImpl;
