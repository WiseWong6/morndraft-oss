import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  findArtifactMapEntryForLine,
  recoverMarkdownFencesForPreview,
} from '@morndraft/core';
import type { TextSearchState } from '@morndraft/features-personal';
import { ArtifactMapShell } from '@morndraft/features-personal';
import type { ArtifactDeskTranslations } from '../../i18n';
import { detectArtifactContent } from '../../utils/content-detection.js';
import type { MornDraftComponentScope } from '../../utils/releaseConfigTypes';
import type { ArtifactDiagnostic } from '../editor/diagnosticTypes';
import type { ContentType } from '../preview/MarkdownCodeBlockRenderer';
import { MarkdownDocumentRenderer } from '../preview/MarkdownDocumentRenderer';
import {
  HtmlPreviewBlock,
  MermaidPreviewBlock,
  PreviewI18nContext,
  PreviewThemeContext,
} from '../preview/PreviewRenderBlocks';
import { PreviewAiSelectionToolbar } from '../preview/PreviewAiSelectionToolbar';
import { PreviewFixReviewOverlay } from '../preview/PreviewFixReviewOverlay';
import { PreviewFormatToolbar } from '../preview/PreviewFormatToolbar';
import { PreviewArtifactCollapseContext } from '../preview/CollapsibleArtifactBlock';
import { ArtifactErrorAiRepairContext } from '../preview/ArtifactErrorBlock';
import { BlockHeaderCopyContext, type BlockCopyContentKind } from '../preview/BlockHeaderCopyAction';
import { copyImageBlobPayload } from '../preview/clipboardWriters';
import { usePreviewArtifactCollapse, usePreviewArtifactEntries } from '../preview/usePreviewArtifactCollapse';
import ScrollToTopButton, { getScrollToTopBehavior } from '../ScrollToTopButton';
import {
  PreviewDeliveryDisplayControls,
  type PreviewDeliveryDisplayOptions,
} from '../preview/PreviewDeliveryDisplayControls';
import { usePreviewA4Pagination } from '../preview/usePreviewA4Pagination';
import {
  applyPreviewSearchActiveCssHighlight,
  applyPreviewSearchBlockOverlay,
  applyPreviewSearchFrameTextHighlight,
  applyPreviewSearchTextHighlights,
  clearPreviewSearchBlockHighlights,
  getPreviewSearchActiveTarget,
  getPreviewSearchBlockTarget,
  getPreviewSearchTextBlockTarget,
  getPreviewSearchVisibleTextTarget,
  unwrapPreviewSearchHighlights,
} from '../preview/previewSearchHighlight';
import {
  createPreviewRenderDeliveryAccess,
  type DeliveryAccessState,
  type DeliveryNotice,
} from '../preview/deliveryAccess';
import { createPreviewDeliveryRequestContext } from '../preview/deliveryRequestContext';
import { HtmlPreviewMountSchedulerProvider } from '../preview/htmlPreviewMountScheduler';
import { preprocessArtifactCode } from '../preview/previewDomUtils';
import type { PreviewSourcePatchEcho } from '../preview/previewMarkdownPatchMeta';
import {
  resolvePreviewEditingResetSource,
  resolvePreviewEditingSourceChannels,
  serializePreviewEditingSourcePatch,
} from '../preview/standaloneHtmlFenceEditing';
import { useArtifactMapNavigation } from '../preview/useArtifactMapNavigation';
import {
  highlightPreviewDiagnosticLineTarget,
  scrollPreviewDiagnosticLineIntoView,
  scrollPreviewSourceLineIntoView,
} from '../preview/previewDiagnosticLineNavigation';
import { usePreviewMarkdownEditing } from '../preview/usePreviewMarkdownEditing';
import { usePreviewMarkdownImageInsertion } from '../preview/usePreviewMarkdownImageInsertion';
import type {
  ArtifactAppliedFix,
  ArtifactFixReview,
} from '../editor/diagnosticTypes';

const PublicStrictHtmlPreviewBlock: React.FC<React.ComponentProps<typeof HtmlPreviewBlock>> = (props) => (
  <HtmlPreviewBlock {...props} securityMode="publicStrict" />
);

type PublicSharedFinalPreviewProps = {
  complianceFooter?: React.ReactNode;
  source: string;
  sourcePatchEcho: PreviewSourcePatchEcho;
  stateResetKey: string;
  theme: 'light' | 'dark';
  t: ArtifactDeskTranslations;
  deliveryAccess: DeliveryAccessState;
  deliveryDisplayOptions: PreviewDeliveryDisplayOptions;
  diagnosticLineFocusRequest?: { line: number; requestId: number } | null;
  diagnostics: readonly ArtifactDiagnostic[];
  pendingFixReview: ArtifactFixReview | null;
  lastAppliedFix: ArtifactAppliedFix | null;
  mornDraftComponentScope?: MornDraftComponentScope;
  searchState?: TextSearchState | null;
  sourceLineFocusRequest?: { line: number; requestId: number } | null;
  isAiFixBusy?: boolean;
  onBeginFixReview(fixId: string | 'all'): void;
  onCancelFixReview(): void;
  onConfirmFixReview(): void;
  onFinalCursorLineChange?: (line: number) => void;
  onMermaidDiagnosticChange?: (id: string, diagnostic: { code: string; line?: number | null; messageZh: string; messageEn?: string } | null) => void;
  onRequestAiFix?: (diagnostic: ArtifactDiagnostic) => void;
  onPatch(nextSource: string, meta?: Parameters<NonNullable<React.ComponentProps<typeof MarkdownDocumentRenderer>['onSourcePatch']>>[1]): void;
  onToggleA4Pagination(): void;
  onToggleCodeChrome(): void;
  onUndoLastFix(): void;
};

export const PublicSharedFinalPreview: React.FC<PublicSharedFinalPreviewProps> = ({
  complianceFooter = null,
  source,
  sourcePatchEcho,
  stateResetKey,
  theme,
  t,
  deliveryAccess,
  deliveryDisplayOptions,
  diagnosticLineFocusRequest = null,
  diagnostics,
  pendingFixReview,
  lastAppliedFix,
  mornDraftComponentScope = 'showcase',
  searchState = null,
  sourceLineFocusRequest = null,
  isAiFixBusy = false,
  onBeginFixReview,
  onCancelFixReview,
  onConfirmFixReview,
  onFinalCursorLineChange,
  onMermaidDiagnosticChange,
  onRequestAiFix,
  onPatch,
  onToggleA4Pagination,
  onToggleCodeChrome,
  onUndoLastFix,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [previewSurface, setPreviewSurface] = useState<HTMLElement | null>(null);
  const [isArtifactMapPanelOpen, setIsArtifactMapPanelOpen] = useState(true);
  const [isBackToTopVisible, setIsBackToTopVisible] = useState(false);
  const latestSourceRef = useRef(source);
  const [deliveryNotice, setDeliveryNotice] = useState<DeliveryNotice | null>(null);
  latestSourceRef.current = source;

  const handlePreviewScroll = useCallback(() => {
    setIsBackToTopVisible((scrollContainerRef.current?.scrollTop ?? 0) > 480);
  }, []);
  const handleBackToTop = useCallback(() => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: getScrollToTopBehavior() });
  }, []);

  const sourceChannels = useMemo(
    () => resolvePreviewEditingSourceChannels({ code: source, latestSource: source }),
    [source],
  );
  const processedCode = useMemo(
    () => preprocessArtifactCode(sourceChannels.renderSource),
    [sourceChannels.renderSource],
  );
  const recoveredPreview = useMemo(
    () => recoverMarkdownFencesForPreview(processedCode),
    [processedCode],
  );
  const previewCode = recoveredPreview.source;
  const previewLineMap = recoveredPreview.recoveries.length
    ? recoveredPreview.lineMap
    : undefined;
  const contentType = detectArtifactContent(sourceChannels.renderSource).primaryType as ContentType;
  const editingResetSource = resolvePreviewEditingResetSource(sourceChannels, previewCode);
  const isA4PaginationAvailable = contentType !== 'html';
  const isA4PaginationActive = isA4PaginationAvailable && deliveryDisplayOptions.includeA4Pagination;
  usePreviewA4Pagination({
    enabled: isA4PaginationActive,
    surface: previewSurface,
    resetKey: `${stateResetKey}|${theme}|${previewCode}`,
  });
  const renderDeliveryAccess = useMemo(
    () => createPreviewRenderDeliveryAccess(deliveryAccess),
    [deliveryAccess],
  );
  const deliveryRequestContext = useMemo(
    () => createPreviewDeliveryRequestContext(null, deliveryAccess, false, true),
    [deliveryAccess],
  );
  const { handlePreviewMarkdownInsertImageFile } = usePreviewMarkdownImageInsertion({
    deliveryAccess,
    setDeliveryNotice,
    t: t.preview,
  });
  const handlePatch = useCallback((nextSource: string, meta?: Parameters<typeof onPatch>[1]) => {
    onPatch(
      serializePreviewEditingSourcePatch({
        nextSource,
        originalSource: source,
        sourceKind: sourceChannels.sourceKind,
      }),
      meta,
    );
  }, [onPatch, source, sourceChannels.sourceKind]);
  const editing = usePreviewMarkdownEditing({
    code: sourceChannels.editableSource,
    contentType,
    deliveryRequestContext,
    latestSource: sourceChannels.latestEditableSource,
    onAiInstructionNotice: setDeliveryNotice,
    onFinalCursorSourceLineChange: onFinalCursorLineChange,
    onInsertImageFile: isA4PaginationActive ? undefined : handlePreviewMarkdownInsertImageFile,
    onPatch: isA4PaginationActive ? undefined : handlePatch,
    previewCode: editingResetSource,
    previewLineMap,
    processedCode,
    sourceKind: sourceChannels.sourceKind,
    sourcePatchEcho,
    stateResetKey,
  });
  const artifactNavigation = useArtifactMapNavigation({
    code: previewCode,
    isEnabled: true,
    lineMap: previewLineMap,
    scrollContainerRef,
  });
  const artifactMapEntries = artifactNavigation.entries;
  const handledDiagnosticLineFocusRequestIdRef = useRef(0);
  const diagnosticHighlightCleanupRef = useRef<(() => void) | null>(null);
  const handledSourceLineFocusRequestIdRef = useRef(0);
  useLayoutEffect(() => {
    if (!sourceLineFocusRequest) return;
    if (handledSourceLineFocusRequestIdRef.current === sourceLineFocusRequest.requestId) return;
    handledSourceLineFocusRequestIdRef.current = sourceLineFocusRequest.requestId;
    scrollPreviewSourceLineIntoView(scrollContainerRef.current, sourceLineFocusRequest.line);
  }, [sourceLineFocusRequest]);
  useLayoutEffect(() => {
    if (!diagnosticLineFocusRequest) return undefined;
    if (handledDiagnosticLineFocusRequestIdRef.current === diagnosticLineFocusRequest.requestId) return undefined;
    handledDiagnosticLineFocusRequestIdRef.current = diagnosticLineFocusRequest.requestId;
    diagnosticHighlightCleanupRef.current?.();
    diagnosticHighlightCleanupRef.current = null;
    const target = scrollPreviewDiagnosticLineIntoView(scrollContainerRef.current, diagnosticLineFocusRequest.line);
    if (target) {
      diagnosticHighlightCleanupRef.current = highlightPreviewDiagnosticLineTarget(target);
    }
    return () => {
      diagnosticHighlightCleanupRef.current?.();
      diagnosticHighlightCleanupRef.current = null;
    };
  }, [diagnosticLineFocusRequest]);
  const { collapseContext, collapsedArtifactIds, onToggleEntryCollapsed } = usePreviewArtifactCollapse(artifactMapEntries);
  const { artifactMapDisplayEntries, collapsibleArtifactEntryIds } = usePreviewArtifactEntries(artifactMapEntries, collapsedArtifactIds, contentType);
  const blockHeaderCopyContextValue = useMemo(() => ({
    copyBlockImage: async (element: HTMLElement, contentKind: BlockCopyContentKind) => {
      const { captureBlockImageForCopy } = await import('../preview/liveBlockImageCapture');
      const { capture } = await captureBlockImageForCopy({
        authorizeDelivery: async () => ({ captureScale: 2 }),
        blockContentKind: contentKind,
        blockRoot: element,
        currentTheme: theme,
        ensureMermaidRendered: async () => undefined,
        includeCodeChrome: true,
        noMermaidReadyMessage: t.preview.noMermaidReady,
      });
      await copyImageBlobPayload(Promise.resolve(capture.blob));
    },
  }), [t, theme]);
  const handledSearchNavigationRequestIdRef = useRef(0);
  const getPreviewSearchMatchBlock = useCallback(
    (match: { line: number }) => {
      const targetEntry = findArtifactMapEntryForLine(artifactMapEntries, match.line);
      if (!targetEntry || !scrollContainerRef.current) return null;
      return getPreviewSearchBlockTarget(scrollContainerRef.current, targetEntry.id);
    },
    [artifactMapEntries],
  );

  useLayoutEffect(() => {
    const root = scrollContainerRef.current;
    if (!root) return undefined;

    unwrapPreviewSearchHighlights(root);
    clearPreviewSearchBlockHighlights(root);

    const query = searchState?.query.trim() ?? '';
    if (!query) return undefined;

    const activeIndex = searchState?.activeIndex ?? 0;
    const navigationRequestId = searchState?.navigationRequestId ?? 0;
    const shouldNavigate =
      navigationRequestId > 0 &&
      handledSearchNavigationRequestIdRef.current !== navigationRequestId;
    if (shouldNavigate) {
      handledSearchNavigationRequestIdRef.current = navigationRequestId;
    }
    const textHighlightState = applyPreviewSearchTextHighlights(root, query);
    const activeMatch =
      searchState?.activeMatch ?? searchState?.matches[activeIndex] ?? null;
    const fallbackBlock = activeMatch ? getPreviewSearchMatchBlock(activeMatch) : null;
    const activeTarget = activeMatch
      ? getPreviewSearchActiveTarget(
          root,
          activeMatch,
          searchState?.matches ?? [],
          fallbackBlock,
          textHighlightState.textRanges,
          query,
        )
      : { mark: null, block: null, range: null, rangeElement: null, overlayElement: null };
    const activeMark = activeTarget.mark;
    const activeBlock = activeTarget.block ?? getPreviewSearchTextBlockTarget(root, query);
    const activeRange = activeTarget.range;
    const activeRangeElement = activeTarget.rangeElement;
    const activeOverlayElement = activeTarget.overlayElement;
    const activeVisibleTextTarget = activeBlock
      ? getPreviewSearchVisibleTextTarget(root, query, activeBlock) ?? getPreviewSearchVisibleTextTarget(root, query)
      : getPreviewSearchVisibleTextTarget(root, query);
    let deferredTextBlockFrame: number | null = null;
    const scrollActiveElementIntoView = (element: Element) => {
      if (!shouldNavigate) return;
      element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    };
    const applyActiveBlockHighlight = (block: HTMLElement) => {
      const activeBlockOverlay = block.closest('[data-lexical-editor="true"], [data-preview-edit-island="document:preview-markdown"]')
        ? applyPreviewSearchBlockOverlay(root, block)
        : null;
      if (!activeBlockOverlay) {
        block.classList.add('aad-preview-search-block-highlight');
      }
      scrollActiveElementIntoView(block);
    };
    const applyActiveArtifactHighlight = (block: HTMLElement) => {
      const visibleTextTarget = getPreviewSearchVisibleTextTarget(root, query, block) ?? getPreviewSearchVisibleTextTarget(root, query);
      if (visibleTextTarget) {
        applyPreviewSearchBlockOverlay(root, visibleTextTarget);
        scrollActiveElementIntoView(visibleTextTarget);
        return;
      }
      const didRequestFrameHighlight = applyPreviewSearchFrameTextHighlight(block, query);
      if (didRequestFrameHighlight) {
        scrollActiveElementIntoView(block);
        return;
      }
      applyActiveBlockHighlight(block);
    };
    applyPreviewSearchActiveCssHighlight(activeRange);
    if (activeMark) {
      activeMark.classList.add('is-active');
      if (shouldNavigate) {
        window.requestAnimationFrame(() => {
          activeMark.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
        });
      }
    } else if (activeRangeElement) {
      activeOverlayElement?.classList.add('is-active');
      if (shouldNavigate) {
        window.requestAnimationFrame(() => {
          activeRangeElement.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
        });
      }
    } else if (activeVisibleTextTarget) {
      applyPreviewSearchBlockOverlay(root, activeVisibleTextTarget);
      scrollActiveElementIntoView(activeVisibleTextTarget);
    } else if (activeBlock) {
      applyActiveArtifactHighlight(activeBlock);
    } else {
      deferredTextBlockFrame = window.requestAnimationFrame(() => {
        if (!root.isConnected) return;
        const hasVisibleSearchHighlight =
          root.querySelector('.aad-preview-search-overlay-hit, .aad-preview-search-block-highlight, mark.aad-preview-search-highlight.is-active');
        if (hasVisibleSearchHighlight) return;
        const deferredTextBlock = getPreviewSearchTextBlockTarget(root, query);
        if (deferredTextBlock) {
          applyActiveArtifactHighlight(deferredTextBlock);
        }
      });
    }

    return () => {
      if (deferredTextBlockFrame !== null) {
        window.cancelAnimationFrame(deferredTextBlockFrame);
      }
      if (!root.isConnected) return;
      unwrapPreviewSearchHighlights(root);
      clearPreviewSearchBlockHighlights(root);
    };
  }, [
    artifactMapEntries,
    contentType,
    previewCode,
    searchState,
    getPreviewSearchMatchBlock,
  ]);

  return (
    <ArtifactMapShell
      entries={artifactMapDisplayEntries}
      collapsedEntryIds={collapsedArtifactIds}
      collapsibleEntryIds={collapsibleArtifactEntryIds}
      title={t.preview.artifactMap}
      emptyLabel={t.preview.artifactMapEmpty}
      closeLabel={t.preview.closeArtifactMap}
      expandEntryLabel={(entry) => t.preview.expandArtifact(entry.title)}
      collapseEntryLabel={(entry) => t.preview.collapseArtifact(entry.title)}
      lineLabel={t.preview.errorLine}
      onToggleEntryCollapsed={onToggleEntryCollapsed}
      isEnabled={artifactMapDisplayEntries.length > 0}
      isOpen={false}
      isPanelOpen={isArtifactMapPanelOpen}
      panelExpandLabel={t.preview.openArtifactMap}
      panelCollapseLabel={t.preview.closeArtifactMap}
      onNavigate={(entry) => artifactNavigation.navigateToEntry(entry)}
      onPanelToggle={() => setIsArtifactMapPanelOpen((value) => !value)}
    >
    <div
      ref={scrollContainerRef}
      className="aad-preview-scroll md-oss-shared-final-scroll"
      data-document-kind={contentType}
      data-public-final="true"
      data-public-preview-root="true"
      data-shared-final-preview="true"
      onScroll={handlePreviewScroll}
    >
      <div className="aad-preview-display-controls-bar md-oss-shared-final-controls">
        {!isA4PaginationActive && <PreviewFormatToolbar controls={editing.toolbar} t={t.preview} />}
        <PreviewDeliveryDisplayControls
          ariaLabel={t.preview.deliveryDisplayOptions}
          a4PaginationChecked={deliveryDisplayOptions.includeA4Pagination}
          a4PaginationLabel={t.preview.deliveryA4Pagination}
          a4PaginationTitle={t.preview.deliveryA4PaginationToggle}
          codeChromeChecked={deliveryDisplayOptions.includeCodeChrome}
          codeChromeLabel={t.preview.deliveryCode}
          codeChromeTitle={t.preview.deliveryCodeToggle}
          onToggleA4Pagination={onToggleA4Pagination}
          onToggleCodeChrome={onToggleCodeChrome}
          showA4PaginationControl={isA4PaginationAvailable}
        />
      </div>
      {!isA4PaginationActive && (
        <PreviewAiSelectionToolbar
          appliedReplacement={editing.appliedAiReplacement}
          applyReplacement={editing.applyAiReplacement}
          deliveryRequestContext={deliveryRequestContext}
          getLatestSource={() => latestSourceRef.current}
          renderDeliveryAccess={renderDeliveryAccess}
          restoreSelectionFocus={editing.restoreAiSelectionFocus}
          restoreReplacement={editing.restoreAiReplacement}
          scrollContainerRef={scrollContainerRef}
          selection={editing.aiSelection}
          setDeliveryNotice={setDeliveryNotice}
          t={t.preview}
        />
      )}
      {deliveryNotice && (
        <div className={`aad-editor-floating-toast aad-editor-import-toast aad-editor-import-toast-${deliveryNotice.tone}`} role="status">
          {deliveryNotice.text}
        </div>
      )}
      <HtmlPreviewMountSchedulerProvider maxActiveMounts={2} resetKey={stateResetKey}>
        <PreviewArtifactCollapseContext.Provider value={collapseContext}>
        <ArtifactErrorAiRepairContext.Provider
          value={onRequestAiFix ? { isAiFixBusy, onRequestAiFix, repairMode: 'ai' as const } : null}
        >
        <BlockHeaderCopyContext.Provider value={blockHeaderCopyContextValue}>
        <div className="aad-preview-pad w-full">
          <div ref={setPreviewSurface} className="aad-document-surface md-public-final-surface">
            <PreviewThemeContext.Provider value={theme}>
              <PreviewI18nContext.Provider value={t.preview}>
                <MarkdownDocumentRenderer
                  aiCandidateRenderDeliveryAccess={renderDeliveryAccess}
                  code={previewCode}
                  contentType={contentType}
                  diagnostics={diagnostics}
                  getLatestSource={() => latestSourceRef.current}
                  getArtifactIdForNode={artifactNavigation.getArtifactIdForNode}
                  getArtifactIdForSourceLine={artifactNavigation.getArtifactIdForSourceLine}
                  HtmlPreviewComponent={PublicStrictHtmlPreviewBlock}
                  MermaidPreviewComponent={MermaidPreviewBlock}
                  mornDraftComponentScope={mornDraftComponentScope}
                  onBeginFixReview={onBeginFixReview}
                  onJsonFormatted={() => undefined}
                  onMermaidDiagnosticChange={onMermaidDiagnosticChange ?? (() => undefined)}
                  onMermaidSvgReady={() => undefined}
                  onRequestAiFix={onRequestAiFix}
                  onSourcePatch={handlePatch}
                  previewMarkdownEdit={editing.editState}
                  previewSourcePatchEnabled
                  renderDeliveryAccess={renderDeliveryAccess}
                  repairMode={onRequestAiFix ? 'ai' : 'deterministic'}
                  sourceLineMap={previewLineMap}
                  t={t.preview}
                  withArtifactTarget={artifactNavigation.withArtifactTarget}
                />
              </PreviewI18nContext.Provider>
            </PreviewThemeContext.Provider>
          </div>
        </div>
        </BlockHeaderCopyContext.Provider>
        </ArtifactErrorAiRepairContext.Provider>
        </PreviewArtifactCollapseContext.Provider>
      </HtmlPreviewMountSchedulerProvider>
      {complianceFooter}
      <PreviewFixReviewOverlay
        pendingFixReview={pendingFixReview}
        lastAppliedFix={lastAppliedFix}
        onCancelFixReview={onCancelFixReview}
        onConfirmFixReview={onConfirmFixReview}
        onUndoLastFix={onUndoLastFix}
        t={t.preview}
      />
      <ScrollToTopButton
        className="aad-preview-back-to-top"
        label={t.preview.backToTop}
        onClick={handleBackToTop}
        visible={isBackToTopVisible}
      />
    </div>
    </ArtifactMapShell>
  );
};
