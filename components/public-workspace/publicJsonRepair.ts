import {
  analyzeArtifactDocument,
  applyArtifactFix,
} from '@morndraft/core/oss-json-repair';
import { normalizeCodeFenceLanguage } from '@morndraft/core/oss-public';

export const PUBLIC_JSON_REPAIR_MAX_SOURCE_LENGTH = 4 * 1024 * 1024;

export type PublicJsonRepairFix = {
  id: string;
  labelZh?: string;
  labelEn?: string;
  range: { start: number; end: number };
  replacement: string;
  preview?: { before?: string; after?: string } | null;
};

export type PublicJsonRepairDiagnostic = {
  id: string;
  code: string;
  severity: 'error' | 'warning' | 'info';
  messageZh: string;
  messageEn?: string;
  line?: number;
  column?: number;
  fix?: PublicJsonRepairFix | null;
  fixId?: string;
};

export type PublicJsonRepairAnalysis = {
  diagnostics: PublicJsonRepairDiagnostic[];
  sourceTooLarge: boolean;
};

export type PublicJsonRepairReview = {
  id: string;
  source: string;
  nextSource: string;
  diagnostic: PublicJsonRepairDiagnostic;
  fix: PublicJsonRepairFix;
};

export type PublicJsonAppliedRepair = {
  id: string;
  source: string;
  nextSource: string;
  line: number;
  labelZh?: string;
  labelEn?: string;
};

const getSourceLine = (source: string, lineNumber: number) => {
  if (!Number.isSafeInteger(lineNumber) || lineNumber < 1) return '';
  let line = 1;
  let start = 0;
  for (let index = 0; index <= source.length; index += 1) {
    if (index < source.length && source[index] !== '\n') continue;
    if (line === lineNumber) {
      const end = index > start && source[index - 1] === '\r' ? index - 1 : index;
      return source.slice(start, end);
    }
    line += 1;
    start = index + 1;
  }
  return '';
};

const getFenceInfoLanguage = (line: string) => {
  let index = 0;
  while (line[index] === ' ' || line[index] === '\t') index += 1;
  const marker = line[index];
  if (marker !== '`' && marker !== '~') return '';
  const markerStart = index;
  while (line[index] === marker) index += 1;
  if (index - markerStart < 3) return '';
  while (line[index] === ' ' || line[index] === '\t') index += 1;
  const languageStart = index;
  while (
    index < line.length &&
    line[index] !== ' ' &&
    line[index] !== '\t' &&
    line[index] !== '`' &&
    line[index] !== '~'
  ) index += 1;
  return normalizeCodeFenceLanguage(line.slice(languageStart, index));
};

const isJsonFenceDiagnostic = (source: string, diagnostic: PublicJsonRepairDiagnostic) => {
  if (diagnostic.code.startsWith('json.')) return true;
  if (diagnostic.code !== 'markdown.unclosed_fence' || !diagnostic.line) return false;
  const language = getFenceInfoLanguage(getSourceLine(source, diagnostic.line));
  return language === 'json' || language === 'json5';
};

export const analyzePublicJsonRepairSource = (source: string): PublicJsonRepairAnalysis => {
  if (source.length > PUBLIC_JSON_REPAIR_MAX_SOURCE_LENGTH) {
    return { diagnostics: [], sourceTooLarge: true };
  }
  const analysis = analyzeArtifactDocument(source) as {
    diagnostics?: PublicJsonRepairDiagnostic[];
  };
  return {
    diagnostics: (analysis.diagnostics ?? []).filter((diagnostic) => (
      isJsonFenceDiagnostic(source, diagnostic)
    )),
    sourceTooLarge: false,
  };
};

export const beginPublicJsonRepairReview = (
  source: string,
  diagnostic: PublicJsonRepairDiagnostic,
): PublicJsonRepairReview | null => {
  const fix = diagnostic.fix;
  if (!fix?.id || !fix.range) return null;
  const nextSource = applyArtifactFix(source, fix);
  if (nextSource === source) return null;
  return {
    id: `${fix.id}:${source.length}:${fix.range.start}:${fix.range.end}`,
    source,
    nextSource,
    diagnostic,
    fix,
  };
};

export const confirmPublicJsonRepairReview = (
  review: PublicJsonRepairReview,
  currentSource: string,
): { nextSource: string; applied: PublicJsonAppliedRepair } | null => {
  if (review.source !== currentSource) return null;
  return {
    nextSource: review.nextSource,
    applied: {
      id: review.id,
      source: review.source,
      nextSource: review.nextSource,
      line: review.diagnostic.line ?? 1,
      labelZh: review.fix.labelZh,
      labelEn: review.fix.labelEn,
    },
  };
};

export const undoPublicJsonRepair = (
  applied: PublicJsonAppliedRepair,
  currentSource: string,
) => applied.nextSource === currentSource ? applied.source : null;
