import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FilePenLine,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  extractMermaidLabels,
  getMermaidEditAvailability,
  replaceMermaidLabels,
} from '@morndraft/core';
import { trackMornDraftClick } from '../../utils/analytics';
import { formatMermaidErrorMessage } from '../../utils/mermaid-error-message.js';
import { renderMermaidSvg } from '../../utils/mermaid-renderer.js';
import { normalizeMermaidSourceForRender } from '../../utils/mermaid-source.js';
import type { ArtifactPreviewTranslations } from '../../i18n';
import type { ArtifactDiagnostic } from './MarkdownCodeBlockRenderer';
import { ArtifactErrorBlock } from './ArtifactErrorBlock';
import { CollapsibleArtifactBlock } from './CollapsibleArtifactBlock';
import { BlockHeaderCopyAction } from './BlockHeaderCopyAction';
import { MermaidPreviewCanvas } from './MermaidPreviewCanvas';
import {
  activateMermaidLabelEditDraft,
  clearActiveMermaidLabelEditDraft,
  clearMermaidLabelEditDraft,
  isMermaidLabelEditDraftActive,
  MermaidLabelEditor,
  requestMermaidLabelEditActivation,
  type MermaidLabel,
} from './MermaidLabelEditor';
import { useMermaidSvgRenderer, MERMAID_RENDER_REQUEST_EVENT } from './useMermaidSvgRenderer';

export { MERMAID_RENDER_REQUEST_EVENT };

type PreviewTheme = 'dark' | 'light';

const MERMAID_DEFAULT_SCALE = 1;

const stripSourceOnlyMermaidHint = (message: string) =>
  message
    .replace(/\n\n当前没有可靠的自动修复，请在源码中(?:补全这一行|修改)后再预览。/g, '')
    .trim();

export const MermaidPreviewBlock: React.FC<{
  blockId?: string;
  code: string;
  coreDiagnostic?: ArtifactDiagnostic | null;
  theme: PreviewTheme;
  t: ArtifactPreviewTranslations;
  lineOffset?: number;
  isMobilePreview?: boolean;
  normalizeSvg: (svg: string, theme: PreviewTheme) => string;
  onRenderDiagnosticChange?: (diagnostic: { line: number | null; messageZh: string; messageEn?: string } | null) => void;
  onSvgReady?: (svg: string) => void;
  canEdit?: boolean;
  onCodeChange?: (newCode: string) => void;
  isAiFixBusy?: boolean;
  onBeginFixReview?: (fixId: string) => void;
  onRequestAiFix?: (diagnostic: ArtifactDiagnostic) => void;
  repairMode?: 'ai' | 'deterministic';
}> = ({
  blockId,
  code,
  coreDiagnostic = null,
  theme,
  t,
  lineOffset = 0,
  isMobilePreview = false,
  normalizeSvg,
  onRenderDiagnosticChange,
  onSvgReady,
  canEdit = false,
  onCodeChange,
  isAiFixBusy = false,
  onBeginFixReview,
  onRequestAiFix,
  repairMode = 'deterministic',
}) => {
  const [scale, setScale] = useState(MERMAID_DEFAULT_SCALE);
  const [isEditing, setIsEditing] = useState(false);
  const [isBlockFullscreen, setIsBlockFullscreen] = useState(false);
  const [editLabels, setEditLabels] = useState<MermaidLabel[]>([]);
  const [editError, setEditError] = useState<string | null>(null);
  const editBlockKey = useMemo(() => blockId ?? `mermaid:${lineOffset}`, [blockId, lineOffset]);

  const {
    svgContent,
    svgTheme,
    error,
    errorLine,
    canvasWidth,
    blockRef,
  } = useMermaidSvgRenderer({
    code,
    coreDiagnostic,
    theme,
    locale: t.locale,
    lineOffset,
    normalizeSvg,
    onRenderDiagnosticChange,
    onSvgReady,
  });

  const editAvailability = useMemo(() => getMermaidEditAvailability(code), [code]);
  const editSupported = Boolean(canEdit && onCodeChange && !isMobilePreview && editAvailability.supported);
  const sourceEditSupported = Boolean(canEdit && onCodeChange && !isMobilePreview);
  const clampScale = (value: number) => Math.max(0.5, Math.min(3, value));

  const openEditor = useCallback(() => {
    if (!editSupported) return;
    const labels = editAvailability.labels.length ? editAvailability.labels : extractMermaidLabels(code);
    activateMermaidLabelEditDraft(editBlockKey, labels);
    setEditLabels(labels);
    setEditError(null);
    setIsEditing(true);
  }, [code, editAvailability.labels, editBlockKey, editSupported]);

  const handleStartEdit = useCallback(async () => {
    if (!editSupported) return;
    const canActivate = await requestMermaidLabelEditActivation(editBlockKey);
    if (canActivate) openEditor();
  }, [editBlockKey, editSupported, openEditor]);

  useEffect(() => {
    if (!editSupported || isEditing || !isMermaidLabelEditDraftActive(editBlockKey)) return;
    const labels = editAvailability.labels.length ? editAvailability.labels : extractMermaidLabels(code);
    setEditLabels(labels);
    setEditError(null);
    setIsEditing(true);
  }, [code, editAvailability.labels, editBlockKey, editSupported, isEditing]);

  const handleCommitEdit = useCallback(
    async (edits: Map<number, string>) => {
      const newCode = replaceMermaidLabels(code, edits);
      if (newCode !== code) {
        try {
          await renderMermaidSvg({
            code: normalizeMermaidSourceForRender(newCode),
            theme,
            priority: 'high',
          });
        } catch (err) {
          setEditError(formatMermaidErrorMessage(err, { locale: t.locale, lineOffset }));
          return false;
        }
        const nextLabels = extractMermaidLabels(newCode);
        clearMermaidLabelEditDraft(editBlockKey);
        activateMermaidLabelEditDraft(editBlockKey, nextLabels);
        setEditLabels(nextLabels);
        onCodeChange?.(newCode);
      }
      setEditError(null);
      return true;
    },
    [code, editBlockKey, lineOffset, onCodeChange, t.locale, theme],
  );

  const handleCloseAfterCommit = useCallback(() => {
    clearActiveMermaidLabelEditDraft();
    setIsEditing(false);
    setEditLabels([]);
    setEditError(null);
  }, []);

  const handleCancelEdit = useCallback(() => {
    clearMermaidLabelEditDraft(editBlockKey);
    setIsEditing(false);
    setEditLabels([]);
    setEditError(null);
  }, [editBlockKey]);

  const blockingDiagnostic = coreDiagnostic ?? null;
  if (blockingDiagnostic || error) {
    const rawDisplayError = blockingDiagnostic
      ? (t.locale === 'zh' ? blockingDiagnostic.messageZh : blockingDiagnostic.messageEn || blockingDiagnostic.messageZh)
      : error;
    const displayError = sourceEditSupported && t.locale === 'zh'
      ? stripSourceOnlyMermaidHint(rawDisplayError)
      : rawDisplayError;
    const displayLine = blockingDiagnostic?.line ?? errorLine;
    return (
      <ArtifactErrorBlock
        label="Mermaid"
        line={displayLine}
        message={displayError}
        className="aad-mermaid-block"
        copyRole="mermaid-block"
        resetKey={`mermaid-error:${code}`}
        dataAttributes={{ 'data-mermaid-ready': 'error' }}
        diagnostic={blockingDiagnostic}
        isAiFixBusy={isAiFixBusy}
        onBeginFixReview={onBeginFixReview}
        onRequestAiFix={onRequestAiFix}
        repairMode={repairMode}
        canEditSource={sourceEditSupported}
        sourceCode={code}
        sourceLanguage="mermaid"
        sourceStartLine={lineOffset > 0 ? lineOffset + 1 : 1}
        onSourceCodeChange={onCodeChange}
        t={t}
      />
    );
  }

  const readySvgContent = svgContent && svgTheme === theme ? svgContent : '';

  return (
    <CollapsibleArtifactBlock
      label="Mermaid"
      controls={!isMobilePreview ? (
        <div className="aad-mermaid-toolbar">
          <button
            onClick={() => {
              trackMornDraftClick('morndraft_mermaid_zoom_in', {
                target: { type: 'button', text: t.zoomIn },
                context: { component: 'mermaid_block' },
              });
              setScale((s) => clampScale(s + 0.1));
            }}
            disabled={scale >= 3}
            className="aad-icon-button p-1 disabled:opacity-30"
            title={t.zoomIn}
            data-copy-remove="true"
          >
            <ZoomIn size={14} />
          </button>
          <button
            onClick={() => {
              trackMornDraftClick('morndraft_mermaid_zoom_out', {
                target: { type: 'button', text: t.zoomOut },
                context: { component: 'mermaid_block' },
              });
              setScale((s) => clampScale(s - 0.1));
            }}
            disabled={scale <= 0.5}
            className="aad-icon-button p-1 disabled:opacity-30"
            title={t.zoomOut}
            data-copy-remove="true"
          >
            <ZoomOut size={14} />
          </button>
          <button
            onClick={() => {
              trackMornDraftClick('morndraft_mermaid_zoom_reset', {
                target: { type: 'button', text: t.resetZoom },
                context: { component: 'mermaid_block' },
              });
              setScale(1);
            }}
            className="aad-icon-button p-1"
            title={t.resetZoom}
            data-copy-remove="true"
          >
            <RotateCcw size={12} />
          </button>
          <span className="min-w-[36px] text-center text-xs">
            {Math.round(scale * 100)}%
          </span>
        </div>
      ) : undefined}
      actions={
        isEditing ? undefined : (
          <span className="aad-block-controls">
            {editSupported && (
              <button
                onClick={handleStartEdit}
                className="aad-action-button min-h-0 px-2 py-1"
                title={t.editMermaidLabels}
                data-copy-remove="true"
                type="button"
              >
                <FilePenLine size={14} />
                <span>{t.editMermaidLabels}</span>
              </button>
            )}
            <BlockHeaderCopyAction
              contentKind="mermaid"
              imageDisabled={!readySvgContent}
              svgText={readySvgContent}
              text={code}
              t={t}
            />
          </span>
        )
      }
      className={`aad-mermaid-block ${isMobilePreview ? 'aad-mermaid-block--mobile' : ''}`.trim()}
      copyRole="mermaid-block"
      resetKey={`mermaid:${code}`}
      blockRef={blockRef}
      fullscreen={{
        enterLabel: t.enterBlockFullscreen,
        exitLabel: t.exitBlockFullscreen,
        onChange: setIsBlockFullscreen,
      }}
      dataAttributes={{
        ...(isBlockFullscreen ? { 'data-mermaid-fullscreen': 'true' } : {}),
        'data-mermaid-ready': svgContent && svgTheme === theme ? 'ready' : 'pending',
        'data-mermaid-theme': svgTheme ?? '',
      }}
      expandLabel={t.expandBlock}
      collapseLabel={t.collapseBlock}
    >
      <div className={isEditing ? 'aad-mermaid-edit-shell' : 'aad-mermaid-preview-shell'}>
        <div className={isEditing ? 'aad-mermaid-edit-preview' : 'aad-mermaid-preview-surface'}>
          <MermaidPreviewCanvas
            canvasWidth={canvasWidth}
            closeLargeLabel={t.closeMermaidLightbox}
            fitMode={isBlockFullscreen ? 'contain' : 'none'}
            isMobilePreview={isMobilePreview}
            openLargeLabel={t.openMermaidLightbox}
            scale={scale}
            svgContent={svgContent}
          />
        </div>
        {isEditing && (
          <MermaidLabelEditor
            availabilityReason={editAvailability.reason}
            blockKey={editBlockKey}
            error={editError}
            labels={editLabels}
            onCancel={handleCancelEdit}
            onCloseAfterCommit={handleCloseAfterCommit}
            onCommit={handleCommitEdit}
            onDraftChange={() => setEditError(null)}
            sessionId={editBlockKey}
            t={t}
          />
        )}
      </div>
    </CollapsibleArtifactBlock>
  );
};
