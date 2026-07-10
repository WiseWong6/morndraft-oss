const SOURCE_RANGE_KEYS = ['startLine', 'startColumn', 'endLine', 'endColumn'];

const createFailure = (reason, extra = {}) => ({ ok: false, reason, ...extra });

const getLinesWithOffsets = (source) => {
  const text = String(source ?? '');
  const lines = [];
  const pattern = /([^\r\n]*)(\r\n|\r|\n|$)/g;
  let match;

  while ((match = pattern.exec(text))) {
    lines.push({
      text: match[1],
      offset: match.index,
      newline: match[2],
    });
    if (!match[2]) break;
  }

  return lines.length ? lines : [{ text: '', offset: 0, newline: '' }];
};

const isPositiveInteger = (value) => Number.isInteger(value) && value >= 1;

const MARKDOWN_SOURCE_PATCH_CONTEXT = Symbol('markdown-source-patch-context');

const lineColumnToOffsetFromLines = (lines, line, column) => {
  if (!isPositiveInteger(line) || !isPositiveInteger(column)) return null;
  const target = lines[line - 1];
  if (!target || column > target.text.length + 1) return null;
  return target.offset + column - 1;
};

const validateSourceRangeFromLines = (lines, range) => {
  if (!range || SOURCE_RANGE_KEYS.some((key) => !isPositiveInteger(range[key]))) {
    return createFailure('invalid_range');
  }

  const startOffset = lineColumnToOffsetFromLines(lines, range.startLine, range.startColumn);
  const endOffset = lineColumnToOffsetFromLines(lines, range.endLine, range.endColumn);
  if (startOffset === null || endOffset === null) return createFailure('range_out_of_bounds');
  if (endOffset < startOffset) return createFailure('reversed_range');

  return { ok: true, startOffset, endOffset };
};

export const createMarkdownSourcePatchContext = (source) => {
  const text = String(source ?? '');
  const lines = getLinesWithOffsets(text);
  return {
    [MARKDOWN_SOURCE_PATCH_CONTEXT]: true,
    source: text,
    lines,
    getLineAt(line) {
      return lines[line - 1] ?? null;
    },
    lineColumnToOffset(line, column) {
      return lineColumnToOffsetFromLines(lines, line, column);
    },
    validateSourceRange(range) {
      return validateSourceRangeFromLines(lines, range);
    },
    patchSourceRange(range, replacement) {
      const validation = validateSourceRangeFromLines(lines, range);
      if (!validation.ok) return validation;
      return {
        ok: true,
        source: `${text.slice(0, validation.startOffset)}${replacement}${text.slice(validation.endOffset)}`,
      };
    },
  };
};

const isMarkdownSourcePatchContext = (value) =>
  Boolean(value && typeof value === 'object' && value[MARKDOWN_SOURCE_PATCH_CONTEXT]);

const getMarkdownSourceContext = (source) =>
  isMarkdownSourcePatchContext(source) ? source : createMarkdownSourcePatchContext(source);

export const lineColumnToOffset = (source, line, column) =>
  getMarkdownSourceContext(source).lineColumnToOffset(line, column);

export const validateSourceRange = (source, range) =>
  getMarkdownSourceContext(source).validateSourceRange(range);

export const patchSourceRange = (source, range, replacement) => {
  return getMarkdownSourceContext(source).patchSourceRange(range, replacement);
};

export const patchArtifactCodeSource = (
  source,
  { contentRange, patchWholeSource = false, replacement },
) => {
  const nextCode = String(replacement ?? '');
  if (patchWholeSource) {
    return { ok: true, source: nextCode };
  }
  if (!contentRange) {
    return createFailure('missing_range');
  }
  return patchSourceRange(source, contentRange, nextCode);
};

export const rejectRecoveredVirtualLine = (range, lineMap) => {
  if (!Array.isArray(lineMap) || lineMap.length === 0) return { ok: true };
  if (!range || !isPositiveInteger(range.startLine) || !isPositiveInteger(range.endLine)) {
    return createFailure('invalid_range');
  }

  for (let line = range.startLine; line <= range.endLine; line += 1) {
    const mapped = lineMap[line - 1];
    const previous = line > 1 ? lineMap[line - 2] : null;
    if (!isPositiveInteger(mapped)) return createFailure('virtual_line');
    if (isPositiveInteger(previous) && mapped < previous) {
      return createFailure('virtual_line');
    }
  }

  return { ok: true };
};

const getLineAt = (source, line) => getMarkdownSourceContext(source).getLineAt(line);

const hasUnsupportedInlineMarkdown = (value) => {
  const text = String(value ?? '');
  return (
    /!\[[^\]\n]*]\([^)\n]*\)/.test(text) ||
    /\[[^\]\n]+]\([^)\n]+\)/.test(text) ||
    /`/.test(text) ||
    /<\/?[a-z][^>\n]*>/i.test(text) ||
    /~~/.test(text)
  );
};

const LIST_ITEM_PREFIX_PATTERN = /^(\s{0,8}(?:(?:[-+*])|(?:\d+[.)]))[ \t]+(?:\[[ xX]\][ \t]+)?)(.*)$/;
const LIST_ITEM_PREFIX_ONLY_PATTERN = /^\s{0,8}(?:(?:[-+*])|(?:\d+[.)]))[ \t]+(?:\[[ xX]\][ \t]+)?$/;

const stripContainerContinuationPrefixes = (text, prefixLength) => {
  const lines = String(text ?? '').split(/\r?\n/);
  if (lines.length <= 1) return null;
  const prefixes = [''];
  const normalizedLines = [lines[0]];
  let strippedAnyLine = false;

  for (const line of lines.slice(1)) {
    const prefix = line.match(new RegExp(`^[ \\t]{0,${prefixLength}}`))?.[0] ?? '';
    prefixes.push(prefix);
    normalizedLines.push(line.slice(prefix.length));
    strippedAnyLine ||= prefix.length > 0;
  }

  if (!strippedAnyLine) return null;
  return {
    prefixes,
    text: normalizedLines.join('\n'),
  };
};

const readSimpleInlineMarkdownUnits = (markdown) => {
  const units = [];
  const text = String(markdown ?? '');
  let italic = false;
  let strong = false;
  let index = 0;

  while (index < text.length) {
    if (text.slice(index, index + 2) === '**') {
      if (strong || text.indexOf('**', index + 2) !== -1) {
        strong = !strong;
      }
      index += 2;
      continue;
    }

    if (text[index] === '*') {
      italic = !italic;
      index += 1;
      continue;
    }

    units.push({
      char: text[index],
      italic,
      markdownEnd: index + 1,
      markdownStart: index,
      strong,
    });
    index += 1;
  }

  return units;
};

export const getMarkdownPlainText = (markdown) =>
  readSimpleInlineMarkdownUnits(markdown).map((unit) => unit.char).join('');

const clampPlainOffset = (value, max) =>
  Math.max(0, Math.min(Number.isFinite(value) ? Math.round(value) : 0, max));

const plainOffsetToMarkdownOffset = (markdown, plainOffset, affinity = 'start') => {
  const units = readSimpleInlineMarkdownUnits(markdown);
  const normalizedOffset = clampPlainOffset(plainOffset, units.length);
  const skipOpeningMarkers = (offset) => {
    let nextOffset = offset;
    while (nextOffset < markdown.length) {
      if (markdown.slice(nextOffset, nextOffset + 2) === '**') {
        nextOffset += 2;
        continue;
      }
      if (markdown[nextOffset] === '*') {
        nextOffset += 1;
        continue;
      }
      break;
    }
    return nextOffset;
  };
  const getEmptyPlaceholderOffsetBefore = (offset) => {
    if (markdown.slice(Math.max(0, offset - 4), offset) === '****') return offset - 2;
    if (
      markdown.slice(Math.max(0, offset - 2), offset) === '**' &&
      markdown.indexOf('**', offset) === -1
    ) {
      return offset - 1;
    }
    return null;
  };
  if (normalizedOffset === 0) {
    return affinity === 'start' ? skipOpeningMarkers(0) : 0;
  }
  if (normalizedOffset >= units.length) {
    if ((affinity === 'end' || affinity === 'start') && markdown.endsWith('****')) {
      return markdown.length - 2;
    }
    if ((affinity === 'end' || affinity === 'start') && markdown.endsWith('**')) {
      const previousStrongMarker = markdown.lastIndexOf('**', markdown.length - 3);
      if (previousStrongMarker < 0) return markdown.length - 1;
    }
    return affinity === 'start'
      ? markdown.length
      : units[units.length - 1]?.markdownEnd ?? markdown.length;
  }

  if (affinity === 'end') {
    const previousUnit = units[normalizedOffset - 1];
    const nextUnit = units[normalizedOffset];
    const previousEnd = previousUnit?.markdownEnd ?? 0;
    const nextStart = nextUnit?.markdownStart ?? markdown.length;
    const betweenUnits = markdown.slice(previousEnd, nextStart);
    if (betweenUnits === '****') return previousEnd + 2;
    if (
      betweenUnits === '**' &&
      Boolean(previousUnit) &&
      Boolean(nextUnit) &&
      previousUnit.strong === nextUnit.strong &&
      previousUnit.italic === nextUnit.italic
    ) {
      return previousEnd + 1;
    }
    return previousEnd;
  }

  let markdownOffset = units[normalizedOffset].markdownStart;
  const placeholderOffset = getEmptyPlaceholderOffsetBefore(markdownOffset);
  if (affinity === 'start' && placeholderOffset !== null) {
    return placeholderOffset;
  }
  if (affinity === 'start') {
    markdownOffset = skipOpeningMarkers(markdownOffset);
  }
  return markdownOffset;
};

const findCommonPrefixLength = (left, right) => {
  const max = Math.min(left.length, right.length);
  let index = 0;
  while (index < max && left[index] === right[index]) index += 1;
  return index;
};

const findCommonSuffixLength = (left, right, prefixLength) => {
  let suffixLength = 0;
  while (
    suffixLength + prefixLength < left.length &&
    suffixLength + prefixLength < right.length &&
    left[left.length - suffixLength - 1] === right[right.length - suffixLength - 1]
  ) {
    suffixLength += 1;
  }
  return suffixLength;
};

const removeEmptyStrongPairs = (markdown) => {
  let next = markdown;
  while (next.includes('****')) next = next.replaceAll('****', '');
  return next;
};

const replaceMarkdownByPlainTextDiff = (markdown, nextPlainText) => {
  const oldPlainText = getMarkdownPlainText(markdown);
  const plainText = String(nextPlainText ?? '');
  if (oldPlainText === plainText) return markdown;

  const prefixLength = findCommonPrefixLength(oldPlainText, plainText);
  const suffixLength = findCommonSuffixLength(oldPlainText, plainText, prefixLength);
  const oldChangeEnd = oldPlainText.length - suffixLength;
  const newChangeEnd = plainText.length - suffixLength;
  const markdownStart = plainOffsetToMarkdownOffset(markdown, prefixLength, 'start');
  const markdownEnd = plainOffsetToMarkdownOffset(markdown, oldChangeEnd, 'end');
  const replacement = plainText.slice(prefixLength, newChangeEnd);
  return removeEmptyStrongPairs(`${markdown.slice(0, markdownStart)}${replacement}${markdown.slice(markdownEnd)}`);
};

const createEditableBlock = (kind, text, textRange, extra = {}) => ({
  editable: true,
  kind,
  text,
  textRange,
  ...extra,
});

const readonlyBlock = (kind, reason, extra = {}) => ({
  editable: false,
  kind,
  reason,
  ...extra,
});

const getRangeText = (source, range) => {
  const context = getMarkdownSourceContext(source);
  const validation = context.validateSourceRange(range);
  if (!validation.ok) return null;
  return {
    text: context.source.slice(validation.startOffset, validation.endOffset),
    validation,
  };
};

const offsetRangeToSourceRange = (source, startOffset, endOffset) => {
  const lines = getMarkdownSourceContext(source).lines;
  let startLine = null;
  let startColumn = null;
  let endLine = null;
  let endColumn = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineStart = line.offset;
    const lineEnd = line.offset + line.text.length;
    if (startLine === null && startOffset >= lineStart && startOffset <= lineEnd) {
      startLine = index + 1;
      startColumn = startOffset - lineStart + 1;
    }
    if (endLine === null && endOffset >= lineStart && endOffset <= lineEnd) {
      endLine = index + 1;
      endColumn = endOffset - lineStart + 1;
    }
  }

  if (!startLine || !startColumn || !endLine || !endColumn) return null;
  return { startLine, startColumn, endLine, endColumn };
};

const getHeadingBlock = (source, range) => {
  if (range.startLine !== range.endLine) return readonlyBlock('heading', 'multiline_heading');
  const rangeText = getRangeText(source, range);
  if (!rangeText) return readonlyBlock('heading', 'invalid_range');
  const match = rangeText.text.match(/^(\s{0,3}#{1,6}[ \t]+)(.*?)([ \t]+#+[ \t]*)?$/);
  if (!match) return readonlyBlock('heading', 'invalid_heading');
  if (hasUnsupportedInlineMarkdown(match[2])) return readonlyBlock('heading', 'complex_inline');

  const startOffset = rangeText.validation.startOffset + match[1].length;
  const endOffset = rangeText.validation.endOffset - (match[3]?.length ?? 0);
  return createEditableBlock(
    'heading',
    match[2],
    offsetRangeToSourceRange(source, startOffset, endOffset),
  );
};

const getParagraphBlock = (source, range) => {
  const rangeText = getRangeText(source, range);
  if (!rangeText) return readonlyBlock('paragraph', 'invalid_range');
  let text = rangeText.text;
  const line = getLineAt(source, range.startLine);
  const firstLinePrefix = line?.text.slice(0, Math.max(0, range.startColumn - 1)) ?? '';
  const containerPrefixes = LIST_ITEM_PREFIX_ONLY_PATTERN.test(firstLinePrefix)
    ? stripContainerContinuationPrefixes(text, firstLinePrefix.length)
    : null;
  if (containerPrefixes) {
    text = containerPrefixes.text;
  }
  if (hasUnsupportedInlineMarkdown(text)) return readonlyBlock('paragraph', 'complex_inline');
  return createEditableBlock('paragraph', text, range, {
    paragraphLinePrefixes: containerPrefixes?.prefixes,
  });
};

const getListItemBlock = (source, range) => {
  if (range.startLine !== range.endLine) return readonlyBlock('listItem', 'multiline_list_item');
  const rangeText = getRangeText(source, range);
  if (!rangeText) return readonlyBlock('listItem', 'invalid_range');
  const match = rangeText.text.match(LIST_ITEM_PREFIX_PATTERN);
  if (!match) return readonlyBlock('listItem', 'invalid_list_item');
  if (hasUnsupportedInlineMarkdown(match[2])) return readonlyBlock('listItem', 'complex_inline');

  const startOffset = rangeText.validation.startOffset + match[1].length;
  return createEditableBlock(
    'listItem',
    match[2],
    offsetRangeToSourceRange(source, startOffset, rangeText.validation.endOffset),
    { listPrefix: match[1] },
  );
};

const getBlockquoteBlock = (source, range) => {
  const rangeText = getRangeText(source, range);
  if (!rangeText) return readonlyBlock('blockquote', 'invalid_range');
  const lines = rangeText.text.split(/\r?\n/);
  const prefixes = [];
  const textLines = [];

  for (const line of lines) {
    const match = line.match(/^(\s*>[ \t]?)(.*)$/);
    if (!match) return readonlyBlock('blockquote', 'invalid_blockquote');
    if (hasUnsupportedInlineMarkdown(match[2])) return readonlyBlock('blockquote', 'complex_inline');
    prefixes.push(match[1]);
    textLines.push(match[2]);
  }

  return createEditableBlock('blockquote', textLines.join('\n'), range, {
    quotePrefixes: prefixes,
  });
};

const getTableCellBlock = (source, range) => {
  if (range.startLine !== range.endLine) return readonlyBlock('tableCell', 'multiline_table_cell');
  const line = getLineAt(source, range.startLine);
  if (!line) return readonlyBlock('tableCell', 'invalid_range');
  if (!/^\s*\|.*\|\s*$/.test(line.text)) return readonlyBlock('tableCell', 'invalid_table');

  const pipeIndexes = [];
  for (let index = 0; index < line.text.length; index += 1) {
    if (line.text[index] === '|' && line.text[index - 1] !== '\\') pipeIndexes.push(index);
  }
  if (pipeIndexes.length < 2) return readonlyBlock('tableCell', 'invalid_table');

  const sourceColumnIndex = range.startColumn - 1;
  let segmentIndex = pipeIndexes.findIndex((pipeIndex, index) => {
    const nextPipeIndex = pipeIndexes[index + 1];
    return Number.isFinite(nextPipeIndex) && sourceColumnIndex >= pipeIndex && sourceColumnIndex < nextPipeIndex;
  });
  if (segmentIndex < 0 && sourceColumnIndex === pipeIndexes[pipeIndexes.length - 1]) {
    segmentIndex = pipeIndexes.length - 2;
  }
  if (segmentIndex < 0) return readonlyBlock('tableCell', 'invalid_table_cell');

  const cellStart = pipeIndexes[segmentIndex] + 1;
  const cellEnd = pipeIndexes[segmentIndex + 1];
  const rawCell = line.text.slice(cellStart, cellEnd);
  const leadingSpaces = rawCell.match(/^[ \t]*/)[0].length;
  const trailingSpaces = rawCell.match(/[ \t]*$/)[0].length;
  const textStart = cellStart + leadingSpaces;
  const textEnd = Math.max(textStart, cellEnd - trailingSpaces);
  const text = line.text.slice(textStart, textEnd);
  if (hasUnsupportedInlineMarkdown(text)) return readonlyBlock('tableCell', 'complex_inline');

  return createEditableBlock('tableCell', text, {
    startLine: range.startLine,
    startColumn: textStart + 1,
    endLine: range.endLine,
    endColumn: textEnd + 1,
  });
};

export const getEditableMarkdownBlock = (source, range, kind = 'paragraph') => {
  const validation = validateSourceRange(source, range);
  if (!validation.ok) return readonlyBlock(kind, validation.reason);

  switch (kind) {
    case 'heading':
      return getHeadingBlock(source, range);
    case 'listItem':
      return getListItemBlock(source, range);
    case 'blockquote':
      return getBlockquoteBlock(source, range);
    case 'tableCell':
      return getTableCellBlock(source, range);
    case 'paragraph':
    default:
      return getParagraphBlock(source, range);
  }
};

const containsLineBreak = (value) => /[\r\n]/.test(value);

const validateMarkdownBlockReplacement = (block, replacement) => {
  if (block.kind === 'tableCell' && (containsLineBreak(replacement) || replacement.includes('|'))) {
    return createFailure('invalid_replacement');
  }
  if (block.kind === 'heading' && containsLineBreak(replacement)) {
    return createFailure('invalid_replacement');
  }
  return { ok: true };
};

export const patchMarkdownBlockText = (source, block, nextText) => {
  if (!block?.editable) return createFailure(block?.reason ?? 'readonly_block');
  const replacementText = String(nextText ?? '');
  const replacementValidation = validateMarkdownBlockReplacement(block, replacementText);
  if (!replacementValidation.ok) return replacementValidation;

  if (block.kind === 'blockquote') {
    const prefixes = block.quotePrefixes?.length ? block.quotePrefixes : ['> '];
    const replacement = replacementText
      .split(/\r?\n/)
      .map((line, index) => `${prefixes[Math.min(index, prefixes.length - 1)]}${line}`)
      .join('\n');
    return patchSourceRange(source, block.textRange, replacement);
  }

  if (block.kind === 'paragraph' && Array.isArray(block.paragraphLinePrefixes) && containsLineBreak(replacementText)) {
    const prefixes = block.paragraphLinePrefixes;
    const replacement = replacementText
      .split(/\r?\n/)
      .map((line, index) => `${prefixes[Math.min(index, prefixes.length - 1)] ?? ''}${line}`)
      .join('\n');
    return patchSourceRange(source, block.textRange, replacement);
  }

  if (block.kind === 'listItem' && containsLineBreak(replacementText)) {
    const listPrefix = typeof block.listPrefix === 'string' ? block.listPrefix : '- ';
    const [firstLine = '', ...restLines] = replacementText.split(/\r?\n/);
    const replacement = [
      firstLine,
      ...restLines.map((line) => `${listPrefix}${line}`),
    ].join('\n');
    return patchSourceRange(source, block.textRange, replacement);
  }

  return patchSourceRange(source, block.textRange, replacementText);
};

export const patchMarkdownBlockPlainText = (source, block, nextPlainText) => {
  if (!block?.editable) return createFailure(block?.reason ?? 'readonly_block');
  const plainText = String(nextPlainText ?? '');
  const replacementValidation = validateMarkdownBlockReplacement(block, plainText);
  if (!replacementValidation.ok) return replacementValidation;
  return patchMarkdownBlockText(source, block, replaceMarkdownByPlainTextDiff(block.text, plainText));
};

const selectionHasInlineFormat = (markdown, start, end, formatKey) => {
  const units = readSimpleInlineMarkdownUnits(markdown).filter((unit) =>
    unit.markdownStart >= start && unit.markdownEnd <= end,
  );
  return units.length > 0 && units.every((unit) => Boolean(unit[formatKey]));
};

const toggleInlineMarkdownMarker = (source, range, selection, marker, formatKey) => {
  const validation = validateSourceRange(source, range);
  if (!validation.ok) return validation;
  const start = Number(selection?.start);
  const end = Number(selection?.end);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) {
    return createFailure('invalid_selection');
  }

  const blockText = source.slice(validation.startOffset, validation.endOffset);
  if (end > blockText.length) return createFailure('selection_out_of_bounds');
  const selectedText = blockText.slice(start, end);
  if (selectedText.includes('\n')) return createFailure('multiline_selection');

  const absoluteStart = validation.startOffset + start;
  const absoluteEnd = validation.startOffset + end;
  const markerLength = marker.length;
  const isFormatted = start === end
    ? false
    : selectionHasInlineFormat(blockText, start, end, formatKey);
  const canRemoveOuterMarkers = start === end || isFormatted;
  const hasOuterMarkers = canRemoveOuterMarkers &&
    source.slice(absoluteStart - markerLength, absoluteStart) === marker &&
    source.slice(absoluteEnd, absoluteEnd + markerLength) === marker;

  if (hasOuterMarkers) {
    return {
      ok: true,
      source: `${source.slice(0, absoluteStart - markerLength)}${selectedText}${source.slice(absoluteEnd + markerLength)}`,
      selection: {
        start: Math.max(0, start - markerLength),
        end: Math.max(0, end - markerLength),
      },
    };
  }

  if (
    isFormatted &&
    selectedText.startsWith(marker) &&
    selectedText.endsWith(marker) &&
    selectedText.length >= markerLength * 2
  ) {
    const innerText = selectedText.slice(markerLength, -markerLength);
    return {
      ok: true,
      source: `${source.slice(0, absoluteStart)}${innerText}${source.slice(absoluteEnd)}`,
      selection: {
        start,
        end: start + innerText.length,
      },
    };
  }

  return {
    ok: true,
    source: `${source.slice(0, absoluteStart)}${marker}${selectedText}${marker}${source.slice(absoluteEnd)}`,
    selection: {
      start: start + markerLength,
      end: end + markerLength,
    },
  };
};

export const toggleStrong = (source, range, selection) =>
  toggleInlineMarkdownMarker(source, range, selection, '**', 'strong');

export const toggleItalic = (source, range, selection) =>
  toggleInlineMarkdownMarker(source, range, selection, '*', 'italic');
