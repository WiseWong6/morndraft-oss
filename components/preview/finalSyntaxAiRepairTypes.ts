import type { ArtifactDiagnostic } from './MarkdownCodeBlockRenderer';

export type FinalSyntaxAiRepairPatch = {
  kind: 'replace';
  range: { end: number; start: number };
  replacement: string;
};

export type FinalSyntaxAiRepairResult = {
  attempts: number;
  patch?: FinalSyntaxAiRepairPatch;
  source: string;
  sourceVersion: string;
};

export type FinalSyntaxAiRepairRequestHandler = (
  diagnostic: ArtifactDiagnostic,
  sourceSnapshot?: string,
) => FinalSyntaxAiRepairResult | Promise<FinalSyntaxAiRepairResult | null | void> | null | void;
