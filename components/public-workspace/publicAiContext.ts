import {
  PUBLIC_AI_MAX_INSTRUCTION_CHARS,
  PUBLIC_AI_MAX_SELECTION_CHARS,
  PublicAiError,
  getPublicAiSourceKindForContentType,
  hasPublicAiUnsafeHtmlSource,
  inspectPublicAiSourceRangePrivacy,
  type PublicAiAction,
  type PublicAiRequest,
  type PublicAiSourceKind,
  type PublicAiSourceRange,
} from '@morndraft/features-personal/ai';

export { PUBLIC_AI_MAX_INSTRUCTION_CHARS };
export const PUBLIC_AI_MAX_SELECTED_TEXT_CHARS = PUBLIC_AI_MAX_SELECTION_CHARS;

export class PublicAiInputTooLargeError extends Error {
  readonly code = 'input_too_large';

  constructor() {
    super('The AI request input exceeds the public workspace limit.');
    this.name = 'PublicAiInputTooLargeError';
  }
}

export { getPublicAiSourceKindForContentType };

type PublicAiBoundedRequestBase = {
  instruction?: string;
};

export type PublicAiBoundedRequestInput = PublicAiBoundedRequestBase & (
  | {
      action: Extract<PublicAiAction, 'generate' | 'modify' | 'summarize'>;
      patchRange?: PublicAiSourceRange;
      range: PublicAiSourceRange;
      source: string;
      sourceKind: PublicAiSourceKind;
      visibleText?: never;
    }
  | {
      action: 'summarize';
      range?: never;
      source?: never;
      sourceKind?: never;
      visibleText: string;
    }
);

export type PublicAiSelectionRequestInput = PublicAiBoundedRequestBase & {
  action: Extract<PublicAiAction, 'modify' | 'summarize'>;
  /** Independent mutation range; defaults to the authoritative selection. */
  patchRange?: PublicAiSourceRange;
  range: PublicAiSourceRange;
  source: string;
  sourceKind: PublicAiSourceKind;
  /** Trusted DOM-visible selection; required for raw HTML summaries. */
  visibleText?: string;
};

export const buildPublicAiBoundedRequest = (input: PublicAiBoundedRequestInput): PublicAiRequest => {
  const rawInstruction = input.instruction ?? '';
  if (rawInstruction.length > PUBLIC_AI_MAX_INSTRUCTION_CHARS) throw new PublicAiInputTooLargeError();
  const instruction = rawInstruction.trim();
  if (input.source === undefined || !input.range) {
    if (input.action !== 'summarize') throw new Error('missing_ai_source_context');
    const visibleText = input.visibleText ?? '';
    if (visibleText.length > PUBLIC_AI_MAX_SELECTED_TEXT_CHARS) throw new PublicAiInputTooLargeError();
    return { action: input.action, instruction, visibleText } as const;
  }
  if (input.range.end - input.range.start > PUBLIC_AI_MAX_SELECTED_TEXT_CHARS) {
    throw new PublicAiInputTooLargeError();
  }
  if (input.action === 'modify') {
    const patchRange = input.patchRange ?? input.range;
    if (patchRange.end - patchRange.start > PUBLIC_AI_MAX_SELECTED_TEXT_CHARS) {
      throw new PublicAiInputTooLargeError();
    }
    return {
      action: 'modify',
      instruction,
      patchRange,
      range: input.range,
      source: input.source,
      sourceKind: input.sourceKind,
    } as const;
  }
  return {
    action: input.action,
    instruction,
    range: input.range,
    source: input.source,
    sourceKind: input.sourceKind,
  } as const;
};

export const buildPublicAiSelectionRequest = (
  input: PublicAiSelectionRequestInput,
): PublicAiRequest => {
  // Validate the authoritative source range before any visible-only downgrade.
  // A caller-controlled visibleText payload must never bypass an intersecting
  // local resource span, even though raw HTML summaries omit Source afterward.
  inspectPublicAiSourceRangePrivacy(input.source, input.range);
  if (input.action === 'modify') {
    inspectPublicAiSourceRangePrivacy(input.source, input.patchRange ?? input.range);
  }
  if (
    input.action === 'summarize'
    && hasPublicAiUnsafeHtmlSource(input.source, input.sourceKind)
  ) {
    if (!input.visibleText?.trim()) {
      throw new PublicAiError(
        'privacy_unsafe_input',
        'Raw HTML summaries require a trusted visible-text selection.',
      );
    }
    return buildPublicAiBoundedRequest({
      action: 'summarize',
      instruction: input.instruction,
      visibleText: input.visibleText,
    });
  }
  return buildPublicAiBoundedRequest({
    action: input.action,
    instruction: input.instruction,
    patchRange: input.patchRange,
    range: input.range,
    source: input.source,
    sourceKind: input.sourceKind,
  });
};
