import React from 'react';
import { Wrench } from 'lucide-react';
import type { ArtifactPreviewTranslations } from '../../i18n';
import type { ArtifactDiagnostic } from './MarkdownCodeBlockRenderer';

type DiagnosticWithFix = {
  fix?: { id: string } | null;
  fixId?: string;
} | null | undefined;

export const getDiagnosticFixId = (diagnostic: DiagnosticWithFix) =>
  diagnostic?.fixId ?? diagnostic?.fix?.id ?? '';

export const DiagnosticFixAction: React.FC<{
  diagnostic?: ArtifactDiagnostic | DiagnosticWithFix;
  isAiFixBusy?: boolean;
  onBeginFixReview?: (fixId: string) => void;
  onRequestAiFix?: (diagnostic: ArtifactDiagnostic) => void;
  repairMode?: 'ai' | 'deterministic';
  t: ArtifactPreviewTranslations;
}> = ({
  diagnostic,
  isAiFixBusy = false,
  onBeginFixReview,
  onRequestAiFix,
  repairMode = 'deterministic',
  t,
}) => {
  const fixId = getDiagnosticFixId(diagnostic);
  const canAiFix = repairMode === 'ai' &&
    diagnostic &&
    'severity' in diagnostic &&
    diagnostic.severity === 'error' &&
    onRequestAiFix;
  if (canAiFix) {
    return (
      <button
        type="button"
        className="aad-block-copy-action aad-preview-diagnostic-fix-button"
        title={t.aiFix}
        aria-label={t.aiFix}
        data-copy-remove="true"
        disabled={isAiFixBusy}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!isAiFixBusy) onRequestAiFix(diagnostic as ArtifactDiagnostic);
        }}
      >
        <Wrench size={13} />
        <span>{isAiFixBusy ? t.aiFixing : t.aiFix}</span>
      </button>
    );
  }
  if (!fixId || !onBeginFixReview) return null;

  return (
    <button
      type="button"
      className="aad-block-copy-action aad-preview-diagnostic-fix-button"
      title={t.fix}
      aria-label={t.fix}
      data-copy-remove="true"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onBeginFixReview(fixId);
      }}
    >
      <Wrench size={13} />
      <span>{t.fix}</span>
    </button>
  );
};
