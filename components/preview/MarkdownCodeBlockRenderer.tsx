import React, { useCallback, useRef, useState } from 'react';
import {
  CODE_FENCE_LANGUAGE_KINDS,
  createMornDraftHtmlMarkdownFence,
  getCodeFenceLanguageKind,
  isMornDraftHtmlSource,
  normalizeCodeFenceLanguage,
  patchArtifactCodeSource,
  patchSourceRange,
} from '@morndraft/core';
import type { ArtifactPreviewTranslations } from '../../i18n';
import type { HtmlPreviewSelectionChange } from '../../utils/htmlPreviewBridge';
import type { ArtifactFix } from '../editor/diagnosticTypes';
import { CodePreviewBlock } from './CodePreviewBlock';
import { DocumentSpecPreviewBlock } from './DocumentSpecPreviewBlock';
import type { HtmlPreviewRenderMode } from './HtmlPreviewFrame';
import type { BlockCopyContentKind } from './BlockHeaderCopyAction';
import { JsonPreviewBlock } from './JsonPreviewBlock';
import { MarkdownPreviewBlock } from './MarkdownPreviewBlock';
import { MornDraftHtmlSourcePreviewBlock } from './MornDraftFlatPreviewBlock';
import {
  arePreviewRenderDeliveryAccessEqual,
  type PreviewRenderDeliveryAccess,
} from './deliveryAccess';
import {
  getCodeBlockContentSourceRange,
  getNodeSourceRange,
  hasClosedCodeFenceSourceRange,
  sourcePositionAttributes,
  type SourceLineMap,
  type SourcePositionRange,
} from './sourcePosition';
import type { PreviewMarkdownPatchKind, PreviewMarkdownPatchMeta } from './previewMarkdownPatchMeta';
import type { PreviewFinalCursorSourceLineMeta } from './ArtifactPreviewTypes';
import type { HtmlPreviewEditCommitMeta } from './useHtmlPreviewEditMode';
import type {
  PreviewAiSelectionCandidate,
  PreviewAiSelectionCandidatePatchTarget,
  PreviewAiSelectionPatchTargetKind,
  PreviewAiSelectionRect,
} from './previewMarkdownEditingTypes';
export { isRenderedArtifactMapKind } from './artifactMapKinds';

export type ContentType = 'markdown' | 'json' | 'html' | 'mermaid' | 'mixed';

export type ArtifactDiagnostic = {
  id: string;
  code: string;
  severity: 'error' | 'warning' | 'info';
  messageZh: string;
  messageEn?: string;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  fix?: ArtifactFix;
  fixId?: string;
};

type HtmlPreviewComponentProps = {
  code: string;
  copyContentKind?: BlockCopyContentKind;
  copySource?: string;
  headerActions?: React.ReactNode;
  deliveryWidth?: number;
  frameKey?: string;
  label?: string;
  meta?: string;
  hideDefaultMeta?: boolean;
  enableFullscreen?: boolean;
  initialHeight?: number;
  lockInitialHeight?: boolean;
  deferMountUntilVisible?: boolean;
  renderMode?: HtmlPreviewRenderMode;
  onPreviewReady?: () => void;
  canEdit?: boolean;
  isEditing?: boolean;
  onEditStart?: () => void;
  onEditCommit?: (newCode: string, meta?: HtmlPreviewEditCommitMeta) => void;
  onEditCancel?: () => void;
  onEditDraft?: (newCode: string) => void;
  editCommitStrategy?: 'cached-first' | 'iframe-snapshot-first';
  onBlockActivate?: () => void;
  onSelectionChange?: (selection: HtmlPreviewSelectionChange) => void;
};

type PreviewSourcePatchHandler = (nextSource: string, meta?: PreviewMarkdownPatchMeta) => void;
type LocalArtifactSourcePatchHandler = (
  nextSource: string,
  artifact: {
    source: string | null;
    sourceRange: SourcePositionRange | null;
  },
) => void;
type ActiveBlockPatchMetaOptions = {
  commitPhase?: PreviewMarkdownPatchMeta['commitPhase'];
  kind?: PreviewMarkdownPatchKind;
  previousCode?: string;
  skipActiveBlockRefresh?: boolean;
};

export const resolveActiveBlockPatchRefreshMeta = (options: ActiveBlockPatchMetaOptions = {}) => {
  const commitPhase = options.commitPhase ?? 'final';
  return {
    commitPhase,
    ...(options.skipActiveBlockRefresh ? { skipActiveBlockRefresh: true } : {}),
  };
};

const getSourceOffsetForLineColumn = (
  source: string,
  line: number,
  column: number,
) => {
  const lines = source.split('\n');
  const targetLine = Math.min(Math.max(1, Math.trunc(line)), Math.max(1, lines.length));
  let offset = 0;
  for (let index = 0; index < targetLine - 1; index += 1) {
    offset += lines[index].length + 1;
  }
  return offset + Math.max(0, Math.trunc(column) - 1);
};

const getSourceRangeText = (
  source: string | undefined,
  range: SourcePositionRange | null,
) => {
  if (!source || !range) return null;
  const start = getSourceOffsetForLineColumn(source, range.startLine, range.startColumn);
  const end = getSourceOffsetForLineColumn(source, range.endLine, range.endColumn);
  if (end <= start) return null;
  return source.slice(start, end);
};

const createPreviewAiCandidatePatchTarget = (
  source: string | undefined,
  range: SourcePositionRange | null | undefined,
  options: { kind?: PreviewAiSelectionPatchTargetKind } = {},
): PreviewAiSelectionCandidatePatchTarget | undefined => {
  if (!source || !range) return undefined;
  const selectedText = getSourceRangeText(source, range);
  if (!selectedText?.trim()) return undefined;
  return {
    ...(options.kind ? { kind: options.kind } : {}),
    selectedText,
    sourceRange: {
      startLine: range.startLine,
      startColumn: range.startColumn,
      endLine: range.endLine,
      endColumn: range.endColumn,
    },
  };
};

const getElementPreviewAiRect = (element: HTMLElement | null): PreviewAiSelectionRect | null => {
  const rect = element?.getBoundingClientRect();
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  return {
    height: rect.height,
    left: rect.left,
    top: rect.top,
    width: rect.width,
  };
};

export const getCodeBlockFenceSourceRange = (
  source: string | undefined,
  contentRange: SourcePositionRange | null,
): SourcePositionRange | null => {
  if (!source || !contentRange || contentRange.startLine <= 1) return null;
  const lines = source.split(/\r\n|\r|\n/);
  const expectedOpeningIndex = contentRange.startLine - 2;
  const openingSearchFloor = Math.max(0, expectedOpeningIndex - 2);
  let openingIndex = -1;
  let openingMatch: RegExpMatchArray | null = null;
  for (let index = expectedOpeningIndex; index >= openingSearchFloor; index -= 1) {
    const match = (lines[index] ?? '').match(/^ {0,3}(`{3,}|~{3,})/);
    if (!match) continue;
    openingIndex = index;
    openingMatch = match;
    break;
  }
  if (!openingMatch || openingIndex < 0) return null;
  const marker = openingMatch[1];
  const markerChar = marker[0] === '~' ? '~' : '`';
  const escapedMarkerChar = markerChar === '`' ? '\\`' : '~';
  const closePattern = new RegExp(`^ {0,3}${escapedMarkerChar}{${marker.length},}\\s*$`);
  const closingSearchStart = Math.max(openingIndex + 1, contentRange.endLine - 1);
  const closingSearchEnd = Math.min(lines.length - 1, contentRange.endLine + 2);
  let closingIndex = -1;
  for (let index = closingSearchStart; index <= closingSearchEnd; index += 1) {
    const line = lines[index] ?? '';
    if (!closePattern.test(line)) continue;
    closingIndex = index;
    break;
  }
  const closingLine = closingIndex >= 0 ? lines[closingIndex] ?? '' : '';
  if (!closePattern.test(closingLine)) return null;
  return {
    startLine: openingIndex + 1,
    startColumn: 1,
    endLine: closingIndex + 1,
    endColumn: closingLine.length + 1,
  };
};

const normalizeFenceContentForMatch = (value: string) => (
  value.replace(/\r\n|\r/g, '\n').replace(/\n$/, '')
);

const getCodeBlockFenceContent = (
  source: string,
  range: SourcePositionRange,
) => {
  const lines = source.split(/\r\n|\r|\n/);
  return lines.slice(range.startLine, range.endLine - 1).join('\n');
};

const findCodeBlockFenceSourceRanges = (source: string) => {
  const lines = source.split(/\r\n|\r|\n/);
  const ranges: SourcePositionRange[] = [];
  for (let openingIndex = 0; openingIndex < lines.length; openingIndex += 1) {
    const openingMatch = (lines[openingIndex] ?? '').match(/^ {0,3}(`{3,}|~{3,})/);
    if (!openingMatch) continue;
    const marker = openingMatch[1];
    const markerChar = marker[0] === '~' ? '~' : '`';
    const escapedMarkerChar = markerChar === '`' ? '\\`' : '~';
    const closePattern = new RegExp(`^ {0,3}${escapedMarkerChar}{${marker.length},}\\s*$`);
    for (let closingIndex = openingIndex + 1; closingIndex < lines.length; closingIndex += 1) {
      const closingLine = lines[closingIndex] ?? '';
      if (!closePattern.test(closingLine)) continue;
      ranges.push({
        startLine: openingIndex + 1,
        startColumn: 1,
        endLine: closingIndex + 1,
        endColumn: closingLine.length + 1,
      });
      openingIndex = closingIndex;
      break;
    }
  }
  return ranges;
};

export const getCodeBlockFenceOrdinal = (
  source: string | undefined,
  blockSourceRange: SourcePositionRange | null,
): number | null => {
  if (!source || !blockSourceRange) return null;
  const ordinal = findCodeBlockFenceSourceRanges(source).findIndex((range) => (
    range.startLine === blockSourceRange.startLine &&
    range.endLine === blockSourceRange.endLine
  ));
  return ordinal >= 0 ? ordinal : null;
};

export const resolveCurrentCodeBlockFenceSourceRange = (
  source: string | undefined,
  contentRange: SourcePositionRange | null,
  currentCode: string,
  stableFenceOrdinal?: number | null,
): SourcePositionRange | null => {
  if (!source) return null;
  const normalizedCurrentCode = normalizeFenceContentForMatch(currentCode);
  const fenceRanges = findCodeBlockFenceSourceRanges(source);
  const hasStableFenceOrdinal = typeof stableFenceOrdinal === 'number'
    && Number.isInteger(stableFenceOrdinal)
    && stableFenceOrdinal >= 0;
  const ordinalRange = hasStableFenceOrdinal
    ? fenceRanges[stableFenceOrdinal]
    : null;
  if (
    ordinalRange &&
    normalizeFenceContentForMatch(getCodeBlockFenceContent(source, ordinalRange)) === normalizedCurrentCode
  ) {
    return ordinalRange;
  }
  const nearbyRange = getCodeBlockFenceSourceRange(source, contentRange);
  if (
    nearbyRange &&
    normalizeFenceContentForMatch(getCodeBlockFenceContent(source, nearbyRange)) === normalizedCurrentCode
  ) {
    return nearbyRange;
  }
  const matchingRanges = fenceRanges.filter((range) => (
    normalizeFenceContentForMatch(getCodeBlockFenceContent(source, range)) === normalizedCurrentCode
  ));
  if (matchingRanges.length <= 1) return matchingRanges[0] ?? null;
  const expectedOpeningLine = Math.max(1, (contentRange?.startLine ?? 2) - 1);
  return matchingRanges.reduce((nearest, range) => (
    Math.abs(range.startLine - expectedOpeningLine) < Math.abs(nearest.startLine - expectedOpeningLine)
      ? range
      : nearest
  ));
};

type MarkdownCodeBlockRendererProps = {
  children: React.ReactNode;
  className?: string;
  codeProps: Record<string, unknown>;
  contentType: ContentType;
  diagnostics: readonly ArtifactDiagnostic[];
  blockId?: string;
  blockOrdinal?: number;
  forceClosedCodeFence?: boolean;
  fullSource?: string;
  fullSourceRef?: React.RefObject<string | undefined>;
  HtmlPreviewComponent: React.ComponentType<HtmlPreviewComponentProps>;
  MermaidPreviewComponent: React.ComponentType<{
    blockId?: string;
    code: string;
    coreDiagnostic?: ArtifactDiagnostic | null;
    lineOffset?: number;
    onRenderDiagnosticChange?: (diagnostic: { line: number | null; messageZh: string; messageEn?: string } | null) => void;
    onSvgReady?: (svg: string) => void;
    canEdit?: boolean;
    onCodeChange?: (newCode: string) => void;
    isAiFixBusy?: boolean;
    onBeginFixReview?: (fixId: string) => void;
    onRequestAiFix?: (diagnostic: ArtifactDiagnostic) => void;
    repairMode?: 'ai' | 'deterministic';
  }>;
  node: any;
  isAiFixBusy?: boolean;
  onBeginFixReview?: (fixId: string) => void;
  onRequestAiFix?: (diagnostic: ArtifactDiagnostic) => void;
  repairMode?: 'ai' | 'deterministic';
  onJsonFormatted: (formatted: string) => void;
  onMermaidDiagnosticChange?: (
    id: string,
    diagnostic: { code: string; line?: number | null; messageZh: string; messageEn?: string } | null,
  ) => void;
  onMermaidSvgReady: (svg: string) => void;
  onLocalArtifactSourcePatch?: LocalArtifactSourcePatchHandler;
  onHtmlArtifactActivate?: () => void;
  onSourcePatch?: PreviewSourcePatchHandler;
  onFinalCursorSourceLineChange?: (
    line: number,
    selectedText?: string | null,
    meta?: PreviewFinalCursorSourceLineMeta,
  ) => void;
  onPreviewAiSelectionChange?: (selection: PreviewAiSelectionCandidate | null) => void;
  previewSourcePatchEnabled?: boolean;
  sourceLineMap?: SourceLineMap;
  isSourceLineHidden?: (line: number) => boolean;
  renderDeliveryAccess?: PreviewRenderDeliveryAccess;
  t: ArtifactPreviewTranslations;
  withArtifactTarget: (node: any, element: React.ReactElement) => React.ReactElement;
};

export const isIframeBackedPreviewCodeFenceKind = (languageKind: string) => (
  languageKind === CODE_FENCE_LANGUAGE_KINDS.DOCUMENT_SPEC ||
  languageKind === CODE_FENCE_LANGUAGE_KINDS.HTML_PREVIEW
);

export const buildPreviewCodeBlockId = ({
  blockIdentity,
  blockOrdinal,
  content,
  contentRange,
  language,
  languageKind,
  lineOffset,
}: {
  blockIdentity?: string;
  blockOrdinal?: number;
  content: string;
  contentRange: ReturnType<typeof getCodeBlockContentSourceRange>;
  language: string;
  languageKind: string;
  lineOffset: number;
}) => {
  const normalizedKind = languageKind || language || 'plain';
  if (isIframeBackedPreviewCodeFenceKind(languageKind) && Number.isInteger(blockOrdinal) && blockOrdinal >= 0) {
    const identitySegment = blockIdentity ? `${blockIdentity}:` : '';
    return `code-block:${normalizedKind}:iframe:${identitySegment}${blockOrdinal}`;
  }
  const contentLineCount = Math.max(1, content.split(/\r?\n/).length);
  const blockStartLine = contentRange?.startLine ?? lineOffset + 1;
  const blockEndLine = contentRange?.endLine ?? blockStartLine + contentLineCount - 1;
  return `code-block:${normalizedKind}:${blockStartLine}:${blockEndLine}`;
};

export const getCodeBlockContentLineOffset = (
  node: any,
  contentType: ContentType,
  sourceLineMap?: SourceLineMap,
) => {
  const openingLine = Number(node?.position?.start?.line);
  if (!Number.isFinite(openingLine) || openingLine < 1) return 0;
  const sourceOpeningLine = sourceLineMap?.[openingLine - 1] ?? openingLine;
  if (
    (contentType === 'json' || contentType === 'html' || contentType === 'mermaid') &&
    sourceOpeningLine === 1
  ) return 0;
  return sourceOpeningLine;
};

export const isMarkdownCodePreNode = (node: any) => {
  const meaningfulChildren = Array.isArray(node?.children)
    ? node.children.filter((child: any) => child?.type !== 'text' || Boolean(String(child.value ?? '').trim()))
    : [];
  return meaningfulChildren.length === 1 && meaningfulChildren[0]?.tagName === 'code';
};

const getBlockDiagnostic = (
  diagnostics: readonly ArtifactDiagnostic[],
  lineOffset: number,
  code: string,
  codePrefix: string,
  options: { excludeCodes?: readonly string[] } = {},
) => {
  const lineCount = Math.max(1, code.split(/\r?\n/).length);
  const startLine = lineOffset > 0 ? lineOffset + 1 : 1;
  const endLine = startLine + lineCount;
  return diagnostics.find((diagnostic) => (
    diagnostic.severity !== 'info' &&
    diagnostic.code.startsWith(codePrefix) &&
    !options.excludeCodes?.includes(diagnostic.code) &&
    diagnostic.line &&
    diagnostic.line >= startLine &&
    diagnostic.line <= endLine
  )) ?? null;
};

const getOpeningFenceDiagnostic = (
  diagnostics: readonly ArtifactDiagnostic[],
  node: any,
  sourceLineMap?: SourceLineMap,
) => {
  const openingLine = Number(node?.position?.start?.line);
  if (!Number.isFinite(openingLine) || openingLine < 1) return null;
  const sourceOpeningLine = sourceLineMap?.[openingLine - 1] ?? openingLine;
  return diagnostics.find((diagnostic) => (
    diagnostic.severity !== 'info' &&
    diagnostic.code === 'markdown.unclosed_fence' &&
    diagnostic.line === sourceOpeningLine
  )) ?? null;
};

const patchUniqueCodeContent = (source: string, currentCode: string, nextCode: string) => {
  if (!currentCode) return null;
  const start = source.indexOf(currentCode);
  if (start < 0) return null;
  if (source.indexOf(currentCode, start + currentCode.length) !== -1) return null;
  return `${source.slice(0, start)}${nextCode}${source.slice(start + currentCode.length)}`;
};

const getBlockSourceContentRange = (currentCode: string): SourcePositionRange => {
  const lines = currentCode.split('\n');
  const lastLine = lines[lines.length - 1] ?? '';
  return {
    startLine: 2,
    startColumn: 1,
    endLine: lines.length + 1,
    endColumn: lastLine.length + 1,
  };
};

const patchBlockSourceCodeContent = (
  blockSource: string | null,
  currentCode: string,
  nextCode: string,
  options: { patchWholeSource?: boolean } = {},
) => {
  if (!blockSource) return null;
  if (options.patchWholeSource && blockSource.trim() === currentCode.trim()) return nextCode;
  const result = patchArtifactCodeSource(blockSource, {
    contentRange: getBlockSourceContentRange(currentCode),
    patchWholeSource: false,
    replacement: nextCode,
  });
  return result.ok ? result.source : null;
};

export const patchFencedPreviewArtifactSource = ({
  blockSourceRange,
  currentCode,
  nextCode,
  source,
}: {
  blockSourceRange: SourcePositionRange;
  currentCode: string;
  nextCode: string;
  source: string;
}) => {
  const currentBlockSource = getSourceRangeText(source, blockSourceRange);
  const nextBlockSource = patchBlockSourceCodeContent(currentBlockSource, currentCode, nextCode);
  if (nextBlockSource === null) return null;
  const result = patchSourceRange(source, blockSourceRange, nextBlockSource);
  return result.ok ? result.source : null;
};

export const shouldPatchWholePreviewArtifactSource = ({
  contentType,
  isSyntheticWholeSourceFence,
  languageKind,
}: {
  contentType: ContentType;
  isSyntheticWholeSourceFence: boolean;
  languageKind: string;
}) => (
  isSyntheticWholeSourceFence &&
  (
    (contentType === 'html' && languageKind === CODE_FENCE_LANGUAGE_KINDS.HTML_PREVIEW) ||
    (contentType === 'mermaid' && languageKind === CODE_FENCE_LANGUAGE_KINDS.MERMAID)
  )
);

const isWholeSourceCodeFence = (source: string | undefined) => (
  typeof source === 'string' && /^ {0,3}(`{3,}|~{3,})/m.test(source.trimStart())
);

const getRendererContent = (children: React.ReactNode) =>
  String(children).replace(/\n$/, '');

const areCodeBlockDiagnosticsEqual = (
  previous: readonly ArtifactDiagnostic[],
  next: readonly ArtifactDiagnostic[],
) => {
  if (previous === next) return true;
  if (previous.length !== next.length) return false;
  return previous.every((diagnostic, index) => {
    const other = next[index];
    return (
      diagnostic.id === other.id &&
      diagnostic.code === other.code &&
      diagnostic.severity === other.severity &&
      diagnostic.messageZh === other.messageZh &&
      diagnostic.messageEn === other.messageEn &&
      diagnostic.line === other.line &&
      diagnostic.column === other.column &&
      diagnostic.endLine === other.endLine &&
      diagnostic.endColumn === other.endColumn &&
      diagnostic.fixId === other.fixId &&
      diagnostic.fix?.id === other.fix?.id
    );
  });
};

const areMarkdownCodeBlockRendererPropsEqual = (
  previous: MarkdownCodeBlockRendererProps,
  next: MarkdownCodeBlockRendererProps,
) => (
  Boolean(previous.className && next.className) &&
  previous.blockId === next.blockId &&
  previous.blockOrdinal === next.blockOrdinal &&
  previous.className === next.className &&
  getRendererContent(previous.children) === getRendererContent(next.children) &&
  previous.contentType === next.contentType &&
  areCodeBlockDiagnosticsEqual(previous.diagnostics, next.diagnostics) &&
  previous.forceClosedCodeFence === next.forceClosedCodeFence &&
  previous.fullSourceRef === next.fullSourceRef &&
  previous.fullSource === next.fullSource &&
  previous.HtmlPreviewComponent === next.HtmlPreviewComponent &&
  previous.MermaidPreviewComponent === next.MermaidPreviewComponent &&
  previous.isAiFixBusy === next.isAiFixBusy &&
  previous.onBeginFixReview === next.onBeginFixReview &&
  previous.onRequestAiFix === next.onRequestAiFix &&
  previous.repairMode === next.repairMode &&
  previous.onJsonFormatted === next.onJsonFormatted &&
  previous.onMermaidDiagnosticChange === next.onMermaidDiagnosticChange &&
  previous.onMermaidSvgReady === next.onMermaidSvgReady &&
  previous.onLocalArtifactSourcePatch === next.onLocalArtifactSourcePatch &&
  previous.onSourcePatch === next.onSourcePatch &&
  previous.onFinalCursorSourceLineChange === next.onFinalCursorSourceLineChange &&
  previous.onPreviewAiSelectionChange === next.onPreviewAiSelectionChange &&
  previous.previewSourcePatchEnabled === next.previewSourcePatchEnabled &&
  arePreviewRenderDeliveryAccessEqual(previous.renderDeliveryAccess, next.renderDeliveryAccess) &&
  previous.isSourceLineHidden === next.isSourceLineHidden &&
  previous.t === next.t &&
  previous.withArtifactTarget === next.withArtifactTarget
);

const MarkdownCodeBlockRendererImpl: React.FC<MarkdownCodeBlockRendererProps> = ({
  children,
  className,
  codeProps,
  contentType,
  diagnostics,
  blockOrdinal,
  blockId,
  forceClosedCodeFence = false,
  fullSource,
  fullSourceRef,
  HtmlPreviewComponent,
  MermaidPreviewComponent,
  node,
  isAiFixBusy = false,
  onBeginFixReview,
  onRequestAiFix,
  repairMode = 'deterministic',
  onJsonFormatted,
  onMermaidDiagnosticChange,
  onMermaidSvgReady,
  onLocalArtifactSourcePatch,
  onHtmlArtifactActivate,
  onSourcePatch,
  onFinalCursorSourceLineChange,
  onPreviewAiSelectionChange,
  previewSourcePatchEnabled = false,
  sourceLineMap,
  isSourceLineHidden,
  renderDeliveryAccess,
  t,
  withArtifactTarget,
}) => {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const match = /language-([a-zA-Z0-9_-]+)/.exec(className || '');
  const language = match ? normalizeCodeFenceLanguage(match[1]) : '';
  const resolvedLanguageKind = getCodeFenceLanguageKind(language);
  const languageKind = resolvedLanguageKind;
  const content = String(children).replace(/\n$/, '');
  const lineOffset = getCodeBlockContentLineOffset(node, contentType, sourceLineMap);
  const startLine = Number(node?.position?.start?.line);
  const endLine = Number(node?.position?.end?.line);
  const isBlock = Boolean(match) || (Number.isFinite(startLine) && Number.isFinite(endLine) && endLine > startLine);
  const target = (element: React.ReactElement) => withArtifactTarget(node, element);
  const contentRange = getCodeBlockContentSourceRange(node, sourceLineMap, content);
  const contentRangeAttributes = sourcePositionAttributes(contentRange);
  // Props describe the source being rendered now. The ref intentionally stays
  // callback-only so a layout-effect-delayed ref cannot classify a new document
  // using the previous document's source.
  const renderFullSource = fullSource ?? fullSourceRef?.current;
  const fencedBlockSourceRange = getCodeBlockFenceSourceRange(renderFullSource, contentRange);
  const stableFenceOrdinalRef = useRef<number | null | undefined>(undefined);
  if (stableFenceOrdinalRef.current === undefined) {
    stableFenceOrdinalRef.current = getCodeBlockFenceOrdinal(renderFullSource, fencedBlockSourceRange);
  }
  const stableFenceOrdinal = stableFenceOrdinalRef.current;
  const blockSourceRange = fencedBlockSourceRange ?? getNodeSourceRange(node, sourceLineMap);
  const blockSource = getSourceRangeText(renderFullSource, blockSourceRange);
  const hasClosedFence = hasClosedCodeFenceSourceRange(renderFullSource, node, sourceLineMap);
  const isSyntheticWholeSourceFence = Boolean(
    typeof renderFullSource === 'string' &&
    renderFullSource.trim() === content.trim() &&
    (
      (contentType === 'html' && languageKind === CODE_FENCE_LANGUAGE_KINDS.HTML_PREVIEW) ||
      (contentType === 'mermaid' && languageKind === CODE_FENCE_LANGUAGE_KINDS.MERMAID)
    ),
  );
  const canRenderClosedOrSyntheticFence = hasClosedFence || isSyntheticWholeSourceFence || forceClosedCodeFence;
  const canRenderMornDraftHtmlSource = Boolean(
    isBlock &&
    languageKind === CODE_FENCE_LANGUAGE_KINDS.HTML_PREVIEW &&
    isMornDraftHtmlSource(content),
  );
  const shouldPatchWholeSource = shouldPatchWholePreviewArtifactSource({
    contentType,
    isSyntheticWholeSourceFence,
    languageKind,
  });
  const canPatchArtifact = Boolean(
    previewSourcePatchEnabled &&
    (fullSourceRef || fullSource !== undefined) &&
    onSourcePatch &&
    (contentRange || shouldPatchWholeSource),
  );
  const [htmlEditing, setHtmlEditing] = useState(false);
  const [optimisticHtmlCode, setOptimisticHtmlCode] = useState<string | null>(null);
  const transactionIdRef = useRef(0);
  const previewCodeBlockId = blockId ?? buildPreviewCodeBlockId({
    blockOrdinal,
    content,
    contentRange,
    language,
    languageKind,
    lineOffset,
  });
  const effectiveHtmlCode = optimisticHtmlCode ?? content;

  React.useEffect(() => {
    setOptimisticHtmlCode(null);
  }, [content]);

  const createActiveBlockPatchMeta = useCallback((options: ActiveBlockPatchMetaOptions = {}): PreviewMarkdownPatchMeta => {
    transactionIdRef.current += 1;
    return {
      blockId: previewCodeBlockId,
      ...resolveActiveBlockPatchRefreshMeta(options),
      kind: options.kind ?? 'text',
      origin: 'preview-markdown-edit',
      renderScope: 'active-block',
      transactionId: transactionIdRef.current,
    };
  }, [previewCodeBlockId]);

  const patchFencedArtifactCodeSource = useCallback((source: string, nextCode: string, currentCode = content) => {
    const currentFencedBlockSourceRange = resolveCurrentCodeBlockFenceSourceRange(
      source,
      contentRange,
      currentCode,
      stableFenceOrdinal,
    );
    if (!currentFencedBlockSourceRange) return null;
    return patchFencedPreviewArtifactSource({
      blockSourceRange: currentFencedBlockSourceRange,
      currentCode,
      nextCode,
      source,
    });
  }, [content, contentRange, stableFenceOrdinal]);

  const syncLocalArtifactSourcePatch = useCallback((nextSource: string, nextCode: string, meta: PreviewMarkdownPatchMeta) => {
    if (!meta.skipActiveBlockRefresh || !onLocalArtifactSourcePatch) return;
    const localBlockSourceRange = shouldPatchWholeSource
      ? blockSourceRange
      : resolveCurrentCodeBlockFenceSourceRange(nextSource, contentRange, nextCode, stableFenceOrdinal);
    const localBlockSource = localBlockSourceRange
      ? shouldPatchWholeSource
        ? patchBlockSourceCodeContent(blockSource, content, nextCode, { patchWholeSource: true })
        : getSourceRangeText(nextSource, localBlockSourceRange)
      : null;
    onLocalArtifactSourcePatch(nextSource, {
      source: localBlockSource,
      sourceRange: localBlockSourceRange,
    });
  }, [
    blockSource,
    blockSourceRange,
    content,
    contentRange,
    onLocalArtifactSourcePatch,
    stableFenceOrdinal,
    shouldPatchWholeSource,
  ]);

  const emitSourcePatch = useCallback((
    nextSource: string,
    nextCode: string,
    metaOptions?: ActiveBlockPatchMetaOptions,
  ) => {
    if (!onSourcePatch) return;
    const meta = createActiveBlockPatchMeta(metaOptions);
    syncLocalArtifactSourcePatch(nextSource, nextCode, meta);
    onSourcePatch(nextSource, meta);
  }, [createActiveBlockPatchMeta, onSourcePatch, syncLocalArtifactSourcePatch]);

  const patchArtifactCodeChange = useCallback((newCode: string, metaOptions?: ActiveBlockPatchMetaOptions) => {
    const source = fullSourceRef?.current ?? fullSource;
    if (source === undefined || !onSourcePatch) return;
    const fencedSource = patchFencedArtifactCodeSource(source, newCode);
    if (fencedSource !== null) {
      emitSourcePatch(fencedSource, newCode, metaOptions);
      return;
    }
    if (!shouldPatchWholeSource && isIframeBackedPreviewCodeFenceKind(languageKind)) return;
    const result = patchArtifactCodeSource(source, {
      contentRange,
      patchWholeSource: shouldPatchWholeSource,
      replacement: newCode,
    });
    if (result.ok) {
      emitSourcePatch(result.source, newCode, metaOptions);
      return;
    }
    if (!shouldPatchWholeSource) {
      const fallbackSource = patchUniqueCodeContent(source, content, newCode);
      if (fallbackSource !== null) emitSourcePatch(fallbackSource, newCode, metaOptions);
    }
  }, [
    content,
    contentRange,
    emitSourcePatch,
    fullSource,
    fullSourceRef,
    onSourcePatch,
    patchFencedArtifactCodeSource,
    languageKind,
    shouldPatchWholeSource,
  ]);

  const handleArtifactCodeChange = useCallback((newCode: string) => {
    patchArtifactCodeChange(newCode);
  }, [patchArtifactCodeChange]);

  const handleArtifactBlockSourceChange = useCallback((newSource: string) => {
    const source = fullSourceRef?.current ?? fullSource;
    if (source === undefined || !onSourcePatch || !blockSourceRange) return;
    const result = patchSourceRange(source, blockSourceRange, newSource);
    if (result.ok) {
      onSourcePatch(result.source, createActiveBlockPatchMeta());
    }
  }, [blockSourceRange, createActiveBlockPatchMeta, fullSource, fullSourceRef, onSourcePatch]);

  const handleMornDraftHtmlSourceCodeChange = useCallback((newCode: string, metaOptions: ActiveBlockPatchMetaOptions = {}) => {
    const patchMetaOptions = {
      kind: 'code' as const,
      ...metaOptions,
      skipActiveBlockRefresh: true,
    };
    const source = fullSourceRef?.current ?? fullSource;
    if (source !== undefined && onSourcePatch) {
      const fencedSource = patchFencedArtifactCodeSource(source, newCode, metaOptions.previousCode);
      if (fencedSource !== null) {
        emitSourcePatch(fencedSource, newCode, patchMetaOptions);
        return;
      }
    }
    if (source !== undefined && onSourcePatch && isWholeSourceCodeFence(source)) {
      const nextSource = patchBlockSourceCodeContent(source, content, newCode);
      if (nextSource !== null) {
        emitSourcePatch(nextSource, newCode, patchMetaOptions);
        return;
      }
    }
    if (
      source !== undefined &&
      onSourcePatch &&
      isMornDraftHtmlSource(source) &&
      source.trim() === content.trim()
    ) {
      emitSourcePatch(
        createMornDraftHtmlMarkdownFence(newCode, language || 'html'),
        newCode,
        patchMetaOptions,
      );
      return;
    }
    patchArtifactCodeChange(newCode, patchMetaOptions);
  }, [
    content,
    emitSourcePatch,
    fullSource,
    fullSourceRef,
    language,
    onSourcePatch,
    patchArtifactCodeChange,
    patchFencedArtifactCodeSource,
  ]);

  const handleHtmlEditCommit = useCallback((newCode: string) => {
    if (newCode === content) {
      setOptimisticHtmlCode(null);
      setHtmlEditing(false);
      return;
    }
    setOptimisticHtmlCode(newCode);
    const source = fullSourceRef?.current ?? fullSource;
    if (source === undefined || !onSourcePatch) {
      setHtmlEditing(false);
      return;
    }
    const fencedSource = patchFencedArtifactCodeSource(source, newCode);
    if (fencedSource !== null) {
      emitSourcePatch(fencedSource, newCode, { kind: 'code', skipActiveBlockRefresh: true });
      setHtmlEditing(false);
      return;
    }
    if (!shouldPatchWholeSource && isIframeBackedPreviewCodeFenceKind(languageKind)) {
      setHtmlEditing(false);
      return;
    }
    const result = patchArtifactCodeSource(source, {
      contentRange,
      patchWholeSource: shouldPatchWholeSource,
      replacement: newCode,
    });
    if (result.ok) {
      emitSourcePatch(result.source, newCode, { kind: 'code', skipActiveBlockRefresh: true });
    } else if (!shouldPatchWholeSource) {
      const fallbackSource = patchUniqueCodeContent(source, content, newCode);
      if (fallbackSource !== null) {
        emitSourcePatch(fallbackSource, newCode, { kind: 'code', skipActiveBlockRefresh: true });
      }
    }
    setHtmlEditing(false);
  }, [
    content,
    contentRange,
    emitSourcePatch,
    fullSource,
    fullSourceRef,
    onSourcePatch,
    patchFencedArtifactCodeSource,
    languageKind,
    shouldPatchWholeSource,
  ]);

  const handleHtmlEditDraft = useCallback((newCode: string) => {
    setOptimisticHtmlCode(newCode === content ? null : newCode);
  }, [content]);

  const handleHtmlEditCancel = useCallback(() => {
    setOptimisticHtmlCode(null);
    setHtmlEditing(false);
  }, []);

  const reportHtmlPreviewSelection = useCallback((selection: HtmlPreviewSelectionChange) => {
    const sourceLine = contentRange?.startLine ?? (lineOffset > 0 ? lineOffset + 1 : 1);
    onFinalCursorSourceLineChange?.(sourceLine, selection.text || undefined, {
      selectionOccurrenceIndex: selection.textOccurrenceIndex,
      selectionScopeLineRange: contentRange
        ? { startLine: contentRange.startLine, endLine: contentRange.endLine }
        : undefined,
      sourceRange: contentRange,
    });
    const selectedText = selection.text.trim();
    if (!selectedText) {
      onPreviewAiSelectionChange?.(null);
      return;
    }
    const rect = getElementPreviewAiRect(wrapperRef.current);
    if (!rect || !contentRange) return;
    const patchTarget = createPreviewAiCandidatePatchTarget(
      fullSourceRef?.current ?? fullSource,
      contentRange,
      { kind: 'artifact-source' },
    );
    onPreviewAiSelectionChange?.({
      capturedAt: Date.now(),
      contentKind: 'text',
      islandId: `html-preview:${previewCodeBlockId}`,
      patchTarget,
      patchable: Boolean(patchTarget),
      rect,
      selectionOccurrenceIndex: selection.textOccurrenceIndex,
      selectedText,
      sourceLine: contentRange.startLine,
      sourceLineRange: {
        startLine: contentRange.startLine,
        endLine: contentRange.endLine,
      },
      sourceRange: contentRange,
    });
  }, [
    contentRange,
    fullSource,
    fullSourceRef,
    lineOffset,
    onFinalCursorSourceLineChange,
    onPreviewAiSelectionChange,
    previewCodeBlockId,
  ]);

  const activateHtmlPreviewBlock = useCallback(() => {
    onHtmlArtifactActivate?.();
    onPreviewAiSelectionChange?.(null);
    if (!contentRange) return;
    onFinalCursorSourceLineChange?.(contentRange.startLine, undefined, {
      selectionScopeLineRange: { startLine: contentRange.startLine, endLine: contentRange.endLine },
      sourceRange: contentRange,
    });
  }, [
    contentRange,
    onHtmlArtifactActivate,
    onFinalCursorSourceLineChange,
    onPreviewAiSelectionChange,
  ]);

  const wrap = (element: React.ReactElement) => target(
    <div
      ref={wrapperRef}
      className="aad-code-block-wrapper"
      {...contentRangeAttributes}
      hidden={contentRange ? isSourceLineHidden?.(contentRange.startLine) : undefined}
    >
      {element}
    </div>,
  );

  if (isBlock && canRenderClosedOrSyntheticFence && languageKind === CODE_FENCE_LANGUAGE_KINDS.MERMAID) {
    const diagnosticId = `preview.mermaid.render:${lineOffset}:${content}`;
    const coreDiagnostic = getBlockDiagnostic(
      diagnostics,
      lineOffset,
      content,
      'mermaid.',
      { excludeCodes: ['mermaid.render_error'] },
    );
    return wrap(
      <MermaidPreviewComponent
        blockId={previewCodeBlockId}
        code={content}
        coreDiagnostic={coreDiagnostic}
        lineOffset={lineOffset}
        onRenderDiagnosticChange={(diagnostic) => onMermaidDiagnosticChange?.(
          diagnosticId,
          diagnostic ? { code: 'mermaid.render_error', ...diagnostic } : null,
        )}
        onSvgReady={onMermaidSvgReady}
        canEdit={canPatchArtifact}
        onCodeChange={handleArtifactCodeChange}
        isAiFixBusy={isAiFixBusy}
        onBeginFixReview={onBeginFixReview}
        onRequestAiFix={onRequestAiFix}
        repairMode={repairMode}
      />,
    );
  }
  if (
    isBlock &&
    (languageKind === CODE_FENCE_LANGUAGE_KINDS.JSON || languageKind === CODE_FENCE_LANGUAGE_KINDS.JSON5)
  ) {
    const diagnostic = getBlockDiagnostic(diagnostics, lineOffset, content, 'json.')
      ?? getOpeningFenceDiagnostic(diagnostics, node, sourceLineMap);
    const canEditFullJsonFence = canPatchArtifact && Boolean(blockSourceRange && blockSource !== null);
    return wrap(
      <JsonPreviewBlock
        code={content}
        canEditSource={canPatchArtifact}
        diagnostic={diagnostic}
        fullSource={renderFullSource}
        lineOffset={lineOffset}
        isAiFixBusy={isAiFixBusy}
        onBeginFixReview={onBeginFixReview}
        onRequestAiFix={onRequestAiFix}
        repairMode={repairMode}
        onFormatted={onJsonFormatted}
        onSourceCodeChange={handleArtifactCodeChange}
        onSourceDisplayCodeChange={canEditFullJsonFence ? handleArtifactBlockSourceChange : undefined}
        sourceDisplayCode={canEditFullJsonFence ? blockSource : null}
        sourceDisplayStartLine={canEditFullJsonFence ? blockSourceRange?.startLine ?? null : null}
        sourceRange={contentRange}
        sourceStartLine={contentRange?.startLine ?? (lineOffset > 0 ? lineOffset + 1 : null)}
        sourceLanguage={language || 'json'}
        t={t}
      />,
    );
  }
  if (isBlock && languageKind === CODE_FENCE_LANGUAGE_KINDS.DOCUMENT_SPEC) {
    return wrap(<DocumentSpecPreviewBlock code={content} frameKey={previewCodeBlockId} lineOffset={lineOffset} HtmlPreviewComponent={HtmlPreviewComponent} diagnostics={diagnostics} isAiFixBusy={isAiFixBusy} onBeginFixReview={onBeginFixReview} onRequestAiFix={onRequestAiFix} repairMode={repairMode} canEdit={canPatchArtifact} onCodeChange={handleArtifactCodeChange} t={t} />);
  }
  if (canRenderMornDraftHtmlSource) {
    return wrap(
      <MornDraftHtmlSourcePreviewBlock
        code={content}
        frameKey={previewCodeBlockId}
        renderDeliveryAccess={renderDeliveryAccess}
        HtmlPreviewComponent={HtmlPreviewComponent}
        canEdit={canPatchArtifact}
        onCodeChange={handleMornDraftHtmlSourceCodeChange}
        onBlockActivate={activateHtmlPreviewBlock}
        onSelectionChange={reportHtmlPreviewSelection}
        t={t}
      />,
    );
  }
  if (isBlock && canRenderClosedOrSyntheticFence && languageKind === CODE_FENCE_LANGUAGE_KINDS.HTML_PREVIEW) {
    return wrap(
      <HtmlPreviewComponent
        code={effectiveHtmlCode}
        frameKey={previewCodeBlockId}
        renderMode={contentType === 'html' ? 'raw' : 'embedded'}
        enableFullscreen
        deferMountUntilVisible={contentType !== 'html'}
        canEdit={canPatchArtifact}
        isEditing={htmlEditing}
        onEditStart={() => setHtmlEditing(true)}
        onEditCommit={handleHtmlEditCommit}
        onEditCancel={handleHtmlEditCancel}
        onEditDraft={handleHtmlEditDraft}
        onBlockActivate={activateHtmlPreviewBlock}
        onSelectionChange={reportHtmlPreviewSelection}
      />,
    );
  }
  if (isBlock && languageKind === CODE_FENCE_LANGUAGE_KINDS.MARKDOWN) {
    return wrap(<MarkdownPreviewBlock code={content} t={t} />);
  }
  if (isBlock) {
    return wrap(<CodePreviewBlock code={content} language={language} fallbackLabel={t.codeBlockLabel} t={t} />);
  }
  return (
    <code className="aad-inline-code" {...sourcePositionAttributes(getNodeSourceRange(node, sourceLineMap))} {...codeProps}>
      {children}
    </code>
  );
};

export const MarkdownCodeBlockRenderer = React.memo(
  MarkdownCodeBlockRendererImpl,
  areMarkdownCodeBlockRendererPropsEqual,
) as React.FC<MarkdownCodeBlockRendererProps>;
