import React, { useMemo } from 'react';
import { Wrench } from 'lucide-react';
import type { ArtifactDiagnostic, ArtifactFix } from './diagnosticTypes';

const EDITOR_PADDING_TOP_PX = 16;
const EDITOR_LINE_HEIGHT_PX = 20.8;

type EditorLineMetrics = {
  paddingTop: number;
  lineHeight: number;
};

const normalizeEditorLineMetrics = (metrics?: Partial<EditorLineMetrics>): EditorLineMetrics => {
  const paddingTop = Number(metrics?.paddingTop);
  const lineHeight = Number(metrics?.lineHeight);
  return {
    paddingTop: Number.isFinite(paddingTop) ? paddingTop : EDITOR_PADDING_TOP_PX,
    lineHeight: Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : EDITOR_LINE_HEIGHT_PX,
  };
};

const getEditorLineTop = (line: number, metrics: EditorLineMetrics) =>
  `${metrics.paddingTop + (line - 1) * metrics.lineHeight}px`;

export const EditorDiagnosticLayer: React.FC<{
  diagnostics: readonly ArtifactDiagnostic[];
  fixes: readonly ArtifactFix[];
  scrollTop: number;
  lineMetrics?: Partial<EditorLineMetrics>;
  showFixes: boolean;
  activeFixLine?: number | null;
  fixLabel: string;
  onBeginFixReview?: (fixId: string) => void;
}> = ({ diagnostics, fixes, scrollTop, lineMetrics, showFixes, activeFixLine = null, fixLabel, onBeginFixReview }) => {
  const metrics = useMemo(() => normalizeEditorLineMetrics(lineMetrics), [lineMetrics]);
  const visibleDiagnostics = useMemo(
    () => diagnostics.filter((diagnostic) => diagnostic.line && diagnostic.severity !== 'info'),
    [diagnostics],
  );
  const diagnosticLineMap = useMemo(() => {
    const byLine = new Map<number, ArtifactDiagnostic>();
    for (const diagnostic of visibleDiagnostics) {
      const line = diagnostic.line;
      if (!line) continue;
      const current = byLine.get(line);
      if (!current || current.severity !== 'error') byLine.set(line, diagnostic);
    }
    return byLine;
  }, [visibleDiagnostics]);
  const firstFixByLine = useMemo(() => {
    const byLine = new Map<number, { diagnostic: ArtifactDiagnostic; fix: ArtifactFix }>();
    const fixById = new Map(fixes.map((fix) => [fix.id, fix]));
    for (const diagnostic of visibleDiagnostics) {
      if (!diagnostic.line || !diagnostic.fixId || byLine.has(diagnostic.line)) continue;
      const fix = fixById.get(diagnostic.fixId);
      if (fix) byLine.set(diagnostic.line, { diagnostic, fix });
    }
    return byLine;
  }, [fixes, visibleDiagnostics]);
  const visibleFixEntries = useMemo(
    () => Array.from(firstFixByLine.entries()).filter(([line]) => showFixes || activeFixLine === line),
    [activeFixLine, firstFixByLine, showFixes],
  );

  return (
    <>
      <div className="aad-editor-diagnostic-layer" aria-hidden="true">
        <div className="aad-editor-diagnostic-layer-inner" style={{ transform: `translateY(-${scrollTop}px)` }}>
          {Array.from(diagnosticLineMap.entries()).map(([line, diagnostic]) => (
            <div
              key={`line-${diagnostic.id}`}
              className={`aad-editor-diagnostic-row is-${diagnostic.severity}`}
              style={{ top: getEditorLineTop(line, metrics), height: `${metrics.lineHeight}px` }}
            />
          ))}
          {visibleDiagnostics.filter((diagnostic) => diagnostic.column).map((diagnostic) => {
            const startColumn = Math.max(1, diagnostic.column ?? 1);
            const endColumn = Math.max(startColumn + 1, diagnostic.endColumn ?? startColumn + 1);
            return (
              <div
                key={`token-${diagnostic.id}`}
                className={`aad-editor-diagnostic-token is-${diagnostic.severity}`}
                style={{
                  top: getEditorLineTop(diagnostic.line ?? 1, metrics),
                  height: `${metrics.lineHeight}px`,
                  left: `calc((var(--aad-editor-line-number-digits, 1) * 0.72ch) + 2.15rem + ${startColumn - 1}ch)`,
                  width: `${Math.max(1, endColumn - startColumn)}ch`,
                }}
              />
            );
          })}
        </div>
      </div>
      {visibleFixEntries.length > 0 && (
        <div className="aad-editor-line-fix-layer">
          <div className="aad-editor-line-fix-layer-inner" style={{ transform: `translateY(-${scrollTop}px)` }}>
            {visibleFixEntries.map(([line, { fix }]) => (
              <button
                type="button"
                key={fix.id}
                className="aad-editor-line-fix-button"
                style={{ top: getEditorLineTop(line, metrics), height: `${metrics.lineHeight}px` }}
                title={fix.labelZh ?? fixLabel}
                aria-label={fix.labelZh ?? fixLabel}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onBeginFixReview?.(fix.id);
                }}
              >
                <Wrench size={12} />
                <span>{fixLabel}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
};
