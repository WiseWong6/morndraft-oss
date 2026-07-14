import {
  getPublicAiModelRole,
  isPublicAiConfigUsable,
  readPublicAiConfig,
  requestPublicAiConfigOpen,
  resolvePublicAiChatCompletionsUrl,
} from './config';
import {
  PublicAiError,
  type PublicAiAction,
  type PublicAiAdapter,
  type PublicAiConfig,
  type PublicAiRequest,
  type PublicAiResult,
  type PublicAiSourceKind,
} from './types';
import {
  PUBLIC_AI_MAX_RAW_SOURCE_CODE_UNITS,
  PUBLIC_AI_MAX_REDACTED_SPANS,
  PUBLIC_AI_OMITTED_LOCAL_IMAGE_DATA,
  collectPublicAiSensitiveDataSpans,
  omitPublicAiLocalImageDataUrls,
  type PublicAiSensitiveDataSpan,
} from './redact';
import { hasPublicAiUnsafeHtmlSource } from './sourceKind';

type OpenAiCompatibleResponse = {
  choices?: Array<{
    finish_reason?: unknown;
    message?: { content?: unknown };
    text?: unknown;
  }>;
};

export const PUBLIC_AI_DEFAULT_TIMEOUT_MS = 90_000;
export const PUBLIC_AI_MAX_USER_PROMPT_CHARS = 64_000;
export const PUBLIC_AI_MAX_INSTRUCTION_CHARS = 4_000;
export const PUBLIC_AI_MAX_SELECTION_CHARS = 24_000;
export const PUBLIC_AI_MAX_SOURCE_CONTEXT_CHARS = 24_000;

export type PublicAiAdapterOptions = {
  createResourceNamespace?: () => string;
  fetch?: typeof fetch;
  onMissingConfig?: () => void;
  readConfig?: () => PublicAiConfig;
  timeoutMs?: number;
};

type PreparedPublicAiPrompt = {
  fixResources?: {
    carriers: Array<{
      leadingLineBreak: '' | '\n' | '\r' | '\r\n';
      original: string;
      resources: string[];
      trailingLineBreak: '' | '\n' | '\r' | '\r\n';
    }>;
    namespace: string;
    sourceKind: PublicAiSourceKind;
  };
  userPrompt: string;
};

function buildSystemPrompt(action: PublicAiAction): string {
  if (action === 'summarize') {
    return 'You are MornDraft OSS AI. Summarize the selected content clearly and concisely. Return only the summary.';
  }
  if (action === 'modify') {
    return 'You are MornDraft OSS AI. Rewrite the selected content according to the user request. Return only the replacement text.';
  }
  if (action === 'fix') {
    return 'You are MornDraft OSS AI. Repair the provided MornDraft source according to the diagnostic. Return only the full corrected source.';
  }
  return 'You are MornDraft OSS AI. Generate useful MornDraft-compatible Markdown content. Return only the generated content.';
}

const inputTooLarge = () => new PublicAiError(
  'input_too_large',
  'AI input exceeds the browser-local request limit.',
);

const privacyUnsafeInput = () => new PublicAiError(
  'privacy_unsafe_input',
  'AI input contains a local data resource that cannot be sent safely.',
);

const privacyUnsafeResponse = () => new PublicAiError(
  'privacy_unsafe_response',
  'AI returned a response that could not preserve local data resources safely.',
);

const validateSourceRange = (source: string, range: PublicAiRequest['range']) => {
  if (
    !range
    || !Number.isInteger(range.start)
    || !Number.isInteger(range.end)
    || range.start < 0
    || range.end < range.start
    || range.end > source.length
  ) throw privacyUnsafeInput();
  return range;
};

const rangeTouchesSensitiveSpan = (
  range: { start: number; end: number },
  span: PublicAiSensitiveDataSpan,
) => range.start === range.end
  ? range.start >= span.start && range.start < span.end
  : range.start < span.end && range.end > span.start;

export const inspectPublicAiSourceRangePrivacy = (
  source: string,
  inputRange: PublicAiRequest['range'],
) => {
  if (source.length > PUBLIC_AI_MAX_RAW_SOURCE_CODE_UNITS) throw inputTooLarge();
  const range = validateSourceRange(source, inputRange);
  const spans = collectPublicAiSensitiveDataSpans(source);
  if (spans.some(span => rangeTouchesSensitiveSpan(range, span))) throw privacyUnsafeInput();
  return { range, spans };
};

const sanitizeSourceSlice = (
  source: string,
  start: number,
  end: number,
  spans: readonly PublicAiSensitiveDataSpan[],
) => {
  let cursor = start;
  let result = '';
  for (const span of spans) {
    if (span.end <= start) continue;
    if (span.start >= end) break;
    result += source.slice(cursor, Math.max(cursor, span.start));
    result += PUBLIC_AI_OMITTED_LOCAL_IMAGE_DATA;
    cursor = Math.max(cursor, Math.min(end, span.end));
  }
  return result + source.slice(cursor, end);
};

const truncateSanitizedPrefix = (value: string, maxLength: number) => {
  if (value.length <= maxLength) return { omitted: false, value };
  let end = Math.max(0, maxLength);
  const markerStart = value.lastIndexOf(PUBLIC_AI_OMITTED_LOCAL_IMAGE_DATA, end);
  if (
    markerStart >= 0
    && markerStart < end
    && markerStart + PUBLIC_AI_OMITTED_LOCAL_IMAGE_DATA.length > end
  ) end = markerStart;
  return { omitted: true, value: value.slice(0, end) };
};

const truncateSanitizedSuffix = (value: string, maxLength: number) => {
  if (value.length <= maxLength) return { omitted: false, value };
  let start = Math.max(0, value.length - maxLength);
  const markerStart = value.lastIndexOf(PUBLIC_AI_OMITTED_LOCAL_IMAGE_DATA, start);
  if (
    markerStart >= 0
    && markerStart < start
    && markerStart + PUBLIC_AI_OMITTED_LOCAL_IMAGE_DATA.length > start
  ) start = markerStart + PUBLIC_AI_OMITTED_LOCAL_IMAGE_DATA.length;
  return { omitted: true, value: value.slice(start) };
};

const buildBoundedSourceContext = (
  source: string,
  range: { start: number; end: number },
  spans: readonly PublicAiSensitiveDataSpan[],
) => {
  // Reserve deterministic space for section labels and omission markers, then
  // cap the sanitized values themselves. This prevents thousands of resource
  // placeholders from expanding a 24k source slice past the 24k context
  // contract, while the marker-aware truncators never cut through a privacy
  // placeholder.
  const framingReserve = 256;
  const contentBudget = PUBLIC_AI_MAX_SOURCE_CONTEXT_CHARS - framingReserve;
  const beforeBudget = Math.floor(contentBudget / 2);
  const afterBudget = contentBudget - beforeBudget;
  const beforeStart = Math.max(0, range.start - Math.floor(PUBLIC_AI_MAX_SOURCE_CONTEXT_CHARS / 2));
  const afterEnd = Math.min(source.length, range.end + Math.ceil(PUBLIC_AI_MAX_SOURCE_CONTEXT_CHARS / 2));
  const before = truncateSanitizedSuffix(
    sanitizeSourceSlice(source, beforeStart, range.start, spans),
    beforeBudget,
  );
  const after = truncateSanitizedPrefix(
    sanitizeSourceSlice(source, range.end, afterEnd, spans),
    afterBudget,
  );
  const context = [
    beforeStart > 0 || before.omitted ? '[earlier source omitted]' : '',
    before.value ? `Context before:\n${before.value}` : '',
    after.value ? `Context after:\n${after.value}` : '',
    afterEnd < source.length || after.omitted ? '[later source omitted]' : '',
  ].filter(Boolean).join('\n\n');
  if (context.length > PUBLIC_AI_MAX_SOURCE_CONTEXT_CHARS) throw inputTooLarge();
  return context;
};

const PUBLIC_AI_RESOURCE_NAMESPACE_LENGTH = 8;
const PUBLIC_AI_RESOURCE_INDEX_WIDTH = String(PUBLIC_AI_MAX_REDACTED_SPANS - 1).length;
const PUBLIC_AI_RESOURCE_NAMESPACE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const createRandomResourceNamespace = () => {
  const bytes = new Uint8Array(PUBLIC_AI_RESOURCE_NAMESPACE_LENGTH);
  const crypto = globalThis.crypto;
  if (!crypto?.getRandomValues) throw privacyUnsafeInput();
  crypto.getRandomValues(bytes);
  return Array.from(
    bytes,
    byte => PUBLIC_AI_RESOURCE_NAMESPACE_ALPHABET[byte & 0x1f],
  ).join('');
};

const createFixResourceToken = (namespace: string, index: number) => (
  `${namespace}${String(index).padStart(PUBLIC_AI_RESOURCE_INDEX_WIDTH, '0')}_`
);

type FixCarrierRange = { start: number; end: number };

const readLineBreakAt = (value: string, index: number): '' | '\n' | '\r' | '\r\n' => {
  const code = value.charCodeAt(index);
  if (code === 0x0a) return '\n';
  if (code !== 0x0d) return '';
  return value.charCodeAt(index + 1) === 0x0a ? '\r\n' : '\r';
};

const readTrailingLineBreak = (value: string): '' | '\n' | '\r' | '\r\n' => {
  if (value.endsWith('\r\n')) return '\r\n';
  if (value.endsWith('\n')) return '\n';
  if (value.endsWith('\r')) return '\r';
  return '';
};

const readLeadingLineBreakAt = (value: string, index: number): '' | '\n' | '\r' | '\r\n' => {
  if (index <= 0) return '';
  const previous = value.charCodeAt(index - 1);
  if (previous === 0x0a) return value.charCodeAt(index - 2) === 0x0d ? '\r\n' : '\n';
  return previous === 0x0d ? '\r' : '';
};

const collectFixCarrierRanges = (
  source: string,
  spans: readonly PublicAiSensitiveDataSpan[],
): FixCarrierRange[] => {
  const ranges: FixCarrierRange[] = [];
  let lineStart = 0;
  let scan = 0;
  for (const span of spans) {
    // A previous carrier already covers every byte on this physical line.
    if (span.start < scan) continue;
    while (scan < span.start) {
      const lineBreak = readLineBreakAt(source, scan);
      if (lineBreak) {
        scan += lineBreak.length;
        lineStart = scan;
      } else {
        scan += 1;
      }
    }
    let carrierEnd = Math.max(scan, span.end);
    while (carrierEnd < source.length && !readLineBreakAt(source, carrierEnd)) carrierEnd += 1;
    carrierEnd += readLineBreakAt(source, carrierEnd).length;
    const previous = ranges.at(-1);
    if (previous && lineStart <= previous.end) {
      previous.end = Math.max(previous.end, carrierEnd);
    } else {
      ranges.push({ start: lineStart, end: carrierEnd });
    }
    scan = carrierEnd;
    lineStart = carrierEnd;
  }
  return ranges;
};

const isAsciiWhitespaceCode = (code: number) => (
  code === 0x09 || code === 0x0a || code === 0x0c || code === 0x0d || code === 0x20
);

const isAsciiSchemeCode = (code: number) => (
  (code >= 0x41 && code <= 0x5a)
  || (code >= 0x61 && code <= 0x7a)
  || (code >= 0x30 && code <= 0x39)
  || code === 0x2b
  || code === 0x2d
  || code === 0x2e
);

const isUrlTokenBoundary = (code: number) => (
  isAsciiWhitespaceCode(code)
  || code === 0x22
  || code === 0x27
  || code === 0x3c
  || code === 0x3e
  || code === 0x60
);

/**
 * Reject a data resource that is only a substring of an already external URL.
 * This is deliberately a forward-only URL-token scan: it cannot turn a
 * multi-megabyte line with thousands of resources into repeated backtracking.
 */
const hasExternalUrlPrefixAtSensitiveSpan = (
  source: string,
  spans: readonly PublicAiSensitiveDataSpan[],
) => {
  let spanIndex = 0;
  let scheme = '';
  let schemeCandidate = true;
  let externalScheme = false;
  for (let cursor = 0; cursor < source.length; cursor += 1) {
    if (spanIndex < spans.length && cursor === spans[spanIndex]?.start) {
      if (externalScheme) return true;
      spanIndex += 1;
    }
    const code = source.charCodeAt(cursor);
    if (isUrlTokenBoundary(code)) {
      scheme = '';
      schemeCandidate = true;
      externalScheme = false;
      continue;
    }
    if (!schemeCandidate) continue;
    if (code === 0x3a && scheme.length > 0) {
      externalScheme = scheme !== 'data';
      schemeCandidate = false;
      continue;
    }
    if (!isAsciiSchemeCode(code) || scheme.length >= 32) {
      schemeCandidate = false;
      continue;
    }
    const lowerCode = code >= 0x41 && code <= 0x5a ? code + 0x20 : code;
    scheme += String.fromCharCode(lowerCode);
  }
  return false;
};

const trimAsciiWhitespaceRange = (source: string, start: number, end: number) => {
  let trimmedStart = start;
  let trimmedEnd = end;
  while (trimmedStart < trimmedEnd && isAsciiWhitespaceCode(source.charCodeAt(trimmedStart))) {
    trimmedStart += 1;
  }
  while (trimmedEnd > trimmedStart && isAsciiWhitespaceCode(source.charCodeAt(trimmedEnd - 1))) {
    trimmedEnd -= 1;
  }
  return { start: trimmedStart, end: trimmedEnd };
};

const sensitiveContainerIsUnsafe = (
  source: string,
  start: number,
  end: number,
  spans: readonly PublicAiSensitiveDataSpan[],
  firstSpanIndex: number,
  allowAngleWrapper: boolean,
) => {
  let spanIndex = firstSpanIndex;
  while (spanIndex < spans.length && (spans[spanIndex]?.end ?? 0) <= start) spanIndex += 1;
  const first = spanIndex;
  while (spanIndex < spans.length && (spans[spanIndex]?.start ?? source.length) < end) spanIndex += 1;
  if (spanIndex === first) return { nextSpanIndex: first, unsafe: false };
  if (spanIndex !== first + 1) return { nextSpanIndex: spanIndex, unsafe: true };
  const span = spans[first];
  if (!span || span.start < start || span.end > end) {
    return { nextSpanIndex: spanIndex, unsafe: true };
  }
  let content = trimAsciiWhitespaceRange(source, start, end);
  const firstCode = source.charCodeAt(content.start);
  const lastCode = source.charCodeAt(content.end - 1);
  if (
    (firstCode === 0x22 && lastCode === 0x22)
    || (firstCode === 0x27 && lastCode === 0x27)
    || (allowAngleWrapper && firstCode === 0x3c && lastCode === 0x3e)
  ) {
    content = trimAsciiWhitespaceRange(source, content.start + 1, content.end - 1);
  }
  let hasPhysicalLineBreak = false;
  for (let cursor = start; cursor < end; cursor += 1) {
    const code = source.charCodeAt(cursor);
    if (code === 0x0a || code === 0x0d) {
      hasPhysicalLineBreak = true;
      break;
    }
  }
  return {
    nextSpanIndex: spanIndex,
    unsafe: hasPhysicalLineBreak || content.start !== span.start || content.end !== span.end,
  };
};

const asciiEqualsAt = (source: string, start: number, expected: string) => {
  if (start + expected.length > source.length) return false;
  for (let index = 0; index < expected.length; index += 1) {
    const code = source.charCodeAt(start + index);
    const lower = code >= 0x41 && code <= 0x5a ? code + 0x20 : code;
    if (lower !== expected.charCodeAt(index)) return false;
  }
  return true;
};

const isCssIdentifierCode = (code: number) => (
  isAsciiSchemeCode(code) || code === 0x5f || code >= 0x80
);

const hasUnsafeCssUrlContainer = (
  source: string,
  spans: readonly PublicAiSensitiveDataSpan[],
) => {
  let cursor = 0;
  let spanIndex = 0;
  while (cursor < source.length) {
    if (
      !asciiEqualsAt(source, cursor, 'url')
      || isCssIdentifierCode(source.charCodeAt(cursor - 1))
      || isCssIdentifierCode(source.charCodeAt(cursor + 3))
    ) {
      cursor += 1;
      continue;
    }
    let open = cursor + 3;
    while (open < source.length && isAsciiWhitespaceCode(source.charCodeAt(open))) open += 1;
    if (source.charCodeAt(open) !== 0x28) {
      cursor += 3;
      continue;
    }
    const contentStart = open + 1;
    let quote = 0;
    let escaped = false;
    let end = contentStart;
    while (end < source.length) {
      const code = source.charCodeAt(end);
      if (escaped) {
        escaped = false;
      } else if (code === 0x5c) {
        escaped = true;
      } else if (quote) {
        if (code === quote) quote = 0;
      } else if (code === 0x22 || code === 0x27) {
        quote = code;
      } else if (code === 0x29) {
        break;
      }
      end += 1;
    }
    const checked = sensitiveContainerIsUnsafe(
      source,
      contentStart,
      end,
      spans,
      spanIndex,
      false,
    );
    if (checked.unsafe) return true;
    spanIndex = checked.nextSpanIndex;
    cursor = end < source.length ? end + 1 : source.length;
  }
  return false;
};

const hasUnsafeMarkdownDestination = (
  source: string,
  spans: readonly PublicAiSensitiveDataSpan[],
) => {
  let cursor = 0;
  let spanIndex = 0;
  while (cursor + 1 < source.length) {
    if (source.charCodeAt(cursor) !== 0x5d || source.charCodeAt(cursor + 1) !== 0x28) {
      cursor += 1;
      continue;
    }
    const contentStart = cursor + 2;
    let depth = 1;
    let escaped = false;
    let end = contentStart;
    while (end < source.length && depth > 0) {
      const code = source.charCodeAt(end);
      if (escaped) {
        escaped = false;
      } else if (code === 0x5c) {
        escaped = true;
      } else if (code === 0x28) {
        depth += 1;
      } else if (code === 0x29) {
        depth -= 1;
        if (depth === 0) break;
      }
      end += 1;
    }
    const checked = sensitiveContainerIsUnsafe(
      source,
      contentStart,
      end,
      spans,
      spanIndex,
      true,
    );
    if (checked.unsafe) return true;
    spanIndex = checked.nextSpanIndex;
    cursor = end < source.length ? end + 1 : source.length;
  }
  return false;
};

const hasUnsafeQuotedAttribute = (
  source: string,
  spans: readonly PublicAiSensitiveDataSpan[],
) => {
  let cursor = 0;
  let spanIndex = 0;
  while (cursor < source.length) {
    if (source.charCodeAt(cursor) !== 0x3d) {
      cursor += 1;
      continue;
    }
    let valueStart = cursor + 1;
    while (valueStart < source.length && isAsciiWhitespaceCode(source.charCodeAt(valueStart))) {
      valueStart += 1;
    }
    const quote = source.charCodeAt(valueStart);
    if (quote !== 0x22 && quote !== 0x27) {
      cursor += 1;
      continue;
    }
    valueStart += 1;
    let valueEnd = valueStart;
    while (valueEnd < source.length && source.charCodeAt(valueEnd) !== quote) valueEnd += 1;
    const checked = sensitiveContainerIsUnsafe(
      source,
      valueStart,
      valueEnd,
      spans,
      spanIndex,
      false,
    );
    if (checked.unsafe) return true;
    spanIndex = checked.nextSpanIndex;
    cursor = valueEnd < source.length ? valueEnd + 1 : source.length;
  }
  return false;
};

const hasUnsafeSensitiveNesting = (
  source: string,
  spans: readonly PublicAiSensitiveDataSpan[],
) => spans.length > 0 && (
  hasExternalUrlPrefixAtSensitiveSpan(source, spans)
  || hasUnsafeCssUrlContainer(source, spans)
  || hasUnsafeMarkdownDestination(source, spans)
  || hasUnsafeQuotedAttribute(source, spans)
);

const tokenizeFixSource = (
  source: string,
  spans: readonly PublicAiSensitiveDataSpan[],
  sourceKind: PublicAiSourceKind,
  createNamespace: () => string,
  collisionFields: readonly string[],
) => {
  if (spans.some(span => !span.exact)) throw privacyUnsafeInput();
  if (hasUnsafeSensitiveNesting(source, spans)) throw privacyUnsafeInput();
  if (spans.length === 0) {
    return {
      resources: { carriers: [], namespace: '', sourceKind },
      tokenized: source,
    };
  }
  let namespace = '';
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const candidate = createNamespace();
    if (
      /^[A-Z0-9]{8}$/u.test(candidate)
      && !source.includes(candidate)
      && collisionFields.every(field => !field.includes(candidate))
    ) {
      namespace = candidate;
      break;
    }
  }
  if (!namespace) throw privacyUnsafeInput();
  const ranges = collectFixCarrierRanges(source, spans);
  const carriers: NonNullable<PreparedPublicAiPrompt['fixResources']>['carriers'] = [];
  const tokenizedParts: string[] = [];
  let cursor = 0;
  let spanIndex = 0;
  ranges.forEach((range, index) => {
    const original = source.slice(range.start, range.end);
    const resources: string[] = [];
    while (spanIndex < spans.length && (spans[spanIndex]?.start ?? source.length) < range.end) {
      const span = spans[spanIndex];
      if (span && span.start >= range.start) resources.push(source.slice(span.start, span.end));
      spanIndex += 1;
    }
    const trailingLineBreak = readTrailingLineBreak(original);
    const leadingLineBreak = readLeadingLineBreakAt(source, range.start);
    tokenizedParts.push(
      source.slice(cursor, range.start),
      createFixResourceToken(namespace, index),
      trailingLineBreak,
    );
    carriers.push({ leadingLineBreak, original, resources, trailingLineBreak });
    cursor = range.end;
  });
  tokenizedParts.push(source.slice(cursor));
  return {
    resources: { carriers, namespace, sourceKind },
    tokenized: tokenizedParts.join(''),
  };
};

const assertPromptBudget = (prompt: string) => {
  if (prompt.length > PUBLIC_AI_MAX_USER_PROMPT_CHARS) throw inputTooLarge();
  return prompt;
};

function prepareUserPrompt(
  input: PublicAiRequest,
  createNamespace: () => string,
): PreparedPublicAiPrompt {
  if (!['fix', 'generate', 'modify', 'summarize'].includes(input.action)) throw privacyUnsafeInput();
  const rawInstruction = input.instruction ?? '';
  if (rawInstruction.length > PUBLIC_AI_MAX_INSTRUCTION_CHARS) throw inputTooLarge();
  const instruction = rawInstruction.trim();
  const rawDiagnostic = input.diagnostic ?? '';
  if (rawDiagnostic.length > PUBLIC_AI_MAX_SELECTION_CHARS) throw inputTooLarge();
  const diagnostic = rawDiagnostic.trim();
  const parts: string[] = [];
  if (instruction) parts.push(`User request:\n${omitPublicAiLocalImageDataUrls(instruction)}`);
  if (diagnostic) parts.push(`Diagnostic:\n${omitPublicAiLocalImageDataUrls(diagnostic)}`);

  if (input.action === 'fix') {
    if (input.source === undefined) throw privacyUnsafeInput();
    if (!['html', 'markdown', 'text'].includes(input.sourceKind)) throw privacyUnsafeInput();
    if (input.source.length > PUBLIC_AI_MAX_RAW_SOURCE_CODE_UNITS) throw inputTooLarge();
    if (
      hasPublicAiUnsafeHtmlSource(input.source, input.sourceKind)
    ) throw privacyUnsafeInput();
    const spans = collectPublicAiSensitiveDataSpans(input.source);
    const tokenized = tokenizeFixSource(
      input.source,
      spans,
      input.sourceKind,
      createNamespace,
      [instruction, diagnostic],
    );
    if (tokenized.resources.carriers.length > 0) {
      parts.push([
        'Local resource preservation contract:',
        `Treat every ${tokenized.resources.namespace}NNNN_ value as an opaque token.`,
        'Each token replaces immutable complete physical source lines.',
        'Return each token exactly once, byte-for-byte, as the only bytes on its logical line, with its original line ending and order.',
        'Do not add, remove, rename, split, indent, suffix, or reorder tokens.',
      ].join('\n'));
    }
    parts.push(`Full source to repair:\n${tokenized.tokenized}`);
    return {
      fixResources: tokenized.resources,
      // The final source line ending is part of the carrier protocol. Unlike
      // ordinary prompts, Fix must not trim it before serialization.
      userPrompt: assertPromptBudget(parts.join('\n\n')),
    };
  }

  const hasSource = input.source !== undefined;
  if (!hasSource) {
    if (input.action !== 'summarize' || input.range !== undefined || input.selectedText !== undefined) {
      throw privacyUnsafeInput();
    }
    const providedVisibleText = input.visibleText ?? '';
    if (providedVisibleText.length > PUBLIC_AI_MAX_SELECTION_CHARS) throw inputTooLarge();
    const rawVisibleText = providedVisibleText.trim();
    const visibleText = omitPublicAiLocalImageDataUrls(rawVisibleText);
    if (visibleText.length > PUBLIC_AI_MAX_SELECTION_CHARS) throw inputTooLarge();
    if (visibleText) parts.push(`Visible text:\n${visibleText}`);
    return { userPrompt: assertPromptBudget(parts.join('\n\n').trim()) };
  }

  const source = input.source as string;
  if (!['html', 'markdown', 'text'].includes(input.sourceKind)) throw privacyUnsafeInput();
  const { range: selectionRange, spans } = inspectPublicAiSourceRangePrivacy(source, input.range);
  if (selectionRange.end - selectionRange.start > PUBLIC_AI_MAX_SELECTION_CHARS) throw inputTooLarge();
  const range = input.action === 'modify'
    ? validateSourceRange(source, input.patchRange)
    : selectionRange;
  if (
    (input.action === 'modify' && spans.some(span => rangeTouchesSensitiveSpan(range, span)))
    || (input.action !== 'modify' && 'patchRange' in input && input.patchRange !== undefined)
  ) throw privacyUnsafeInput();
  if (
    hasPublicAiUnsafeHtmlSource(source, input.sourceKind)
  ) throw privacyUnsafeInput();
  const selectedText = source.slice(range.start, range.end);
  if (selectedText.length > PUBLIC_AI_MAX_SELECTION_CHARS) throw inputTooLarge();

  if (input.action === 'modify' || input.action === 'summarize') {
    if (selectedText.trim()) parts.push(`Selected text:\n${selectedText.trim()}`);
  }
  if (input.action !== 'summarize') {
    const context = buildBoundedSourceContext(source, range, spans);
    if (context) parts.push(`Relevant source context:\n${context}`);
  }
  return { userPrompt: assertPromptBudget(parts.join('\n\n').trim()) };
}

const restoreFixResources = (
  text: string,
  resources: PreparedPublicAiPrompt['fixResources'],
) => {
  if (text.length > PUBLIC_AI_MAX_RAW_SOURCE_CODE_UNITS) throw privacyUnsafeResponse();
  const providerSpans = collectPublicAiSensitiveDataSpans(text);
  if (providerSpans.length > 0 || !resources) throw privacyUnsafeResponse();
  const { carriers, namespace, sourceKind } = resources;
  if (hasPublicAiUnsafeHtmlSource(text, sourceKind)) throw privacyUnsafeResponse();
  if (carriers.length === 0) return text;
  const tokenLength = namespace.length + PUBLIC_AI_RESOURCE_INDEX_WIDTH + 1;
  let restoredLength = text.length;
  for (const carrier of carriers) {
    const replacedLength = tokenLength + carrier.trailingLineBreak.length;
    if (restoredLength < replacedLength) throw privacyUnsafeResponse();
    restoredLength -= replacedLength;
    if (
      !Number.isSafeInteger(restoredLength)
      || carrier.original.length > PUBLIC_AI_MAX_RAW_SOURCE_CODE_UNITS - restoredLength
    ) throw privacyUnsafeResponse();
    restoredLength += carrier.original.length;
  }
  const restoredParts: string[] = [];
  let cursor = 0;
  let expectedIndex = 0;
  while (expectedIndex < carriers.length) {
    const start = text.indexOf(namespace, cursor);
    if (start < 0) break;
    const carrier = carriers[expectedIndex];
    if (!carrier) throw privacyUnsafeResponse();
    const token = createFixResourceToken(namespace, expectedIndex);
    const tokenEnd = start + token.length;
    const hasExpectedLeadingBoundary = carrier.leadingLineBreak === ''
      ? start === 0
      : readLeadingLineBreakAt(text, start) === carrier.leadingLineBreak;
    if (
      !text.startsWith(token, start)
      || !hasExpectedLeadingBoundary
      || readLineBreakAt(text, tokenEnd) !== carrier.trailingLineBreak
      || (carrier.trailingLineBreak === '' && tokenEnd !== text.length)
    ) throw privacyUnsafeResponse();
    const replacementEnd = tokenEnd + carrier.trailingLineBreak.length;
    restoredParts.push(text.slice(cursor, start), carrier.original);
    cursor = replacementEnd;
    expectedIndex += 1;
  }
  if (
    expectedIndex !== carriers.length
    || text.indexOf(namespace, cursor) >= 0
  ) throw privacyUnsafeResponse();
  restoredParts.push(text.slice(cursor));
  const restored = restoredParts.join('');
  const restoredSpans = collectPublicAiSensitiveDataSpans(restored);
  const originals = carriers.flatMap(carrier => carrier.resources);
  if (
    restoredSpans.length !== originals.length
    || restoredSpans.some((span, index) => (
      !span.exact || restored.slice(span.start, span.end) !== originals[index]
    ))
  ) throw privacyUnsafeResponse();
  if (
    hasPublicAiUnsafeHtmlSource(restored, sourceKind)
    || hasUnsafeSensitiveNesting(restored, restoredSpans)
  ) throw privacyUnsafeResponse();
  return restored;
};

const assertProviderMessagesSafe = (messages: readonly { content: string }[]) => {
  for (const message of messages) {
    if (collectPublicAiSensitiveDataSpans(message.content).length > 0) throw privacyUnsafeInput();
  }
};

function readResult(body: unknown, preserveWhitespace = false): PublicAiResult {
  if (!body || typeof body !== 'object') {
    throw new PublicAiError('invalid_response', 'AI returned an invalid JSON response.');
  }
  const choices = (body as OpenAiCompatibleResponse).choices;
  if (!Array.isArray(choices)) {
    throw new PublicAiError('invalid_response', 'AI returned an invalid response shape.');
  }
  for (const choice of choices) {
    const rawMessageText = typeof choice?.message?.content === 'string' ? choice.message.content : '';
    const rawLegacyText = typeof choice?.text === 'string' ? choice.text : '';
    const messageText = rawMessageText.trim() ? (preserveWhitespace ? rawMessageText : rawMessageText.trim()) : '';
    const legacyText = rawLegacyText.trim() ? (preserveWhitespace ? rawLegacyText : rawLegacyText.trim()) : '';
    const text = messageText || legacyText;
    if (!text) continue;
    return {
      text,
      finishReason: typeof choice.finish_reason === 'string' ? choice.finish_reason : undefined,
    };
  }
  throw new PublicAiError('empty_response', 'AI returned an empty response.');
}

const isModelConfigurationError = (body: unknown) => {
  if (!body || typeof body !== 'object') return false;
  const providerError = 'error' in body && body.error && typeof body.error === 'object'
    ? body.error as Record<string, unknown>
    : body as Record<string, unknown>;
  const safeSignals = ['code', 'type', 'param']
    .map(key => providerError[key])
    .filter((value): value is string => typeof value === 'string' && value.length <= 128)
    .join(' ')
    .toLowerCase();
  return /(?:model_not_found|invalid_model|model.*(?:not[_ -]?found|does[_ -]?not[_ -]?exist|invalid))/u.test(safeSignals);
};

function httpError(status: number, body?: unknown): PublicAiError {
  if (status === 401 || status === 403) {
    return new PublicAiError('unauthorized', 'AI rejected the API Key.', { status });
  }
  if (status === 404) {
    return new PublicAiError('model_not_found', 'AI endpoint or model was not found.', { status });
  }
  if ((status === 400 || status === 422) && isModelConfigurationError(body)) {
    return new PublicAiError('model_not_found', 'AI model is invalid or unavailable.', { status });
  }
  if (status === 429) {
    return new PublicAiError('rate_limited', 'AI request was rate limited.', { status });
  }
  if (status >= 500) {
    return new PublicAiError('server_error', 'AI provider is temporarily unavailable.', { status });
  }
  return new PublicAiError('http_error', `AI request failed with HTTP ${status}.`, { status });
}

function normalizeTimeout(timeoutMs: number | undefined): number {
  if (timeoutMs === undefined) return PUBLIC_AI_DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return PUBLIC_AI_DEFAULT_TIMEOUT_MS;
  return Math.floor(timeoutMs);
}

function createRequestSignal(externalSignal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  let didTimeout = false;
  const abortFromExternal = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) abortFromExternal();
  else externalSignal?.addEventListener('abort', abortFromExternal, { once: true });
  const timeoutId = globalThis.setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);
  return {
    signal: controller.signal,
    didTimeout: () => didTimeout,
    cleanup: () => {
      globalThis.clearTimeout(timeoutId);
      externalSignal?.removeEventListener('abort', abortFromExternal);
    },
  };
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new PublicAiError('invalid_response', 'AI returned invalid JSON.');
  }
}

export function createPublicAiAdapter(options: PublicAiAdapterOptions = {}): PublicAiAdapter {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const readConfig = options.readConfig ?? readPublicAiConfig;
  const timeoutMs = normalizeTimeout(options.timeoutMs);
  const onMissingConfig = options.onMissingConfig ?? requestPublicAiConfigOpen;
  const createResourceNamespace = options.createResourceNamespace ?? createRandomResourceNamespace;

  return {
    async request(input: PublicAiRequest): Promise<PublicAiResult> {
      if (input.signal?.aborted) {
        throw new PublicAiError('aborted', 'AI request was cancelled.');
      }
      const prepared = prepareUserPrompt(input, createResourceNamespace);
      const messages = [
        { role: 'system' as const, content: buildSystemPrompt(input.action) },
        { role: 'user' as const, content: prepared.userPrompt },
      ];
      assertProviderMessagesSafe(messages);
      const config = readConfig();
      const modelRole = getPublicAiModelRole(input.action);
      if (!isPublicAiConfigUsable(config, input.action)) {
        onMissingConfig();
        throw new PublicAiError('missing_config', 'AI is not configured for this action.');
      }
      const requestSignal = createRequestSignal(input.signal, timeoutMs);
      try {
        const response = await fetchImpl(resolvePublicAiChatCompletionsUrl(config.baseUrl), {
          method: 'POST',
          headers: {
            accept: 'application/json',
            authorization: `Bearer ${config.apiKey.trim()}`,
            'content-type': 'application/json',
          },
          signal: requestSignal.signal,
          body: JSON.stringify({
            messages,
            model: config.models[modelRole].trim(),
            stream: false,
            temperature: 0.2,
          }),
        });
        if (!response.ok) {
          const errorBody = await response.json().catch(() => null);
          throw httpError(response.status, errorBody);
        }
        const result = readResult(await parseJsonResponse(response), input.action === 'fix');
        return input.action === 'fix'
          ? { ...result, text: restoreFixResources(result.text, prepared.fixResources) }
          : result;
      } catch (error) {
        if (error instanceof PublicAiError) throw error;
        if (requestSignal.didTimeout()) {
          throw new PublicAiError('timeout', 'AI request timed out.');
        }
        if (input.signal?.aborted || requestSignal.signal.aborted) {
          throw new PublicAiError('aborted', 'AI request was cancelled.');
        }
        throw new PublicAiError('network_error', 'AI request could not reach the configured provider.');
      } finally {
        requestSignal.cleanup();
      }
    },
  };
}

export const publicAiAdapter: PublicAiAdapter = createPublicAiAdapter();
