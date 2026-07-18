import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, CheckCircle2, Wrench, X } from 'lucide-react';
import type { ArtifactPreviewTranslations } from '../../i18n';
import type {
  ArtifactAppliedFix,
  ArtifactFixReview,
  ArtifactFixPreviewLine,
} from '../editor/diagnosticTypes';
import { useFixReviewKeyboard } from '../editor/useFixReviewKeyboard';

const APPLIED_FIX_TOAST_DURATION_MS = 2000;

const getPreviewLineLabel = (
  line: ArtifactFixPreviewLine | undefined,
  locale: 'zh' | 'en',
) => {
  if (!line) return '';
  return locale === 'zh'
    ? line.labelZh || line.labelEn || ''
    : line.labelEn || line.labelZh || '';
};

export const PreviewFixReviewOverlay: React.FC<{
  pendingFixReview?: ArtifactFixReview | null;
  lastAppliedFix?: ArtifactAppliedFix | null;
  onConfirmFixReview?: () => void;
  onCancelFixReview?: () => void;
  onUndoLastFix?: () => void;
  t: ArtifactPreviewTranslations;
}> = ({
  pendingFixReview = null,
  lastAppliedFix = null,
  onConfirmFixReview,
  onCancelFixReview,
  onUndoLastFix,
  t,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const pendingFixId = pendingFixReview?.id;
  const appliedFixId = lastAppliedFix?.id;
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const dismissToast = useCallback(() => setIsVisible(false), []);

  useEffect(() => {
    if (pendingFixId) {
      setIsVisible(true);
      return undefined;
    }
    if (!appliedFixId) {
      setIsVisible(false);
      return undefined;
    }
    setIsVisible(true);
    const timer = window.setTimeout(() => setIsVisible(false), APPLIED_FIX_TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [appliedFixId, pendingFixId]);

  useEffect(() => {
    if (!pendingFixId && !appliedFixId) return undefined;
    const frame = window.requestAnimationFrame(() => overlayRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [appliedFixId, pendingFixId]);

  useFixReviewKeyboard({
    enabled: isVisible,
    mode: pendingFixReview ? 'pending' : 'applied',
    onCancel: onCancelFixReview,
    onDismiss: dismissToast,
    onUndo: onUndoLastFix,
    scopeSelector: '.aad-preview-body, .aad-preview-fix-overlay',
  });

  if (!isVisible) return null;

  if (pendingFixReview) {
    const primaryLabel = getPreviewLineLabel(pendingFixReview.previewLines[0], t.locale);
    return (
      <div ref={overlayRef} className="aad-preview-fix-overlay" role="dialog" aria-label={t.fixReviewTitle} tabIndex={-1}>
        <div className="aad-preview-fix-card">
          <div className="aad-preview-fix-title">
            <Wrench size={14} />
            <span>{t.fixReviewTitle}</span>
          </div>
          <p className="aad-preview-fix-description">
            {primaryLabel || t.fixReviewDescription(pendingFixReview.fixes.length)}
          </p>
          <div className="aad-preview-fix-actions">
            <button type="button" className="aad-action-button" onClick={onCancelFixReview}>
              <X size={14} />
              <span>{t.cancelFix}</span>
            </button>
            <button type="button" className="aad-action-button is-accent" onClick={onConfirmFixReview}>
              <Check size={14} />
              <span>{t.previewAiApply}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!lastAppliedFix) return null;

  return (
    <div ref={overlayRef} className="aad-preview-fix-overlay is-applied" role="status" tabIndex={-1}>
      <div className="aad-preview-fix-card">
        <div className="aad-preview-fix-title">
          <CheckCircle2 size={14} />
          <span>{t.fixApplied}</span>
        </div>
        <div className="aad-preview-fix-actions">
          <button type="button" className="aad-action-button" onClick={onUndoLastFix}>
            <span>{t.undoFix}</span>
          </button>
          <button
            type="button"
            className="aad-action-button"
            aria-label={t.closeFixToast}
            title={t.closeFixToast}
            onClick={dismissToast}
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};
