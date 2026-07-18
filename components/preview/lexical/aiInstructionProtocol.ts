import type { ArtifactPreviewTranslations } from '../../../i18n';
import type {
  PreviewAiClarificationQuestion,
  PreviewAiInstructionSessionSnapshot,
} from '../PreviewAiSelectionToolbar';

export type AiInstructionApiResponse = {
  code?: string;
  error?: {
    code?: string;
    message?: string;
  };
  message?: string;
  patch?: {
    kind?: string;
    replacement?: string;
  };
  resultText?: string;
  session?: PreviewAiInstructionSessionSnapshot;
};

export type SlashInstructionSourceRange = {
  end: number;
  endLine: number;
  start: number;
  startLine: number;
};

export type FinalSlashAiFollowUpPayload = {
  followUpInstruction: string;
  previousResultText: string;
};

export type AiInstructionDisplayChannel = 'progress' | 'thinking' | 'clarification';

export const FINAL_SLASH_AI_COMMAND_TEXT = '/AI ';
export const FINAL_SLASH_AI_COMMAND_MAX_LENGTH = 2004;
export const FINAL_SLASH_COMMAND_MAX_LENGTH = 64;

export const AI_INSTRUCTION_SESSION_RUNNING_STATUSES = new Set<PreviewAiInstructionSessionSnapshot['status']>([
  'planning',
  'generating',
  'repairing',
]);

export const createFinalSlashAiDraftId = () =>
  `final-slash-ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export const normalizeAiInstructionText = (value: string) => value.replace(/\s+/g, ' ').trim().toLocaleLowerCase();

export const readFinalSlashAiInstruction = (slashText: string) => {
  if (!/^\/ai(?:\s|$)/iu.test(slashText)) return null;
  return slashText.slice(3).trim();
};

export const readSlashSourceInstruction = (sourceText: string) => {
  const trimmed = sourceText.trim();
  if (!trimmed.startsWith('/')) return '';
  const aiInstruction = readFinalSlashAiInstruction(trimmed);
  if (aiInstruction !== null) return aiInstruction;
  return trimmed.slice(1).trim();
};

export const createPreviewAiInstructionSourceVersion = (source: string) => {
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${source.length}:${(hash >>> 0).toString(16)}`;
};

export const getSourceLineForOffset = (source: string, offset: number) =>
  source.slice(0, Math.max(0, offset)).split('\n').length;

export const resolveSlashInstructionSourceRange = ({
  allowSlashOnly = false,
  instruction,
  slashText,
  source,
}: {
  allowSlashOnly?: boolean;
  instruction: string;
  slashText: string;
  source: string;
}): SlashInstructionSourceRange | null => {
  const candidates = [slashText, `/${instruction}`, `${FINAL_SLASH_AI_COMMAND_TEXT}${instruction}`, allowSlashOnly ? '/' : '']
    .map((candidate) => candidate.trim())
    .filter((candidate, index, list) => (
      (candidate.length > 1 || (allowSlashOnly && candidate === '/')) &&
      list.indexOf(candidate) === index
    ));
  for (const candidate of candidates) {
    let searchIndex = 0;
    while (searchIndex < source.length) {
      const start = source.indexOf(candidate, searchIndex);
      if (start < 0) break;
      const end = start + candidate.length;
      const sourceInstruction = readSlashSourceInstruction(source.slice(start, end));
      if (
        (allowSlashOnly && candidate === '/') ||
        normalizeAiInstructionText(sourceInstruction) === normalizeAiInstructionText(instruction)
      ) {
        return {
          start,
          end,
          startLine: getSourceLineForOffset(source, start),
          endLine: getSourceLineForOffset(source, end),
        };
      }
      searchIndex = start + candidate.length;
    }
  }
  return null;
};

export const readAiInstructionApiErrorCode = (body: AiInstructionApiResponse) => body.error?.code || body.code || '';

export const getAiInstructionApiErrorMessage = (
  body: AiInstructionApiResponse,
  fallback: string,
  status: number,
  t: ArtifactPreviewTranslations,
) => {
  const code = readAiInstructionApiErrorCode(body);
  if (status === 401 || code === 'unauthorized') return t.previewAiLoginRequired;
  if (code === 'missing_entitlement') return t.previewAiUpgradeRequired;
  if (code === 'quota_exhausted') return t.previewAiQuotaExhausted;
  if (code === 'provider_unavailable') return t.previewAiProviderUnavailable;
  if (code === 'stale_ai_selection_source' || code === 'instruction_range_mismatch') {
    return t.previewAiSlashChanged;
  }
  return body.error?.message || body.message || fallback;
};

export const getAiInstructionRuntimeErrorMessage = (error: unknown, t: ArtifactPreviewTranslations) => {
  if (!(error instanceof Error)) return t.previewAiRequestFailed;
  const message = error.message.trim();
  if (!message) return t.previewAiRequestFailed;
  const isNativeFetchFailure = error.name === 'TypeError' &&
    /failed to fetch|network|load failed|fetch failed/iu.test(message);
  if (isNativeFetchFailure) return t.previewAiRequestFailed;
  return message;
};

export const buildOssAiInstruction = (
  instruction: string,
  followUp?: FinalSlashAiFollowUpPayload,
  clarification?: { answer: string; questions: PreviewAiClarificationQuestion[] },
) => {
  const parts = [instruction];
  if (followUp) {
    parts.push(`Follow-up request:\n${followUp.followUpInstruction}`);
    parts.push(`Previous result:\n${followUp.previousResultText}`);
  }
  if (clarification) {
    parts.push(`Clarification answer:\n${clarification.answer}`);
    if (clarification.questions.length) {
      parts.push(`Clarification questions:\n${clarification.questions.map(question => `- ${question.question}`).join('\n')}`);
    }
  }
  return parts.filter(Boolean).join('\n\n');
};

export const AI_INLINE_DISPLAY_CHUNK_SIZES: Record<AiInstructionDisplayChannel, number> = {
  clarification: 4,
  progress: 3,
  thinking: 12,
};

export const splitAiInstructionDisplayChunk = (text: string, channel: AiInstructionDisplayChannel) => {
  const units = Array.from(text);
  const size = Math.max(1, AI_INLINE_DISPLAY_CHUNK_SIZES[channel] ?? 3);
  return {
    chunk: units.slice(0, size).join(''),
    rest: units.slice(size).join(''),
  };
};
