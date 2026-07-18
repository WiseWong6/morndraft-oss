import type {
  FinalSyntaxAiRepairRequestHandler,
  FinalSyntaxAiRepairResult,
} from './finalSyntaxAiRepairTypes';
import { assertPreviewAiSourceSnapshotCurrent } from './previewOssAiPrivacy';
import type {
  PreviewAiSelection,
  PreviewAiSelectionRange,
} from './previewMarkdownEditingTypes';

const countSourceLines = (value: string) => value.split('\n').length;

const offsetRangeToPreviewAiSelectionRange = (
  source: string,
  range: { end: number; start: number },
): PreviewAiSelectionRange | null => {
  const { end, start } = range;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > source.length) {
    return null;
  }
  return {
    start,
    end,
    startLine: countSourceLines(source.slice(0, start)),
    endLine: countSourceLines(source.slice(0, Math.max(start, end))),
  };
};

export const requestPreviewAiFinalRepair = async ({
  changedMessage,
  getLatestSource,
  request,
  sourceSnapshot,
}: {
  changedMessage: string;
  getLatestSource(): string;
  request(sourceSnapshot: string): ReturnType<FinalSyntaxAiRepairRequestHandler>;
  sourceSnapshot: string;
}) => {
  assertPreviewAiSourceSnapshotCurrent(getLatestSource(), sourceSnapshot, changedMessage);
  const result = await request(sourceSnapshot);
  assertPreviewAiSourceSnapshotCurrent(getLatestSource(), sourceSnapshot, changedMessage);
  return result;
};

export const createPreviewAiFinalRepairSelection = (
  baseSelection: PreviewAiSelection,
  requestSource: string,
  repaired: FinalSyntaxAiRepairResult,
): { replacement: string; selection: PreviewAiSelection } | null => {
  const patch = repaired.patch ?? {
    kind: 'replace' as const,
    range: { start: 0, end: requestSource.length },
    replacement: repaired.source,
  };
  if (patch.kind !== 'replace' || typeof patch.replacement !== 'string') return null;
  const sourceRange = offsetRangeToPreviewAiSelectionRange(requestSource, patch.range);
  if (!sourceRange) return null;
  const selectedText = requestSource.slice(sourceRange.start, sourceRange.end);
  return {
    replacement: patch.replacement,
    selection: {
      ...baseSelection,
      contextLineRange: { startLine: sourceRange.startLine, endLine: sourceRange.endLine },
      contextRange: sourceRange,
      patchTarget: { kind: 'artifact-source', selectedText, sourceRange },
      selectedText,
      sourceKind: baseSelection.sourceKind,
      sourceSnapshot: requestSource,
      sourceRange,
      visibleText: selectedText || baseSelection.visibleText,
    },
  };
};
