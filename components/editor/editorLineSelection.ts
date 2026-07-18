const normalizeForMatch = (value: string) => value.replace(/\s+/g, ' ').trim().toLocaleLowerCase();

// Find the (0-based) nth occurrence of needle in haystack starting from an
// offset, mirroring previewDiagnosticLineNavigation.findNthOccurrence. Kept
// local to avoid a preview-only dependency in the editor package.
const findNthOccurrence = (
  haystack: string,
  needle: string,
  occurrenceIndex: number,
  fromIndex = 0,
): number => {
  if (!needle || occurrenceIndex < 0) return -1;
  let remaining = occurrenceIndex;
  let searchFrom = fromIndex;
  while (remaining >= 0) {
    const found = haystack.indexOf(needle, searchFrom);
    if (found < 0) return -1;
    if (remaining === 0) return found;
    remaining -= 1;
    searchFrom = found + needle.length;
  }
  return -1;
};

export const getLineSelectionRange = (value: string, line: number) => {
  const lines = value.split('\n');
  const targetLine = Math.min(Math.max(1, Math.trunc(line)), Math.max(1, lines.length));
  let start = 0;
  for (let index = 0; index < targetLine - 1; index += 1) {
    start += lines[index].length + 1;
  }
  const end = start + (lines[targetLine - 1]?.length ?? 0);
  return { line: targetLine, start, end };
};

export const getSourceLineSelectionRange = (value: string, offset: number) => {
  const anchor = Number.isFinite(offset)
    ? Math.min(Math.max(0, Math.trunc(offset)), value.length)
    : 0;
  const previousLineBreak = anchor > 0 ? value.lastIndexOf('\n', anchor - 1) : -1;
  const start = previousLineBreak + 1;
  const nextLineBreak = value.indexOf('\n', start);
  let end = nextLineBreak < 0 ? value.length : nextLineBreak;
  if (end > start && value[end - 1] === '\r') end -= 1;
  return { start, end };
};

export type SourceLineDoubleClickInput = {
  pointerType: string | null;
  button: number;
  detail: number;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
};

export const shouldHandleSourceLineDoubleClick = (input: SourceLineDoubleClickInput) => (
  input.pointerType === 'mouse' &&
  input.button === 0 &&
  input.detail === 2 &&
  !input.altKey &&
  !input.ctrlKey &&
  !input.metaKey &&
  !input.shiftKey
);

const getOffsetForLine = (value: string, line: number) => {
  const lines = value.split('\n');
  const targetLine = Math.min(Math.max(1, Math.trunc(line)), Math.max(1, lines.length));
  let offset = 0;
  for (let index = 0; index < targetLine - 1; index += 1) {
    offset += lines[index].length + 1;
  }
  return offset;
};

export const getExplicitSelectionRange = (
  value: string,
  selectionRange: { start: number; end: number },
): { line: number; start: number; end: number } | null => {
  const start = Math.max(0, Math.min(value.length, Math.trunc(selectionRange.start)));
  const end = Math.max(start, Math.min(value.length, Math.trunc(selectionRange.end)));
  if (end <= start) return null;
  return {
    line: value.slice(0, start).split('\n').length,
    start,
    end,
  };
};

// Build a normalized (whitespace-collapsed, lowercased) view of `value` alongside
// an offset map that, for each normalized character, records its raw index in
// `value`. A run of whitespace is emitted as a single normalized space whose raw
// offset points at the first whitespace character of the run. Leading whitespace
// at the very start is dropped (mirrors trim()).
const buildNormalizedView = (value: string): { text: string; rawOffsets: number[] } => {
  let text = '';
  const rawOffsets: number[] = [];
  let pendingSpace = false;
  let started = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (/\s/.test(char)) {
      if (started) pendingSpace = true;
      continue;
    }
    if (pendingSpace) {
      text += ' ';
      // Space represents the whitespace run that ended just before this char;
      // point it at the previous raw index (last whitespace position).
      rawOffsets.push(index - 1);
      pendingSpace = false;
    }
    text += char.toLocaleLowerCase();
    rawOffsets.push(index);
    started = true;
  }
  return { text, rawOffsets };
};

// Locate the exact characters in source for a text that was selected in final.
// Returns a selection range in the raw source string, or null when the text
// cannot be mapped back (e.g. it spans markdown sigils that differ between
// rendered and raw form). In that case the caller falls back to line-based
// positioning, which is never worse than the previous behavior.
export const getSelectionTextRange = (
  value: string,
  selectionText: string,
  occurrenceIndex = 0,
  scopeLineRange?: { startLine: number; endLine: number },
): { line: number; start: number; end: number } | null => {
  const trimmed = selectionText.trim();
  if (!trimmed) return null;
  const normalizedNeedle = normalizeForMatch(trimmed);
  if (!normalizedNeedle) return null;
  const scopedStart = scopeLineRange
    ? getOffsetForLine(value, scopeLineRange.startLine)
    : 0;
  const scopedEnd = scopeLineRange
    ? getLineSelectionRange(value, scopeLineRange.endLine).end
    : value.length;
  const scopedValue = value.slice(scopedStart, Math.max(scopedStart, scopedEnd));
  const { text: normalizedHaystack, rawOffsets } = buildNormalizedView(scopedValue);
  const startIndex = findNthOccurrence(normalizedHaystack, normalizedNeedle, Math.max(0, occurrenceIndex));
  if (startIndex < 0) return null;
  const endIndex = startIndex + normalizedNeedle.length - 1;
  const rawStart = rawOffsets[startIndex] ?? -1;
  const rawEndOffset = rawOffsets[endIndex] ?? -1;
  if (rawStart < 0 || rawEndOffset < 0) return null;
  const start = scopedStart + rawStart;
  const end = scopedStart + rawEndOffset + 1;
  if (end <= start) return null;
  const line = value.slice(0, start).split('\n').length;
  return { line, start, end };
};
