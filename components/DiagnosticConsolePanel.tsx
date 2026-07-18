import React from 'react';
import { AlertTriangle, Wrench, X } from 'lucide-react';

export type DiagnosticConsolePanelDiagnostic = {
  id: string;
  code: string;
  line?: number;
  severity?: 'error' | 'warning' | 'info';
  messageZh: string;
  messageEn?: string;
  [key: string]: unknown;
};

export type DiagnosticConsolePanelTranslations = {
  diagnosticDialogTitle: string;
  closeDiagnosticDialog: string;
  diagnosticPanelTitle: (issues: number, fixes: number) => string;
  aiFix?: string;
  aiFixing?: string;
  fix: string;
  fixAll: string;
  errorLine: (line: number) => string;
  jumpToSourceLine: (line: number) => string;
};

export const DiagnosticConsolePanel: React.FC<{
  diagnostics: readonly DiagnosticConsolePanelDiagnostic[];
  fixCount: number;
  aiFixError?: string | null;
  isAiFixBusy?: boolean;
  locale: 'zh' | 'en';
  onBeginFixReviewAll?: () => void;
  onClose?: () => void;
  onRequestAiFixAll?: (diagnostic: DiagnosticConsolePanelDiagnostic) => void;
  onRequestLineFocus?: (line: number) => void;
  t: DiagnosticConsolePanelTranslations;
  className?: string;
}> = ({
  diagnostics,
  fixCount,
  aiFixError = null,
  isAiFixBusy = false,
  locale,
  onBeginFixReviewAll,
  onClose,
  onRequestAiFixAll,
  onRequestLineFocus,
  t,
  className = '',
}) => {
  const visibleDiagnostics = diagnostics.filter((diagnostic) => diagnostic.line && diagnostic.severity !== 'info');
  const aiFixDiagnostic = visibleDiagnostics.find((diagnostic) => diagnostic.severity === 'error') ?? null;
  const canRequestAiFix = Boolean(aiFixDiagnostic && onRequestAiFixAll);
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      onClose?.();
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  if (visibleDiagnostics.length === 0) return null;

  return (
    <div className={`aad-editor-diagnostic-panel ${className}`.trim()}>
      <div className="aad-editor-diagnostic-dialog-title-row">
        <div className="aad-editor-diagnostic-dialog-title">
          <AlertTriangle size={14} />
          <span>{t.diagnosticDialogTitle}</span>
        </div>
        <button
          type="button"
          className="aad-editor-diagnostic-close-button"
          onClick={onClose}
          title={t.closeDiagnosticDialog}
          aria-label={t.closeDiagnosticDialog}
        >
          <X size={14} />
        </button>
      </div>
      <div className="aad-editor-diagnostic-panel-header">
        <div className="aad-editor-diagnostic-panel-title">
          <AlertTriangle size={13} />
          <span>{t.diagnosticPanelTitle(visibleDiagnostics.length, fixCount)}</span>
        </div>
        <div className="aad-editor-diagnostic-panel-actions">
          {fixCount > 0 && canRequestAiFix && aiFixDiagnostic && (
            <button
              type="button"
              className="aad-action-button is-accent aad-editor-diagnostic-fix-button"
              disabled={isAiFixBusy}
              onClick={() => onRequestAiFixAll?.(aiFixDiagnostic)}
              title={t.aiFix ?? t.fixAll}
              aria-label={t.aiFix ?? t.fixAll}
            >
              <Wrench size={14} />
              <span>{isAiFixBusy ? t.aiFixing ?? t.fix : t.fix}</span>
            </button>
          )}
          {fixCount > 0 && !canRequestAiFix && onBeginFixReviewAll && (
            <button
              type="button"
              className="aad-action-button is-accent aad-editor-diagnostic-fix-button"
              onClick={onBeginFixReviewAll}
              title={t.fixAll}
              aria-label={t.fixAll}
            >
              <Wrench size={14} />
              <span>{t.fix}</span>
            </button>
          )}
        </div>
      </div>
      {aiFixError && (
        <div className="aad-editor-diagnostic-ai-error" role="status">
          {aiFixError}
        </div>
      )}
      <div className="aad-editor-diagnostic-list">
        {visibleDiagnostics.slice(0, 4).map((diagnostic) => (
          <div className="aad-editor-diagnostic-item" key={diagnostic.id}>
            <button
              type="button"
              className="aad-editor-diagnostic-item-line"
              onClick={() => onRequestLineFocus?.(diagnostic.line ?? 1)}
              title={t.jumpToSourceLine(diagnostic.line ?? 1)}
              aria-label={t.jumpToSourceLine(diagnostic.line ?? 1)}
            >
              {t.errorLine(diagnostic.line ?? 1)}
            </button>
            <span className="aad-editor-diagnostic-item-message">
              {locale === 'zh' ? diagnostic.messageZh : diagnostic.messageEn || diagnostic.messageZh}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
