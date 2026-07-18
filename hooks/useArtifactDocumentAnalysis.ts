import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  analyzeArtifactDocument,
  applyArtifactFix,
  applyArtifactFixes,
} from '@morndraft/core';
import type {
  ArtifactDiagnostic,
  ArtifactAppliedFix,
  ArtifactFix,
  ArtifactFixPreviewLine,
  ArtifactFixReview,
} from '../components/editor/diagnosticTypes';

const getFallbackPreview = (source: string, fix: ArtifactFix) => ({
  before: source.slice(fix.range.start, fix.range.end) || ' ',
  after: fix.replacement || ' ',
});

const getLineFromOffset = (source: string, offset: number) => source.slice(0, Math.max(0, offset)).split('\n').length;

const getFixPreviewLines = (source: string, fixes: ArtifactFix[], fixLineById: Map<string, number>): ArtifactFixPreviewLine[] =>
  [...fixes]
    .sort((a, b) => a.range.start - b.range.start)
    .map((fix, index) => {
      const fallback = getFallbackPreview(source, fix);
      return {
        id: `${fix.id}:${index}`,
        line: fixLineById.get(fix.id) ?? getLineFromOffset(source, fix.range.start),
        labelZh: fix.labelZh,
        labelEn: fix.labelEn,
        before: fix.preview?.before ?? fallback.before,
        after: fix.preview?.after ?? fallback.after,
      };
    });

export const useArtifactDocumentAnalysis = (
  code: string,
  setCode: (value: string) => void,
  flushCode: (value: string) => void,
) => {
  const [pendingFixReview, setPendingFixReview] = useState<ArtifactFixReview | null>(null);
  const [lastAppliedFix, setLastAppliedFix] = useState<ArtifactAppliedFix | null>(null);
  const [fixApplyVersion, setFixApplyVersion] = useState(0);
  const analysis = useMemo(
    () => analyzeArtifactDocument(code) as { diagnostics: ArtifactDiagnostic[]; fixes: ArtifactFix[] },
    [code],
  );

  useEffect(() => {
    setPendingFixReview((current) => (current?.source === code ? current : null));
    setLastAppliedFix((current) => (!current || current.nextSource === code ? current : null));
  }, [code]);

  const beginFixReview = useCallback((target: string | 'all') => {
    const selectedFixes = target === 'all'
      ? analysis.fixes
      : analysis.fixes.filter((item) => item.id === target);
    if (selectedFixes.length === 0) return false;
    const fixLineById = new Map(analysis.diagnostics.flatMap((diagnostic) => {
      const id = diagnostic.fixId ?? diagnostic.fix?.id;
      return id && diagnostic.line ? [[id, diagnostic.line] as const] : [];
    }));
    const nextSource = selectedFixes.length === 1
      ? applyArtifactFix(code, selectedFixes[0])
      : applyArtifactFixes(code, selectedFixes);
    setLastAppliedFix(null);
    setPendingFixReview({
      id: `${target}:${Date.now()}`,
      mode: target === 'all' ? 'all' : 'single',
      source: code,
      nextSource,
      fixes: selectedFixes,
      previewLines: getFixPreviewLines(code, selectedFixes, fixLineById),
    });
    return true;
  }, [analysis.diagnostics, analysis.fixes, code]);

  const confirmFixReview = useCallback(() => {
    if (!pendingFixReview || pendingFixReview.source !== code) {
      setPendingFixReview(null);
      return;
    }
    setCode(pendingFixReview.nextSource);
    flushCode(pendingFixReview.nextSource);
    setLastAppliedFix({
      id: pendingFixReview.id,
      mode: pendingFixReview.mode,
      source: pendingFixReview.source,
      nextSource: pendingFixReview.nextSource,
      line: pendingFixReview.previewLines[0]?.line ?? 1,
      fixCount: pendingFixReview.fixes.length,
    });
    setPendingFixReview(null);
    setFixApplyVersion((version) => version + 1);
  }, [code, flushCode, pendingFixReview, setCode]);

  const cancelFixReview = useCallback(() => {
    setPendingFixReview(null);
  }, []);

  const undoLastFix = useCallback(() => {
    if (!lastAppliedFix || lastAppliedFix.nextSource !== code) {
      setLastAppliedFix(null);
      return;
    }
    setCode(lastAppliedFix.source);
    flushCode(lastAppliedFix.source);
    setLastAppliedFix(null);
    setPendingFixReview(null);
    setFixApplyVersion((version) => version + 1);
  }, [code, flushCode, lastAppliedFix, setCode]);

  return {
    diagnostics: analysis.diagnostics,
    fixes: analysis.fixes,
    pendingFixReview,
    lastAppliedFix,
    fixApplyVersion,
    beginFixReview,
    confirmFixReview,
    cancelFixReview,
    undoLastFix,
  };
};
