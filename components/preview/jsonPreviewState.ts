import { classifyJsonFenceContent, normalizeCodeFenceLanguage } from '@morndraft/core';
import type { ArtifactPreviewTranslations } from '../../i18n';
import { formatJsonErrorMessage, getJsonErrorDisplayLine } from '../../utils/json-error-message.js';
import type { ArtifactDiagnostic } from './MarkdownCodeBlockRenderer';
import type { SourcePositionRange } from './sourcePosition';
import {
  getCanonicalJsonPreviewDiagnostic,
  getJsonDiagnosticErrorMessage,
} from './jsonPreviewDiagnostics';

type JsonFenceClassification =
  | { kind: 'single'; formatted: string; value: unknown }
  | { kind: 'invalid'; error: unknown };

export type JsonPreviewState = {
  formatted: string;
  error: string | null;
  errorLine: number | null;
  errorDiagnostic: ArtifactDiagnostic | null;
  singleTreeValue: unknown;
};

export const resolveJsonPreviewState = ({
  canEditSource,
  code,
  diagnostic,
  fullSource,
  lineOffset,
  sourceLanguage,
  sourceRange,
  sourceStartLine,
  t,
}: {
  canEditSource: boolean;
  code: string;
  diagnostic: ArtifactDiagnostic | null;
  fullSource: string | null;
  lineOffset: number;
  sourceLanguage: string;
  sourceRange: SourcePositionRange | null;
  sourceStartLine: number | null;
  t: ArtifactPreviewTranslations;
}): JsonPreviewState => {
  const parseMode = normalizeCodeFenceLanguage(sourceLanguage) === 'json5' ? 'json5' : 'json';
  const classification = classifyJsonFenceContent(code, { parseMode }) as JsonFenceClassification;
  const singleTreeValue = classification.kind === 'single' ? classification.value : null;
  const formatted = classification.kind === 'single' ? classification.formatted : code;
  let error: string | null = null;
  let errorLine: number | null = null;
  let errorDiagnostic: ArtifactDiagnostic | null = null;

  if (classification.kind === 'invalid') {
    const canonicalDiagnostic = getCanonicalJsonPreviewDiagnostic({
      code,
      diagnostic,
      fullSource,
      sourceRange,
      sourceStartLine,
    });
    if (canonicalDiagnostic) {
      errorDiagnostic = canonicalDiagnostic;
      error = getJsonDiagnosticErrorMessage(canonicalDiagnostic, t);
      errorLine = canonicalDiagnostic.line ?? null;
    } else {
      error = formatJsonErrorMessage(classification.error, code, {
        locale: t.locale,
        lineOffset,
        repairHint: canEditSource ? false : undefined,
        showLocationInBody: false,
      });
      errorLine = getJsonErrorDisplayLine(classification.error, { lineOffset, source: code });
    }
  }

  return { formatted, error, errorLine, errorDiagnostic, singleTreeValue };
};
