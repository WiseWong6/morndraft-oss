import type { PublicAiSourceKind, PublicTextSelection } from './types';

export type PublicAiGenerateSnapshot = {
  source: string;
  sourceKind: PublicAiSourceKind;
  range: { start: number; end: number };
};

export class PublicAiStaleSourceError extends Error {
  constructor() {
    super('The source changed while AI was working. Review the current source and try again.');
    this.name = 'PublicAiStaleSourceError';
  }
}

export const applyPublicAiModifyResult = (
  currentSource: string,
  selection: PublicTextSelection,
  result: string,
) => {
  const expectedSourceText = selection.sourceText ?? selection.text;
  if (currentSource !== selection.source || currentSource.slice(selection.start, selection.end) !== expectedSourceText) {
    throw new PublicAiStaleSourceError();
  }
  return `${currentSource.slice(0, selection.start)}${result}${currentSource.slice(selection.end)}`;
};

export const applyPublicAiGenerateResult = (
  currentSource: string,
  snapshot: PublicAiGenerateSnapshot,
  result: string,
) => {
  if (currentSource !== snapshot.source) throw new PublicAiStaleSourceError();
  const insertion = result.trim();
  return `${currentSource.slice(0, snapshot.range.start)}${insertion}${currentSource.slice(snapshot.range.end)}`;
};
