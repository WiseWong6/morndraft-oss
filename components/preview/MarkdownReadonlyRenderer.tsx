import React, { useLayoutEffect, useMemo, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import {
  getCodeFenceLanguageKind,
  normalizeCodeFenceLanguage,
} from '@morndraft/core';
import type { ArtifactPreviewTranslations } from '../../i18n';
import {
  arePreviewRenderDeliveryAccessEqual,
  type PreviewRenderDeliveryAccess,
} from './deliveryAccess';
import type { HtmlPreviewRenderMode } from './HtmlPreviewFrame';
import {
  MORNDRAFT_MARKDOWN_SANITIZE_SCHEMA,
  morndraftMarkdownUrlTransform,
} from './markdownSanitizeSchema';
import {
  buildPreviewCodeBlockId,
  getCodeBlockContentLineOffset,
  isMarkdownCodePreNode,
  MarkdownCodeBlockRenderer,
  type ArtifactDiagnostic,
  type ContentType,
} from './MarkdownCodeBlockRenderer';
import { MarkdownImageFrame } from './MarkdownImageFrame';
import {
  getCodeBlockContentSourceRange,
  getNodeSourceRange,
  sourcePositionAttributes,
  type SourceLineMap,
  type SourcePositionRange,
} from './sourcePosition';
import { createSourcePositionMarkdownRenderers } from './sourcePositionRenderers';
import type { HtmlPreviewSelectionChange } from '../../utils/htmlPreviewBridge';
import type { PreviewFinalCursorSourceLineMeta } from './ArtifactPreviewTypes';
import type { PreviewMarkdownPatchMeta } from './previewMarkdownPatchMeta';
import type { HtmlPreviewEditCommitMeta } from './useHtmlPreviewEditMode';
import type { BlockCopyContentKind } from './BlockHeaderCopyAction';
import type { PreviewAiSelectionCandidate } from './previewMarkdownEditingTypes';

type PreviewMarkdownSegmentLike = {
  source: string;
  sourceRange: SourcePositionRange | null;
};

export const createSegmentLineMap = (
  segment: PreviewMarkdownSegmentLike,
  sourceLineMap?: SourceLineMap,
): SourceLineMap => {
  const sourceRange = segment.sourceRange;
  if (!sourceRange) return null;
  const lineCount = Math.max(1, segment.source.split(/\r\n|\r|\n/).length);
  return Array.from(
    { length: lineCount },
    (_, index) => sourceLineMap?.[sourceRange.startLine + index - 1] ?? sourceRange.startLine + index,
  );
};

export const getMappedLine = (line: number, sourceLineMap?: SourceLineMap) =>
  sourceLineMap?.[line - 1] ?? line;

const isImageOnlyParagraphNode = (node: any) => {
  const children = Array.isArray(node?.children) ? node.children : [];
  return (
    children.some((child) => child?.tagName === 'img') &&
    children.every(
      (child) =>
        child?.tagName === 'img' ||
        (child?.type === 'text' && String(child.value ?? '').trim().length === 0),
    )
  );
};

type MarkdownReadonlyRendererProps = {
  codeBlockIdentityPrefix?: string;
  code: string;
  contentType: ContentType;
  diagnostics: readonly ArtifactDiagnostic[];
  forceClosedCodeFence?: boolean;
  fullSource?: string;
  fullSourceRef?: React.RefObject<string | undefined>;
  getArtifactIdForNode: (node: any) => string;
  HtmlPreviewComponent: React.ComponentType<{
    code: string;
    copyContentKind?: BlockCopyContentKind;
    copySource?: string;
    headerActions?: React.ReactNode;
    deliveryWidth?: number;
    frameKey?: string;
    label?: string;
    meta?: string;
    hideDefaultMeta?: boolean;
    initialHeight?: number;
    lockInitialHeight?: boolean;
    deferMountUntilVisible?: boolean;
    onPreviewReady?: () => void;
    renderMode?: HtmlPreviewRenderMode;
    canEdit?: boolean;
    isEditing?: boolean;
    onEditStart?: () => void;
    onEditCommit?: (newCode: string, meta?: HtmlPreviewEditCommitMeta) => void;
    onEditCancel?: () => void;
    onEditDraft?: (newCode: string) => void;
    editCommitStrategy?: 'cached-first' | 'iframe-snapshot-first';
    onBlockActivate?: () => void;
    onSelectionChange?: (selection: HtmlPreviewSelectionChange) => void;
  }>;
  isSourceLineHidden?: (line: number) => boolean;
  lineMap?: SourceLineMap;
  MermaidPreviewComponent: React.ComponentType<{
    blockId?: string;
    code: string;
    coreDiagnostic?: ArtifactDiagnostic | null;
    lineOffset?: number;
    onRenderDiagnosticChange?: (
      diagnostic: { line: number | null; messageZh: string; messageEn?: string } | null,
    ) => void;
    onSvgReady?: (svg: string) => void;
    canEdit?: boolean;
    onCodeChange?: (newCode: string) => void;
    isAiFixBusy?: boolean;
    onBeginFixReview?: (fixId: string) => void;
    onRequestAiFix?: (diagnostic: ArtifactDiagnostic) => void;
    repairMode?: 'ai' | 'deterministic';
  }>;
  onJsonFormatted: (formatted: string) => void;
  isAiFixBusy?: boolean;
  onBeginFixReview?: (fixId: string) => void;
  onRequestAiFix?: (diagnostic: ArtifactDiagnostic) => void;
  repairMode?: 'ai' | 'deterministic';
  onMermaidDiagnosticChange?: (
    id: string,
    diagnostic: {
      code: string;
      line?: number | null;
      messageZh: string;
      messageEn?: string;
    } | null,
  ) => void;
  onMermaidSvgReady: (svg: string) => void;
  onLocalArtifactSourcePatch?: (
    nextSource: string,
    artifact: {
      source: string | null;
      sourceRange: SourcePositionRange | null;
    },
  ) => void;
  onHtmlArtifactActivate?: () => void;
  onSourcePatch?: (nextSource: string, meta?: PreviewMarkdownPatchMeta) => void;
  onFinalCursorSourceLineChange?: (
    line: number,
    selectedText?: string | null,
    meta?: PreviewFinalCursorSourceLineMeta,
  ) => void;
  onPreviewAiSelectionChange?: (selection: PreviewAiSelectionCandidate | null) => void;
  previewSourcePatchEnabled?: boolean;
  renderDeliveryAccess?: PreviewRenderDeliveryAccess;
  t: ArtifactPreviewTranslations;
  withArtifactTarget: (node: any, element: React.ReactElement) => React.ReactElement;
};

const areSourceLineMapsEqual = (previous?: SourceLineMap, next?: SourceLineMap) => {
  if (previous === next) return true;
  if (!previous || !next || previous.length !== next.length) return false;
  for (let index = 0; index < previous.length; index += 1) {
    if (previous[index] !== next[index]) return false;
  }
  return true;
};

const areDiagnosticsEqual = (
  previous: readonly ArtifactDiagnostic[],
  next: readonly ArtifactDiagnostic[],
) => {
  if (previous === next) return true;
  if (previous.length !== next.length) return false;
  return previous.every((diagnostic, index) => {
    const nextDiagnostic = next[index];
    return (
      diagnostic.id === nextDiagnostic.id &&
      diagnostic.code === nextDiagnostic.code &&
      diagnostic.severity === nextDiagnostic.severity &&
      diagnostic.messageZh === nextDiagnostic.messageZh &&
      diagnostic.messageEn === nextDiagnostic.messageEn &&
      diagnostic.line === nextDiagnostic.line &&
      diagnostic.column === nextDiagnostic.column &&
      diagnostic.endLine === nextDiagnostic.endLine &&
      diagnostic.endColumn === nextDiagnostic.endColumn &&
      diagnostic.fixId === nextDiagnostic.fixId &&
      diagnostic.fix?.id === nextDiagnostic.fix?.id
    );
  });
};

const areMarkdownReadonlyRendererPropsEqual = (
  previous: MarkdownReadonlyRendererProps,
  next: MarkdownReadonlyRendererProps,
) => (
  previous.code === next.code &&
  previous.codeBlockIdentityPrefix === next.codeBlockIdentityPrefix &&
  previous.contentType === next.contentType &&
  previous.forceClosedCodeFence === next.forceClosedCodeFence &&
  previous.fullSourceRef === next.fullSourceRef &&
  (
    previous.fullSource === next.fullSource ||
    Boolean(previous.fullSourceRef && previous.fullSourceRef === next.fullSourceRef)
  ) &&
  previous.HtmlPreviewComponent === next.HtmlPreviewComponent &&
  previous.MermaidPreviewComponent === next.MermaidPreviewComponent &&
  previous.getArtifactIdForNode === next.getArtifactIdForNode &&
  previous.isSourceLineHidden === next.isSourceLineHidden &&
  previous.isAiFixBusy === next.isAiFixBusy &&
  previous.onFinalCursorSourceLineChange === next.onFinalCursorSourceLineChange &&
  previous.onPreviewAiSelectionChange === next.onPreviewAiSelectionChange &&
  previous.onBeginFixReview === next.onBeginFixReview &&
  previous.onRequestAiFix === next.onRequestAiFix &&
  previous.repairMode === next.repairMode &&
  previous.onLocalArtifactSourcePatch === next.onLocalArtifactSourcePatch &&
  previous.onHtmlArtifactActivate === next.onHtmlArtifactActivate &&
  previous.withArtifactTarget === next.withArtifactTarget &&
  previous.previewSourcePatchEnabled === next.previewSourcePatchEnabled &&
  arePreviewRenderDeliveryAccessEqual(previous.renderDeliveryAccess, next.renderDeliveryAccess) &&
  previous.t === next.t &&
  areSourceLineMapsEqual(previous.lineMap, next.lineMap) &&
  areDiagnosticsEqual(previous.diagnostics, next.diagnostics)
);

const MarkdownReadonlyRendererImpl: React.FC<MarkdownReadonlyRendererProps> = ({
  codeBlockIdentityPrefix,
  code,
  contentType,
  diagnostics,
  forceClosedCodeFence = false,
  fullSource,
  fullSourceRef: externalFullSourceRef,
  getArtifactIdForNode,
  HtmlPreviewComponent,
  isSourceLineHidden,
  lineMap,
  MermaidPreviewComponent,
  onJsonFormatted,
  isAiFixBusy = false,
  onBeginFixReview,
  onRequestAiFix,
  repairMode = 'deterministic',
  onMermaidDiagnosticChange,
  onMermaidSvgReady,
  onLocalArtifactSourcePatch,
  onHtmlArtifactActivate,
  onSourcePatch,
  onFinalCursorSourceLineChange,
  onPreviewAiSelectionChange,
  previewSourcePatchEnabled = false,
  renderDeliveryAccess,
  t,
  withArtifactTarget,
}) => {
  const internalFullSourceRef = useRef(fullSource);
  const fullSourceRef = externalFullSourceRef ?? internalFullSourceRef;
  const codeBlockOrdinalRef = useRef(0);
  codeBlockOrdinalRef.current = 0;

  useLayoutEffect(() => {
    if (!externalFullSourceRef) internalFullSourceRef.current = fullSource;
  }, [externalFullSourceRef, fullSource]);

  const renderCodeBlockRef = useRef<(props: any) => React.ReactElement>(() => <></>);
  const StableMarkdownCodeRenderer = useMemo(
    () => (props: any) => renderCodeBlockRef.current(props),
    [],
  );

  const components = useMemo(() => {
    const sourcePositionRenderers = createSourcePositionMarkdownRenderers(
      lineMap,
      isSourceLineHidden,
    );
    const headingRenderers = Object.fromEntries(
      ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map((tag) => [
        tag,
        (props: any) => {
          const { node, children, className, ...rest } = props;
          const sourceRange = getNodeSourceRange(node, lineMap);
          const artifactId = getArtifactIdForNode(node);
          return React.createElement(
            tag,
            {
              ...rest,
              ...sourcePositionAttributes(sourceRange),
              ...(artifactId ? { 'data-artifact-id': artifactId } : {}),
              ...(className ? { className } : {}),
              ...(sourceRange && isSourceLineHidden?.(sourceRange.startLine)
                ? { hidden: true }
                : {}),
            },
            children,
          );
        },
      ]),
    );
    renderCodeBlockRef.current = ({ node, className, children, ...props }: any) => {
      const match = /language-([a-zA-Z0-9_-]+)/.exec(className || '');
      const language = match ? normalizeCodeFenceLanguage(match[1]) : '';
      const content = String(children).replace(/\n$/, '');
      const lineOffset = getCodeBlockContentLineOffset(node, contentType, lineMap);
      const startLine = Number(node?.position?.start?.line);
      const endLine = Number(node?.position?.end?.line);
      const isBlock = Boolean(match) || (Number.isFinite(startLine) && Number.isFinite(endLine) && endLine > startLine);
      const blockOrdinal = isBlock ? codeBlockOrdinalRef.current++ : undefined;
      const contentRange = getCodeBlockContentSourceRange(node, lineMap, content);
      const blockId = buildPreviewCodeBlockId({
        blockIdentity: codeBlockIdentityPrefix,
        blockOrdinal,
        content,
        contentRange,
        language,
        languageKind: getCodeFenceLanguageKind(language),
        lineOffset,
      });
      return (
        <MarkdownCodeBlockRenderer
          key={blockId}
          blockId={blockId}
          blockOrdinal={blockOrdinal}
          className={className}
          codeProps={props}
          contentType={contentType}
          diagnostics={diagnostics}
          forceClosedCodeFence={forceClosedCodeFence}
          fullSource={fullSource}
          fullSourceRef={fullSourceRef}
          HtmlPreviewComponent={HtmlPreviewComponent}
          MermaidPreviewComponent={MermaidPreviewComponent}
          node={node}
          isAiFixBusy={isAiFixBusy}
          onJsonFormatted={onJsonFormatted}
          onBeginFixReview={onBeginFixReview}
          onRequestAiFix={onRequestAiFix}
          repairMode={repairMode}
          onMermaidDiagnosticChange={onMermaidDiagnosticChange}
          onMermaidSvgReady={onMermaidSvgReady}
          onLocalArtifactSourcePatch={onLocalArtifactSourcePatch}
          onHtmlArtifactActivate={onHtmlArtifactActivate}
          onSourcePatch={onSourcePatch}
          onFinalCursorSourceLineChange={onFinalCursorSourceLineChange}
          onPreviewAiSelectionChange={onPreviewAiSelectionChange}
          previewSourcePatchEnabled={previewSourcePatchEnabled}
          renderDeliveryAccess={renderDeliveryAccess}
          sourceLineMap={lineMap}
          isSourceLineHidden={isSourceLineHidden}
          t={t}
          withArtifactTarget={withArtifactTarget}
        >
          {children}
        </MarkdownCodeBlockRenderer>
      );
    };
    return {
      ...sourcePositionRenderers,
      p: (props: any) => {
        const { node, children, className, ...rest } = props;
        if (!isImageOnlyParagraphNode(node)) {
          const ParagraphElement = sourcePositionRenderers.p;
          return (
            <ParagraphElement node={node} className={className} {...rest}>
              {children}
            </ParagraphElement>
          );
        }
        const sourceRange = getNodeSourceRange(node, lineMap);
        const mergedClassName =
          ['aad-md-paragraph', className].filter(Boolean).join(' ') || undefined;
        return (
          <div
            {...rest}
            {...sourcePositionAttributes(sourceRange)}
            hidden={sourceRange ? isSourceLineHidden?.(sourceRange.startLine) : undefined}
            className={mergedClassName}
          >
            {children}
          </div>
        );
      },
      pre: (props: any) => {
        const { node, children, ...rest } = props;
        if (isMarkdownCodePreNode(node)) return <>{children}</>;
        return <pre {...rest}>{children}</pre>;
      },
      code: StableMarkdownCodeRenderer,
      img: (props: any) => {
        const { node, alt, src, title, ...rest } = props;
        const artifactId = getArtifactIdForNode(node);
        const sourceRange = getNodeSourceRange(node, lineMap);
        return (
          <MarkdownImageFrame
            alt={typeof alt === 'string' ? alt : ''}
            src={typeof src === 'string' ? src : ''}
            title={typeof title === 'string' ? title : ''}
            hidden={sourceRange ? isSourceLineHidden?.(sourceRange.startLine) : undefined}
            frameAttributes={{
              ...sourcePositionAttributes(sourceRange),
              ...(artifactId ? { 'data-artifact-id': artifactId } : {}),
            }}
            imageAttributes={rest}
          />
        );
      },
      ...headingRenderers,
    };
  }, [
    StableMarkdownCodeRenderer,
    codeBlockIdentityPrefix,
    contentType,
    diagnostics,
    forceClosedCodeFence,
    getArtifactIdForNode,
    fullSource,
    fullSourceRef,
    HtmlPreviewComponent,
    isAiFixBusy,
    isSourceLineHidden,
    lineMap,
    MermaidPreviewComponent,
    onJsonFormatted,
    onBeginFixReview,
    onRequestAiFix,
    repairMode,
    onMermaidDiagnosticChange,
    onMermaidSvgReady,
    onLocalArtifactSourcePatch,
    onHtmlArtifactActivate,
    onFinalCursorSourceLineChange,
    onPreviewAiSelectionChange,
    onSourcePatch,
    previewSourcePatchEnabled,
    renderDeliveryAccess,
    t,
    withArtifactTarget,
  ]);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      urlTransform={morndraftMarkdownUrlTransform}
      rehypePlugins={[rehypeRaw, [rehypeSanitize, MORNDRAFT_MARKDOWN_SANITIZE_SCHEMA]]}
      components={components}
    >
      {code}
    </ReactMarkdown>
  );
};

export const MarkdownReadonlyRenderer = React.memo(
  MarkdownReadonlyRendererImpl,
  areMarkdownReadonlyRendererPropsEqual,
) as React.FC<MarkdownReadonlyRendererProps>;
