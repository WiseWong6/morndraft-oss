import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
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
import { TextMetricsInline } from '../TextMetricsInline';
import { DiagnosticConsoleButton } from '../DiagnosticConsoleButton';
import { DiagnosticConsolePanel } from '../DiagnosticConsolePanel';
import { PreviewNavigationProvider } from '../preview/ErrorLineMeta';
import { usePreviewDiagnostics } from '../preview/usePreviewDiagnostics';
import {
  formatFinalSyntaxAiRepairError,
  getFinalSyntaxRepairDiagnosticFixId,
  requestFinalSyntaxAiRepair,
} from '../preview/finalSyntaxAiRepair';
import { getPublicAiSourceKindForContentType } from '@morndraft/features-personal/ai';
import { buildArtifactMap } from '@morndraft/core';
import type { ArtifactDiagnostic, ArtifactFixReview } from '../editor/diagnosticTypes';
import { copyPlainText, copyRichHtmlPayload } from '../preview/clipboardWriters';
import { detectArtifactContent } from '../../utils/content-detection.js';
import {
  DEFAULT_DESKTOP_EDITOR_WIDTH,
  clampDesktopEditorWidth,
  resolveDesktopEditorWidthBounds,
  type DesktopEditorWidthBounds,
} from '../../utils/desktopEditorWidth';
import { usePublicVisiblePreviewMetrics } from './usePublicVisiblePreviewMetrics';
import { PublicSharedFinalPreview } from './PublicSharedFinalPreview';
// Dialog/compliance styles live in public-workspace.css; PublicWorkspace is
// tree-shaken out of this shell, so the stylesheet must be imported here.
import '../public-workspace/public-workspace.css';
import './public-desktop.css';

type PublicDesktopView = {
  adapters: OssReleaseAdapters;
  documentEpoch: number;
  documentTitle: string;
  locale: Locale;
  releaseConfig: MornDraftReleaseConfig;
  source: string;
  theme: 'light' | 'dark';
  themeMode: 'light' | 'dark';
  onDocumentImport(source: string, suggestedTitle?: string): void;
  onLocaleChange(locale: Locale): void;
  onSourceChange(source: string): void;
  onThemeChange(theme: 'light' | 'dark'): void;
};

const getLabels = (locale: Locale) => locale === 'zh'
  ? {
      desktopNotice: '建议在桌面端使用完整编辑体验。',
      final: 'Final',
      import: '本地导入',
      importing: '正在导入…',
      source: 'Source',
      drop: '松开即可导入文件、文本或 URL',
    }
  : {
      desktopNotice: 'For the full editing experience, open MornDraft on a desktop.',
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
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importNotice, setImportNotice] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  // Split workspace reuses the established desktop editor width system
  // (default 420px, drag-resizable, preview keeps at least half).
  const [editorBounds, setEditorBounds] = useState<DesktopEditorWidthBounds>(() => (
    resolveDesktopEditorWidthBounds({
      draftSidebarWidth: 0,
      mainWidth: typeof window !== 'undefined' ? window.innerWidth : undefined,
    })
  ));
  const editorBoundsRef = useRef(editorBounds);
  editorBoundsRef.current = editorBounds;
  const [editorWidth, setEditorWidth] = useState(() => (
    clampDesktopEditorWidth(DEFAULT_DESKTOP_EDITOR_WIDTH, editorBoundsRef.current)
  ));
  useEffect(() => {
    setEditorWidth((currentWidth) => clampDesktopEditorWidth(currentWidth, editorBounds));
  }, [editorBounds]);
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleResize = () => {
      setEditorBounds(resolveDesktopEditorWidthBounds({
        draftSidebarWidth: 0,
        mainWidth: window.innerWidth,
      }));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const setClampedEditorWidth = useCallback((nextWidth: number) => {
    setEditorWidth(clampDesktopEditorWidth(nextWidth, editorBoundsRef.current));
  }, []);
  const isEditorDragging = useRef(false);
  const startEditorDrag = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    isEditorDragging.current = true;
    const startX = event.clientX;
    const startWidth = editorWidth || DEFAULT_DESKTOP_EDITOR_WIDTH;

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isEditorDragging.current) return;
      setClampedEditorWidth(startWidth + (moveEvent.clientX - startX));
    };
    const onMouseUp = () => {
      isEditorDragging.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [editorWidth, setClampedEditorWidth]);
  const sourcePaneStyle = useMemo(() => ({
    flex: '0 0 auto',
    flexBasis: editorWidth,
    maxWidth: editorWidth,
    minWidth: 0,
    width: editorWidth,
  } as React.CSSProperties), [editorWidth]);
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
  const [previewMetricsRoot, setPreviewMetricsRoot] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setPreviewMetricsRoot(previewRootRef.current?.querySelector<HTMLElement>('[data-public-preview-root="true"]') ?? null);
  }, [documentEpoch]);
  const previewMetrics = usePublicVisiblePreviewMetrics({
    enabled: Boolean(previewMetricsRoot),
    root: previewMetricsRoot,
  });
  const [renderDiagnostics, setRenderDiagnostics] = useState<readonly ArtifactDiagnostic[]>([]);
  const { updatePreviewDiagnostic } = usePreviewDiagnostics({
    resetKey: `${documentEpoch}`,
    sourceKey: source,
    onChange: (next) => setRenderDiagnostics(next),
  });
  const [isDiagnosticOpen, setIsDiagnosticOpen] = useState(false);
  const [diagnosticLineFocusRequest, setDiagnosticLineFocusRequest] = useState<{ line: number; requestId: number } | null>(null);
  const allDiagnostics = useMemo(
    () => [...artifactAnalysis.diagnostics, ...renderDiagnostics],
    [artifactAnalysis.diagnostics, renderDiagnostics],
  );
  const requestDiagnosticLineFocus = useCallback((line: number) => {
    setDiagnosticLineFocusRequest({ line, requestId: Date.now() });
  }, []);
  const [aiFixReview, setAiFixReview] = useState<ArtifactFixReview | null>(null);
  const [aiFixError, setAiFixError] = useState<string | null>(null);
  const [isAiFixBusy, setIsAiFixBusy] = useState(false);
  const handleRequestAiFix = useCallback(async (diagnostic: ArtifactDiagnostic) => {
    const fixId = getFinalSyntaxRepairDiagnosticFixId(diagnostic);
    if (fixId && artifactAnalysis.beginFixReview(fixId)) return;
    if (isAiFixBusy) return;
    setIsAiFixBusy(true);
    setAiFixError(null);
    const sourceSnapshot = source;
    try {
      const repaired = await requestFinalSyntaxAiRepair({
        diagnostic,
        enableOssAiProvider: true,
        source: sourceSnapshot,
        sourceKind: getPublicAiSourceKindForContentType(detectArtifactContent(sourceSnapshot).primaryType),
      });
      if (!repaired.source.trim() || repaired.source === sourceSnapshot) return;
      const errorLine = diagnostic.line ?? 1;
      const beforeLines = sourceSnapshot.split('\n')
        .slice(Math.max(0, errorLine - 2), errorLine + 2)
        .join('\n');
      setAiFixReview({
        id: `ai-fix:${diagnostic.id}:${Date.now()}`,
        mode: 'single',
        source: sourceSnapshot,
        nextSource: repaired.source,
        fixes: diagnostic.fix ? [diagnostic.fix] : [],
        previewLines: [{
          id: `ai-fix:${diagnostic.id}`,
          line: errorLine,
          labelZh: diagnostic.messageZh,
          labelEn: diagnostic.messageEn,
          before: beforeLines,
          after: repaired.source,
        }],
      });
    } catch (error) {
      setAiFixError(formatFinalSyntaxAiRepairError(error, t.preview.aiFixFailed));
    } finally {
      setIsAiFixBusy(false);
    }
  }, [artifactAnalysis, isAiFixBusy, source, t]);
  const effectivePendingFixReview = artifactAnalysis.pendingFixReview ?? aiFixReview;
  const handleConfirmFixReview = useCallback(() => {
    if (artifactAnalysis.pendingFixReview) {
      artifactAnalysis.confirmFixReview();
      return;
    }
    if (aiFixReview) {
      onSourceChange(aiFixReview.nextSource);
      setAiFixReview(null);
    }
  }, [aiFixReview, artifactAnalysis, onSourceChange]);
  const handleCancelFixReview = useCallback(() => {
    if (artifactAnalysis.pendingFixReview) {
      artifactAnalysis.cancelFixReview();
      return;
    }
    setAiFixReview(null);
  }, [artifactAnalysis]);
  const textSearchLabels = useMemo(() => getPreviewTextSearchLabels(t.preview), [t]);
  const artifactMapEntries = useMemo(
    () => buildArtifactMap(source).map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      level: entry.level,
      title: entry.title,
    })),
    [source],
  );
  const handleTextSearchNavigate = useCallback(() => {
    // Scrolling is driven by the highlight effect inside the shared preview.
  }, []);
  const handleCopyRichText = useCallback(async () => {
    const root = previewRootRef.current?.querySelector<HTMLElement>('[data-public-preview-root="true"]') ?? null;
    const target = root?.querySelector<HTMLElement>('.aad-document-surface') ?? root;
    if (!target) throw new Error('Final preview is not ready.');
    if (detectArtifactContent(source).primaryType === 'json') {
      await copyPlainText(source);
      return;
    }
    const { buildPreviewCopyPayload } = await import('../preview/portablePreviewPayload');
    const payload = await buildPreviewCopyPayload(target, theme);
    await copyRichHtmlPayload(Promise.resolve(payload));
  }, [source, theme]);

  const importDropData = useCallback(async (dropData: EditorImportDropData) => {
    setIsImporting(true);
    setImportNotice(null);
    try {
      const files = dropData.files ? Array.from(dropData.files as ArrayLike<File>) : [];
      const nextSource = await buildEditorImportContentFromDropData(dropData, {
        resolveImageAsset: localImageResolver,
      });
      onDocumentImport(nextSource, files[0]?.name);
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
      })
      .catch((error) => {
        setImportNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Failed to load sample.' });
      });
  }, [locale, onDocumentImport, releaseConfig.mornDraftComponentScope]);
  const brandSlot = (
    <WorkspaceBrandMark isDarkTheme={theme === 'dark'} />
  );

  return (
    <main
      className="aad-commercial-workspace-shell is-public-workspace md-oss-shared-shell"
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
      <p className="md-oss-desktop-notice" role="note">{labels.desktopNotice}</p>
      <div className="md-oss-workspace md-oss-source-workspace" style={sourcePaneStyle}>
        <Editor
          value={source}
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
          }}
          onUndoLastFix={artifactAnalysis.undoLastFix}
          pendingFixReview={artifactAnalysis.pendingFixReview}
          searchState={previewSearchState}
          t={t.editor}
        />
      </div>
      <div
        className="aad-resize-handle hidden md:block relative flex-shrink-0 group cursor-col-resize transition-colors"
        onMouseDown={startEditorDrag}
      />
      <div
        ref={previewRootRef}
        className={`md-oss-workspace md-oss-final-workspace aad-preview-shell ${deliveryDisplayOptions.includeA4Pagination ? 'is-a4-paginated' : ''} ${deliveryDisplayOptions.includeCodeChrome ? '' : 'hide-code-chrome'}`.replace(/\s+/g, ' ').trim()}
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
            <span className="aad-toolbar-title">{t.preview.title}</span>
            <TextMetricsInline
              compactCharacters={previewMetrics.compactCharacters}
              compactTokens={previewMetrics.compactTokens}
              metricsLabel={t.preview.metricsAria(previewMetrics.characters, previewMetrics.estimatedTokens)}
              charactersLabel={t.preview.charactersShort}
              tokensLabel={t.preview.tokens}
            />
            <DiagnosticConsoleButton
              diagnostics={allDiagnostics}
              fixCount={artifactAnalysis.fixes.length}
              isOpen={isDiagnosticOpen}
              onToggle={() => setIsDiagnosticOpen((current) => !current)}
              getTitle={(issues, fixes) => t.preview.diagnosticPanelTitle(issues, fixes)}
            />
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
              artifactMapEntries={artifactMapEntries}
              documentEpoch={documentEpoch}
              onCopyRichText={handleCopyRichText}
              getPreviewRoot={() => {
                const root = previewRootRef.current?.querySelector<HTMLElement>('[data-public-preview-root="true"]') ?? null;
                // Capture the Final paper itself, not the surrounding workspace:
                // delivery image/PDF output must match the A4 paper width, never
                // the fluid preview container width.
                return root?.querySelector<HTMLElement>('.aad-document-surface') ?? root;
              }}
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
        <PreviewNavigationProvider value={{ enabledCapabilities: [], onRequestEditorLineFocus: requestDiagnosticLineFocus }}>
        <PublicSharedFinalPreview
          complianceFooter={<PublicComplianceFooter />}
          deliveryAccess={deliveryAccess}
          deliveryDisplayOptions={deliveryDisplayOptions}
          diagnosticLineFocusRequest={diagnosticLineFocusRequest}
          diagnostics={artifactAnalysis.diagnostics}
          isAiFixBusy={isAiFixBusy}
          lastAppliedFix={artifactAnalysis.lastAppliedFix}
          mornDraftComponentScope={releaseConfig.mornDraftComponentScope}
          onBeginFixReview={artifactAnalysis.beginFixReview}
          onCancelFixReview={handleCancelFixReview}
          onConfirmFixReview={handleConfirmFixReview}
          onMermaidDiagnosticChange={updatePreviewDiagnostic}
          onPatch={handlePreviewSourcePatch}
          onRequestAiFix={handleRequestAiFix}
          onToggleA4Pagination={toggleDeliveryA4Pagination}
          onToggleCodeChrome={toggleDeliveryCodeChrome}
          onUndoLastFix={artifactAnalysis.undoLastFix}
          pendingFixReview={effectivePendingFixReview}
          searchState={previewSearchState}
          source={source}
          sourcePatchEcho={previewSourcePatchEcho}
          stateResetKey={`public:${documentEpoch}`}
          t={t}
          theme={theme}
        />
        </PreviewNavigationProvider>
        {isDiagnosticOpen && (
          <DiagnosticConsolePanel
            className="aad-editor-diagnostic-panel aad-preview-diagnostic-panel md-oss-diagnostic-panel"
            aiFixError={aiFixError}
            diagnostics={allDiagnostics}
            fixCount={artifactAnalysis.fixes.length}
            isAiFixBusy={isAiFixBusy}
            locale={locale}
            onBeginFixReviewAll={() => artifactAnalysis.beginFixReview('all')}
            onClose={() => setIsDiagnosticOpen(false)}
            onRequestAiFixAll={handleRequestAiFix}
            onRequestLineFocus={requestDiagnosticLineFocus}
            t={{
              aiFix: t.preview.aiFix,
              aiFixing: t.preview.aiFixing,
              closeDiagnosticDialog: t.preview.closeDiagnosticDialog,
              diagnosticDialogTitle: t.preview.diagnosticDialogTitle,
              diagnosticPanelTitle: t.preview.diagnosticPanelTitle,
              errorLine: t.preview.errorLine,
              fix: t.preview.fix,
              fixAll: t.preview.fixAll,
              jumpToSourceLine: t.preview.jumpToSourceLine,
            }}
          />
        )}
      </div>
      <PublicDialog
        className="md-public-about-dialog"
        isOpen={isAboutOpen}
        labelledBy="oss-about-title"
        onClose={() => setIsAboutOpen(false)}
      >
        <h2 id="oss-about-title">{t.about.title}</h2>
        {t.about.problems.map((problem) => (
          <p key={problem}>{problem}</p>
        ))}
        {Boolean(t.about.usageTitle || t.about.usage) && (
          <section className="md-public-about-section">
            {t.about.usageTitle && <h3>{t.about.usageTitle}</h3>}
            {t.about.usage && <p className="md-public-about-usage">{t.about.usage}</p>}
          </section>
        )}
        <button type="button" className="aad-action-button" onClick={() => setIsAboutOpen(false)}>
          {t.about.confirm}
        </button>
      </PublicDialog>
    </main>
  );
};
