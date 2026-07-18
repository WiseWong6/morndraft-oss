import type {
  PublicAiRequest,
  PublicAiSourceKind,
} from '@morndraft/features-personal/ai';
import {
  buildPublicAiSelectionRequest,
} from '../public-workspace/publicAiContext';
import { requestOssAiText } from '../../utils/ossAiConfig';

type PreviewOssAiSelectionRequestInput = {
  action: 'modify' | 'summarize';
  changedMessage: string;
  instruction: string;
  patchRange?: { start: number; end: number };
  range?: { start: number; end: number };
  sourceKind: PublicAiSourceKind;
  sourceSnapshot: string;
  visibleText: string;
};

export const assertPreviewAiSourceSnapshotCurrent = (
  latestSource: string,
  sourceSnapshot: string,
  changedMessage: string,
) => {
  if (latestSource !== sourceSnapshot) throw new Error(changedMessage);
};

export const buildPreviewOssAiSelectionRequest = ({
  action,
  changedMessage,
  instruction,
  patchRange,
  range,
  sourceKind,
  sourceSnapshot,
  visibleText,
}: PreviewOssAiSelectionRequestInput): PublicAiRequest => {
  if (range) {
    return buildPublicAiSelectionRequest({
      action,
      instruction,
      patchRange,
      range: { start: range.start, end: range.end },
      source: sourceSnapshot,
      sourceKind,
      visibleText,
    });
  }
  if (action !== 'summarize') throw new Error(changedMessage);
  return { action: 'summarize', instruction, visibleText };
};

type RequestPreviewOssAiSelectionInput = Omit<
  PreviewOssAiSelectionRequestInput,
  'instruction'
> & {
  followUp?: { followUpInstruction: string; previousResultText: string };
  getLatestSource(): string;
  requestText?: typeof requestOssAiText;
  requestInstruction: string;
  signal: AbortSignal;
};

export const requestPreviewOssAiSelection = async ({
  followUp,
  getLatestSource,
  requestText = requestOssAiText,
  requestInstruction,
  signal,
  ...input
}: RequestPreviewOssAiSelectionInput) => {
  assertPreviewAiSourceSnapshotCurrent(getLatestSource(), input.sourceSnapshot, input.changedMessage);
  const result = await requestText({
    ...buildPreviewOssAiSelectionRequest({
      ...input,
      instruction: followUp
        ? [
            requestInstruction,
            `Follow-up request:\n${followUp.followUpInstruction}`,
            `Previous result:\n${followUp.previousResultText}`,
          ].filter(Boolean).join('\n\n')
        : requestInstruction,
    }),
    signal,
  });
  assertPreviewAiSourceSnapshotCurrent(getLatestSource(), input.sourceSnapshot, input.changedMessage);
  return result;
};
