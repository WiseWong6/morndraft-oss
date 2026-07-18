import React from 'react';
import { AlertTriangle } from 'lucide-react';

export type DiagnosticConsoleButtonDiagnostic = {
  line?: number;
  severity?: 'error' | 'warning' | 'info';
  [key: string]: unknown;
};

export const getVisibleDiagnosticIssueCount = (
  diagnostics: readonly DiagnosticConsoleButtonDiagnostic[],
) => diagnostics.filter((diagnostic) => diagnostic.line && diagnostic.severity !== 'info').length;

export const DiagnosticConsoleButton: React.FC<{
  diagnostics: readonly DiagnosticConsoleButtonDiagnostic[];
  fixCount: number;
  isOpen: boolean;
  onToggle: () => void;
  getTitle: (issues: number, fixes: number) => string;
  className?: string;
}> = ({ diagnostics, fixCount, isOpen, onToggle, getTitle, className = '' }) => {
  if (diagnostics.length === 0) return null;
  const issueCount = getVisibleDiagnosticIssueCount(diagnostics);
  const title = getTitle(issueCount, fixCount);
  return (
    <button
      type="button"
      className={`aad-editor-diagnostic-console ${issueCount > 0 ? 'has-issues' : ''} ${className}`.trim()}
      title={title}
      aria-label={title}
      aria-pressed={isOpen}
      onClick={onToggle}
    >
      <span className="aad-editor-diagnostic-icon" aria-hidden="true">
        <AlertTriangle size={14} />
      </span>
      <span className="aad-editor-diagnostic-count">{issueCount.toLocaleString()}</span>
    </button>
  );
};
