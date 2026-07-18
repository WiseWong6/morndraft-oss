import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import type { ArtifactPreviewTranslations } from '../../i18n';

const APPLIED_NOTICE_DURATION_MS = 2_000;

export const usePreviewAiAppliedNotice = (onDismiss: () => void) => {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  const clearTimer = useCallback(() => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  const dismiss = useCallback(() => {
    clearTimer();
    setVisible(false);
    onDismissRef.current();
  }, [clearTimer]);

  const show = useCallback(() => {
    clearTimer();
    setVisible(true);
    timeoutRef.current = window.setTimeout(dismiss, APPLIED_NOTICE_DURATION_MS);
  }, [clearTimer, dismiss]);

  useEffect(() => clearTimer, [clearTimer]);

  return { dismiss, show, visible };
};

export const PreviewAiAppliedNotice: React.FC<{
  onDismiss: () => void;
  onUndo: () => void;
  t: ArtifactPreviewTranslations;
}> = ({ onDismiss, onUndo, t }) => {
  const noticeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => noticeRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <div ref={noticeRef} className="aad-preview-ai-selection-undo" tabIndex={-1}>
      <CheckCircle2 size={15} aria-hidden="true" />
      <span>{t.previewAiApplied}</span>
      <button type="button" onClick={onUndo}>{t.previewAiUndo}</button>
      <button
        type="button"
        className="aad-preview-ai-selection-dismiss"
        aria-label={t.previewAiClose}
        title={t.previewAiClose}
        onClick={onDismiss}
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
};
