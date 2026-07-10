import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { OssAiSettingsDialog, type OssAiSettings } from './OssAiSettingsDialog';
import { OssBrandCluster } from './OssBrandCluster';
import { OssDialog } from './OssDialog';
import { OssPreview } from './OssPreview';
import { detectOssDocument } from './ossDocument';
import './oss-shell.css';

type Locale = 'zh' | 'en';
type Theme = 'light' | 'dark';
type WorkspaceMode = 'final' | 'source';

const COPY_RESET_MS = 1800;
const LOCALE_KEY = 'morndraft.oss.locale';
const THEME_KEY = 'morndraft.oss.theme';

const SAMPLES: Record<Locale, string> = {
  zh: `# MornDraft 开源版

在左侧编辑源码，在右侧检查最终交付效果。

\`\`\`mermaid
flowchart LR
  Agent[Agent 生成] --> Review[人工审核]
  Review --> Deliver[复制与交付]
\`\`\`

\`\`\`json
{"edition":"open-source","storage":"local"}
\`\`\`

\`\`\`html
<!doctype html><html><body style="font-family:system-ui;padding:24px"><button id="demo">安全沙箱中的 HTML</button><script>document.querySelector('#demo').onclick=()=>alert('运行在隔离 iframe 中')</script></body></html>
\`\`\``,
  en: `# MornDraft Open Source

Edit source on the left and review the final deliverable on the right.

\`\`\`mermaid
flowchart LR
  Agent[Agent output] --> Review[Human review]
  Review --> Deliver[Copy and deliver]
\`\`\`

\`\`\`json
{"edition":"open-source","storage":"local"}
\`\`\`

\`\`\`html
<!doctype html><html><body style="font-family:system-ui;padding:24px"><button id="demo">HTML in a safe sandbox</button><script>document.querySelector('#demo').onclick=()=>alert('Running inside an isolated iframe')</script></body></html>
\`\`\``,
};

const readPreference = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
  if (typeof window === 'undefined') return fallback;
  const value = window.localStorage.getItem(key) as T | null;
  return value && allowed.includes(value) ? value : fallback;
};

const copyText = async (value: string) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('copy_failed');
};

const downloadSource = (source: string) => {
  const detected = detectOssDocument(source);
  const extension = { html: 'html', json: 'json', markdown: 'md', mermaid: 'mmd' }[detected.kind];
  const payload = detected.kind === 'markdown' ? source : detected.content;
  const url = URL.createObjectURL(new Blob([payload], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `morndraft-source.${extension}`;
  link.click();
  URL.revokeObjectURL(url);
};

export const OssShell: React.FC = () => {
  const [locale, setLocale] = useState<Locale>(() => readPreference(LOCALE_KEY, ['zh', 'en'], 'zh'));
  const [theme, setTheme] = useState<Theme>(() => readPreference(THEME_KEY, ['light', 'dark'], 'light'));
  const [source, setSource] = useState(() => SAMPLES[locale]);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('final');
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isAiSettingsOpen, setIsAiSettingsOpen] = useState(false);
  const [aiSettings, setAiSettings] = useState<OssAiSettings | null>(null);

  const labels = useMemo(() => locale === 'zh' ? {
    final: '最终效果', source: '源码', copy: '复制源码', copied: '已复制', copyError: '复制失败',
    download: '下载源码', theme: '主题', language: '语言', light: '浅色', dark: '深色',
    about: '关于', ai: 'AI 配置', editor: '源码编辑器', preview: '最终预览',
  } : {
    final: 'Final', source: 'Source', copy: 'Copy source', copied: 'Copied', copyError: 'Copy failed',
    download: 'Download source', theme: 'Theme', language: 'Language', light: 'Light', dark: 'Dark',
    about: 'About', ai: 'AI settings', editor: 'Source editor', preview: 'Final preview',
  }, [locale]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
    window.localStorage.setItem(LOCALE_KEY, locale);
  }, [locale]);

  const handleCopy = useCallback(async () => {
    try {
      await copyText(source);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
    window.setTimeout(() => setCopyState('idle'), COPY_RESET_MS);
  }, [source]);

  return (
    <div className="oss-app" data-build-profile="oss" data-oss-shell="public">
      <header className="oss-header">
        <OssBrandCluster />
        <div className="oss-mode-switch" role="group" aria-label={locale === 'zh' ? '工作区模式' : 'Workspace mode'}>
          <button type="button" aria-pressed={workspaceMode === 'source'} onClick={() => setWorkspaceMode('source')}>{labels.source}</button>
          <button type="button" aria-pressed={workspaceMode === 'final'} onClick={() => setWorkspaceMode('final')}>{labels.final}</button>
        </div>
        <nav className="oss-actions" aria-label={locale === 'zh' ? '工作区操作' : 'Workspace actions'}>
          <button type="button" onClick={() => void handleCopy()}>
            {copyState === 'copied' ? labels.copied : copyState === 'error' ? labels.copyError : labels.copy}
          </button>
          <button type="button" onClick={() => downloadSource(source)}>{labels.download}</button>
          <button type="button" onClick={() => setIsAiSettingsOpen(true)}>{labels.ai}</button>
          <label>
            <span className="sr-only">{labels.language}</span>
            <select value={locale} onChange={(event) => setLocale(event.target.value as Locale)} aria-label={labels.language}>
              <option value="zh">中文</option>
              <option value="en">English</option>
            </select>
          </label>
          <label>
            <span className="sr-only">{labels.theme}</span>
            <select value={theme} onChange={(event) => setTheme(event.target.value as Theme)} aria-label={labels.theme}>
              <option value="light">{labels.light}</option>
              <option value="dark">{labels.dark}</option>
            </select>
          </label>
          <button type="button" onClick={() => setIsAboutOpen(true)}>{labels.about}</button>
        </nav>
      </header>

      <main className="oss-workspace" data-workspace-mode={workspaceMode}>
        <section className="oss-editor-panel" aria-label={labels.editor}>
          <div className="oss-panel-title">{labels.source}</div>
          <textarea
            aria-label={labels.editor}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={source}
            onChange={(event) => setSource(event.target.value)}
          />
        </section>
        <section className="oss-preview-panel" aria-label={labels.preview}>
          <div className="oss-panel-title">{labels.final}</div>
          <div className="oss-preview-scroll">
            <OssPreview source={source} theme={theme} locale={locale} />
          </div>
        </section>
      </main>

      <OssDialog
        isOpen={isAboutOpen}
        labelledBy="oss-about-title"
        onClose={() => setIsAboutOpen(false)}
      >
        <h2 id="oss-about-title">MornDraft Open Source</h2>
        <p>{locale === 'zh'
          ? '一个纯本地的 Agent 产物编辑、预览与交付工作区。内容不会由本应用上传到 MornDraft 服务。'
          : 'A local-first workspace for editing, previewing, and delivering Agent output. This app does not upload content to MornDraft services.'}</p>
        <button data-oss-dialog-initial-focus type="button" onClick={() => setIsAboutOpen(false)}>{locale === 'zh' ? '关闭' : 'Close'}</button>
      </OssDialog>

      <OssAiSettingsDialog
        initialSettings={aiSettings}
        isOpen={isAiSettingsOpen}
        locale={locale}
        onClose={() => setIsAiSettingsOpen(false)}
        onSave={setAiSettings}
      />
      <p className="sr-only" role="status" aria-live="polite">
        {copyState === 'copied' ? labels.copied : copyState === 'error' ? labels.copyError : ''}
      </p>
    </div>
  );
};

export default OssShell;
