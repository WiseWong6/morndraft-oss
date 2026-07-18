import React from 'react';
import type { ArtifactFixReview } from './diagnosticTypes';

type PendingRow = { id: string; kind: 'context' | 'delete' | 'add'; text: string };

const splitDisplayLines = (value: string) => value.split('\n');

const buildPrefixSuffixDiff = (sourceLines: string[], nextLines: string[]): PendingRow[] => {
  let prefix = 0;
  while (prefix < sourceLines.length && prefix < nextLines.length && sourceLines[prefix] === nextLines[prefix]) {
    prefix += 1;
  }

  let sourceSuffix = sourceLines.length - 1;
  let nextSuffix = nextLines.length - 1;
  while (sourceSuffix >= prefix && nextSuffix >= prefix && sourceLines[sourceSuffix] === nextLines[nextSuffix]) {
    sourceSuffix -= 1;
    nextSuffix -= 1;
  }

  const rows: PendingRow[] = [];
  sourceLines.slice(0, prefix).forEach((text, index) => rows.push({ id: `context-start-${index}`, kind: 'context', text }));
  sourceLines.slice(prefix, sourceSuffix + 1).forEach((text, index) => rows.push({ id: `delete-${index}`, kind: 'delete', text }));
  nextLines.slice(prefix, nextSuffix + 1).forEach((text, index) => rows.push({ id: `add-${index}`, kind: 'add', text }));
  sourceLines.slice(sourceSuffix + 1).forEach((text, index) => rows.push({ id: `context-end-${index}`, kind: 'context', text }));
  return rows;
};

const buildLineDiffRows = (source: string, nextSource: string): PendingRow[] => {
  const sourceLines = splitDisplayLines(source);
  const nextLines = splitDisplayLines(nextSource);
  if (source === nextSource) {
    return sourceLines.map((text, index) => ({ id: `context-${index}`, kind: 'context', text }));
  }

  if (sourceLines.length * nextLines.length > 160000) {
    return buildPrefixSuffixDiff(sourceLines, nextLines);
  }

  const dp = Array.from({ length: sourceLines.length + 1 }, () => Array(nextLines.length + 1).fill(0));
  for (let sourceIndex = sourceLines.length - 1; sourceIndex >= 0; sourceIndex -= 1) {
    for (let nextIndex = nextLines.length - 1; nextIndex >= 0; nextIndex -= 1) {
      dp[sourceIndex][nextIndex] = sourceLines[sourceIndex] === nextLines[nextIndex]
        ? dp[sourceIndex + 1][nextIndex + 1] + 1
        : Math.max(dp[sourceIndex + 1][nextIndex], dp[sourceIndex][nextIndex + 1]);
    }
  }

  const rows: PendingRow[] = [];
  let sourceIndex = 0;
  let nextIndex = 0;
  while (sourceIndex < sourceLines.length && nextIndex < nextLines.length) {
    if (sourceLines[sourceIndex] === nextLines[nextIndex]) {
      rows.push({ id: `context-${sourceIndex}-${nextIndex}`, kind: 'context', text: sourceLines[sourceIndex] });
      sourceIndex += 1;
      nextIndex += 1;
    } else if (dp[sourceIndex + 1][nextIndex] >= dp[sourceIndex][nextIndex + 1]) {
      rows.push({ id: `delete-${sourceIndex}`, kind: 'delete', text: sourceLines[sourceIndex] });
      sourceIndex += 1;
    } else {
      rows.push({ id: `add-${nextIndex}`, kind: 'add', text: nextLines[nextIndex] });
      nextIndex += 1;
    }
  }

  while (sourceIndex < sourceLines.length) {
    rows.push({ id: `delete-tail-${sourceIndex}`, kind: 'delete', text: sourceLines[sourceIndex] });
    sourceIndex += 1;
  }
  while (nextIndex < nextLines.length) {
    rows.push({ id: `add-tail-${nextIndex}`, kind: 'add', text: nextLines[nextIndex] });
    nextIndex += 1;
  }
  return rows;
};

export const getPendingFixRowCount = (review: ArtifactFixReview) => buildLineDiffRows(review.source, review.nextSource).length;

export const EditorPendingFixOverlay: React.FC<{
  review: ArtifactFixReview;
  scrollTop: number;
  inlineHint: string;
}> = ({ review, scrollTop, inlineHint }) => {
  const rows = buildLineDiffRows(review.source, review.nextSource);
  const lastAddIndex = rows.reduce((result, row, index) => row.kind === 'add' ? index : result, -1);
  const shouldShowHint = (index: number) => rows[index]?.kind === 'add' && (review.mode === 'all' ? rows[index + 1]?.kind !== 'add' : index === lastAddIndex);
  return (
    <div className="aad-editor-pending-fix-layer" aria-hidden="true">
      <div className="aad-editor-pending-fix-content" style={{ transform: `translateY(-${scrollTop}px)` }}>
        {rows.map((row, index) => (
          <code className={`aad-editor-pending-fix-line is-${row.kind}`} key={row.id}>
            {row.text || '\u00A0'}
            {shouldShowHint(index) && <span className="aad-editor-pending-fix-inline-hint">{inlineHint}</span>}
          </code>
        ))}
      </div>
    </div>
  );
};
