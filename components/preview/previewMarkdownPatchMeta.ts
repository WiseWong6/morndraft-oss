export type PreviewMarkdownPatchKind = 'ai' | 'bold' | 'code' | 'image' | 'italic' | 'structure' | 'style' | 'table' | 'text';

export type PreviewMarkdownPatchMeta = {
  aiReplacement?: {
    replacement: string;
    selectedText: string;
    sourceRange?: {
      end: number;
      endLine: number;
      start: number;
      startLine: number;
    };
  };
  blockId: string;
  commitPhase?: 'input' | 'idle' | 'final' | 'format' | 'structural';
  kind: PreviewMarkdownPatchKind;
  origin: 'preview-markdown-edit';
  forceDocumentRefresh?: boolean;
  renderScope: 'active-block';
  skipActiveBlockRefresh?: boolean;
  transactionId: number;
};

export type PreviewSourcePatchEcho = {
  baseSource: string;
  meta: PreviewMarkdownPatchMeta;
  sequence: number;
  source: string;
} | null;

export const isActiveBlockPreviewMarkdownPatchEcho = ({
  previewCode,
  sourcePatchEcho,
}: {
  previewCode: string;
  sourcePatchEcho: PreviewSourcePatchEcho;
}) =>
  Boolean(
    sourcePatchEcho &&
    (sourcePatchEcho.source === previewCode || sourcePatchEcho.baseSource === previewCode) &&
    sourcePatchEcho.meta.origin === 'preview-markdown-edit' &&
    sourcePatchEcho.meta.renderScope === 'active-block',
  );

export const isSkippableLocalPreviewPatchEcho = ({
  previewCode,
  sourcePatchEcho,
}: {
  previewCode: string;
  sourcePatchEcho: PreviewSourcePatchEcho;
}) => Boolean(
  (sourcePatchEcho?.meta.kind === 'ai' || sourcePatchEcho?.meta.kind === 'code') &&
  sourcePatchEcho.meta.skipActiveBlockRefresh &&
  !sourcePatchEcho.meta.forceDocumentRefresh &&
  isActiveBlockPreviewMarkdownPatchEcho({ previewCode, sourcePatchEcho })
);

export const resolvePreviewRenderResetKey = ({
  previousResetKey,
  previewCode,
  sourcePatchEcho,
}: {
  previousResetKey: string;
  previewCode: string;
  sourcePatchEcho: PreviewSourcePatchEcho;
}) =>
  isActiveBlockPreviewMarkdownPatchEcho({ previewCode, sourcePatchEcho })
    ? previousResetKey
    : previewCode;
