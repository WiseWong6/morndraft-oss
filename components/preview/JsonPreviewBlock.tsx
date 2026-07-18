import React, { useEffect } from 'react';
import type { ArtifactPreviewTranslations } from '../../i18n';
import { ArtifactErrorBlock } from './ArtifactErrorBlock';
import {
  CollapsibleArtifactBlock,
  type CollapsibleArtifactBlockProps,
} from './CollapsibleArtifactBlock';
import { BlockHeaderCopyAction } from './BlockHeaderCopyAction';
import { DiagnosticFixAction } from './DiagnosticFixAction';
import type { ArtifactDiagnostic } from './MarkdownCodeBlockRenderer';
import { JsonTreeView } from './JsonTreeView';
import { renderJsonLine } from './JsonPreviewSyntax';
import type { SourcePositionRange } from './sourcePosition';
import { resolveJsonPreviewState } from './jsonPreviewState';

export { renderJsonLine };

type JsonCollapsibleBlockProps = Omit<CollapsibleArtifactBlockProps, 'expandLabel' | 'collapseLabel'>;

const JsonCollapsibleBlock: React.FC<JsonCollapsibleBlockProps & {
  t: ArtifactPreviewTranslations;
}> = ({ t, ...props }) => (
  <CollapsibleArtifactBlock
    {...props}
    expandLabel={t.expandBlock}
    collapseLabel={t.collapseBlock}
  />
);

export const JsonPreviewBlock: React.FC<{
  code: string;
  diagnostic?: ArtifactDiagnostic | null;
  extraActions?: React.ReactNode;
  lineOffset?: number;
  isAiFixBusy?: boolean;
  onBeginFixReview?: (fixId: string) => void;
  onRequestAiFix?: (diagnostic: ArtifactDiagnostic) => void;
  onFormatted?: (formatted: string) => void;
  repairMode?: 'ai' | 'deterministic';
  canEditSource?: boolean;
  fullSource?: string | null;
  onSourceCodeChange?: (newCode: string) => void;
  onSourceDisplayCodeChange?: (newSource: string) => void;
  sourceDisplayCode?: string | null;
  sourceDisplayStartLine?: number | null;
  sourceRange?: SourcePositionRange | null;
  sourceStartLine?: number | null;
  sourceLanguage?: string;
  t: ArtifactPreviewTranslations;
}> = ({
  code,
  diagnostic = null,
  extraActions,
  isAiFixBusy = false,
  canEditSource = false,
  fullSource = null,
  lineOffset = 0,
  onBeginFixReview,
  onRequestAiFix,
  onFormatted,
  repairMode = 'deterministic',
  onSourceCodeChange,
  onSourceDisplayCodeChange,
  sourceDisplayCode = null,
  sourceDisplayStartLine = null,
  sourceRange = null,
  sourceStartLine = null,
  sourceLanguage = 'json',
  t,
}) => {
  const { formatted, error, errorLine, errorDiagnostic, singleTreeValue } = resolveJsonPreviewState({
    canEditSource,
    code,
    diagnostic,
    fullSource,
    lineOffset,
    sourceLanguage,
    sourceRange,
    sourceStartLine,
    t,
  });
  useEffect(() => {
    if (!error) {
      onFormatted?.(formatted);
    }
  }, [formatted, error, onFormatted]);

  if (error) {
    const errorSourceCode = sourceDisplayCode ?? code;
    const errorSourceStartLine = sourceDisplayStartLine ?? sourceStartLine ?? (lineOffset > 0 ? lineOffset + 1 : 1);
    const handleErrorSourceCodeChange = onSourceDisplayCodeChange ?? onSourceCodeChange;
    return (
      <ArtifactErrorBlock
        t={t}
        label="JSON"
        line={errorLine}
        message={error}
        className="aad-json-block aad-json-error"
        copyRole="json-block"
        resetKey={`json-error:${code}`}
        actions={extraActions}
        diagnostic={errorDiagnostic}
        isAiFixBusy={isAiFixBusy}
        onBeginFixReview={onBeginFixReview}
        onRequestAiFix={onRequestAiFix}
        repairMode={repairMode}
        canEditSource={Boolean(canEditSource && handleErrorSourceCodeChange)}
        sourceCode={errorSourceCode}
        sourceLanguage={sourceLanguage}
        sourceStartLine={errorSourceStartLine}
        onSourceCodeChange={handleErrorSourceCodeChange}
      />
    );
  }

  return (
    <JsonCollapsibleBlock
      t={t}
      label="JSON"
      className="aad-json-block"
      copyRole="json-block"
      resetKey={`json:${code}`}
      dataAttributes={{ 'data-copy-text': formatted }}
      actions={(
        <>
          {extraActions}
          <DiagnosticFixAction
            diagnostic={diagnostic}
            isAiFixBusy={isAiFixBusy}
            onBeginFixReview={onBeginFixReview}
            onRequestAiFix={onRequestAiFix}
            repairMode={repairMode}
            t={t}
          />
          <BlockHeaderCopyAction contentKind="json" text={formatted} t={t} />
        </>
      )}
    >
      <pre className="aad-json-viewer">
        <code>
          <JsonTreeView key={formatted} value={singleTreeValue} t={t} />
        </code>
      </pre>
    </JsonCollapsibleBlock>
  );
};
