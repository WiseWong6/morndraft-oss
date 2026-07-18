import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  recoverMarkdownFencesForPreview,
} from '@morndraft/core';
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
  source: string;
  sourcePatchEcho: PreviewSourcePatchEcho;
  stateResetKey: string;
  theme: 'light' | 'dark';
  t: ArtifactDeskTranslations;
  deliveryAccess: DeliveryAccessState;
  diagnostics: readonly ArtifactDiagnostic[];
  pendingFixReview: ArtifactFixReview | null;
  lastAppliedFix: ArtifactAppliedFix | null;
  mornDraftComponentScope?: MornDraftComponentScope;
  onBeginFixReview(fixId: string | 'all'): void;
  onCancelFixReview(): void;
  onConfirmFixReview(): void;
  onPatch(nextSource: string, meta?: Parameters<NonNullable<React.ComponentProps<typeof MarkdownDocumentRenderer>['onSourcePatch']>>[1]): void;
  onUndoLastFix(): void;
};

export const PublicSharedFinalPreview: React.FC<PublicSharedFinalPreviewProps> = ({
  source,
  sourcePatchEcho,
  stateResetKey,
  theme,
  t,
  deliveryAccess,
  diagnostics,
  pendingFixReview,
  lastAppliedFix,
  mornDraftComponentScope = 'showcase',
  onBeginFixReview,
  onCancelFixReview,
  onConfirmFixReview,
  onPatch,
  onUndoLastFix,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const latestSourceRef = useRef(source);
  const [deliveryNotice, setDeliveryNotice] = useState<DeliveryNotice | null>(null);
  latestSourceRef.current = source;

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
    onInsertImageFile: handlePreviewMarkdownInsertImageFile,
    onPatch: handlePatch,
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

  return (
    <div
      ref={scrollContainerRef}
      className="aad-preview-scroll md-oss-shared-final-scroll"
      data-document-kind={contentType}
      data-public-final="true"
      data-public-preview-root="true"
      data-shared-final-preview="true"
    >
      <div className="aad-preview-display-controls-bar md-oss-shared-final-controls">
        <PreviewFormatToolbar controls={editing.toolbar} t={t.preview} />
      </div>
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
      {deliveryNotice && (
        <div className={`aad-editor-floating-toast aad-editor-import-toast aad-editor-import-toast-${deliveryNotice.tone}`} role="status">
          {deliveryNotice.text}
        </div>
      )}
      <HtmlPreviewMountSchedulerProvider maxActiveMounts={2} resetKey={stateResetKey}>
        <div className="aad-preview-pad w-full">
          <div className="aad-document-surface md-public-final-surface">
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
                  onMermaidDiagnosticChange={() => undefined}
                  onMermaidSvgReady={() => undefined}
                  onSourcePatch={handlePatch}
                  previewMarkdownEdit={editing.editState}
                  previewSourcePatchEnabled
                  renderDeliveryAccess={renderDeliveryAccess}
                  repairMode="deterministic"
                  sourceLineMap={previewLineMap}
                  t={t.preview}
                  withArtifactTarget={artifactNavigation.withArtifactTarget}
                />
              </PreviewI18nContext.Provider>
            </PreviewThemeContext.Provider>
          </div>
        </div>
      </HtmlPreviewMountSchedulerProvider>
      <PreviewFixReviewOverlay
        pendingFixReview={pendingFixReview}
        lastAppliedFix={lastAppliedFix}
        onCancelFixReview={onCancelFixReview}
        onConfirmFixReview={onConfirmFixReview}
        onUndoLastFix={onUndoLastFix}
        t={t.preview}
      />
    </div>
  );
};
