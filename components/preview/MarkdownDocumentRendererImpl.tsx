import React from 'react';
import type { ArtifactPreviewTranslations } from '../../i18n';
import type { PreviewRenderDeliveryAccess } from './deliveryAccess';
import type { HtmlPreviewRenderMode } from './HtmlPreviewFrame';
import { type ArtifactDiagnostic, type ContentType } from './MarkdownCodeBlockRenderer';
import type { PreviewMarkdownAutoFocusTarget } from './ArtifactPreviewTypes';
import type { PreviewMarkdownEditState } from './previewMarkdownEditingTypes';
import type { PreviewMarkdownPatchMeta } from './previewMarkdownPatchMeta';
import type { SourceLineMap } from './sourcePosition';
import type { HtmlPreviewEditCommitMeta } from './useHtmlPreviewEditMode';
import type { BlockCopyContentKind } from './BlockHeaderCopyAction';
import type { HtmlPreviewSelectionChange } from '../../utils/htmlPreviewBridge';
import type { MornDraftComponentScope } from '../../utils/releaseConfigTypes';

const MarkdownReadonlyRenderer = React.lazy(async () => {
  const module = await import('./MarkdownReadonlyRenderer');
  return { default: module.MarkdownReadonlyRenderer };
});

const MarkdownLexicalDocument = React.lazy(async () => {
  const module = await import('./MarkdownLexicalIsland');
  return { default: module.MarkdownLexicalDocument };
});

const markdownRendererFallback = (
  <div className="aad-preview-renderer-loading" aria-hidden="true" />
);

export const MarkdownDocumentRenderer: React.FC<{
  aiCandidateRenderDeliveryAccess?: PreviewRenderDeliveryAccess;
  code: string;
  contentType: ContentType;
  mornDraftComponentScope?: MornDraftComponentScope;
  renderDeliveryAccess?: PreviewRenderDeliveryAccess;
  getLatestSource?: () => string;
  getArtifactIdForNode: (node: any) => string;
  getArtifactIdForSourceLine: (line: number) => string;
  withArtifactTarget: (node: any, element: React.ReactElement) => React.ReactElement;
  isSourceLineHidden?: (line: number) => boolean;
  MermaidPreviewComponent: React.ComponentType<{
    blockId?: string;
    code: string;
    coreDiagnostic?: ArtifactDiagnostic | null;
    lineOffset?: number;
    onRenderDiagnosticChange?: (
      diagnostic: { line: number | null; messageZh: string; messageEn?: string } | null,
    ) => void;
    onSvgReady?: (svg: string) => void;
    canEdit?: boolean;
    onCodeChange?: (newCode: string) => void;
    isAiFixBusy?: boolean;
    onBeginFixReview?: (fixId: string) => void;
    onRequestAiFix?: (diagnostic: ArtifactDiagnostic) => void;
    repairMode?: 'ai' | 'deterministic';
  }>;
  HtmlPreviewComponent: React.ComponentType<{
    code: string;
    copyContentKind?: BlockCopyContentKind;
    copySource?: string;
    headerActions?: React.ReactNode;
    deliveryWidth?: number;
    frameKey?: string;
    label?: string;
    meta?: string;
    hideDefaultMeta?: boolean;
    initialHeight?: number;
    lockInitialHeight?: boolean;
    deferMountUntilVisible?: boolean;
    onPreviewReady?: () => void;
    renderMode?: HtmlPreviewRenderMode;
    canEdit?: boolean;
    isEditing?: boolean;
    onEditStart?: () => void;
    onEditCommit?: (newCode: string, meta?: HtmlPreviewEditCommitMeta) => void;
    onEditCancel?: () => void;
    onEditDraft?: (newCode: string) => void;
    editCommitStrategy?: 'cached-first' | 'iframe-snapshot-first';
    onBlockActivate?: () => void;
    onSelectionChange?: (selection: HtmlPreviewSelectionChange) => void;
  }>;
  diagnostics?: readonly ArtifactDiagnostic[];
  sourceLineMap?: SourceLineMap;
  onJsonFormatted: (formatted: string) => void;
  isAiFixBusy?: boolean;
  onBeginFixReview?: (fixId: string) => void;
  onRequestAiFix?: (diagnostic: ArtifactDiagnostic) => void;
  repairMode?: 'ai' | 'deterministic';
  onMermaidDiagnosticChange?: (
    id: string,
    diagnostic: {
      code: string;
      line?: number | null;
      messageZh: string;
      messageEn?: string;
    } | null,
  ) => void;
  onMermaidSvgReady: (svg: string) => void;
  onSourcePatch?: (nextSource: string, meta?: PreviewMarkdownPatchMeta) => void;
  previewSourcePatchEnabled?: boolean;
  autoFocusKey?: number;
  autoFocusTarget?: PreviewMarkdownAutoFocusTarget;
  previewMarkdownEdit?: PreviewMarkdownEditState;
  t: ArtifactPreviewTranslations;
}> = ({
  aiCandidateRenderDeliveryAccess,
  code,
  contentType,
  mornDraftComponentScope = 'showcase',
  renderDeliveryAccess,
  getLatestSource,
  getArtifactIdForNode,
  getArtifactIdForSourceLine,
  HtmlPreviewComponent,
  isSourceLineHidden,
  MermaidPreviewComponent,
  diagnostics = [],
  sourceLineMap,
  onJsonFormatted,
  isAiFixBusy = false,
  onBeginFixReview,
  onRequestAiFix,
  repairMode = 'deterministic',
  onMermaidDiagnosticChange,
  onMermaidSvgReady,
  onSourcePatch,
  previewSourcePatchEnabled = false,
  autoFocusKey = 0,
  autoFocusTarget = 'rootEnd',
  previewMarkdownEdit,
  t,
  withArtifactTarget,
}) => {
  const renderReadonlyMarkdown = (
    source: string,
    lineMap?: SourceLineMap,
    key?: React.Key,
  ) => {
    const fullSource = getLatestSource?.();
    return (
      <React.Suspense key={key} fallback={markdownRendererFallback}>
        <MarkdownReadonlyRenderer
          code={source}
          contentType={contentType}
          diagnostics={diagnostics}
          fullSource={fullSource}
          getArtifactIdForNode={getArtifactIdForNode}
          HtmlPreviewComponent={HtmlPreviewComponent}
          isSourceLineHidden={isSourceLineHidden}
          lineMap={lineMap}
          MermaidPreviewComponent={MermaidPreviewComponent}
          isAiFixBusy={isAiFixBusy}
          onJsonFormatted={onJsonFormatted}
          onBeginFixReview={onBeginFixReview}
          onRequestAiFix={onRequestAiFix}
          repairMode={repairMode}
          onMermaidDiagnosticChange={onMermaidDiagnosticChange}
          onMermaidSvgReady={onMermaidSvgReady}
          onSourcePatch={onSourcePatch}
          onFinalCursorSourceLineChange={previewMarkdownEdit?.onFinalCursorSourceLineChange}
          onPreviewAiSelectionChange={previewMarkdownEdit?.onLexicalAiSelectionChange}
          previewSourcePatchEnabled={previewSourcePatchEnabled}
          renderDeliveryAccess={renderDeliveryAccess}
          t={t}
          withArtifactTarget={withArtifactTarget}
        />
      </React.Suspense>
    );
  };

  if (previewMarkdownEdit?.enabled) {
    return (
      <React.Suspense fallback={markdownRendererFallback}>
        <MarkdownLexicalDocument
          code={code}
          aiCandidateRenderDeliveryAccess={aiCandidateRenderDeliveryAccess}
          contentType={contentType}
          diagnostics={diagnostics}
          editState={previewMarkdownEdit}
          getArtifactIdForNode={getArtifactIdForNode}
          getArtifactIdForSourceLine={getArtifactIdForSourceLine}
          HtmlPreviewComponent={HtmlPreviewComponent}
          isSourceLineHidden={isSourceLineHidden}
          MermaidPreviewComponent={MermaidPreviewComponent}
          isAiFixBusy={isAiFixBusy}
          onJsonFormatted={onJsonFormatted}
          onBeginFixReview={onBeginFixReview}
          onRequestAiFix={onRequestAiFix}
          repairMode={repairMode}
          onMermaidDiagnosticChange={onMermaidDiagnosticChange}
          onMermaidSvgReady={onMermaidSvgReady}
          mornDraftComponentScope={mornDraftComponentScope}
          renderDeliveryAccess={renderDeliveryAccess}
          autoFocusKey={autoFocusKey}
          autoFocusTarget={autoFocusTarget}
          sourceLineMap={sourceLineMap}
          t={t}
          withArtifactTarget={withArtifactTarget}
        />
      </React.Suspense>
    );
  }

  return renderReadonlyMarkdown(code, sourceLineMap);
};
