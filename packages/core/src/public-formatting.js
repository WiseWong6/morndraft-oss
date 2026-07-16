import JSON5 from 'json5';

import {
  parseMarkdownRichInline,
  sanitizeMarkdownInlineStyle,
  serializeMarkdownRichInline,
} from './markdown-lexical-edit.js';
import { getPublicSourcePhysicalLineBounds } from './public-editor-interactions.js';

const INLINE_FORMAT_FIELDS = {
  bold: 'strong',
  highlight: 'highlight',
  italic: 'italic',
  underline: 'underline',
};

const BLOCK_FORMATS = new Set([
  'paragraph', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'quote', 'bulletList', 'numberList',
]);
const PUBLIC_BLOCK_PREFIX_PATTERN = /^(?:#{1,6}[ \t]+|>[ \t]?|(?:[-+*]|\d+[.)])[ \t]+)/u;
const PUBLIC_CONTAINER_PREFIX_PATTERN = /^(?:>[ \t]?|(?:[-+*]|\d+[.)])[ \t]+)/u;

const createFailure = (reason) => ({ ok: false, reason });

const isSelectionCurrent = (source, selection) => (
  selection
  && Number.isSafeInteger(selection.start)
  && Number.isSafeInteger(selection.end)
  && selection.start >= 0
  && selection.end > selection.start
  && selection.end <= source.length
  && selection.source === source
  && selection.sourceText === source.slice(selection.start, selection.end)
  && typeof selection.visibleText === 'string'
  && selection.visibleText.trim().length > 0
  && Number.isSafeInteger(selection.formatContext?.blockStart)
  && Number.isSafeInteger(selection.formatContext?.blockEnd)
  && Number.isSafeInteger(selection.formatContext?.visibleStart)
  && Number.isSafeInteger(selection.formatContext?.visibleEnd)
  && selection.formatContext.blockStart >= 0
  && selection.formatContext.blockStart <= selection.start
  && selection.formatContext.blockEnd >= selection.end
  && selection.formatContext.blockEnd <= source.length
  && selection.formatContext.visibleStart >= 0
  && selection.formatContext.visibleEnd > selection.formatContext.visibleStart
);

const getLineBounds = (source, start, end) => {
  const bounds = getPublicSourcePhysicalLineBounds(source, start, end);
  return { lineEnd: bounds.end, lineStart: bounds.start };
};

const rangeOverlaps = (start, end, otherStart, otherEnd) => start < otherEnd && end > otherStart;

const findFenceOverlap = (source, start, end) => {
  const linePattern = /(^|\n)( {0,3})(`{3,}|~{3,})([^\r\n]*)(?:\r?\n|$)/gu;
  let open = null;
  let match;
  while ((match = linePattern.exec(source))) {
    const lineStart = match.index + match[1].length;
    const lineEnd = linePattern.lastIndex;
    const marker = match[3];
    if (!open) {
      open = { char: marker[0], length: marker.length, start: lineStart };
      continue;
    }
    if (marker[0] !== open.char || marker.length < open.length || match[4].trim()) continue;
    if (rangeOverlaps(start, end, open.start, lineEnd)) return true;
    open = null;
  }
  return Boolean(open && rangeOverlaps(start, end, open.start, source.length));
};

const findInlineCodeOverlap = (source, start, end) => {
  const { lineEnd, lineStart } = getLineBounds(source, start, end);
  const line = source.slice(lineStart, lineEnd);
  const codePattern = /(`+)([\s\S]*?)\1/gu;
  let match;
  while ((match = codePattern.exec(line))) {
    const codeStart = lineStart + match.index;
    const codeEnd = codeStart + match[0].length;
    if (rangeOverlaps(start, end, codeStart, codeEnd)) return true;
  }
  return false;
};

const hasUnsupportedBlockLine = (source, start, end) => {
  const { lineEnd, lineStart } = getLineBounds(source, start, end);
  return source.slice(lineStart, lineEnd).split(/\r?\n|\r/u).some((line) => {
    const trimmed = line.trim();
    return (
      /^\|.*\|$/u.test(trimmed)
      || /^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?$/u.test(trimmed)
      || /^ {0,3}(?:<\/?(?:table|thead|tbody|tr|td|th|iframe|script|style)\b|<!--)/iu.test(line)
    );
  });
};

const spansMultipleLogicalBlocks = (source, start, end) => {
  const { lineEnd, lineStart } = getLineBounds(source, start, end);
  const blockSource = source.slice(lineStart, lineEnd);
  if (/(?:\r\n|\r|\n)[ \t]*(?:\r\n|\r|\n)/u.test(blockSource)) return true;
  const lines = blockSource.split(/\r?\n|\r/u);
  return lines.slice(1).some((line) => /^ {0,3}(?:#{1,6}[ \t]+|>[ \t]?|[-+*][ \t]+|\d+[.)][ \t]+)/u.test(line));
};

const hasNestedBlockPrefix = (source, start, end) => {
  const { lineEnd, lineStart } = getLineBounds(source, start, end);
  return source.slice(lineStart, lineEnd).split(/\r?\n|\r/u).some((line) => {
    const rest = line.slice(line.match(/^ {0,3}/u)?.[0].length ?? 0);
    const firstPrefix = rest.match(PUBLIC_CONTAINER_PREFIX_PATTERN)?.[0];
    if (!firstPrefix) return false;
    const nestedIndent = rest.slice(firstPrefix.length).match(/^[ \t]{0,3}/u)?.[0] ?? '';
    return PUBLIC_BLOCK_PREFIX_PATTERN.test(rest.slice(firstPrefix.length + nestedIndent.length));
  });
};

const isRawJson5Container = (source) => {
  const trimmed = source.trim();
  if (!/^(?:\{|\[)/u.test(trimmed)) return false;
  try {
    const value = JSON5.parse(trimmed);
    return value !== null && typeof value === 'object';
  } catch {
    return false;
  }
};

export const getPublicFormatSelectionAvailability = (sourceInput, selection) => {
  const source = String(sourceInput ?? '');
  if (!isSelectionCurrent(source, selection)) {
    return { canApplyBlockFormat: false, canFormat: false, reason: 'selection-required' };
  }
  if (
    findFenceOverlap(source, selection.start, selection.end)
    || findInlineCodeOverlap(source, selection.start, selection.end)
    || hasUnsupportedBlockLine(source, selection.start, selection.end)
    || hasNestedBlockPrefix(source, selection.start, selection.end)
    || spansMultipleLogicalBlocks(source, selection.start, selection.end)
  ) {
    return { canApplyBlockFormat: false, canFormat: false, reason: 'unsupported-region' };
  }
  if (isRawJson5Container(source) && !source.includes('\n\n')) {
    return { canApplyBlockFormat: false, canFormat: false, reason: 'unsupported-region' };
  }
  if (!getInlineFormatContext(source, selection)) {
    return {
      canApplyBlockFormat: true,
      canFormat: false,
      reason: 'unserializable-selection',
    };
  }
  return { canApplyBlockFormat: true, canFormat: true, reason: null };
};

function getInlineFormatContext(source, selection) {
  const context = selection.formatContext;
  const blockSource = source.slice(context.blockStart, context.blockEnd);
  const prefix = blockSource.match(/^ {0,3}(?:#{1,6}[ \t]+|>[ \t]?|(?:[-+*]|\d+[.)])[ \t]+)/u)?.[0] ?? '';
  const inlineStart = context.blockStart + prefix.length;
  const inlineSource = source.slice(inlineStart, context.blockEnd);
  const parsed = parseMarkdownRichInline(inlineSource);
  if (
    !parsed.ok
    || context.visibleEnd > parsed.text.length
    || parsed.text.slice(context.visibleStart, context.visibleEnd) !== selection.visibleText
  ) return null;
  return {
    inlineEnd: context.blockEnd,
    inlineStart,
    parsed,
    visibleEnd: context.visibleEnd,
    visibleStart: context.visibleStart,
  };
}

const getOverlappingSegments = (segments, start, end) => {
  const overlaps = [];
  let offset = 0;
  for (const segment of segments) {
    const segmentStart = offset;
    const segmentEnd = segmentStart + segment.text.length;
    offset = segmentEnd;
    if (segmentEnd > start && segmentStart < end) overlaps.push(segment);
  }
  return overlaps;
};

const patchInlineVisibleRange = (source, selection, updateSegment) => {
  const context = getInlineFormatContext(source, selection);
  if (!context) return createFailure('unserializable-selection');
  const nextSegments = [];
  let offset = 0;
  for (const rawSegment of context.parsed.segments) {
    const segment = { ...rawSegment, style: { ...(rawSegment.style ?? {}) } };
    const segmentStart = offset;
    const segmentEnd = segmentStart + segment.text.length;
    offset = segmentEnd;
    if (segmentEnd <= context.visibleStart || segmentStart >= context.visibleEnd) {
      nextSegments.push(segment);
      continue;
    }
    const localStart = Math.max(0, context.visibleStart - segmentStart);
    const localEnd = Math.min(segment.text.length, context.visibleEnd - segmentStart);
    if (localStart > 0) nextSegments.push({ ...segment, text: segment.text.slice(0, localStart) });
    if (localEnd > localStart) {
      nextSegments.push(updateSegment({ ...segment, text: segment.text.slice(localStart, localEnd) }));
    }
    if (localEnd < segment.text.length) nextSegments.push({ ...segment, text: segment.text.slice(localEnd) });
  }
  const replacement = serializeMarkdownRichInline(nextSegments);
  return {
    ok: true,
    selection: { start: context.inlineStart, end: context.inlineStart + replacement.length },
    source: `${source.slice(0, context.inlineStart)}${replacement}${source.slice(context.inlineEnd)}`,
  };
};

const applyInlineFormat = (source, selection, format) => {
  const field = INLINE_FORMAT_FIELDS[format];
  if (!field) return createFailure('invalid-command');
  const context = getInlineFormatContext(source, selection);
  if (!context) return createFailure('unserializable-selection');
  const selectedSegments = getOverlappingSegments(
    context.parsed.segments,
    context.visibleStart,
    context.visibleEnd,
  );
  const shouldEnable = selectedSegments.length > 0
    && !selectedSegments.every((segment) => Boolean(segment[field]));
  return patchInlineVisibleRange(source, selection, (segment) => ({ ...segment, [field]: shouldEnable }));
};

const applyInlineStyle = (source, selection, stylePatch) => {
  const safePatch = sanitizeMarkdownInlineStyle(stylePatch);
  const requestedKeys = Object.keys(stylePatch ?? {}).filter((key) => (
    ['color', 'fontFamily', 'fontSize', 'letterSpacing', 'lineHeight'].includes(key)
  ));
  if (requestedKeys.length !== 1) return createFailure('invalid-command');
  const key = requestedKeys[0];
  const requestedValue = String(stylePatch[key] ?? '').trim();
  if (requestedValue && !safePatch[key]) return createFailure('invalid-command');
  return patchInlineVisibleRange(source, selection, (segment) => {
    const style = { ...(segment.style ?? {}) };
    if (requestedValue) style[key] = safePatch[key];
    else delete style[key];
    return { ...segment, style };
  });
};

const stripPublicBlockPrefix = (line) => {
  const indent = line.match(/^ {0,3}/u)?.[0] ?? '';
  const rest = line.slice(indent.length);
  const prefix = rest.match(PUBLIC_BLOCK_PREFIX_PATTERN)?.[0] ?? '';
  return {
    indent,
    text: rest.slice(prefix.length),
  };
};

const applyBlockFormat = (source, selection, format) => {
  if (!BLOCK_FORMATS.has(format)) return createFailure('invalid-command');
  const { lineEnd, lineStart } = getLineBounds(source, selection.start, selection.end);
  const lineBreak = source.includes('\r\n') ? '\r\n' : source.includes('\r') ? '\r' : '\n';
  const blockSource = source.slice(lineStart, lineEnd);
  const lines = blockSource.split(/\r?\n|\r/u);
  let numberedIndex = 0;
  const replacement = lines.map((line) => {
    if (!line.trim()) return line;
    const { indent, text } = stripPublicBlockPrefix(line);
    if (format === 'paragraph') return `${indent}${text}`;
    if (/^h[1-6]$/u.test(format)) return `${indent}${'#'.repeat(Number(format.slice(1)))} ${text}`;
    if (format === 'quote') return `${indent}> ${text}`;
    if (format === 'bulletList') return `${indent}- ${text}`;
    numberedIndex += 1;
    return `${indent}${numberedIndex}. ${text}`;
  }).join(lineBreak);
  return {
    ok: true,
    selection: { start: lineStart, end: lineStart + replacement.length },
    source: `${source.slice(0, lineStart)}${replacement}${source.slice(lineEnd)}`,
  };
};

export const applyPublicFormatCommand = (sourceInput, selection, command) => {
  const source = String(sourceInput ?? '');
  const availability = getPublicFormatSelectionAvailability(source, selection);
  if (!command || typeof command !== 'object') return createFailure('invalid-command');
  if (command.kind === 'block' && availability.canApplyBlockFormat) {
    return applyBlockFormat(source, selection, command.format);
  }
  if (!availability.canFormat) return createFailure(availability.reason);
  if (command.kind === 'inline') return applyInlineFormat(source, selection, command.format);
  if (command.kind === 'style') return applyInlineStyle(source, selection, command.style);
  return createFailure('invalid-command');
};
