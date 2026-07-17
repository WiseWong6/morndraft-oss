import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  analyzePublicJsonRepairSource,
  beginPublicJsonRepairReview,
  confirmPublicJsonRepairReview,
  undoPublicJsonRepair,
  type PublicJsonAppliedRepair,
  type PublicJsonRepairDiagnostic,
  type PublicJsonRepairReview,
} from './publicJsonRepair';
import type {
  PublicWorkspaceLocale,
  PublicWorkspaceMode,
  SourceChangeMeta,
} from './types';

const getLabels = (locale: PublicWorkspaceLocale) => locale === 'zh' ? {
  title: '发现 JSON / JSON5 问题',
  candidateTitle: '修复候选',
  appliedTitle: '已采用 JSON 修复',
  manualOnly: '这个问题不能安全地自动修改，请在 Source 中手动修复。',
  line: (line: number) => `第 ${line} 行`,
  preview: '预览修复',
  before: '修复前',
  after: '修复后',
  adopt: '采用',
  cancel: '取消',
  undo: '撤回',
  close: '关闭',
} : {
  title: 'JSON / JSON5 issue found',
  candidateTitle: 'Repair candidate',
  appliedTitle: 'JSON repair adopted',
  manualOnly: 'This issue cannot be changed safely and needs a manual Source edit.',
  line: (line: number) => `Line ${line}`,
  preview: 'Preview repair',
  before: 'Before',
  after: 'After',
  adopt: 'Adopt',
  cancel: 'Cancel',
  undo: 'Undo',
  close: 'Close',
};

const compactPreview = (value: string | undefined) => {
  const text = value || ' ';
  return text.length <= 800 ? text : `${text.slice(0, 780)}\n…`;
};

export const PublicJsonRepairController: React.FC<{
  locale: PublicWorkspaceLocale;
  mode: PublicWorkspaceMode;
  source: string;
  onSourceChange(next: string, meta: SourceChangeMeta): void;
}> = ({
  locale,
  mode,
  source,
  onSourceChange,
}) => {
  const labels = getLabels(locale);
  const analysis = useMemo(() => analyzePublicJsonRepairSource(source), [source]);
  const [pending, setPending] = useState<PublicJsonRepairReview | null>(null);
  const [applied, setApplied] = useState<PublicJsonAppliedRepair | null>(null);
  const [dismissedSource, setDismissedSource] = useState<string | null>(null);

  useEffect(() => {
    setPending((current) => current && current.source === source ? current : null);
    setApplied((current) => (
      current && (current.source === source || current.nextSource === source) ? current : null
    ));
    setDismissedSource((current) => current === source ? current : null);
  }, [source]);

  const beginReview = useCallback((diagnostic: PublicJsonRepairDiagnostic) => {
    const next = beginPublicJsonRepairReview(source, diagnostic);
    if (!next) return;
    setApplied(null);
    setPending(next);
  }, [source]);

  const cancelReview = useCallback(() => {
    setPending(null);
    setDismissedSource(source);
  }, [source]);

  const confirmReview = useCallback(() => {
    if (!pending) return;
    const confirmed = confirmPublicJsonRepairReview(pending, source);
    if (!confirmed) {
      setPending(null);
      return;
    }
    setApplied(confirmed.applied);
    setPending(null);
    setDismissedSource(null);
    onSourceChange(confirmed.nextSource, { origin: mode === 'final' ? 'final' : 'source' });
  }, [mode, onSourceChange, pending, source]);

  const undoRepair = useCallback(() => {
    if (!applied) return;
    const previous = undoPublicJsonRepair(applied, source);
    if (previous === null) {
      setApplied(null);
      return;
    }
    setApplied(null);
    setPending(null);
    setDismissedSource(null);
    onSourceChange(previous, { origin: mode === 'final' ? 'final' : 'source' });
  }, [applied, mode, onSourceChange, source]);

  if (pending?.source === source) {
    const before = compactPreview(
      pending.fix.preview?.before ??
      source.slice(pending.fix.range.start, pending.fix.range.end),
    );
    const after = compactPreview(
      pending.fix.preview?.after ??
      pending.fix.replacement,
    );
    const fixLabel = locale === 'zh'
      ? pending.fix.labelZh
      : pending.fix.labelEn || pending.fix.labelZh;
    return (
      <aside
        className="md-public-json-repair-card is-candidate"
        data-morndraft-delivery-exclude="true"
        data-testid="oss-json-repair-candidate"
        role="dialog"
        aria-label={labels.candidateTitle}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          cancelReview();
        }}
      >
        <strong>{labels.candidateTitle}</strong>
        <p>{fixLabel || labels.title} · {labels.line(pending.diagnostic.line ?? 1)}</p>
        <div className="md-public-json-repair-preview">
          <div>
            <span>{labels.before}</span>
            <pre><code>{before}</code></pre>
          </div>
          <div>
            <span>{labels.after}</span>
            <pre><code>{after}</code></pre>
          </div>
        </div>
        <div className="md-public-json-repair-actions">
          <button type="button" data-testid="oss-json-repair-cancel" onClick={cancelReview}>{labels.cancel}</button>
          <button type="button" data-testid="oss-json-repair-adopt" onClick={confirmReview}>{labels.adopt}</button>
        </div>
      </aside>
    );
  }

  if (applied?.nextSource === source) {
    const label = locale === 'zh' ? applied.labelZh : applied.labelEn || applied.labelZh;
    return (
      <aside
        className="md-public-json-repair-card is-applied"
        data-morndraft-delivery-exclude="true"
        data-testid="oss-json-repair-applied"
        role="status"
      >
        <strong>{labels.appliedTitle}</strong>
        <p>{label || labels.line(applied.line)}</p>
        <div className="md-public-json-repair-actions">
          <button type="button" data-testid="oss-json-repair-dismiss" onClick={() => setApplied(null)}>{labels.close}</button>
          <button type="button" data-testid="oss-json-repair-undo" onClick={undoRepair}>{labels.undo}</button>
        </div>
      </aside>
    );
  }

  if (
    analysis.sourceTooLarge ||
    analysis.diagnostics.length === 0 ||
    dismissedSource === source
  ) return null;

  return (
    <aside
      className="md-public-json-repair-card is-diagnostic"
      data-morndraft-delivery-exclude="true"
      data-testid="oss-json-repair-panel"
      role="status"
    >
      <div className="md-public-json-repair-heading">
        <strong>{labels.title}</strong>
        <button type="button" aria-label={labels.close} onClick={() => setDismissedSource(source)}>×</button>
      </div>
      <ul>
        {analysis.diagnostics.slice(0, 4).map((diagnostic) => {
          const message = locale === 'zh'
            ? diagnostic.messageZh
            : diagnostic.messageEn || diagnostic.messageZh;
          return (
            <li key={diagnostic.id}>
              <span>{diagnostic.line ? `${labels.line(diagnostic.line)}：` : ''}{message}</span>
              {diagnostic.fix ? (
                <button type="button" onClick={() => beginReview(diagnostic)}>{labels.preview}</button>
              ) : (
                <small>{labels.manualOnly}</small>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
};

export default PublicJsonRepairController;
