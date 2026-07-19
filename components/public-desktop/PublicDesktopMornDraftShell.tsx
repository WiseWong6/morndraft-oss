import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Code2, FileCheck, Upload } from 'lucide-react';
import { TextSearchControl, type TextSearchState } from '@morndraft/features-personal';
import { TRANSLATIONS, getSampleEntries, loadSampleSource, type Locale, type SampleKey } from '../../i18n';
import type { OssReleaseAdapters } from '../../apps/web-oss/src/releaseAdapters';
import { useArtifactDocumentAnalysis } from '../../hooks/useArtifactDocumentAnalysis';
import { usePreviewSourcePatchEcho } from '../../hooks/usePreviewSourcePatchEcho';
import type { MornDraftReleaseConfig } from '../../utils/releaseConfigTypes';
import Editor from '../Editor';
import { OssMoreMenu } from '../OssMoreMenu';
import { OssSyntaxSamplesMenu } from '../OssSyntaxSamplesMenu';
import { WorkspaceBrandMark } from '../WorkspaceBrandMark';
import {
  buildEditorImportContentFromDropData,
  type EditorImportDropData,
} from '../editor/editorImport';
import { createLocalEditorImportImageAssetResolver } from '../editor/editorImportLocalAssets';
import { useEditorImportDropZone } from '../editor/useEditorImportDropZone';
import { createPublicAllOpenDeliveryAccess } from '../preview/deliveryAccess';
import { usePreviewDeliveryDisplayOptions } from '../preview/PreviewDeliveryDisplayControls';
import { getPreviewTextSearchLabels } from '../preview/previewToolbarText';
import { PublicComplianceFooter } from '../public-workspace/PublicComplianceFooter';
import { PublicDeliveryToolbar } from '../public-workspace/PublicDeliveryToolbar';
import { PublicDialog } from '../public-workspace/PublicDialog';
import { PublicSharedFinalPreview } from './PublicSharedFinalPreview';
import './public-desktop.css';

type PublicDesktopView = {
  adapters: OssReleaseAdapters;
  documentEpoch: number;
  documentTitle: string;
  locale: Locale;
  releaseConfig: MornDraftReleaseConfig;
  source: string;
  theme: 'light' | 'dark';
  themeMode: 'light' | 'dark' | 'system';
  onDocumentImport(source: string, suggestedTitle?: string): void;
  onLocaleChange(locale: Locale): void;
  onSourceChange(source: string): void;
  onThemeChange(theme: 'light' | 'dark' | 'system'): void;
};

const getLabels = (locale: Locale) => locale === 'zh'
  ? {
      about: '纯浏览器运行的 Agent 产物编辑、预览与本地交付工作区。',
      close: '关闭',
      final: 'Final',
      import: '本地导入',
      importing: '正在导入…',
      source: 'Source',
      drop: '松开即可导入文件、文本或 URL',
    }
  : {
      about: 'A browser-only workspace for editing, previewing, and locally delivering agent output.',
      close: 'Close',
      final: 'Final',
      import: 'Local import',
      importing: 'Importing…',
      source: 'Source',
      drop: 'Drop files, text, or a URL to import',
    };

export const PublicDesktopMornDraftShell: React.FC<{ view: Record<string, any> }> = ({
  view: rawView,
}) => {
  const view = rawView as PublicDesktopView;
  const {
    adapters,
    documentEpoch,
    documentTitle,
    locale,
    releaseConfig,
    source,
    theme,
    themeMode,
    onDocumentImport,
    onLocaleChange,
    onSourceChange,
    onThemeChange,
  } = view;
  const labels = getLabels(locale);
  const t = TRANSLATIONS[locale];
  const deliveryAccess = useMemo(() => createPublicAllOpenDeliveryAccess(), []);
  const previewRootRef = useRef<HTMLDivElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [mode, setMode] = useState<'source' | 'final'>('final');
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importNotice, setImportNotice] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const { handleEditorChange, handlePreviewSourcePatch, previewSourcePatchEcho } =
    usePreviewSourcePatchEcho({
      previewSource: source,
      setCode: onSourceChange,
      flushPreviewSource: onSourceChange,
    });
  const artifactAnalysis = useArtifactDocumentAnalysis(source, handleEditorChange, onSourceChange);
  const localImageResolver = useMemo(() => createLocalEditorImportImageAssetResolver(), []);
  const {
    deliveryDisplayOptions,
    toggleDeliveryA4Pagination,
    toggleDeliveryCodeChrome,
  } = usePreviewDeliveryDisplayOptions();
  const [previewSearchState, setPreviewSearchState] = useState<TextSearchState | null>(null);
  const textSearchLabels = useMemo(() => getPreviewTextSearchLabels(t.preview), [t]);
  const handleTextSearchNavigate = useCallback(() => {
    // Scrolling is driven by the highlight effect inside the shared preview.
  }, []);

  const importDropData = useCallback(async (dropData: EditorImportDropData) => {
    setIsImporting(true);
    setImportNotice(null);
    try {
      const files = dropData.files ? Array.from(dropData.files as ArrayLike<File>) : [];
      const nextSource = await buildEditorImportContentFromDropData(dropData, {
        resolveImageAsset: localImageResolver,
      });
      onDocumentImport(nextSource, files[0]?.name);
      setMode('final');
      setImportNotice({ tone: 'success', text: locale === 'zh' ? '本地导入完成' : 'Local import complete' });
    } catch (error) {
      setImportNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : (locale === 'zh' ? '导入失败' : 'Import failed'),
      });
    } finally {
      setIsImporting(false);
    }
  }, [localImageResolver, locale, onDocumentImport]);
  const { dropZoneProps, isDragActive } = useEditorImportDropZone({
    onImportDrop: (dropData) => void importDropData(dropData),
  });
  const sampleEntries = useMemo(() => getSampleEntries(locale), [locale]);
  const loadSample = useCallback((key: SampleKey) => {
    void loadSampleSource(locale, key, releaseConfig.mornDraftComponentScope)
      .then((nextSource) => {
        onDocumentImport(nextSource);
        setMode('final');
      })
      .catch((error) => {
        setImportNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Failed to load sample.' });
      });
  }, [locale, onDocumentImport, releaseConfig.mornDraftComponentScope]);
  const brandSlot = (
    <WorkspaceBrandMark isDarkTheme={theme === 'dark'} />
  );
  const modeSwitch = (
    <button
      type="button"
      className="aad-workspace-mode-switch is-final"
      data-testid="oss-workspace-mode-toggle"
      onClick={() => setMode('source')}
      title={t.preview.switchToSource}
      aria-label={t.preview.switchToSource}
    >
      <span className="aad-workspace-mode-segment" aria-hidden="true">
        <Code2 size={14} />
      </span>
      <span className="aad-workspace-mode-segment is-active" aria-hidden="true">
        <FileCheck size={14} />
      </span>
    </button>
  );

  return (
    <main
      className="aad-commercial-workspace-shell is-public-workspace md-oss-shared-shell"
      data-commercial-workspace-mode={mode}
      data-public-workspace="true"
      data-shared-desktop-shell="true"
      {...dropZoneProps}
    >
      {isDragActive && (
        <div className="aad-final-import-overlay md-oss-drop-overlay" aria-hidden="true">
          <span>{labels.drop}</span>
        </div>
      )}
      {importNotice && (
        <div className={`aad-editor-floating-toast aad-editor-import-toast aad-editor-import-toast-${importNotice.tone}`} role="status">
          {importNotice.text}
        </div>
      )}
      <div className="md-oss-workspace" style={{ display: mode === 'source' ? 'flex' : 'none' }}>
        <Editor
          value={source}
          brandSlot={brandSlot}
          deliveryAccess={deliveryAccess}
          diagnostics={artifactAnalysis.diagnostics}
          fixes={artifactAnalysis.fixes}
          fixApplyVersion={artifactAnalysis.fixApplyVersion}
          isAuthenticated
          lastAppliedFix={artifactAnalysis.lastAppliedFix}
          locale={locale}
          onBeginFixReview={artifactAnalysis.beginFixReview}
          onCancelFixReview={artifactAnalysis.cancelFixReview}
          onChange={handleEditorChange}
          onConfirmFixReview={artifactAnalysis.confirmFixReview}
          onImportComplete={({ content, suggestedTitle }) => {
            onDocumentImport(content, suggestedTitle);
            setMode('final');
          }}
          onUndoLastFix={artifactAnalysis.undoLastFix}
          onWorkspaceModeToggle={() => setMode('final')}
          pendingFixReview={artifactAnalysis.pendingFixReview}
          t={t.editor}
          workspaceModeSwitchLabel={labels.final}
        />
      </div>
      <div
        ref={previewRootRef}
        className={`md-oss-workspace md-oss-final-workspace aad-preview-shell ${deliveryDisplayOptions.includeA4Pagination ? 'is-a4-paginated' : ''} ${deliveryDisplayOptions.includeCodeChrome ? '' : 'hide-code-chrome'}`.replace(/\s+/g, ' ').trim()}
        style={{ display: mode === 'final' ? 'flex' : 'none' }}
      >
        <header className="aad-toolbar md-oss-shared-toolbar">
          <div className="aad-workspace-title-tools md-oss-shared-toolbar-group">
            {brandSlot}
            <button
              type="button"
              className="aad-icon-button aad-toolbar-icon-button"
              disabled={isImporting}
              title={isImporting ? labels.importing : labels.import}
              aria-label={isImporting ? labels.importing : labels.import}
              onClick={() => importInputRef.current?.click()}
            >
              <Upload size={14} />
            </button>
            <input
              ref={importInputRef}
              className="sr-only md-public-file-input"
              type="file"
              multiple
              onChange={(event) => {
                const files = event.currentTarget.files;
                event.currentTarget.value = '';
                if (files?.length) void importDropData({ files });
              }}
            />
            {modeSwitch}
            <span className="aad-toolbar-title">{t.preview.title}</span>
            <div className="aad-preview-title-search">
              <TextSearchControl
                value={source}
                labels={textSearchLabels}
                onNavigate={handleTextSearchNavigate}
                onSearchStateChange={setPreviewSearchState}
              />
            </div>
          </div>
          <div className="aad-preview-toolbar-actions md-oss-shared-toolbar-actions">
            <OssSyntaxSamplesMenu locale={locale} onLoadSample={loadSample} sampleEntries={sampleEntries} />
            <PublicDeliveryToolbar
              adapter={adapters.delivery}
              documentEpoch={documentEpoch}
              getPreviewRoot={() => previewRootRef.current?.querySelector<HTMLElement>('[data-public-preview-root="true"]') ?? null}
              locale={locale}
              source={source}
              theme={theme}
              title={documentTitle}
            />
            <OssMoreMenu
              locale={locale}
              onAboutOpen={() => setIsAboutOpen(true)}
              onLocaleChange={onLocaleChange}
              onThemeModeChange={(next) => onThemeChange(next)}
              releaseConfig={releaseConfig}
              themeMode={themeMode}
            />
          </div>
        </header>
        <PublicSharedFinalPreview
          deliveryAccess={deliveryAccess}
          deliveryDisplayOptions={deliveryDisplayOptions}
          diagnostics={artifactAnalysis.diagnostics}
          lastAppliedFix={artifactAnalysis.lastAppliedFix}
          mornDraftComponentScope={releaseConfig.mornDraftComponentScope}
          onBeginFixReview={artifactAnalysis.beginFixReview}
          onCancelFixReview={artifactAnalysis.cancelFixReview}
          onConfirmFixReview={artifactAnalysis.confirmFixReview}
          onPatch={handlePreviewSourcePatch}
          onToggleA4Pagination={toggleDeliveryA4Pagination}
          onToggleCodeChrome={toggleDeliveryCodeChrome}
          onUndoLastFix={artifactAnalysis.undoLastFix}
          pendingFixReview={artifactAnalysis.pendingFixReview}
          searchState={previewSearchState}
          source={source}
          sourcePatchEcho={previewSourcePatchEcho}
          stateResetKey={`public:${documentEpoch}`}
          t={t}
          theme={theme}
        />
        <PublicComplianceFooter />
      </div>
      <PublicDialog
        className="md-public-about-dialog"
        isOpen={isAboutOpen}
        labelledBy="oss-about-title"
        onClose={() => setIsAboutOpen(false)}
      >
        <h2 id="oss-about-title">MornDraft</h2>
        <p>{labels.about}</p>
        <button type="button" className="aad-action-button" onClick={() => setIsAboutOpen(false)}>
          {labels.close}
        </button>
      </PublicDialog>
    </main>
  );
};
