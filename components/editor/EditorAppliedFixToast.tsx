import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, CheckCircle2, Wrench, X } from 'lucide-react';
import type { EditorTranslations } from '../../i18n';
import type { ArtifactAppliedFix, ArtifactFixReview } from './diagnosticTypes';
import { useFixReviewKeyboard } from './useFixReviewKeyboard';

const APPLIED_FIX_TOAST_DURATION_MS = 2000;

export const EditorAppliedFixToast: React.FC<{
  lastAppliedFix?: ArtifactAppliedFix | null;
  pendingFixReview?: ArtifactFixReview | null;
  onConfirmFixReview?: () => void;
  onCancelFixReview?: () => void;
  onUndoLastFix?: () => void;
  t: EditorTranslations;
}> = ({
  lastAppliedFix = null,
  pendingFixReview = null,
  onConfirmFixReview,
  onCancelFixReview,
  onUndoLastFix,
  t,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const appliedFixId = lastAppliedFix?.id;
  const pendingFixId = pendingFixReview?.id;
  const toastRef = useRef<HTMLDivElement | null>(null);
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
    const frame = window.requestAnimationFrame(() => toastRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [appliedFixId, pendingFixId]);

  useFixReviewKeyboard({
    enabled: isVisible,
    mode: pendingFixReview ? 'pending' : 'applied',
    onCancel: onCancelFixReview,
    onDismiss: dismissToast,
    onUndo: onUndoLastFix,
    scopeSelector: '.aad-editor-input, .aad-editor-fix-review-toast',
  });

  if (!isVisible) return null;

  if (pendingFixReview) {
    return (
      <div
        ref={toastRef}
        className="aad-editor-floating-toast aad-editor-applied-fix-toast aad-editor-fix-review-toast is-pending"
        role="dialog"
        aria-label={t.pendingFixToast}
        tabIndex={-1}
      >
        <div className="aad-editor-fix-toast-title">
          <Wrench size={13} />
          <span>{t.pendingFixToast}</span>
        </div>
        <div className="aad-editor-fix-toast-actions">
          <button type="button" className="aad-action-button" onClick={onCancelFixReview}>
            <X size={13} />
            <span>{t.cancelFixShortcut}</span>
          </button>
          <button type="button" className="aad-action-button is-accent" onClick={onConfirmFixReview}>
            <Check size={13} />
            <span>{t.acceptFixShortcut}</span>
          </button>
        </div>
      </div>
    );
  }

  if (!lastAppliedFix) return null;

  return (
    <div
      ref={toastRef}
      className="aad-editor-floating-toast aad-editor-applied-fix-toast aad-editor-fix-review-toast is-applied"
      role="status"
      tabIndex={-1}
    >
      <div className="aad-editor-fix-toast-title">
        <CheckCircle2 size={13} />
        <span>{t.fixApplied}</span>
        <span className="aad-editor-applied-fix-shortcut">{t.undoFixShortcutHint}</span>
      </div>
      <div className="aad-editor-fix-toast-actions">
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
          <X size={13} />
        </button>
      </div>
    </div>
  );
};
