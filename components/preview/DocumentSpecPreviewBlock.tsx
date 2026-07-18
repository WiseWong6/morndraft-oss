import React from 'react';
import { renderDocumentSpecToHtml } from '@morndraft/core';
import type { ArtifactPreviewTranslations } from '../../i18n';
import { ArtifactErrorBlock } from './ArtifactErrorBlock';
import type { BlockCopyContentKind } from './BlockHeaderCopyAction';

type HtmlPreviewComponentProps = {
  code: string;
  copyContentKind?: BlockCopyContentKind;
  copySource?: string;
  headerActions?: React.ReactNode;
  deliveryWidth?: number;
  frameKey?: string;
  label?: string;
  meta?: string;
  onPreviewReady?: () => void;
};
type ArtifactFix = {
  id: string;
  labelZh?: string;
  labelEn?: string;
};
type ArtifactDiagnostic = {
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

const getDiagnosticLine = (
  diagnostics: Array<{ line?: number; severity?: string }>,
  lineOffset: number,
) => {
  const diagnostic = diagnostics.find((item) => item.severity === 'error' && item.line);
  if (!diagnostic?.line) return lineOffset > 0 ? lineOffset + 1 : 1;
  return diagnostic.line + lineOffset;
};

const formatDiagnostics = (diagnostics: Array<{
  code: string;
  message: string;
  path?: string;
  line?: number;
  column?: number;
}>) =>
  diagnostics
    .map((diagnostic) => {
      const location = diagnostic.line
        ? ` line ${diagnostic.line}${diagnostic.column ? `:${diagnostic.column}` : ''}`
        : diagnostic.path ? ` ${diagnostic.path}` : '';
      return `[${diagnostic.code}]${location} ${diagnostic.message}`;
    })
    .join('\n');

const getBlockDiagnostic = (
  diagnostics: readonly ArtifactDiagnostic[],
  lineOffset: number,
  code: string,
) => {
  const lineCount = Math.max(1, code.split(/\r?\n/).length);
  const startLine = lineOffset > 0 ? lineOffset + 1 : 1;
  const endLine = startLine + lineCount;
  return diagnostics.find((diagnostic) => (
    diagnostic.code.startsWith('document_spec.') &&
    diagnostic.line &&
    diagnostic.line >= startLine &&
    diagnostic.line <= endLine
  ));
};

export const DocumentSpecPreviewBlock: React.FC<{
  code: string;
  frameKey?: string;
  lineOffset?: number;
  HtmlPreviewComponent: React.ComponentType<HtmlPreviewComponentProps>;
  diagnostics?: readonly ArtifactDiagnostic[];
  isAiFixBusy?: boolean;
  onBeginFixReview?: (fixId: string) => void;
  onRequestAiFix?: (diagnostic: ArtifactDiagnostic) => void;
  repairMode?: 'ai' | 'deterministic';
  canEdit?: boolean;
  onCodeChange?: (newCode: string) => void;
  t: ArtifactPreviewTranslations;
}> = ({
  code,
  frameKey,
  lineOffset = 0,
  HtmlPreviewComponent,
  diagnostics = [],
  isAiFixBusy = false,
  onBeginFixReview,
  onRequestAiFix,
  repairMode = 'deterministic',
  canEdit = false,
  onCodeChange,
  t,
}) => {
  const result = renderDocumentSpecToHtml(code);

  if (result.ok) {
    return (
      <HtmlPreviewComponent
        code={result.html}
        frameKey={frameKey}
        label={t.documentSpec}
        meta={t.documentSpecPreview}
      />
    );
  }

  const errorLine = getDiagnosticLine(result.diagnostics, lineOffset);
  const blockDiagnostic = getBlockDiagnostic(diagnostics, lineOffset, code);
  const message = blockDiagnostic
    ? (t.locale === 'zh' ? blockDiagnostic.messageZh : blockDiagnostic.messageEn || blockDiagnostic.messageZh)
    : formatDiagnostics(result.diagnostics);

  return (
    <ArtifactErrorBlock
      t={t}
      label={t.documentSpecInvalid}
      line={blockDiagnostic?.line ?? errorLine}
      message={message}
      className="aad-json-block aad-json-error aad-document-spec-error"
      copyRole="document-spec-error"
      resetKey={`document-spec-error:${code}`}
      diagnostic={blockDiagnostic}
      isAiFixBusy={isAiFixBusy}
      onBeginFixReview={onBeginFixReview}
      onRequestAiFix={onRequestAiFix}
      repairMode={repairMode}
      canEditSource={Boolean(canEdit && onCodeChange)}
      sourceCode={code}
      sourceLanguage="document-spec"
      sourceStartLine={lineOffset > 0 ? lineOffset + 1 : 1}
      onSourceCodeChange={onCodeChange}
    />
  );
};
