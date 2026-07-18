import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { buildArtifactMap } from '@morndraft/core';
import {
  getPublicAiSourceKindForContentType,
  type PublicAiSourceKind,
} from '@morndraft/features-personal/ai';
import {
  createPreviewAiSourceVersion,
  debugPreviewMarkdownEditing,
} from './previewMarkdownEditingDebug';
import {
  isActiveBlockPreviewMarkdownPatchEcho,
  type PreviewMarkdownPatchMeta,
  type PreviewSourcePatchEcho,
} from './previewMarkdownPatchMeta';
import { getLineSelectionRange, getSelectionTextRange } from '../editor/editorLineSelection';
import { getSourceLineTextOccurrenceIndex } from './previewDiagnosticLineNavigation';
import type { SourceLineMap } from './sourcePosition';
import type {
  PreviewAiAppliedReplacement,
  PreviewAiFocusRestorer,
  PreviewAiReplacementApplier,
  PreviewAiReplacementResult,
  PreviewAiSelection,
  PreviewAiSelectionCandidate,
  PreviewAiSelectionCandidatePatchTarget,
  PreviewAiSelectionPatchTarget,
  PreviewAiSelectionRange,
  PreviewAiSelectionRect,
  PreviewMarkdownEditingController,
  PreviewMarkdownBlockFormat,
  PreviewMarkdownTextFormat,
  PreviewMarkdownEditState,
  PreviewMarkdownLexicalFormatController,
  PreviewMarkdownLexicalFormatSnapshot,
} from './previewMarkdownEditingTypes';
import type { PreviewFinalCursorSourceLineMeta } from './ArtifactPreviewTypes';
import type { DeliveryNotice } from './deliveryAccess';
import type { DeliveryRequestContext } from './deliveryActionTypes';
import {
  createInactiveTextFormats,
  hasLexicalMarkdownIslandSelection,
  isLexicalMarkdownIslandTarget,
} from './previewMarkdownEditingDom';
import { canUsePreviewMarkdownEditing } from './previewMarkdownEditingAccess';
import type { PreviewEditingSourceKind } from './standaloneHtmlFenceEditing';

export { canUsePreviewMarkdownEditing } from './previewMarkdownEditingAccess';

type ContentType = 'markdown' | 'json' | 'html' | 'mermaid' | 'mixed';
type PreviewFormatDisabledReason = 'selection-required' | 'upgrade-required' | 'unavailable';
type MarkdownLineRange = { endLine: number; startLine: number };
type MarkdownSearchScope = MarkdownLineRange & { kind: 'candidate' | 'heading' | 'list' | 'paragraph' | 'quote' };
const AI_SELECTION_MIN_LENGTH = 1;
const PREVIEW_MARKDOWN_DOCUMENT_ID = 'document:preview-markdown';
export const PREVIEW_AI_DOCUMENT_REPLACE_MAX_LENGTH = 50_000;

export const shouldResetPreviewMarkdownEditingForSourceChange = ({
  previewCode,
  sourcePatchEcho,
}: {
  previewCode: string;
  sourcePatchEcho?: PreviewSourcePatchEcho;
}) =>
  !isActiveBlockPreviewMarkdownPatchEcho({
    previewCode,
    sourcePatchEcho: sourcePatchEcho ?? null,
  });

export const shouldResetPreviewMarkdownEditingState = ({
  canEdit,
  latestSource,
  previousLatestSource,
  previousStateResetKey,
  previewCode,
  sourcePatchEcho,
  stateResetKey,
}: {
  canEdit: boolean;
  latestSource: string;
  previousLatestSource: string;
  previousStateResetKey: string;
  previewCode: string;
  sourcePatchEcho?: PreviewSourcePatchEcho;
  stateResetKey: string;
}) => {
  if (!canEdit) return true;
  if (previousLatestSource === latestSource && previousStateResetKey === stateResetKey) return false;
  if (previousStateResetKey !== stateResetKey) return true;
  return shouldResetPreviewMarkdownEditingForSourceChange({ previewCode, sourcePatchEcho });
};

export const getPreviewFormatToolbarDisabledReason = ({
  canEdit,
  hasActiveBlock,
  isUpgradeRequired,
}: {
  canEdit: boolean;
  hasActiveBlock: boolean;
  isUpgradeRequired: boolean;
}): PreviewFormatDisabledReason | undefined => {
  if (canEdit && hasActiveBlock) return undefined;
  if (!canEdit && isUpgradeRequired) return 'upgrade-required';
  if (canEdit) return 'selection-required';
  return 'unavailable';
};

const isHeadingBlockFormat = (format: string) => /^h[1-6]$/.test(format);

const normalizeAiSelectionText = (value: string) => value.replace(/\s+/g, ' ').trim().toLocaleLowerCase();

const MARKDOWN_INLINE_MARKERS = ['**', '__', '~~', '`', '*', '_'] as const;
const MARKDOWN_SOURCE_LIST_MARKER_PATTERN = /^\s{0,12}(?:[-+*]\s+|\d{1,9}[.)]\s+)/;
const MARKDOWN_TASK_LIST_MARKER_PATTERN = /^\[[ xX]\]\s+/;
const MARKDOWN_RENDERED_LIST_MARKER_PATTERN = /^\s*(?:[•◦▪‣]\s+|\d{1,9}[.)]\s+)/;
const MARKDOWN_HEADING_LINE_PATTERN = /^\s{0,3}#{1,6}(?:\s+|$)/;
const MARKDOWN_BLOCKQUOTE_LINE_PATTERN = /^\s{0,3}>\s?/;
const MARKDOWN_TABLE_LINE_PATTERN = /^\s*\|.*\|\s*$/;

export { createPreviewAiSourceVersion } from './previewMarkdownEditingDebug';

const NON_DOCUMENT_AI_SELECTION_CLEAR_GRACE_MS = 750;

const countLines = (value: string) => value.split('\n').length;

const getSourceRangeEndLine = (source: string, start: number, end: number) =>
  countLines(source.slice(0, Math.max(start, end)));

const getSourceOffsetForLineColumn = (
  source: string,
  line: number,
  column: number,
) => {
  const lines = source.split('\n');
  if (
    !Number.isFinite(line) ||
    !Number.isFinite(column) ||
    line < 1 ||
    column < 1 ||
    line > Math.max(1, lines.length)
  ) {
    return null;
  }
  let offset = 0;
  for (let index = 0; index < line - 1; index += 1) {
    offset += (lines[index]?.length ?? 0) + 1;
  }
  const lineText = lines[line - 1] ?? '';
  if (column > lineText.length + 1) return null;
  return offset + column - 1;
};

const sourcePositionRangeToAiSelectionRange = (
  source: string,
  range: PreviewAiSelectionCandidatePatchTarget['sourceRange'],
): PreviewAiSelectionRange | null => {
  if (
    !Number.isInteger(range.startLine) ||
    !Number.isInteger(range.startColumn) ||
    !Number.isInteger(range.endLine) ||
    !Number.isInteger(range.endColumn) ||
    range.endLine < range.startLine
  ) {
    return null;
  }
  const start = getSourceOffsetForLineColumn(source, range.startLine, range.startColumn);
  const end = getSourceOffsetForLineColumn(source, range.endLine, range.endColumn);
  if (start === null || end === null || start < 0 || end <= start || end > source.length) return null;
  return {
    start,
    end,
    startLine: range.startLine,
    endLine: getSourceRangeEndLine(source, start, end),
  };
};

const getSafeOccurrenceIndex = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.trunc(value)
    : 0;

const findNthNormalizedOccurrence = (
  haystack: string,
  needle: string,
  occurrenceIndex: number,
) => {
  if (!needle || occurrenceIndex < 0) return -1;
  let searchFrom = 0;
  let remaining = occurrenceIndex;
  while (searchFrom < haystack.length) {
    const found = haystack.indexOf(needle, searchFrom);
    if (found < 0) return -1;
    if (remaining === 0) return found;
    remaining -= 1;
    searchFrom = found + needle.length;
  }
  return -1;
};

const buildNormalizedMarkdownInlineView = (value: string): { text: string; rawOffsets: number[] } => {
  let text = '';
  const rawOffsets: number[] = [];
  let pendingSpace = false;
  let started = false;

  for (let index = 0; index < value.length; index += 1) {
    const marker = MARKDOWN_INLINE_MARKERS.find((candidate) => value.startsWith(candidate, index));
    if (marker) {
      index += marker.length - 1;
      continue;
    }

    const char = value[index];
    if (/\s/.test(char)) {
      if (started) pendingSpace = true;
      continue;
    }
    if (pendingSpace) {
      text += ' ';
      rawOffsets.push(index - 1);
      pendingSpace = false;
    }
    text += char.toLocaleLowerCase();
    rawOffsets.push(index);
    started = true;
  }

  return { text, rawOffsets };
};

const stripMarkdownSourceLinePrefixWithOffset = (lineText: string) => {
  let value = lineText;
  let previousValue = '';
  let offset = 0;
  while (previousValue !== value) {
    previousValue = value;
    const nextValue = value.replace(/^\s{0,3}>\s?/, '');
    offset += value.length - nextValue.length;
    value = nextValue;
  }
  const stripOnce = (pattern: RegExp) => {
    const nextValue = value.replace(pattern, '');
    offset += value.length - nextValue.length;
    value = nextValue;
  };
  stripOnce(/^\s{0,3}#{1,6}(?:\s+|$)/);
  stripOnce(MARKDOWN_SOURCE_LIST_MARKER_PATTERN);
  stripOnce(MARKDOWN_TASK_LIST_MARKER_PATTERN);
  return { offset, text: value };
};

const stripMarkdownSourceLinePrefix = (lineText: string) =>
  stripMarkdownSourceLinePrefixWithOffset(lineText).text;

const normalizeMarkdownSourceVisibleLine = (lineText: string) =>
  buildNormalizedMarkdownInlineView(stripMarkdownSourceLinePrefix(lineText)).text;

const normalizeMarkdownSelectedVisibleLine = (lineText: string) =>
  buildNormalizedMarkdownInlineView(lineText.replace(MARKDOWN_RENDERED_LIST_MARKER_PATTERN, '')).text;

const normalizeMarkdownVisibleLineSequence = (value: string, normalizeLine: (lineText: string) => string) =>
  value
    .split(/\r\n|\r|\n/)
    .map(normalizeLine)
    .filter(Boolean)
    .join(' ');

const sourceRangeMatchesAiSelection = (sourceText: string, selectedText: string) => {
  const normalizedSelection = normalizeAiSelectionText(selectedText);
  if (normalizeAiSelectionText(sourceText) === normalizedSelection) return true;
  if (buildNormalizedMarkdownInlineView(sourceText).text === normalizedSelection) return true;
  return normalizeMarkdownVisibleLineSequence(sourceText, normalizeMarkdownSourceVisibleLine) ===
    normalizeMarkdownVisibleLineSequence(selectedText, normalizeMarkdownSelectedVisibleLine);
};

const sourceRangeLooksLikeRenderedHtmlText = (
  source: string,
  range: { end: number; line: number; start: number },
) => {
  const lineRange = getLineSelectionRange(source, range.line);
  const beforeSelection = source.slice(lineRange.start, range.start);
  const afterSelection = source.slice(range.end, lineRange.end);
  return /<\s*[a-z][^>]*>[^<]*$/iu.test(beforeSelection) &&
    /^[^<]*<\s*\/\s*[a-z][^>]*>/iu.test(afterSelection);
};

const expandInlineMarkdownSelectionRange = (
  source: string,
  lineStart: number,
  lineEnd: number,
  rangeStart: number,
  rangeEnd: number,
) => {
  let start = rangeStart;
  let end = rangeEnd;

  for (const marker of MARKDOWN_INLINE_MARKERS) {
    const markerStart = start - marker.length;
    const selectedSource = source.slice(start, end);
    if (
      markerStart >= lineStart &&
      source.slice(markerStart, start) === marker &&
      selectedSource.includes(marker)
    ) {
      start = markerStart;
      break;
    }
  }

  for (const marker of MARKDOWN_INLINE_MARKERS) {
    const selectedSource = source.slice(start, end);
    if (
      end + marker.length <= lineEnd &&
      source.slice(end, end + marker.length) === marker &&
      selectedSource.includes(marker)
    ) {
      end += marker.length;
      break;
    }
  }

  return { start, end };
};

const getInlineMarkdownSelectionTextRange = (
  source: string,
  sourceLine: number,
  selectedText: string,
  occurrenceIndex = 0,
): { line: number; start: number; end: number } | null => {
  const normalizedNeedle = normalizeAiSelectionText(selectedText);
  if (normalizedNeedle.length < AI_SELECTION_MIN_LENGTH) return null;
  const lineRange = getLineSelectionRange(source, sourceLine);
  const lineSource = source.slice(lineRange.start, lineRange.end);
  const { text, rawOffsets } = buildNormalizedMarkdownInlineView(lineSource);
  const startIndex = findNthNormalizedOccurrence(text, normalizedNeedle, occurrenceIndex);
  if (startIndex < 0) return null;
  const endIndex = startIndex + normalizedNeedle.length - 1;
  const rawStart = rawOffsets[startIndex] ?? -1;
  const rawEndOffset = rawOffsets[endIndex] ?? -1;
  if (rawStart < 0 || rawEndOffset < 0) return null;
  const expandedRange = expandInlineMarkdownSelectionRange(
    source,
    lineRange.start,
    lineRange.end,
    lineRange.start + rawStart,
    lineRange.start + rawEndOffset + 1,
  );
  if (expandedRange.end <= expandedRange.start) return null;
  return {
    line: lineRange.line,
    start: expandedRange.start,
    end: expandedRange.end,
  };
};

const clampMarkdownLineRange = (
  range: MarkdownLineRange,
  lineCount: number,
): MarkdownLineRange => {
  const startLine = Math.min(Math.max(Math.trunc(range.startLine), 1), lineCount);
  const endLine = Math.min(
    Math.max(Math.trunc(range.endLine), startLine),
    lineCount,
  );
  return { startLine, endLine };
};

const getCandidateMarkdownLineRange = (
  candidate: PreviewAiSelectionCandidate,
  lineCount: number,
): MarkdownLineRange => {
  if (
    candidate.sourceLineRange &&
    Number.isFinite(candidate.sourceLineRange.startLine) &&
    Number.isFinite(candidate.sourceLineRange.endLine)
  ) {
    return clampMarkdownLineRange(candidate.sourceLineRange, lineCount);
  }
  const sourceLine = Number.isFinite(candidate.sourceLine) ? candidate.sourceLine : 1;
  return clampMarkdownLineRange({ startLine: sourceLine, endLine: sourceLine }, lineCount);
};

const sameMarkdownLineRange = (left: MarkdownLineRange, right: MarkdownLineRange) =>
  left.startLine === right.startLine && left.endLine === right.endLine;

const markdownLineRangeContains = (outer: MarkdownLineRange, inner: MarkdownLineRange) =>
  outer.startLine <= inner.startLine && outer.endLine >= inner.endLine;

const intersectMarkdownLineRange = (
  left: MarkdownLineRange,
  right: MarkdownLineRange,
): MarkdownLineRange | null => {
  const startLine = Math.max(left.startLine, right.startLine);
  const endLine = Math.min(left.endLine, right.endLine);
  return endLine >= startLine ? { startLine, endLine } : null;
};

const pushMarkdownSearchScope = (
  scopes: MarkdownSearchScope[],
  scope: MarkdownSearchScope | null | undefined,
) => {
  if (!scope) return;
  if (scopes.some((existing) => sameMarkdownLineRange(existing, scope))) return;
  scopes.push(scope);
};

const getMarkdownSourceLineText = (source: string, line: number) => {
  const lineRange = getLineSelectionRange(source, line);
  return source.slice(lineRange.start, lineRange.end);
};

const isMarkdownBlankLine = (lineText: string) => lineText.trim().length === 0;

const isMarkdownHeadingLine = (lineText: string) => MARKDOWN_HEADING_LINE_PATTERN.test(lineText);

const isMarkdownBlockquoteLine = (lineText: string) => MARKDOWN_BLOCKQUOTE_LINE_PATTERN.test(lineText);

const getMarkdownListLineInfo = (lineText: string) => {
  const match = lineText.match(/^(\s{0,12})(?:[-+*]\s+|\d{1,9}[.)]\s+)/);
  return match ? { indent: match[1]?.length ?? 0 } : null;
};

const isMarkdownListLine = (lineText: string) => Boolean(getMarkdownListLineInfo(lineText));

const isMarkdownListContinuationLine = (lineText: string) =>
  /^\s{2,}\S/.test(lineText) &&
  !isMarkdownHeadingLine(lineText) &&
  !isMarkdownBlockquoteLine(lineText);

const isMarkdownListBlockLine = (lineText: string) =>
  isMarkdownListLine(lineText) || isMarkdownListContinuationLine(lineText);

const isMarkdownFenceLine = (lineText: string) => /^\s*(`{3,}|~{3,})/.test(lineText);

const isMarkdownTableLine = (lineText: string) => MARKDOWN_TABLE_LINE_PATTERN.test(lineText);

const isMarkdownParagraphLine = (lineText: string) =>
  !isMarkdownBlankLine(lineText) &&
  !isMarkdownHeadingLine(lineText) &&
  !isMarkdownBlockquoteLine(lineText) &&
  !isMarkdownListLine(lineText) &&
  !isMarkdownFenceLine(lineText) &&
  !isMarkdownTableLine(lineText);

const findMarkdownLineInRange = (
  source: string,
  range: MarkdownLineRange,
  anchorLine: number,
  predicate: (lineText: string) => boolean,
) => {
  if (anchorLine >= range.startLine && anchorLine <= range.endLine) {
    if (predicate(getMarkdownSourceLineText(source, anchorLine))) return anchorLine;
  }
  for (let line = range.startLine; line <= range.endLine; line += 1) {
    if (line === anchorLine) continue;
    if (predicate(getMarkdownSourceLineText(source, line))) return line;
  }
  return null;
};

const expandMarkdownLineScope = (
  source: string,
  line: number,
  outerScope: MarkdownLineRange,
  predicate: (lineText: string) => boolean,
) => {
  let startLine = line;
  let endLine = line;
  while (
    startLine > outerScope.startLine &&
    predicate(getMarkdownSourceLineText(source, startLine - 1))
  ) {
    startLine -= 1;
  }
  while (
    endLine < outerScope.endLine &&
    predicate(getMarkdownSourceLineText(source, endLine + 1))
  ) {
    endLine += 1;
  }
  return { startLine, endLine };
};

const getSmallestMarkdownHeadingScope = (
  source: string,
  anchorLine: number,
): MarkdownLineRange | null => {
  const entries = buildArtifactMap(source) as Array<{
    kind?: string;
    level?: number;
    line?: number;
    sectionEndLine?: number;
  }>;
  let best:
    | (MarkdownLineRange & { level: number })
    | null = null;
  for (const entry of entries) {
    if (entry.kind !== 'heading' || !Number.isFinite(entry.line)) continue;
    const startLine = Number(entry.line);
    const endLine = Number.isFinite(entry.sectionEndLine)
      ? Number(entry.sectionEndLine)
      : startLine;
    if (startLine > anchorLine || endLine < anchorLine) continue;
    const level = Number.isFinite(entry.level) ? Number(entry.level) : 1;
    if (
      !best ||
      level > best.level ||
      (level === best.level && startLine >= best.startLine)
    ) {
      best = { endLine, level, startLine };
    }
  }
  return best ? { startLine: best.startLine, endLine: best.endLine } : null;
};

const getMarkdownLocalStructureScope = (
  source: string,
  candidateRange: MarkdownLineRange,
  anchorLine: number,
  outerScope: MarkdownLineRange,
): MarkdownSearchScope | null => {
  const searchRange = intersectMarkdownLineRange(candidateRange, outerScope) ?? outerScope;
  const listLine = findMarkdownLineInRange(source, searchRange, anchorLine, isMarkdownListLine);
  if (listLine !== null) {
    return {
      ...expandMarkdownLineScope(source, listLine, outerScope, (lineText) =>
        !isMarkdownBlankLine(lineText) && isMarkdownListBlockLine(lineText),
      ),
      kind: 'list',
    };
  }

  const quoteLine = findMarkdownLineInRange(source, searchRange, anchorLine, isMarkdownBlockquoteLine);
  if (quoteLine !== null) {
    return {
      ...expandMarkdownLineScope(source, quoteLine, outerScope, isMarkdownBlockquoteLine),
      kind: 'quote',
    };
  }

  const paragraphLine = findMarkdownLineInRange(source, searchRange, anchorLine, isMarkdownParagraphLine);
  if (paragraphLine !== null) {
    return {
      ...expandMarkdownLineScope(source, paragraphLine, outerScope, isMarkdownParagraphLine),
      kind: 'paragraph',
    };
  }

  return null;
};

const getPreviewAiMarkdownSearchScopes = (
  source: string,
  candidate: PreviewAiSelectionCandidate,
): MarkdownSearchScope[] => {
  const lineCount = getSourceLineCount(source);
  const candidateRange = getCandidateMarkdownLineRange(candidate, lineCount);
  const anchorLine = Math.min(Math.max(Math.trunc(candidate.sourceLine), 1), lineCount);
  const headingScope = getSmallestMarkdownHeadingScope(source, anchorLine);
  const outerScope = headingScope ?? candidateRange;
  const scopes: MarkdownSearchScope[] = [];
  pushMarkdownSearchScope(
    scopes,
    getMarkdownLocalStructureScope(source, candidateRange, anchorLine, outerScope),
  );
  if (headingScope) pushMarkdownSearchScope(scopes, { ...headingScope, kind: 'heading' });
  if (!headingScope || markdownLineRangeContains(headingScope, candidateRange)) {
    pushMarkdownSearchScope(scopes, { ...candidateRange, kind: 'candidate' });
  }
  return scopes;
};

const findPreviewAiMarkdownLinePatchTargetInScope = (
  source: string,
  scope: MarkdownSearchScope,
  normalizedSelection: string,
  candidate: PreviewAiSelectionCandidate,
): PreviewAiSelectionPatchTarget | undefined => {
  const sourceLines: Array<{
    end: number;
    line: number;
    start: number;
    visibleText: string;
  }> = [];
  for (let line = scope.startLine; line <= scope.endLine; line += 1) {
    const lineRange = getLineSelectionRange(source, line);
    const rawText = source.slice(lineRange.start, lineRange.end);
    sourceLines.push({
      end: lineRange.end,
      line: lineRange.line,
      start: lineRange.start,
      visibleText: normalizeMarkdownSourceVisibleLine(rawText),
    });
  }
  const matches: Array<{
    end: number;
    endLine: number;
    start: number;
    startLine: number;
  }> = [];
  for (let startIndex = 0; startIndex < sourceLines.length; startIndex += 1) {
    if (!sourceLines[startIndex].visibleText) continue;
    const visibleLines: string[] = [];
    for (let endIndex = startIndex; endIndex < sourceLines.length; endIndex += 1) {
      const currentLine = sourceLines[endIndex];
      if (currentLine.visibleText) visibleLines.push(currentLine.visibleText);
      const normalizedWindow = visibleLines.join(' ');
      if (!normalizedWindow) continue;
      if (normalizedWindow === normalizedSelection) {
        matches.push({
          end: currentLine.end,
          endLine: currentLine.line,
          start: sourceLines[startIndex].start,
          startLine: sourceLines[startIndex].line,
        });
      }
      if (
        normalizedWindow.length > normalizedSelection.length &&
        !normalizedSelection.startsWith(normalizedWindow)
      ) {
        break;
      }
    }
  }
  if (matches.length === 0) return undefined;
  const candidateLine = Math.min(
    Math.max(Math.trunc(candidate.sourceLine), scope.startLine),
    scope.endLine,
  );
  const occurrenceIndex = getSafeOccurrenceIndex(candidate.selectionOccurrenceIndex);
  const match = matches.find((candidateMatch) =>
    candidateMatch.startLine <= candidateLine && candidateMatch.endLine >= candidateLine,
  ) ?? matches[Math.min(occurrenceIndex, matches.length - 1)];
  const selectedSource = source.slice(match.start, match.end);
  if (!selectedSource.trim()) return undefined;
  return {
    selectedText: selectedSource,
    sourceRange: {
      start: match.start,
      end: match.end,
      startLine: match.startLine,
      endLine: getSourceRangeEndLine(source, match.start, match.end),
    },
  };
};

const resolvePreviewAiMarkdownLinePatchTarget = (
  source: string,
  candidate: PreviewAiSelectionCandidate,
  selectedText: string,
): PreviewAiSelectionPatchTarget | undefined => {
  if (
    candidate.patchable === false ||
    candidate.patchTarget ||
    candidate.image ||
    candidate.islandId !== PREVIEW_MARKDOWN_DOCUMENT_ID ||
    (candidate.contentKind && candidate.contentKind !== 'text') ||
    !Number.isFinite(candidate.sourceLine)
  ) {
    return undefined;
  }
  const normalizedSelection = normalizeMarkdownVisibleLineSequence(
    selectedText,
    normalizeMarkdownSelectedVisibleLine,
  );
  if (normalizedSelection.length < AI_SELECTION_MIN_LENGTH) return undefined;
  const scopes = getPreviewAiMarkdownSearchScopes(source, candidate);
  for (const scope of scopes) {
    const patchTarget = findPreviewAiMarkdownLinePatchTargetInScope(
      source,
      scope,
      normalizedSelection,
      candidate,
    );
    if (patchTarget) return patchTarget;
  }
  return undefined;
};

const buildNormalizedMarkdownSourceScopeView = (
  source: string,
  scope: MarkdownSearchScope,
) => {
  const view: { rawOffsets: number[]; text: string } = { rawOffsets: [], text: '' };
  for (let line = scope.startLine; line <= scope.endLine; line += 1) {
    const lineRange = getLineSelectionRange(source, line);
    const rawText = source.slice(lineRange.start, lineRange.end);
    const { offset, text } = stripMarkdownSourceLinePrefixWithOffset(rawText);
    const normalizedLine = buildNormalizedMarkdownInlineView(text);
    if (!normalizedLine.text) continue;
    if (view.text) {
      view.text += ' ';
      view.rawOffsets.push(Math.max(lineRange.start, lineRange.start + offset - 1));
    }
    view.text += normalizedLine.text;
    normalizedLine.rawOffsets.forEach((rawOffset) => {
      view.rawOffsets.push(lineRange.start + offset + rawOffset);
    });
  }
  return view;
};

const findPreviewAiMarkdownVisiblePatchTargetInScope = (
  source: string,
  scope: MarkdownSearchScope,
  normalizedSelection: string,
  candidate: PreviewAiSelectionCandidate,
): PreviewAiSelectionPatchTarget | undefined => {
  const view = buildNormalizedMarkdownSourceScopeView(source, scope);
  if (!view.text || view.rawOffsets.length !== view.text.length) return undefined;
  const matches: Array<{
    end: number;
    endLine: number;
    start: number;
    startLine: number;
  }> = [];
  let searchFrom = 0;
  while (searchFrom < view.text.length) {
    const found = view.text.indexOf(normalizedSelection, searchFrom);
    if (found < 0) break;
    const endIndex = found + normalizedSelection.length - 1;
    const rawStart = view.rawOffsets[found] ?? -1;
    const rawEndOffset = view.rawOffsets[endIndex] ?? -1;
    if (rawStart >= 0 && rawEndOffset >= rawStart) {
      const rawEnd = rawEndOffset + 1;
      const selectedSource = source.slice(rawStart, rawEnd);
      const candidateRange = {
        end: rawEnd,
        line: countLines(source.slice(0, rawStart)),
        start: rawStart,
      };
      if (
        sourceRangeMatchesAiSelection(selectedSource, candidate.selectedText) &&
        !sourceRangeLooksLikeRenderedHtmlText(source, candidateRange)
      ) {
        matches.push({
          end: rawEnd,
          endLine: getSourceRangeEndLine(source, rawStart, rawEnd),
          start: rawStart,
          startLine: candidateRange.line,
        });
      }
    }
    searchFrom = found + Math.max(1, normalizedSelection.length);
  }
  if (matches.length === 0) return undefined;
  const candidateLine = Math.min(
    Math.max(Math.trunc(candidate.sourceLine), scope.startLine),
    scope.endLine,
  );
  const occurrenceIndex = getSafeOccurrenceIndex(candidate.selectionOccurrenceIndex);
  const match = matches.find((candidateMatch) =>
    candidateMatch.startLine <= candidateLine && candidateMatch.endLine >= candidateLine,
  ) ?? matches[Math.min(occurrenceIndex, matches.length - 1)];
  const selectedSource = source.slice(match.start, match.end);
  if (!selectedSource.trim()) return undefined;
  return {
    selectedText: selectedSource,
    sourceRange: {
      start: match.start,
      end: match.end,
      startLine: match.startLine,
      endLine: match.endLine,
    },
  };
};

const resolvePreviewAiMarkdownVisiblePatchTarget = (
  source: string,
  candidate: PreviewAiSelectionCandidate,
  selectedText: string,
): PreviewAiSelectionPatchTarget | undefined => {
  if (
    candidate.patchable === false ||
    candidate.patchTarget ||
    candidate.image ||
    candidate.islandId !== PREVIEW_MARKDOWN_DOCUMENT_ID ||
    (candidate.contentKind && candidate.contentKind !== 'text') ||
    !Number.isFinite(candidate.sourceLine)
  ) {
    return undefined;
  }
  const normalizedSelection = normalizeMarkdownVisibleLineSequence(
    selectedText,
    normalizeMarkdownSelectedVisibleLine,
  );
  if (normalizedSelection.length < AI_SELECTION_MIN_LENGTH) return undefined;
  const scopes = getPreviewAiMarkdownSearchScopes(source, candidate);
  for (const scope of scopes) {
    const patchTarget = findPreviewAiMarkdownVisiblePatchTargetInScope(
      source,
      scope,
      normalizedSelection,
      candidate,
    );
    if (patchTarget) return patchTarget;
  }
  return undefined;
};

const isFiniteRect = (rect: PreviewAiSelectionRect) =>
  Number.isFinite(rect.top) &&
  Number.isFinite(rect.left) &&
  Number.isFinite(rect.width) &&
  Number.isFinite(rect.height) &&
  rect.width > 0 &&
  rect.height > 0;

const normalizePreviewAiSelectionRects = (
  rects: PreviewAiSelectionRect[] | undefined,
) => {
  const safeRects = (rects ?? []).filter(isFiniteRect);
  return safeRects.length > 0
    ? safeRects.map((rect) => ({
        height: rect.height,
        left: rect.left,
        top: rect.top,
        width: rect.width,
      }))
    : undefined;
};

const getSourceLineCount = (source: string) => Math.max(1, source.split(/\r\n|\r|\n/).length);

const getPreviewAiCandidateSourceLines = (
  source: string,
  candidate: PreviewAiSelectionCandidate,
) => {
  const lineCount = getSourceLineCount(source);
  const primaryLine = Math.min(Math.max(Math.trunc(candidate.sourceLine), 1), lineCount);
  const range = candidate.sourceLineRange;
  if (
    !range ||
    !Number.isFinite(range.startLine) ||
    !Number.isFinite(range.endLine)
  ) {
    return [primaryLine];
  }
  const startLine = Math.min(Math.max(Math.trunc(range.startLine), 1), lineCount);
  const endLine = Math.min(Math.max(Math.trunc(range.endLine), startLine), lineCount);
  const lines = [primaryLine];
  for (let line = startLine; line <= endLine; line += 1) {
    if (line !== primaryLine) lines.push(line);
  }
  return lines;
};

const getPreviewAiCandidateContextRange = (
  source: string,
  candidate: PreviewAiSelectionCandidate,
): PreviewAiSelectionRange | null => {
  const lines = getPreviewAiCandidateSourceLines(source, candidate);
  if (lines.length === 0) return null;
  const startLine = Math.min(...lines);
  const endLine = Math.max(...lines);
  const startRange = getLineSelectionRange(source, startLine);
  const endRange = getLineSelectionRange(source, endLine);
  return {
    start: startRange.start,
    end: endRange.end,
    startLine: startRange.line,
    endLine: endRange.line,
  };
};

const resolvePreviewAiSelectionRawRange = (
  source: string,
  candidate: PreviewAiSelectionCandidate,
  selectedText: string,
) => {
  const lineCount = getSourceLineCount(source);
  const primaryCandidateLine = getLineSelectionRange(source, candidate.sourceLine).line;
  const candidateOccurrenceIndex = getSafeOccurrenceIndex(candidate.selectionOccurrenceIndex);
  const candidateRange = getCandidateMarkdownLineRange(candidate, lineCount);
  const headingScope = candidate.islandId === PREVIEW_MARKDOWN_DOCUMENT_ID
    ? getSmallestMarkdownHeadingScope(source, primaryCandidateLine)
    : null;
  const rawSearchScope = headingScope && !markdownLineRangeContains(headingScope, candidateRange)
    ? headingScope
    : candidateRange;
  const rawSearchLines = [primaryCandidateLine];
  for (let line = rawSearchScope.startLine; line <= rawSearchScope.endLine; line += 1) {
    if (line !== primaryCandidateLine) rawSearchLines.push(line);
  }
  const rawRangeTouchesCandidateLine = (range: { end: number; line: number; start: number }, candidateLine: number) => {
    const startLine = range.line;
    const endLine = getSourceRangeEndLine(source, range.start, range.end);
    return startLine <= candidateLine && endLine >= candidateLine;
  };
  for (const sourceLine of rawSearchLines) {
    const candidateLine = getLineSelectionRange(source, sourceLine).line;
    const lineOccurrenceIndex = candidateLine === primaryCandidateLine ? candidateOccurrenceIndex : 0;
    const occurrenceIndex =
      getSourceLineTextOccurrenceIndex(source, sourceLine, selectedText) + lineOccurrenceIndex;
    const exactRange = getSelectionTextRange(source, selectedText, occurrenceIndex, rawSearchScope);
    const exactRawRange = exactRange &&
      rawRangeTouchesCandidateLine(exactRange, candidateLine) &&
      sourceRangeMatchesAiSelection(source.slice(exactRange.start, exactRange.end), selectedText)
      ? exactRange
      : null;
    if (exactRawRange && !sourceRangeLooksLikeRenderedHtmlText(source, exactRawRange)) return exactRawRange;
    const inlineRawRange = getInlineMarkdownSelectionTextRange(source, sourceLine, selectedText, lineOccurrenceIndex);
    if (inlineRawRange && !sourceRangeLooksLikeRenderedHtmlText(source, inlineRawRange)) return inlineRawRange;
  }
  return null;
};

const isFullDocumentAiPatchTarget = (
  source: string,
  range: PreviewAiSelectionRange,
) => range.start === 0 && range.end === source.length;

const resolvePreviewAiExplicitPatchTarget = (
  source: string,
  candidate: PreviewAiSelectionCandidate,
): PreviewAiSelectionPatchTarget | undefined => {
  const explicitPatchTarget = candidate.patchTarget;
  if (!explicitPatchTarget || candidate.patchable === false) return undefined;
  const selectedText = explicitPatchTarget.selectedText.trim();
  if (selectedText.length < AI_SELECTION_MIN_LENGTH) return undefined;
  const sourceRange = sourcePositionRangeToAiSelectionRange(source, explicitPatchTarget.sourceRange);
  if (!sourceRange) return undefined;
  if (
    explicitPatchTarget.kind !== 'artifact-source' &&
    candidate.islandId === PREVIEW_MARKDOWN_DOCUMENT_ID &&
    isFullDocumentAiPatchTarget(source, sourceRange) &&
    source.length > PREVIEW_AI_DOCUMENT_REPLACE_MAX_LENGTH
  ) {
    return undefined;
  }
  const selectedSource = source.slice(sourceRange.start, sourceRange.end);
  if (!sourceRangeMatchesAiSelection(selectedSource, selectedText)) return undefined;
  return {
    ...(explicitPatchTarget.kind ? { kind: explicitPatchTarget.kind } : {}),
    selectedText,
    sourceRange,
  };
};

export const resolvePreviewAiSelection = ({
  candidate,
  source,
  sourceKind = 'markdown',
}: {
  candidate: PreviewAiSelectionCandidate | null;
  source: string;
  sourceKind?: PublicAiSourceKind;
}): PreviewAiSelection | null => {
  if (!candidate || !isFiniteRect(candidate.rect)) return null;
  const selectedText = candidate.selectedText.trim();
  if (
    selectedText.length < AI_SELECTION_MIN_LENGTH ||
    !Number.isFinite(candidate.sourceLine) ||
    candidate.sourceLine < 1
  ) {
    return null;
  }
  const explicitPatchTarget = resolvePreviewAiExplicitPatchTarget(source, candidate);
  const candidateSourceRange = candidate.sourceRange
    ? sourcePositionRangeToAiSelectionRange(source, candidate.sourceRange)
    : undefined;
  // Declared-but-invalid authority must not downgrade to visible-only.
  if (candidate.sourceRange && !candidateSourceRange) return null;
  const contextRange = getPreviewAiCandidateContextRange(source, candidate);
  if (!contextRange) return null;
  const isContextOnlyCandidate = candidate.patchable === false ||
    Boolean(candidate.image) ||
    Boolean(candidate.contentKind && candidate.contentKind !== 'text');
  const rawRange = isContextOnlyCandidate || candidate.patchTarget
    ? null
    : resolvePreviewAiSelectionRawRange(source, candidate, selectedText);
  const rawRangePatchTarget = rawRange &&
    sourceRangeMatchesAiSelection(source.slice(rawRange.start, rawRange.end), selectedText)
    ? {
        selectedText,
        sourceRange: {
          start: rawRange.start,
          end: rawRange.end,
          startLine: rawRange.line,
          endLine: getSourceRangeEndLine(source, rawRange.start, rawRange.end),
        },
      }
    : undefined;
  const markdownBlockLinePatchTarget = explicitPatchTarget || rawRangePatchTarget
    ? undefined
    : resolvePreviewAiMarkdownLinePatchTarget(source, candidate, selectedText);
  const markdownVisibleRangePatchTarget = explicitPatchTarget || rawRangePatchTarget || markdownBlockLinePatchTarget
    ? undefined
    : resolvePreviewAiMarkdownVisiblePatchTarget(source, candidate, selectedText);
  const patchTarget =
    explicitPatchTarget ??
    rawRangePatchTarget ??
    markdownBlockLinePatchTarget ??
    markdownVisibleRangePatchTarget;
  // Request authority stays independent from mutation authority. Ordinary text
  // uses its exact resolved range instead of the producer's broader node range.
  const sourceRange = candidate.patchTarget || isContextOnlyCandidate
    ? candidateSourceRange ?? patchTarget?.sourceRange
    : patchTarget?.sourceRange ?? candidateSourceRange;
  return {
    capturedAt: candidate.capturedAt,
    contentKind: candidate.contentKind,
    contextLineRange: {
      startLine: contextRange.startLine,
      endLine: contextRange.endLine,
    },
    contextRange,
    image: candidate.image,
    islandId: candidate.islandId,
    patchTarget,
    repairDiagnostic: candidate.repairDiagnostic,
    rect: candidate.rect,
    selectionRects: normalizePreviewAiSelectionRects(candidate.selectionRects),
    selectionScope: candidate.selectionScope,
    selectedText,
    sourceKind,
    sourceSnapshot: source,
    sourceRange,
    sourceVersion: createPreviewAiSourceVersion(source),
    visibleText: selectedText,
  };
};

export const usePreviewMarkdownEditing = ({
  code,
  contentType,
  deliveryRequestContext,
  latestSource = code,
  onBeforePatch,
  onAiInstructionNotice,
  onInsertImageFile,
  onPatch,
  onRequestEditorLineFocus,
  onFinalCursorSourceLineChange,
  previewCode,
  previewLineMap,
  processedCode,
  isUpgradeRequired = false,
  sourceKind = 'document',
  sourcePatchEcho = null,
  stateResetKey,
}: {
  code: string;
  contentType: ContentType;
  deliveryRequestContext?: DeliveryRequestContext;
  latestSource?: string;
  onBeforePatch?: () => void;
  onAiInstructionNotice?: (notice: DeliveryNotice | null) => void;
  onInsertImageFile?: (file: File) => Promise<string | null>;
  onPatch?: (nextSource: string, meta?: PreviewMarkdownPatchMeta) => void;
  onRequestEditorLineFocus?: (line: number) => void;
  onFinalCursorSourceLineChange?: (
    line: number,
    selectedText?: string | null,
    meta?: PreviewFinalCursorSourceLineMeta,
  ) => void;
  previewCode: string;
  previewLineMap?: SourceLineMap;
  processedCode: string;
  isUpgradeRequired?: boolean;
  sourceKind?: PreviewEditingSourceKind;
  sourcePatchEcho?: PreviewSourcePatchEcho;
  stateResetKey?: string;
}): PreviewMarkdownEditingController => {
  const [activeIslandId, setActiveIslandId] = useState<string | null>(null);
  const activeIslandIdRef = useRef<string | null>(null);
  const [activeLexicalFormat, setActiveLexicalFormat] = useState<{
    controller: PreviewMarkdownLexicalFormatController;
    snapshot: PreviewMarkdownLexicalFormatSnapshot;
  } | null>(null);
  const [aiSelection, setAiSelection] = useState<PreviewAiSelection | null>(null);
  const [appliedAiReplacement, setAppliedAiReplacement] = useState<PreviewAiAppliedReplacement | null>(null);
  const activeLexicalFormatRef = useRef<{
    controller: PreviewMarkdownLexicalFormatController;
    snapshot: PreviewMarkdownLexicalFormatSnapshot;
  } | null>(null);
  const appliedAiReplacementRef = useRef<PreviewAiAppliedReplacement | null>(null);
  const aiFocusRestorersRef = useRef(new Map<string, PreviewAiFocusRestorer>());
  const aiReplacementAppliersRef = useRef(new Map<string, PreviewAiReplacementApplier>());
  const aiSelectionRef = useRef<PreviewAiSelection | null>(null);
  const latestSourceRef = useRef(latestSource);
  const onPatchRef = useRef(onPatch);
  const onBeforePatchRef = useRef(onBeforePatch);
  const transactionIdRef = useRef(0);
  latestSourceRef.current = latestSource;
  onPatchRef.current = onPatch;
  onBeforePatchRef.current = onBeforePatch;
  const canEditDirectly = canUsePreviewMarkdownEditing({
    code,
    contentType,
    hasPatch: Boolean(onPatch),
    latestSource,
    processedCode,
    sourceKind,
  });
  const settlingLocalPatchSourceRef = useRef<string | null>(null);
  const activeLocalPatchSource = sourcePatchEcho?.meta.origin === 'preview-markdown-edit' &&
    sourcePatchEcho.meta.renderScope === 'active-block'
    ? sourcePatchEcho.source
    : null;
  if (activeLocalPatchSource) {
    settlingLocalPatchSourceRef.current = activeLocalPatchSource;
  }
  const settlingLocalPatchSource = settlingLocalPatchSourceRef.current;
  const isLocalPatchSourceSettling = Boolean(
    settlingLocalPatchSource &&
    latestSource === settlingLocalPatchSource &&
    (code === settlingLocalPatchSource || previewCode === settlingLocalPatchSource),
  );
  const canEdit = canEditDirectly || isLocalPatchSourceSettling;
  if (canEditDirectly && !activeLocalPatchSource) {
    settlingLocalPatchSourceRef.current = null;
  }
  const enabled = canEdit;
  const effectiveStateResetKey = stateResetKey ?? latestSource;
  const observedSourceStateRef = useRef({
    latestSource,
    stateResetKey: effectiveStateResetKey,
  });

  useLayoutEffect(() => {
    latestSourceRef.current = latestSource;
    onPatchRef.current = onPatch;
    onBeforePatchRef.current = onBeforePatch;
  }, [latestSource, onBeforePatch, onPatch]);

  const updateAppliedAiReplacement = useCallback((next: PreviewAiAppliedReplacement | null) => {
    appliedAiReplacementRef.current = next;
    setAppliedAiReplacement(next);
  }, []);

  const clearActiveEditingState = useCallback(() => {
    activeIslandIdRef.current = null;
    activeLexicalFormatRef.current = null;
    aiSelectionRef.current = null;
    setActiveIslandId(null);
    setActiveLexicalFormat(null);
    setAiSelection(null);
  }, []);

  const clearAiSelection = useCallback(() => {
    aiSelectionRef.current = null;
    setAiSelection(null);
  }, []);

  useLayoutEffect(() => {
    const previousState = observedSourceStateRef.current;
    const shouldReset = shouldResetPreviewMarkdownEditingState({
      canEdit,
      latestSource,
      previousLatestSource: previousState.latestSource,
      previousStateResetKey: previousState.stateResetKey,
      previewCode,
      sourcePatchEcho,
      stateResetKey: effectiveStateResetKey,
    });
    observedSourceStateRef.current = {
      latestSource,
      stateResetKey: effectiveStateResetKey,
    };
    if (shouldReset) {
      const shouldKeepAppliedAiReplacement =
        previousState.stateResetKey === effectiveStateResetKey &&
        appliedAiReplacementRef.current?.afterSource === latestSource;
      clearActiveEditingState();
      if (!shouldKeepAppliedAiReplacement) updateAppliedAiReplacement(null);
    }
  }, [
    canEdit,
    clearActiveEditingState,
    effectiveStateResetKey,
    latestSource,
    previewCode,
    sourcePatchEcho,
    updateAppliedAiReplacement,
  ]);

  const handleActiveIslandChange = useCallback((islandId: string | null) => {
    activeIslandIdRef.current = islandId;
    setActiveIslandId(islandId);
    if (!islandId) {
      activeLexicalFormatRef.current = null;
      setActiveLexicalFormat(null);
    }
  }, []);

  const handleCommitIslandEdit = useCallback((islandId: string) => {
    if (activeIslandIdRef.current !== islandId) return;
    handleActiveIslandChange(null);
  }, [handleActiveIslandChange]);

  const handleLexicalFormatChange = useCallback(
    (
      snapshot: PreviewMarkdownLexicalFormatSnapshot | null,
      controller?: PreviewMarkdownLexicalFormatController,
    ) => {
      if (!snapshot || !controller || !snapshot.canFormat) {
        if (activeLexicalFormatRef.current === null) return;
        activeLexicalFormatRef.current = null;
        setActiveLexicalFormat((current) => current === null ? current : null);
        return;
      }
      activeIslandIdRef.current = snapshot.islandId;
      setActiveIslandId(snapshot.islandId);
      const nextActiveLexicalFormat = { controller, snapshot };
      activeLexicalFormatRef.current = nextActiveLexicalFormat;
      setActiveLexicalFormat(nextActiveLexicalFormat);
    },
    [],
  );

  const handleLexicalAiSelectionChange = useCallback((candidate: PreviewAiSelectionCandidate | null) => {
    const nextSelection = resolvePreviewAiSelection({
      candidate,
      source: latestSourceRef.current,
      sourceKind: getPublicAiSourceKindForContentType(contentType),
    });
    debugPreviewMarkdownEditing('ai-selection-resolve', {
      candidate: candidate
        ? {
            islandId: candidate.islandId,
            selectionOccurrenceIndex: candidate.selectionOccurrenceIndex ?? 0,
            selectedTextLength: candidate.selectedText.length,
            sourceLine: candidate.sourceLine,
            sourceLineRange: candidate.sourceLineRange,
          }
        : null,
      resolvedRange: nextSelection?.sourceRange ?? null,
      resolvedContextRange: nextSelection?.contextRange ?? null,
      sourceLength: latestSourceRef.current.length,
      sourceVersion: createPreviewAiSourceVersion(latestSourceRef.current),
    });
    const current = aiSelectionRef.current;
    if (
      !nextSelection &&
      !candidate &&
      current &&
      current.islandId !== 'document:preview-markdown' &&
      Date.now() - current.capturedAt < NON_DOCUMENT_AI_SELECTION_CLEAR_GRACE_MS
    ) {
      return;
    }
    if (
      current &&
      nextSelection &&
      current.islandId === nextSelection.islandId &&
      current.visibleText === nextSelection.visibleText &&
      current.sourceSnapshot === nextSelection.sourceSnapshot &&
      (current.sourceRange?.start ?? -1) === (nextSelection.sourceRange?.start ?? -1) &&
      (current.sourceRange?.end ?? -1) === (nextSelection.sourceRange?.end ?? -1) &&
      (current.patchTarget?.sourceRange.start ?? -1) === (nextSelection.patchTarget?.sourceRange.start ?? -1) &&
      (current.patchTarget?.sourceRange.end ?? -1) === (nextSelection.patchTarget?.sourceRange.end ?? -1) &&
      (current.contextRange?.start ?? -1) === (nextSelection.contextRange?.start ?? -1) &&
      (current.contextRange?.end ?? -1) === (nextSelection.contextRange?.end ?? -1) &&
      current.selectionScope === nextSelection.selectionScope
    ) {
      return;
    }
    aiSelectionRef.current = nextSelection;
    setAiSelection(nextSelection);
  }, [contentType]);

  const handlePatch = useCallback((nextSource: string, meta?: PreviewMarkdownPatchMeta) => {
    const onPatchHandler = onPatchRef.current;
    if (!onPatchHandler || nextSource === latestSourceRef.current) return;
    latestSourceRef.current = nextSource;
    transactionIdRef.current = Math.max(transactionIdRef.current, meta?.transactionId ?? 0);
    onPatchHandler(nextSource, meta);
  }, []);

  const registerAiReplacementApplier = useCallback((
    islandId: string,
    applier: PreviewAiReplacementApplier,
  ) => {
    aiReplacementAppliersRef.current.set(islandId, applier);
    return () => {
      if (aiReplacementAppliersRef.current.get(islandId) === applier) {
        aiReplacementAppliersRef.current.delete(islandId);
      }
    };
  }, []);

  const registerAiFocusRestorer = useCallback((
    islandId: string,
    restorer: PreviewAiFocusRestorer,
  ) => {
    aiFocusRestorersRef.current.set(islandId, restorer);
    return () => {
      if (aiFocusRestorersRef.current.get(islandId) === restorer) {
        aiFocusRestorersRef.current.delete(islandId);
      }
    };
  }, []);

  const restoreAiSelectionFocus = useCallback((selection: PreviewAiSelection | null | undefined) => {
    const islandId = selection?.islandId ?? aiSelectionRef.current?.islandId ?? activeIslandIdRef.current;
    if (!islandId) return;
    aiFocusRestorersRef.current.get(islandId)?.();
  }, []);

  const applyAiReplacement = useCallback((
    selection: PreviewAiSelection,
    replacement: string,
  ): PreviewAiReplacementResult => {
    const sourceReplacement = replacement;
    if (!sourceReplacement.trim()) return { ok: false, reason: 'empty-replacement' };
    const source = latestSourceRef.current;
    if (source !== selection.sourceSnapshot) {
      clearAiSelection();
      return { ok: false, reason: 'selection-stale' };
    }
    const patchTarget = selection.patchTarget;
    if (!patchTarget) {
      clearAiSelection();
      return { ok: false, reason: 'selection-mismatch' };
    }
    const selectedSource = source.slice(patchTarget.sourceRange.start, patchTarget.sourceRange.end);
    if (!sourceRangeMatchesAiSelection(selectedSource, patchTarget.selectedText)) {
      clearAiSelection();
      return { ok: false, reason: 'selection-mismatch' };
    }
    const isFullSourceReplacement =
      patchTarget.sourceRange.start === 0 &&
      patchTarget.sourceRange.end === source.length;
    const nextSource = [
      source.slice(0, patchTarget.sourceRange.start),
      sourceReplacement,
      source.slice(patchTarget.sourceRange.end),
    ].join('');
    if (nextSource === source) return { ok: false, reason: 'no-change' };
    updateAppliedAiReplacement({
      afterSource: nextSource,
      appliedAt: Date.now(),
      beforeSource: source,
      replacement: sourceReplacement,
      selection,
    });
    const didApplyInEditor = !isFullSourceReplacement && Boolean(
      aiReplacementAppliersRef.current
        .get(selection.islandId)?.({
          replacement: sourceReplacement,
          selectedText: patchTarget.selectedText,
          sourceRange: patchTarget.sourceRange,
        }) ?? false,
    );
    onBeforePatchRef.current?.();
    transactionIdRef.current += 1;
    handlePatch(nextSource, {
      aiReplacement: {
        replacement: sourceReplacement,
        selectedText: patchTarget.selectedText,
        sourceRange: patchTarget.sourceRange,
      },
      blockId: selection.islandId,
      commitPhase: 'final',
      forceDocumentRefresh: isFullSourceReplacement || undefined,
      kind: 'ai',
      origin: 'preview-markdown-edit',
      renderScope: 'active-block',
      skipActiveBlockRefresh: (!isFullSourceReplacement && didApplyInEditor) || undefined,
      transactionId: transactionIdRef.current,
    });
    clearAiSelection();
    return { ok: true, nextSource };
  }, [clearAiSelection, handlePatch, updateAppliedAiReplacement]);

  const restoreAiReplacement = useCallback((
    selection: PreviewAiSelection,
    previousSource: string,
    expectedSource: string,
    replacement: string,
  ): PreviewAiReplacementResult => {
    if (!previousSource.trim()) return { ok: false, reason: 'empty-replacement' };
    const source = latestSourceRef.current;
    if (source !== expectedSource) {
      clearAiSelection();
      updateAppliedAiReplacement(null);
      return { ok: false, reason: 'selection-stale' };
    }
    if (previousSource === source) return { ok: true, nextSource: source };
    const safeReplacement = replacement.trim();
    const patchTarget = selection.patchTarget;
    if (!patchTarget) {
      updateAppliedAiReplacement(null);
      clearAiSelection();
      return { ok: false, reason: 'selection-mismatch' };
    }
    const restoreAiReplacementMeta = safeReplacement
      ? {
          replacement: patchTarget.selectedText,
          selectedText: safeReplacement,
        }
      : undefined;
    if (restoreAiReplacementMeta) {
      aiReplacementAppliersRef.current
        .get(selection.islandId)?.(restoreAiReplacementMeta);
    }
    updateAppliedAiReplacement(null);
    onBeforePatchRef.current?.();
    transactionIdRef.current += 1;
    handlePatch(previousSource, {
      aiReplacement: restoreAiReplacementMeta,
      blockId: selection.islandId,
      commitPhase: 'final',
      kind: 'ai',
      origin: 'preview-markdown-edit',
      renderScope: 'active-block',
      transactionId: transactionIdRef.current,
    });
    clearAiSelection();
    return { ok: true, nextSource: previousSource };
  }, [clearAiSelection, handlePatch, updateAppliedAiReplacement]);

  const editState = useMemo<PreviewMarkdownEditState | undefined>(
    () =>
      canEdit
        ? {
            activeIslandId,
            deliveryRequestContext,
            enabled,
            lineMap: previewLineMap,
            onActiveIslandChange: handleActiveIslandChange,
            onAiInstructionNotice,
            onCommitIslandEdit: handleCommitIslandEdit,
            onInsertImageFile,
            onLexicalAiSelectionChange: handleLexicalAiSelectionChange,
            onLexicalFormatChange: handleLexicalFormatChange,
            onFinalCursorSourceLineChange,
            onBeforePatch,
            onPatch: handlePatch,
            registerAiFocusRestorer,
            registerAiReplacementApplier,
            onRequestEditorLineFocus,
            source: latestSource,
            sourcePatchEcho,
            stateResetKey: effectiveStateResetKey,
          }
        : undefined,
    [
      activeIslandId,
      canEdit,
      deliveryRequestContext,
      enabled,
      handleActiveIslandChange,
      handleCommitIslandEdit,
      handleLexicalAiSelectionChange,
      handleLexicalFormatChange,
      handlePatch,
      latestSource,
      onAiInstructionNotice,
      onBeforePatch,
      onFinalCursorSourceLineChange,
      onInsertImageFile,
      onRequestEditorLineFocus,
      previewLineMap,
      registerAiFocusRestorer,
      registerAiReplacementApplier,
      sourcePatchEcho,
      effectiveStateResetKey,
    ],
  );

  useEffect(() => {
    if (!canEdit) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if (!isLexicalMarkdownIslandTarget(event.target) && !hasLexicalMarkdownIslandSelection()) return;
      const key = event.key.toLowerCase();
      const activeFormat = activeLexicalFormatRef.current;
      if (!activeFormat) return;
      if ((event.metaKey || event.ctrlKey) && key === 'b') {
        event.preventDefault();
        event.stopPropagation();
        if (isHeadingBlockFormat(activeFormat.snapshot.blockFormat)) return;
        activeFormat.controller.toggleFormat('bold');
        return;
      }
      if ((event.metaKey || event.ctrlKey) && key === 'i') {
        event.preventDefault();
        event.stopPropagation();
        activeFormat.controller.toggleFormat('italic');
        return;
      }
      if ((event.metaKey || event.ctrlKey) && key === 'u') {
        event.preventDefault();
        event.stopPropagation();
        activeFormat.controller.toggleFormat('underline');
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [canEdit]);

  const toolbar = activeLexicalFormat && canEdit
    ? {
        activeTextFormats: activeLexicalFormat.snapshot.activeTextFormats,
        canApplyBlockFormat: activeLexicalFormat.snapshot.canApplyBlockFormat,
        canApplyFontFamily: true,
        canApplyFontSize: true,
        canFormat: activeLexicalFormat.snapshot.canFormat,
        selectedBlockFormat: activeLexicalFormat.snapshot.blockFormat,
        selectedColor: activeLexicalFormat.snapshot.selectedColor,
        selectedFontFamily: activeLexicalFormat.snapshot.selectedFontFamily,
        selectedFontSize: activeLexicalFormat.snapshot.selectedFontSize,
        selectedLetterSpacing: activeLexicalFormat.snapshot.selectedLetterSpacing,
        selectedLineHeight: activeLexicalFormat.snapshot.selectedLineHeight,
        onApplyBlockFormat: activeLexicalFormat.controller.applyBlockFormat,
        onApplyColor: (color: string) => activeLexicalFormat.controller.applyStyle({ color }),
        onApplyFontFamily: (fontFamily: string) =>
          activeLexicalFormat.controller.applyStyle({ fontFamily }),
        onApplyFontSize: (fontSize: string) =>
          activeLexicalFormat.controller.applyStyle({ fontSize }),
        onApplyLetterSpacing: (letterSpacing: string) =>
          activeLexicalFormat.controller.applyStyle({ letterSpacing }),
        onApplyLineHeight: (lineHeight: string) =>
          activeLexicalFormat.controller.applyStyle({ lineHeight }),
        onToggleFormat: (format: PreviewMarkdownTextFormat) => {
          if (format === 'bold' && isHeadingBlockFormat(activeLexicalFormat.snapshot.blockFormat)) return;
          activeLexicalFormat.controller.toggleFormat(format);
        },
      }
    : {
        activeTextFormats: createInactiveTextFormats(),
        canApplyBlockFormat: false,
        canFormat: false,
        disabledReason: getPreviewFormatToolbarDisabledReason({
          canEdit,
          hasActiveBlock: Boolean(activeIslandId),
          isUpgradeRequired,
        }),
        selectedBlockFormat: 'paragraph' as PreviewMarkdownBlockFormat,
        selectedColor: '',
        selectedFontFamily: '',
        selectedFontSize: '',
        selectedLetterSpacing: '',
        selectedLineHeight: '',
        onApplyBlockFormat: (blockFormat: PreviewMarkdownBlockFormat) => {
          void blockFormat;
        },
        onApplyColor: (color: string) => {
          void color;
        },
        onApplyFontFamily: (fontFamily: string) => {
          void fontFamily;
        },
        onApplyFontSize: (fontSize: string) => {
          void fontSize;
        },
        onApplyLetterSpacing: (letterSpacing: string) => {
          void letterSpacing;
        },
        onApplyLineHeight: (lineHeight: string) => {
          void lineHeight;
        },
        onToggleFormat: (format: PreviewMarkdownTextFormat) => {
          void format;
        },
      };

  const styleSignature = activeLexicalFormat
    ? [
        activeLexicalFormat.snapshot.islandId,
        activeLexicalFormat.snapshot.blockFormat,
        activeLexicalFormat.snapshot.selectedColor,
        activeLexicalFormat.snapshot.selectedFontFamily,
        activeLexicalFormat.snapshot.selectedFontSize,
        activeLexicalFormat.snapshot.selectedLetterSpacing,
        activeLexicalFormat.snapshot.selectedLineHeight,
        ...Object.entries(activeLexicalFormat.snapshot.activeTextFormats)
          .filter(([, isActive]) => isActive)
          .map(([format]) => format),
      ].join(':')
    : '';

  return {
    appliedAiReplacement,
    aiSelection,
    applyAiReplacement,
    canEdit,
    clearAiSelection,
    editState,
    enabled,
    restoreAiReplacement,
    restoreAiSelectionFocus,
    styleSignature,
    toolbar,
  };
};
