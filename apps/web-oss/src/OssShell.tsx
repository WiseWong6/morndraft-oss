import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  PublicWorkspace,
  createLocalPublicImportAdapter,
  type PublicWorkspaceLocale,
  type PublicWorkspaceTheme,
  type SourceChangeMeta,
} from '../../../components/public-workspace';
import './oss-shell.css';

const LOCALE_KEY = 'morndraft.oss.locale';
const THEME_KEY = 'morndraft.oss.theme';

const INITIAL_SOURCE = `# MornDraft Open Source

Source 是唯一真相源；你可以在 Source 或 Final 修改内容。

\`\`\`json5
{
  // JSON5 支持注释、单引号和尾逗号
  edition: 'open-source',
  storage: 'browser-local',
}
\`\`\`

\`\`\`mermaid
flowchart LR
  Agent[Agent 生成] --> Review[人工审核]
  Review --> Deliver[本地交付]
\`\`\`

输入 \`/\` 可以插入 Markdown 表格和 MornDraft flat 组件。`;

const readPreference = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
  if (typeof window === 'undefined') return fallback;
  try {
    const value = window.localStorage.getItem(key) as T | null;
    return value && allowed.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
};

export const OssShell: React.FC = () => {
  const [locale, setLocale] = useState<PublicWorkspaceLocale>(() => readPreference(LOCALE_KEY, ['zh', 'en'], 'zh'));
  const [theme, setTheme] = useState<PublicWorkspaceTheme>(() => readPreference(THEME_KEY, ['light', 'dark'], 'light'));
  const [source, setSource] = useState(INITIAL_SOURCE);
  const [documentEpoch, setDocumentEpoch] = useState(0);
  const importAdapter = useMemo(() => createLocalPublicImportAdapter(), []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try { window.localStorage.setItem(THEME_KEY, theme); } catch { /* Browser storage may be unavailable. */ }
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
    try { window.localStorage.setItem(LOCALE_KEY, locale); } catch { /* Browser storage may be unavailable. */ }
  }, [locale]);

  const handleSourceChange = useCallback((next: string, meta: SourceChangeMeta) => {
    setSource(next);
    if (meta.resetDocument) setDocumentEpoch((value) => value + 1);
  }, []);

  return (
    <div className="oss-app" data-build-profile="oss" data-oss-shell="public">
      <PublicWorkspace
        documentEpoch={documentEpoch}
        importAdapter={importAdapter}
        locale={locale}
        source={source}
        theme={theme}
        title="MornDraft OSS"
        onLocaleChange={setLocale}
        onSourceChange={handleSourceChange}
        onThemeChange={setTheme}
      />

    </div>
  );
};

export default OssShell;
