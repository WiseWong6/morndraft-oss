import React from 'react';
import { TRANSLATIONS, type ArtifactPreviewTranslations } from '../../i18n';
import { HtmlPreviewFrame, type HtmlPreviewRenderMode } from './HtmlPreviewFrame';
import type { HtmlPreviewEditCommitMeta, HtmlPreviewEditCommitStrategy } from './useHtmlPreviewEditMode';
import type { HtmlPreviewSecurityMode } from './HtmlPreviewFrameTypes';
import type { HtmlPreviewSelectionChange } from '../../utils/htmlPreviewBridge';
import {
  MermaidPreviewBlock as BaseMermaidPreviewBlock,
} from './MermaidPreviewBlock';
import {
  normalizeMermaidSvg,
} from './mermaidCapture';
import type { ArtifactDiagnostic } from './MarkdownCodeBlockRenderer';
import type { PreviewTheme } from './previewDomUtils';
import { PreviewViewportContext } from './PreviewViewportContext';
import { normalizePreviewDeliveryWidth } from './previewLayoutContract';
import type { BlockCopyContentKind } from './BlockHeaderCopyAction';

export const PreviewThemeContext = React.createContext<PreviewTheme>('light');
export const PreviewI18nContext = React.createContext<ArtifactPreviewTranslations>(TRANSLATIONS.zh.preview);

export const MermaidPreviewBlock: React.FC<{
  blockId?: string;
  code: string;
  coreDiagnostic?: ArtifactDiagnostic | null;
  lineOffset?: number;
  onRenderDiagnosticChange?: (diagnostic: { line: number | null; messageZh: string; messageEn?: string } | null) => void;
  onSvgReady?: (svg: string) => void;
  canEdit?: boolean;
  onCodeChange?: (newCode: string) => void;
  isAiFixBusy?: boolean;
  onBeginFixReview?: (fixId: string) => void;
  onRequestAiFix?: (diagnostic: ArtifactDiagnostic) => void;
  repairMode?: 'ai' | 'deterministic';
}> = ({ blockId, code, coreDiagnostic = null, lineOffset = 0, onRenderDiagnosticChange, onSvgReady, canEdit, onCodeChange, isAiFixBusy, onBeginFixReview, onRequestAiFix, repairMode }) => {
  const theme = React.useContext(PreviewThemeContext);
  const t = React.useContext(PreviewI18nContext);
  const viewport = React.useContext(PreviewViewportContext);
  return (
    <BaseMermaidPreviewBlock
      blockId={blockId}
      code={code}
      coreDiagnostic={coreDiagnostic}
      theme={theme}
      t={t}
      lineOffset={lineOffset}
      isMobilePreview={viewport.isMobilePreview}
      normalizeSvg={normalizeMermaidSvg}
      onRenderDiagnosticChange={onRenderDiagnosticChange}
      onSvgReady={onSvgReady}
      canEdit={canEdit}
      onCodeChange={onCodeChange}
      isAiFixBusy={isAiFixBusy}
      onBeginFixReview={onBeginFixReview}
      onRequestAiFix={onRequestAiFix}
      repairMode={repairMode}
    />
  );
};

export const HtmlPreviewBlock: React.FC<{
  code: string;
  copyContentKind?: BlockCopyContentKind;
  copySource?: string;
  headerActions?: React.ReactNode;
  label?: string;
  meta?: string;
  hideDefaultMeta?: boolean;
  renderMode?: HtmlPreviewRenderMode;
  securityMode?: HtmlPreviewSecurityMode;
  enableFullscreen?: boolean;
  deliveryWidth?: number;
  initialHeight?: number;
  lockInitialHeight?: boolean;
  deferMountUntilVisible?: boolean;
  frameKey?: string;
  onPreviewReady?: () => void;
  onPreviewPendingChange?: (isPending: boolean) => void;
  canEdit?: boolean;
  isEditing?: boolean;
  onEditStart?: () => void;
  onEditCommit?: (newCode: string, meta?: HtmlPreviewEditCommitMeta) => void;
  onEditCancel?: () => void;
  onEditDraft?: (newCode: string) => void;
  editCommitStrategy?: HtmlPreviewEditCommitStrategy;
  onBlockActivate?: () => void;
  onSelectionChange?: (selection: HtmlPreviewSelectionChange) => void;
}> = ({ code, copyContentKind, copySource, headerActions, label, meta, hideDefaultMeta, renderMode, securityMode, enableFullscreen, deliveryWidth, initialHeight, lockInitialHeight, deferMountUntilVisible, frameKey, onPreviewReady, onPreviewPendingChange, canEdit, isEditing, onEditStart, onEditCommit, onEditCancel, onEditDraft, editCommitStrategy, onBlockActivate, onSelectionChange }) => {
  const theme = React.useContext(PreviewThemeContext);
  const t = React.useContext(PreviewI18nContext);
  const viewport = React.useContext(PreviewViewportContext);
  const normalizedDeliveryWidth = normalizePreviewDeliveryWidth(deliveryWidth);
  return (
    <HtmlPreviewFrame
      code={code}
      copyContentKind={copyContentKind}
      copySource={copySource}
      headerActions={headerActions}
      deliveryWidth={normalizedDeliveryWidth}
      label={label}
      meta={meta}
      hideDefaultMeta={hideDefaultMeta}
      renderMode={renderMode}
      securityMode={securityMode}
      enableFullscreen={enableFullscreen}
      initialHeight={initialHeight}
      lockInitialHeight={lockInitialHeight}
      deferMountUntilVisible={deferMountUntilVisible}
      frameKey={frameKey}
      theme={theme}
      t={t}
      isMobilePreview={viewport.isMobilePreview}
      mobileFallbackMode={viewport.mobileHtmlFallbackMode}
      mobileChromeMode={viewport.mobileHtmlChromeMode}
      onPreviewReady={onPreviewReady}
      onPreviewPendingChange={onPreviewPendingChange}
      canEdit={canEdit}
      isEditing={isEditing}
      onEditStart={onEditStart}
      onEditCommit={onEditCommit}
      onEditCancel={onEditCancel}
      onEditDraft={onEditDraft}
      editCommitStrategy={editCommitStrategy}
      onBlockActivate={onBlockActivate}
      onSelectionChange={onSelectionChange}
    />
  );
};
