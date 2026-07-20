import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PublicDesktopMornDraftShell as DesktopMornDraftShell } from '../../../components/public-desktop/PublicDesktopMornDraftShell';
import { getInitialLocale, TRANSLATIONS, type Locale } from '../../../i18n';
import { derivePublicImportedDocumentTitle } from '../../../components/public-workspace/publicDocumentTitle';
import { createOssReleaseAdapters } from './releaseAdapters';
import { OSS_RELEASE_CONFIG } from './ossReleaseConfig';
import './shared-desktop.css';
import './release.css';

const LOCALE_KEY = 'morndraft.oss.locale';
const THEME_KEY = 'morndraft.oss.theme';

type MornDraftThemeMode = 'light' | 'dark';

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
  const releaseConfig = OSS_RELEASE_CONFIG;
  const [locale, setLocale] = useState<Locale>(() => readPreference(LOCALE_KEY, ['zh', 'en'], getInitialLocale()));
  const [themeMode, setThemeMode] = useState<MornDraftThemeMode>(() => readPreference(THEME_KEY, ['light', 'dark'], 'light'));
  const [source, setSource] = useState(() => adapters.persistence.readInitialSource());
  const [importedFileTitle, setImportedFileTitle] = useState<string | undefined>(undefined);
  const [documentEpoch, setDocumentEpoch] = useState(0);
  const documentTitle = useMemo(
    () => derivePublicImportedDocumentTitle(source, locale, importedFileTitle),
    [importedFileTitle, locale, source],
  );
  const theme = themeMode;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try { window.localStorage.setItem(THEME_KEY, themeMode); } catch { /* Browser storage may be unavailable. */ }
  }, [theme, themeMode]);

  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
    document.title = TRANSLATIONS[locale].documentTitle;
    try { window.localStorage.setItem(LOCALE_KEY, locale); } catch { /* Browser storage may be unavailable. */ }
  }, [locale]);

  const handleDocumentImport = useCallback((next: string, suggestedTitle?: string) => {
    setSource(next);
    setImportedFileTitle(suggestedTitle);
    setDocumentEpoch((value) => value + 1);
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
      <DesktopMornDraftShell
        view={{
          adapters,
          documentEpoch,
          documentTitle,
          locale,
          onDocumentImport: handleDocumentImport,
          onLocaleChange: setLocale,
          onSourceChange: setSource,
          onThemeChange: setThemeMode,
          releaseConfig,
          source,
          theme,
          themeMode,
        }}
      />
    </div>
  );
};

export default PublicAppImpl;
