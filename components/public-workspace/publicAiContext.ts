import type { PublicAiAction } from './types';

export const PUBLIC_AI_MAX_INSTRUCTION_CHARS = 4_000;
export const PUBLIC_AI_MAX_SELECTED_TEXT_CHARS = 24_000;
export const PUBLIC_AI_MAX_SOURCE_CONTEXT_CHARS = 24_000;

const PUBLIC_LOCAL_IMAGE_DATA_URL = /data:image\/(?:avif|gif|jpeg|png|webp);base64,[a-z0-9+/=]+/giu;
const OMITTED_IMAGE = '[local image data omitted]';

type DataUrlSpan = { start: number; end: number };

export class PublicAiInputTooLargeError extends Error {
  readonly code = 'input_too_large';

  constructor() {
    super('The AI request input exceeds the public workspace limit.');
    this.name = 'PublicAiInputTooLargeError';
  }
}

const collectLocalImageDataUrlSpans = (source: string): DataUrlSpan[] => {
  const spans: DataUrlSpan[] = [];
  for (const match of source.matchAll(PUBLIC_LOCAL_IMAGE_DATA_URL)) {
    if (match.index === undefined) continue;
    spans.push({ start: match.index, end: match.index + match[0].length });
  }
  return spans;
};

export const omitPublicAiLocalImageDataUrls = (value: string) => (
  value.replace(PUBLIC_LOCAL_IMAGE_DATA_URL, OMITTED_IMAGE)
);

const sanitizeSourceSlice = (
  source: string,
  start: number,
  end: number,
  spans: readonly DataUrlSpan[],
) => {
  let cursor = start;
  let sanitized = '';
  for (const span of spans) {
    if (span.end <= start) continue;
    if (span.start >= end) break;
    sanitized += source.slice(cursor, Math.max(cursor, span.start));
    sanitized += OMITTED_IMAGE;
    cursor = Math.max(cursor, Math.min(end, span.end));
  }
  return sanitized + source.slice(cursor, end);
};

export const buildPublicAiBoundedSourceContext = (
  source: string,
  range: { start: number; end: number },
) => {
  if (
    !Number.isInteger(range.start) || !Number.isInteger(range.end)
    || range.start < 0 || range.end < range.start || range.end > source.length
  ) throw new Error('invalid_ai_source_range');
  const beforeBudget = Math.floor(PUBLIC_AI_MAX_SOURCE_CONTEXT_CHARS / 2);
  const afterBudget = PUBLIC_AI_MAX_SOURCE_CONTEXT_CHARS - beforeBudget;
  const beforeStart = Math.max(0, range.start - beforeBudget);
  const afterEnd = Math.min(source.length, range.end + afterBudget);
  const spans = collectLocalImageDataUrlSpans(source);
  const before = sanitizeSourceSlice(source, beforeStart, range.start, spans);
  const after = sanitizeSourceSlice(source, range.end, afterEnd, spans);
  return [
    beforeStart > 0 ? '[earlier source omitted]' : '',
    before ? `Context before:\n${before}` : '',
    after ? `Context after:\n${after}` : '',
    afterEnd < source.length ? '[later source omitted]' : '',
  ].filter(Boolean).join('\n\n');
};

export type PublicAiBoundedRequestInput = {
  action: Extract<PublicAiAction, 'generate' | 'modify' | 'summarize'>;
  instruction?: string;
  range?: { start: number; end: number };
  selectedText?: string;
  source?: string;
};

export const buildPublicAiBoundedRequest = (input: PublicAiBoundedRequestInput) => {
  const instruction = input.instruction?.trim() ?? '';
  if (instruction.length > PUBLIC_AI_MAX_INSTRUCTION_CHARS) throw new PublicAiInputTooLargeError();
  const selectedText = omitPublicAiLocalImageDataUrls(input.selectedText ?? '');
  if (selectedText.length > PUBLIC_AI_MAX_SELECTED_TEXT_CHARS) throw new PublicAiInputTooLargeError();
  if (input.action === 'summarize') {
    return { action: input.action, selectedText } as const;
  }
  if (input.source === undefined || !input.range) throw new Error('missing_ai_source_context');
  return {
    action: input.action,
    instruction,
    selectedText: input.action === 'modify' ? selectedText : undefined,
    source: buildPublicAiBoundedSourceContext(input.source, input.range),
  } as const;
};
