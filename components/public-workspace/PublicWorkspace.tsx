import React, { useCallback, useMemo, useRef, useState } from 'react';
import { PublicDialog } from './PublicDialog';
import { PublicFinalPreview } from './PublicFinalPreview';
import { PublicSourceEditor } from './PublicSourceEditor';
import { PUBLIC_IMPORT_ACCEPT, PublicImportError } from './publicImport';
import { getPublicFlatInsertEntries, getPublicSyntaxEntries } from './publicShowcase';
import { usePublicWorkspaceController } from './publicWorkspaceController';
import type {
  PublicSyntaxEntry,
  PublicWorkspaceLocale,
  PublicWorkspaceProps,
  PublicWorkspaceTheme,
  SourceChangeMeta,
} from './types';
import './public-workspace.css';

const getLabels = (locale: PublicWorkspaceLocale) => locale === 'zh' ? {
  source: '源码',
  final: '最终效果',
  sourceEditor: '源码编辑器',
  import: '本地导入',
  importing: '正在导入…',
  importDone: '已完成本地导入',
  importFailed: '导入失败',
  syntax: '语法',
  more: '更多',
  language: '语言',
  theme: '主题',
  light: '浅色',
  dark: '深色',
  about: '关于',
  close: '关闭',
  aboutText: '纯浏览器运行的 Agent 产物编辑、预览与本地交付工作区。',
  drop: '松开即可从本地导入',
} : {
  source: 'Source',
  final: 'Final',
  sourceEditor: 'Source editor',
  import: 'Local import',
  importing: 'Importing…',
  importDone: 'Local import complete',
  importFailed: 'Import failed',
  syntax: 'Syntax',
  more: 'More',
  language: 'Language',
  theme: 'Theme',
  light: 'Light',
  dark: 'Dark',
  about: 'About',
  close: 'Close',
  aboutText: 'A browser-only workspace for editing, previewing, and locally delivering Agent output.',
  drop: 'Drop to import from this device',
};

const resolveSyntaxSource = async (entry: PublicSyntaxEntry) => (
  typeof entry.source === 'function' ? entry.source() : entry.source
);

export const PublicWorkspace: React.FC<PublicWorkspaceProps> = ({
  source,
  documentEpoch,
  onSourceChange,
  importAdapter,
  locale = 'zh',
  theme = 'light',
  syntaxEntries,
  flatInsertEntries: providedFlatInsertEntries,
  initialMode = 'final',
  title = 'MornDraft',
  finalRenderer: CustomFinalRenderer,
  onLocaleChange,
  onThemeChange,
  onAboutOpen,
}) => {
  const labels = getLabels(locale);
  const entries = syntaxEntries ?? getPublicSyntaxEntries(locale);
  const flatInsertEntries = useMemo(
    () => providedFlatInsertEntries ?? getPublicFlatInsertEntries(),
    [providedFlatInsertEntries],
  );
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [importState, setImportState] = useState<{ kind: 'idle' | 'busy' | 'done' | 'error'; message?: string }>({ kind: 'idle' });
  const forwardSourceChange = useCallback((next: string, meta?: SourceChangeMeta) => {
    if (!meta) return;
    setImportState(current => current.kind === 'busy' ? { kind: 'idle' } : current);
    onSourceChange(next, meta);
  }, [onSourceChange]);
  const workspaceController = usePublicWorkspaceController<SourceChangeMeta>({
    source,
    settledSource: source,
    documentKey: `public:${documentEpoch}`,
    documentRevision: documentEpoch,
    initialMode,
    onCommitSource: forwardSourceChange,
    onCommitFinal: forwardSourceChange,
  });
  const {
    beginAsyncReplacement,
    commitAsyncSourceReplacement,
    commitFinal,
    commitSource,
    finalWorkspaceSnapshot,
    isAsyncReplacementCurrent,
    mode,
    setMode,
  } = workspaceController;
  const workspaceClassName = useMemo(() => (
    `md-public-workspace md-public-workspace--${theme}${isDragging ? ' is-dragging' : ''}`
  ), [isDragging, theme]);

  const handleSourceChange = useCallback((next: string, meta: SourceChangeMeta) => {
    if (meta.origin === 'final') {
      commitFinal(next, meta);
      return;
    }
    commitSource(next, meta);
  }, [commitFinal, commitSource]);

  const importFiles = async (files: readonly File[]) => {
    if (files.length === 0) return;
    const operation = beginAsyncReplacement();
    setImportState({ kind: 'busy' });
    try {
      const imported = await importAdapter.importFiles(files);
      if (!commitAsyncSourceReplacement(
        operation,
        imported.source,
        { origin: 'import', resetDocument: true },
      )) return;
      setMode('final');
      setImportState({ kind: 'done', message: labels.importDone });
    } catch (error) {
      if (!isAsyncReplacementCurrent(operation)) return;
      const message = error instanceof PublicImportError || error instanceof Error
        ? error.message
        : labels.importFailed;
      setImportState({ kind: 'error', message });
    }
  };

  const loadSyntax = async (entry: PublicSyntaxEntry) => {
    const operation = beginAsyncReplacement();
    setImportState(current => current.kind === 'busy' ? { kind: 'idle' } : current);
    try {
      const next = await resolveSyntaxSource(entry);
      if (!commitAsyncSourceReplacement(
        operation,
        next,
        { origin: 'syntax', resetDocument: true },
      )) return;
      setMode('final');
    } catch {
      if (!isAsyncReplacementCurrent(operation)) return;
      setImportState({ kind: 'error', message: labels.importFailed });
    }
  };

  const openAbout = () => {
    if (onAboutOpen) {
      onAboutOpen();
      return;
    }
    setIsAboutOpen(true);
  };
  const closeAbout = useCallback(() => setIsAboutOpen(false), []);

  return (
    <div
      className={workspaceClassName}
      data-public-workspace="true"
      data-workspace-mode={mode}
      data-theme={theme}
      onDragEnter={(event) => {
        if (event.dataTransfer.types.includes('Files')) setIsDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragging(false);
      }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        void importFiles(Array.from(event.dataTransfer.files));
      }}
    >
      <header className="md-public-toolbar">
        <strong className="md-public-title">{title}</strong>
        <div className="md-public-mode-switch" role="group" aria-label={locale === 'zh' ? '工作区模式' : 'Workspace mode'}>
          <button type="button" aria-pressed={mode === 'source'} onClick={() => setMode('source')}>{labels.source}</button>
          <button type="button" aria-pressed={mode === 'final'} onClick={() => setMode('final')}>{labels.final}</button>
        </div>
        <nav className="md-public-actions" aria-label={locale === 'zh' ? '公共工作区操作' : 'Public workspace actions'}>
          <button type="button" disabled={importState.kind === 'busy'} onClick={() => inputRef.current?.click()}>
            {importState.kind === 'busy' ? labels.importing : labels.import}
          </button>
          <input
            ref={inputRef}
            className="md-public-file-input"
            type="file"
            accept={PUBLIC_IMPORT_ACCEPT}
            multiple
            onChange={(event) => {
              const files = Array.from(event.currentTarget.files ?? []);
              event.currentTarget.value = '';
              void importFiles(files);
            }}
          />
          <details className="md-public-menu">
            <summary>{labels.syntax}</summary>
            <div role="menu" aria-label={labels.syntax}>
              {entries.map((entry) => (
                <button key={entry.id} type="button" role="menuitem" onClick={() => void loadSyntax(entry)}>{entry.label}</button>
              ))}
            </div>
          </details>
          <details className="md-public-menu md-public-menu--more">
            <summary>{labels.more}</summary>
            <div role="menu" aria-label={labels.more}>
              {onLocaleChange && (
                <label>
                  <span>{labels.language}</span>
                  <select value={locale} onChange={(event) => onLocaleChange(event.target.value as PublicWorkspaceLocale)}>
                    <option value="zh">中文</option>
                    <option value="en">English</option>
                  </select>
                </label>
              )}
              {onThemeChange && (
                <label>
                  <span>{labels.theme}</span>
                  <select value={theme} onChange={(event) => onThemeChange(event.target.value as PublicWorkspaceTheme)}>
                    <option value="light">{labels.light}</option>
                    <option value="dark">{labels.dark}</option>
                  </select>
                </label>
              )}
              <button type="button" role="menuitem" onClick={openAbout}>{labels.about}</button>
            </div>
          </details>
        </nav>
      </header>

      <main className="md-public-main">
        {mode === 'source' ? (
          <PublicSourceEditor
            key={`source-${documentEpoch}`}
            source={source}
            locale={locale}
            origin="source"
            flatInsertEntries={flatInsertEntries}
            ariaLabel={labels.sourceEditor}
            onSourceChange={handleSourceChange}
          />
        ) : CustomFinalRenderer ? (
          <CustomFinalRenderer
            source={finalWorkspaceSnapshot.source}
            documentEpoch={documentEpoch}
            locale={locale}
            theme={theme}
            onSourceChange={handleSourceChange}
          />
        ) : (
          <PublicFinalPreview
            source={finalWorkspaceSnapshot.source}
            documentEpoch={documentEpoch}
            locale={locale}
            theme={theme}
            onSourceChange={handleSourceChange}
          />
        )}
      </main>

      {isDragging && <div className="md-public-drop-overlay">{labels.drop}</div>}
      {importState.kind !== 'idle' && importState.kind !== 'busy' && (
        <p className={`md-public-status md-public-status--${importState.kind}`} role={importState.kind === 'error' ? 'alert' : 'status'}>
          {importState.message}
        </p>
      )}
      <PublicDialog
        isOpen={isAboutOpen}
        labelledBy="md-public-about-title"
        onClose={closeAbout}
      >
        <h2 id="md-public-about-title">MornDraft Open Source</h2>
        <p>{labels.aboutText}</p>
        <button type="button" data-public-dialog-initial-focus onClick={closeAbout}>{labels.close}</button>
      </PublicDialog>
    </div>
  );
};
