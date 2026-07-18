import { analyzeArtifactDocument } from '@morndraft/core';
import type { ArtifactPreviewTranslations } from '../../i18n';
import type { ArtifactDiagnostic } from './MarkdownCodeBlockRenderer';
import type { SourcePositionRange } from './sourcePosition';

export const isBlockingJsonDiagnostic = (diagnostic: ArtifactDiagnostic | null | undefined) => (
  Boolean(diagnostic && diagnostic.severity !== 'info' && (
    diagnostic.code.startsWith('json.') ||
    diagnostic.code === 'markdown.unclosed_fence'
  ))
);

export const getJsonDiagnosticErrorMessage = (
  diagnostic: ArtifactDiagnostic,
  t: ArtifactPreviewTranslations,
) => {
  const message = t.locale === 'zh'
    ? diagnostic.messageZh
    : diagnostic.messageEn || diagnostic.messageZh;
  if (t.locale !== 'zh') {
    return diagnostic.line
      ? `Invalid JSON near line ${diagnostic.line}. ${message}`
      : message;
  }
  return message;
};

const getCanonicalJsonDiagnosticFromCode = (
  code: string,
  sourceRange: SourcePositionRange | null | undefined,
  sourceStartLine: number | null | undefined,
) => {
  if (!sourceStartLine || sourceStartLine <= 1) return null;
  const syntheticPrefix = '\n'.repeat(Math.max(0, sourceStartLine - 2));
  const syntheticSource = `${syntheticPrefix}\`\`\`json\n${code}\n\`\`\``;
  const analysis = analyzeArtifactDocument(syntheticSource) as { diagnostics?: ArtifactDiagnostic[] };
  const sourceEndLine = sourceRange?.endLine
    ?? (sourceStartLine + Math.max(1, code.split(/\r?\n/).length) - 1);
  return analysis.diagnostics?.find((item) => (
    item.severity !== 'info' &&
    item.code.startsWith('json.') &&
    item.line &&
    item.line >= sourceStartLine &&
    item.line <= sourceEndLine
  )) ?? null;
};

const hasDeterministicJsonFix = (diagnostic: ArtifactDiagnostic | null | undefined) => (
  Boolean(diagnostic?.fixId || diagnostic?.fix?.id)
);

const getCanonicalJsonDiagnosticFromSource = (
  source: string | null | undefined,
  sourceRange: SourcePositionRange | null | undefined,
) => {
  if (!source) return null;
  const analysis = analyzeArtifactDocument(source) as { diagnostics?: ArtifactDiagnostic[] };
  const diagnostics = analysis.diagnostics?.filter((item) => (
    item.severity !== 'info' &&
    item.code.startsWith('json.') &&
    item.line
  )) ?? [];
  const rangedDiagnostic = sourceRange
    ? diagnostics.find((item) => (
        item.line &&
        item.line >= sourceRange.startLine &&
        item.line <= sourceRange.endLine
      )) ?? diagnostics.find((item) => (
        item.line === sourceRange.endLine + 1 && hasDeterministicJsonFix(item)
      ))
    : null;
  return sourceRange
    ? rangedDiagnostic ?? null
    : diagnostics.length === 1 ? (diagnostics[0] ?? null) : null;
};

export const getCanonicalJsonPreviewDiagnostic = ({
  code,
  diagnostic,
  fullSource,
  sourceRange,
  sourceStartLine,
}: {
  code: string;
  diagnostic: ArtifactDiagnostic | null | undefined;
  fullSource: string | null | undefined;
  sourceRange: SourcePositionRange | null | undefined;
  sourceStartLine: number | null | undefined;
}) => {
  const codeDiagnostic = getCanonicalJsonDiagnosticFromCode(code, sourceRange, sourceStartLine);
  const fullSourceDiagnostic = getCanonicalJsonDiagnosticFromSource(fullSource, sourceRange);
  return fullSourceDiagnostic &&
      isBlockingJsonDiagnostic(fullSourceDiagnostic) &&
      hasDeterministicJsonFix(fullSourceDiagnostic)
    ? fullSourceDiagnostic
    : diagnostic && isBlockingJsonDiagnostic(diagnostic) && hasDeterministicJsonFix(diagnostic)
    ? diagnostic
    : codeDiagnostic && isBlockingJsonDiagnostic(codeDiagnostic)
    ? codeDiagnostic
    : diagnostic && isBlockingJsonDiagnostic(diagnostic)
    ? diagnostic
    : fullSourceDiagnostic && isBlockingJsonDiagnostic(fullSourceDiagnostic)
    ? fullSourceDiagnostic
    : null;
};
