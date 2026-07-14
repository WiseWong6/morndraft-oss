import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  PublicDialog,
  PublicWorkspace,
  createLocalPublicImportAdapter,
  type PublicDeliveryAdapter,
  type PublicDeliveryInput,
  type PublicWorkspaceLocale,
  type PublicWorkspaceTheme,
  type SourceChangeMeta,
} from '../../../components/public-workspace';
import {
  PUBLIC_AI_CONFIG_REQUEST_EVENT,
  PublicAiSettingsForm,
  createPublicAiAdapter,
  readPublicAiConfig,
  type PublicAiConfig,
} from '@morndraft/features-personal/ai';
import './oss-shell.css';

const LOCALE_KEY = 'morndraft.oss.locale';
const THEME_KEY = 'morndraft.oss.theme';

type PublicDeliveryAction = 'copyImage' | 'downloadImage' | 'downloadPdf' | 'downloadHtml';

const runPublicDeliveryAction = async (action: PublicDeliveryAction, input: PublicDeliveryInput) => {
  const { runBrowserPublicDeliveryAction } = await import('./publicDeliveryAdapter');
  await runBrowserPublicDeliveryAction(action, input);
};

const createLazyPublicDeliveryAdapter = (): PublicDeliveryAdapter => ({
  copyImage: (input) => runPublicDeliveryAction('copyImage', input),
  downloadImage: (input) => runPublicDeliveryAction('downloadImage', input),
  downloadPdf: (input) => runPublicDeliveryAction('downloadPdf', input),
  downloadHtml: (input) => runPublicDeliveryAction('downloadHtml', input),
});

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

输入 \`/\` 可以插入 Markdown 表格和 MornDraft flat 组件；输入 \`/AI\` 可以调用你配置的生成模型。`;

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
  const [isAiSettingsOpen, setIsAiSettingsOpen] = useState(false);
  const [aiConfig, setAiConfig] = useState<PublicAiConfig>(() => readPublicAiConfig());
  const importAdapter = useMemo(() => createLocalPublicImportAdapter(), []);
  const aiAdapter = useMemo(() => createPublicAiAdapter(), []);
  const deliveryAdapter = useMemo(() => createLazyPublicDeliveryAdapter(), []);

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
    <div className="oss-app" data-build-profile="oss" data-oss-shell="public">
      <PublicWorkspace
        aiAdapter={aiAdapter}
        deliveryAdapter={deliveryAdapter}
        documentEpoch={documentEpoch}
        importAdapter={importAdapter}
        locale={locale}
        source={source}
        theme={theme}
        title="MornDraft OSS"
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

export default OssShell;
