import {
  getCodeFenceLanguageKind,
  CODE_FENCE_LANGUAGE_KINDS,
} from './code-fence-language.js';

const SOURCE_RANGE_KEYS = ['startLine', 'startColumn', 'endLine', 'endColumn'];
const SAFE_INLINE_STYLE_KEYS = ['color', 'fontFamily', 'fontSize', 'lineHeight', 'letterSpacing'];
const SAFE_INLINE_FONT_FAMILY_SANS =
  '"MornDraft Sans SC", "Noto Sans SC", "Source Han Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';
const SAFE_INLINE_FONT_FAMILY_SERIF =
  '"MornDraft Serif SC", "Noto Serif SC", "Source Han Serif SC", "Songti SC", "SimSun", serif';
const SAFE_INLINE_FONT_FAMILIES = new Set([
  SAFE_INLINE_FONT_FAMILY_SANS,
  SAFE_INLINE_FONT_FAMILY_SERIF,
]);
const LEGACY_INLINE_FONT_FAMILY_SANS_PATTERN = new RegExp(
  ['ali', 'baba|pu', 'hui|source han sans|noto sans|pingfang sc|microsoft yahei'].join(''),
  'i',
);
const LEGACY_INLINE_FONT_FAMILY_SERIF_PATTERN =
  /source han serif|noto serif|songti|stsong|simsun/i;
const SAFE_INLINE_FONT_SIZES = new Set(['12px', '14px', '15px', '16px', '18px', '20px', '24px']);
const SAFE_INLINE_LINE_HEIGHTS = new Set(['1.35', '1.5', '2']);
const SAFE_INLINE_LETTER_SPACINGS = new Set(['0.02em', '0.05em', '0.08em']);
const createFailure = (reason) => ({ ok: false, reason });

const isPositiveInteger = (value) => Number.isInteger(value) && value >= 1;

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

const lineColumnToOffset = (lines, line, column) => {
  if (!isPositiveInteger(line) || !isPositiveInteger(column)) return null;
  const target = lines[line - 1];
  if (!target || column > target.text.length + 1) return null;
  return target.offset + column - 1;
};

const validateSourceRange = (source, range) => {
  if (!range || SOURCE_RANGE_KEYS.some((key) => !isPositiveInteger(range[key]))) {
    return createFailure('invalid_range');
  }
  const lines = getLinesWithOffsets(source);
  const startOffset = lineColumnToOffset(lines, range.startLine, range.startColumn);
  const endOffset = lineColumnToOffset(lines, range.endLine, range.endColumn);
  if (startOffset === null || endOffset === null) return createFailure('range_out_of_bounds');
  if (endOffset < startOffset) return createFailure('reversed_range');
  return { ok: true, endOffset, lines, startOffset };
};

const patchSourceRange = (source, range, replacement) => {
  const text = String(source ?? '');
  const validation = validateSourceRange(text, range);
  if (!validation.ok) return validation;
  return {
    ok: true,
    source: `${text.slice(0, validation.startOffset)}${replacement}${text.slice(validation.endOffset)}`,
  };
};

const splitUnescapedPipes = (line) => {
  const cells = [];
  let cell = '';
  let escaped = false;
  let startIndex = 0;
  let endIndex = line.length;

  if (line.trimStart().startsWith('|')) {
    startIndex = line.indexOf('|') + 1;
  }
  const trimmedEnd = line.trimEnd().length;
  if (trimmedEnd > 0 && line[trimmedEnd - 1] === '|') {
    let precedingBackslashes = 0;
    for (
      let index = trimmedEnd - 2;
      index >= startIndex && line[index] === '\\';
      index -= 1
    ) {
      precedingBackslashes += 1;
    }
    if (precedingBackslashes % 2 === 0) endIndex = trimmedEnd - 1;
  }

  for (let index = startIndex; index < endIndex; index += 1) {
    const char = line[index];
    if (char === '|' && !escaped) {
      cells.push(cell);
      cell = '';
      continue;
    }
    cell += char;
    escaped = char === '\\' && !escaped;
    if (char !== '\\') escaped = false;
  }
  cells.push(cell);
  return cells;
};

const unescapeHtmlText = (value) =>
  String(value ?? '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

const escapeHtmlText = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const escapeHtmlAttribute = (value) =>
  escapeHtmlText(value).replace(/"/g, '&quot;');

const unescapeMarkdownCharacters = (value, escapableCharacters) => {
  const source = String(value ?? '');
  let result = '';
  for (let index = 0; index < source.length; index += 1) {
    if (
      source[index] === '\\' &&
      index + 1 < source.length &&
      escapableCharacters.has(source[index + 1])
    ) {
      result += source[index + 1];
      index += 1;
      continue;
    }
    result += source[index];
  }
  return result;
};

const unescapeTableCell = (value) =>
  unescapeMarkdownCharacters(String(value ?? '').trim(), new Set(['\\', '|']))
    .replace(/<br\s*\/?>/gi, '\n');

const normalizeInlineStyleKey = (key) => {
  const text = String(key ?? '').trim().toLowerCase();
  if (text === 'color') return 'color';
  if (text === 'font-family' || text === 'fontfamily') return 'fontFamily';
  if (text === 'font-size' || text === 'fontsize') return 'fontSize';
  if (text === 'line-height' || text === 'lineheight') return 'lineHeight';
  if (text === 'letter-spacing' || text === 'letterspacing') return 'letterSpacing';
  return null;
};

const sanitizeInlineStyleValue = (key, value) => {
  const text = String(value ?? '').trim();
  if (!text) return '';
  switch (key) {
    case 'color':
      return /^#[0-9a-fA-F]{6}$/.test(text) ? text.toUpperCase() : '';
    case 'fontFamily':
      if (SAFE_INLINE_FONT_FAMILIES.has(text)) return text;
      if (LEGACY_INLINE_FONT_FAMILY_SERIF_PATTERN.test(text)) return SAFE_INLINE_FONT_FAMILY_SERIF;
      return LEGACY_INLINE_FONT_FAMILY_SANS_PATTERN.test(text) ? SAFE_INLINE_FONT_FAMILY_SANS : '';
    case 'fontSize':
      return SAFE_INLINE_FONT_SIZES.has(text) ? text : '';
    case 'lineHeight':
      return SAFE_INLINE_LINE_HEIGHTS.has(text) ? text : '';
    case 'letterSpacing':
      return SAFE_INLINE_LETTER_SPACINGS.has(text) ? text : '';
    default:
      return '';
  }
};

const hasInlineStyleValue = (style) =>
  Boolean(style?.color || style?.fontFamily || style?.fontSize || style?.lineHeight || style?.letterSpacing);

const sameInlineStyle = (left = {}, right = {}) =>
  (left.color || '') === (right.color || '') &&
  (left.fontFamily || '') === (right.fontFamily || '') &&
  (left.fontSize || '') === (right.fontSize || '') &&
  (left.lineHeight || '') === (right.lineHeight || '') &&
  (left.letterSpacing || '') === (right.letterSpacing || '');

const SAFE_INLINE_FORMAT_KEYS = [
  'code',
  'highlight',
  'strikethrough',
  'subscript',
  'superscript',
  'underline',
];

const sameInlineFormats = (left = {}, right = {}) =>
  SAFE_INLINE_FORMAT_KEYS.every((key) => Boolean(left[key]) === Boolean(right[key]));

const applySafeInlineFormats = (target, source = {}) => {
  SAFE_INLINE_FORMAT_KEYS.forEach((key) => {
    if (source[key]) target[key] = true;
  });
  return target;
};

export const sanitizeMarkdownInlineStyle = (style) => {
  if (!style || typeof style !== 'object') return {};
  return SAFE_INLINE_STYLE_KEYS.reduce((safeStyle, key) => {
    const value = sanitizeInlineStyleValue(key, style[key]);
    if (value) safeStyle[key] = value;
    return safeStyle;
  }, {});
};

const parseMarkdownInlineStyleAttribute = (styleAttribute) => {
  const declarations = unescapeHtmlText(styleAttribute)
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);
  const style = {};

  for (const declaration of declarations) {
    const separatorIndex = declaration.indexOf(':');
    if (separatorIndex <= 0) return null;
    const key = normalizeInlineStyleKey(declaration.slice(0, separatorIndex));
    if (!key) return null;
    const value = sanitizeInlineStyleValue(key, declaration.slice(separatorIndex + 1));
    if (!value) return null;
    style[key] = value;
  }

  return sanitizeMarkdownInlineStyle(style);
};

export const serializeMarkdownInlineStyle = (style) => {
  const safeStyle = sanitizeMarkdownInlineStyle(style);
  const declarations = [
    safeStyle.color ? `color: ${safeStyle.color}` : '',
    safeStyle.fontFamily ? `font-family: ${safeStyle.fontFamily}` : '',
    safeStyle.fontSize ? `font-size: ${safeStyle.fontSize}` : '',
    safeStyle.lineHeight ? `line-height: ${safeStyle.lineHeight}` : '',
    safeStyle.letterSpacing ? `letter-spacing: ${safeStyle.letterSpacing}` : '',
  ].filter(Boolean);
  return declarations.join('; ');
};

const mergeInlineSegments = (segments) =>
  segments.reduce((merged, segment) => {
    if (!segment?.text) return merged;
    const safeSegment = {
      italic: Boolean(segment.italic),
      strong: Boolean(segment.strong),
      style: sanitizeMarkdownInlineStyle(segment.style),
      text: String(segment.text),
    };
    applySafeInlineFormats(safeSegment, segment);
    const previous = merged[merged.length - 1];
    if (
      previous &&
      previous.italic === safeSegment.italic &&
      previous.strong === safeSegment.strong &&
      sameInlineFormats(previous, safeSegment) &&
      sameInlineStyle(previous.style, safeSegment.style)
    ) {
      previous.text += safeSegment.text;
      return merged;
    }
    merged.push(safeSegment);
    return merged;
  }, []);

const appendInlineTextSegment = (segments, text, strong, italic, style, formats = {}) => {
  if (!text) return;
  const segment = {
    italic: Boolean(italic),
    strong: Boolean(strong),
    style: sanitizeMarkdownInlineStyle(style),
    text: unescapeHtmlText(text),
  };
  applySafeInlineFormats(segment, formats);
  segments.push(segment);
};

const parseSpanOpeningTag = (source) => {
  const match = source.match(/^<span\b([^>]*)>/i);
  if (!match) return null;
  const rawAttributes = match[1] ?? '';
  const styleMatch = rawAttributes.match(/\bstyle\s*=\s*(["'])(.*?)\1/i);
  const remainingAttributes = rawAttributes
    .replace(/\bstyle\s*=\s*(["']).*?\1/i, '')
    .trim();
  if (remainingAttributes) return { ok: false, reason: 'unsupported_span_attribute' };
  const style = parseMarkdownInlineStyleAttribute(styleMatch?.[2] ?? '');
  if (style === null) return { ok: false, reason: 'unsafe_inline_style' };
  return {
    ok: true,
    length: match[0].length,
    style,
  };
};

export const parseMarkdownRichInline = (markdown) => {
  const source = String(markdown ?? '');
  if (source && !/[\\`*~=<&\r\n]/.test(source)) {
    return {
      ok: true,
      segments: [{
        italic: false,
        strong: false,
        style: {},
        text: source,
      }],
      source,
      text: source,
    };
  }
  const segments = [];
  const styleStack = [];
  const formatDepths = {
    code: 0,
    highlight: 0,
    strikethrough: 0,
    subscript: 0,
    superscript: 0,
    underline: 0,
  };
  let buffer = '';
  let index = 0;
  let strongDepth = 0;
  let italicDepth = 0;

  const currentStyle = () => Object.assign({}, ...styleStack);
  const currentFormats = () =>
    Object.fromEntries(
      Object.entries(formatDepths)
        .filter(([, depth]) => depth > 0)
        .map(([key]) => [key, true]),
    );
  const flush = () => {
    appendInlineTextSegment(
      segments,
      buffer,
      strongDepth > 0,
      italicDepth > 0,
      currentStyle(),
      currentFormats(),
    );
    buffer = '';
  };
  const toggleFormatDepth = (format) => {
    formatDepths[format] = formatDepths[format] > 0 ? formatDepths[format] - 1 : formatDepths[format] + 1;
  };
  const incrementFormatDepth = (format) => {
    formatDepths[format] += 1;
  };
  const decrementFormatDepth = (format) => {
    formatDepths[format] = Math.max(0, formatDepths[format] - 1);
  };

  while (index < source.length) {
    const rest = source.slice(index);

    if (formatDepths.code > 0) {
      if (source[index] === '`') {
        flush();
        decrementFormatDepth('code');
        index += 1;
        continue;
      }
      if (/^<\/code>/i.test(rest)) {
        flush();
        decrementFormatDepth('code');
        index += rest.match(/^<\/code>/i)[0].length;
        continue;
      }
      buffer += source[index];
      index += 1;
      continue;
    }

    if (rest.startsWith('\\') && index + 1 < source.length) {
      buffer += source[index + 1];
      index += 2;
      continue;
    }

    if (source[index] === '`') {
      const endIndex = source.indexOf('`', index + 1);
      if (endIndex > index + 1) {
        flush();
        appendInlineTextSegment(
          segments,
          source.slice(index + 1, endIndex),
          strongDepth > 0,
          italicDepth > 0,
          currentStyle(),
          { ...currentFormats(), code: true },
        );
        index = endIndex + 1;
        continue;
      }
    }

    if (rest.startsWith('**')) {
      flush();
      strongDepth = strongDepth > 0 ? strongDepth - 1 : strongDepth + 1;
      index += 2;
      continue;
    }

    if (rest.startsWith('~~')) {
      flush();
      toggleFormatDepth('strikethrough');
      index += 2;
      continue;
    }

    if (rest.startsWith('==')) {
      flush();
      toggleFormatDepth('highlight');
      index += 2;
      continue;
    }

    if (source[index] === '*') {
      flush();
      italicDepth = italicDepth > 0 ? italicDepth - 1 : italicDepth + 1;
      index += 1;
      continue;
    }

    if (/^<br\s*\/?>/i.test(rest)) {
      buffer += '\n';
      index += rest.match(/^<br\s*\/?>/i)[0].length;
      continue;
    }

    if (/^<(strong|b)>/i.test(rest)) {
      flush();
      strongDepth += 1;
      index += rest.match(/^<(strong|b)>/i)[0].length;
      continue;
    }

    if (/^<\/(strong|b)>/i.test(rest)) {
      flush();
      strongDepth = Math.max(0, strongDepth - 1);
      index += rest.match(/^<\/(strong|b)>/i)[0].length;
      continue;
    }

    if (/^<(em|i)>/i.test(rest)) {
      flush();
      italicDepth += 1;
      index += rest.match(/^<(em|i)>/i)[0].length;
      continue;
    }

    if (/^<\/(em|i)>/i.test(rest)) {
      flush();
      italicDepth = Math.max(0, italicDepth - 1);
      index += rest.match(/^<\/(em|i)>/i)[0].length;
      continue;
    }

    const openingFormatMatch = rest.match(/^<(u|s|del|code|mark|sub|sup)>/i);
    if (openingFormatMatch) {
      flush();
      incrementFormatDepth(inlineTagToFormat(openingFormatMatch[1].toLowerCase()));
      index += openingFormatMatch[0].length;
      continue;
    }

    const closingFormatMatch = rest.match(/^<\/(u|s|del|code|mark|sub|sup)>/i);
    if (closingFormatMatch) {
      flush();
      decrementFormatDepth(inlineTagToFormat(closingFormatMatch[1].toLowerCase()));
      index += closingFormatMatch[0].length;
      continue;
    }

    if (/^<span\b/i.test(rest)) {
      flush();
      const parsedSpan = parseSpanOpeningTag(rest);
      if (!parsedSpan?.ok) return createFailure(parsedSpan?.reason ?? 'invalid_span');
      styleStack.push(parsedSpan.style);
      index += parsedSpan.length;
      continue;
    }

    if (/^<\/span>/i.test(rest)) {
      flush();
      if (styleStack.length === 0) return createFailure('unmatched_span_close');
      styleStack.pop();
      index += rest.match(/^<\/span>/i)[0].length;
      continue;
    }

    if (/^<\/?[a-z][^>\n]*>/i.test(rest)) {
      return createFailure('unsupported_inline_html');
    }

    buffer += source[index];
    index += 1;
  }

  flush();
  if (styleStack.length > 0) return createFailure('unclosed_span');
  return {
    ok: true,
    segments: mergeInlineSegments(segments),
    source,
    text: mergeInlineSegments(segments).map((segment) => segment.text).join(''),
  };
};

const escapeMarkdownInlineText = (value) =>
  String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/==/g, '\\=\\=')
    .replace(/\*/g, '\\*')
    .replace(/~/g, '\\~')
    .replace(/`/g, '\\`');

const escapeInlineCodeText = (value) =>
  String(value ?? '').replace(/`/g, '&#96;');

const wrapHtmlInlineFormat = (content, tag) => `<${tag}>${content}</${tag}>`;

const inlineTagToFormat = (tag) => {
  switch (tag) {
    case 'del':
    case 's':
      return 'strikethrough';
    case 'mark':
      return 'highlight';
    case 'sub':
      return 'subscript';
    case 'sup':
      return 'superscript';
    case 'u':
      return 'underline';
    default:
      return tag;
  }
};

export const serializeMarkdownRichInline = (segments) => {
  const normalizedSegments = mergeInlineSegments(Array.isArray(segments) ? segments : []);
  return normalizedSegments.map((segment) => {
    const styleText = serializeMarkdownInlineStyle(segment.style);
    const usesHtmlFormat = Boolean(
      hasInlineStyleValue(segment.style) ||
      segment.underline ||
      segment.highlight ||
      segment.subscript ||
      segment.superscript ||
      (segment.code && (
        segment.strong ||
        segment.italic ||
        segment.strikethrough ||
        String(segment.text ?? '').includes('`')
      )),
    );
    let content = usesHtmlFormat
      ? escapeHtmlText(segment.text)
      : escapeMarkdownInlineText(segment.text);

    if (hasInlineStyleValue(segment.style)) {
      content = `<span style="${escapeHtmlAttribute(styleText)}">${escapeHtmlText(segment.text)}</span>`;
    }

    if (usesHtmlFormat) {
      if (segment.code) content = wrapHtmlInlineFormat(content, 'code');
      if (segment.highlight) content = wrapHtmlInlineFormat(content, 'mark');
      if (segment.underline) content = wrapHtmlInlineFormat(content, 'u');
      if (segment.strikethrough) content = wrapHtmlInlineFormat(content, 's');
      if (segment.subscript) content = wrapHtmlInlineFormat(content, 'sub');
      if (segment.superscript) content = wrapHtmlInlineFormat(content, 'sup');
      if (segment.italic) content = wrapHtmlInlineFormat(content, 'em');
      if (segment.strong) content = wrapHtmlInlineFormat(content, 'strong');
      return content;
    }

    if (segment.code) {
      content = `\`${escapeInlineCodeText(segment.text)}\``;
    }
    if (segment.strikethrough) {
      content = `~~${content}~~`;
    }
    if (segment.italic) {
      content = `*${content}*`;
    }
    if (segment.strong) {
      content = `**${content}**`;
    }
    return content;
  }).join('');
};

export const getMarkdownRichInlinePlainText = (markdown) => {
  const parsed = parseMarkdownRichInline(markdown);
  return parsed.ok ? parsed.text : String(markdown ?? '');
};

const splitRichInlineSegmentsByRange = (segments, start, end, stylePatch) => {
  const nextSegments = [];
  let offset = 0;
  const safePatch = sanitizeMarkdownInlineStyle(stylePatch);

  for (const segment of mergeInlineSegments(segments)) {
    const text = segment.text;
    const segmentStart = offset;
    const segmentEnd = offset + text.length;
    offset = segmentEnd;

    if (segmentEnd <= start || segmentStart >= end) {
      nextSegments.push(segment);
      continue;
    }

    const localStart = Math.max(0, start - segmentStart);
    const localEnd = Math.min(text.length, end - segmentStart);
    if (localStart > 0) {
      nextSegments.push({ ...segment, text: text.slice(0, localStart) });
    }
    if (localEnd > localStart) {
      nextSegments.push({
        ...segment,
        style: sanitizeMarkdownInlineStyle({
          ...segment.style,
          ...safePatch,
        }),
        text: text.slice(localStart, localEnd),
      });
    }
    if (localEnd < text.length) {
      nextSegments.push({ ...segment, text: text.slice(localEnd) });
    }
  }

  return mergeInlineSegments(nextSegments);
};

export const patchMarkdownRichInlineRange = (source, range, selection, stylePatch) => {
  const text = String(source ?? '');
  const validation = validateSourceRange(text, range);
  if (!validation.ok) return validation;
  const blockText = text.slice(validation.startOffset, validation.endOffset);
  const parsed = parseMarkdownRichInline(blockText);
  if (!parsed.ok) return parsed;
  const plainLength = parsed.text.length;
  const start = Math.max(0, Math.min(Number(selection?.start) || 0, plainLength));
  const end = Math.max(start, Math.min(Number(selection?.end) || 0, plainLength));
  const nextSegments = splitRichInlineSegmentsByRange(
    parsed.segments,
    start === end ? 0 : start,
    start === end ? plainLength : end,
    stylePatch,
  );
  return patchSourceRange(text, range, serializeMarkdownRichInline(nextSegments));
};

const serializeTableCellValue = (value) =>
  Array.isArray(value) ? serializeMarkdownRichInline(value) : String(value ?? '');

const escapeTableCell = (value) =>
  serializeTableCellValue(value)
    .replace(/\r\n|\r|\n/g, '<br>')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .trim();

const isDelimiterCell = (value) => /^:?-{3,}:?$/.test(String(value ?? '').trim());

const parseDelimiterAlignment = (value) => {
  const text = String(value ?? '').trim();
  if (text.startsWith(':') && text.endsWith(':')) return 'center';
  if (text.endsWith(':')) return 'right';
  if (text.startsWith(':')) return 'left';
  return 'none';
};

const serializeDelimiter = (alignment) => {
  switch (alignment) {
    case 'center':
      return ':---:';
    case 'right':
      return '---:';
    case 'left':
      return ':---';
    case 'none':
    default:
      return '---';
  }
};

export const parseMarkdownPipeTable = (source, range) => {
  const text = String(source ?? '');
  const validation = validateSourceRange(text, range);
  if (!validation.ok) return validation;
  const tableSource = text.slice(validation.startOffset, validation.endOffset);
  const rawLines = tableSource.split(/\r\n|\r|\n/);
  const lines = rawLines.filter((line, index) => index < rawLines.length - 1 || line.length > 0);
  if (lines.length < 2) return createFailure('table_too_short');

  const headerCells = splitUnescapedPipes(lines[0]);
  const delimiterCells = splitUnescapedPipes(lines[1]);
  if (
    headerCells.length === 0 ||
    delimiterCells.length === 0 ||
    !delimiterCells.every(isDelimiterCell)
  ) {
    return createFailure('invalid_table_delimiter');
  }

  const columnCount = Math.max(headerCells.length, delimiterCells.length);
  if (columnCount === 0) return createFailure('empty_table');
  const alignments = Array.from({ length: columnCount }, (_, index) =>
    parseDelimiterAlignment(delimiterCells[index] ?? '---'),
  );

  const rows = [headerCells, ...lines.slice(2).map(splitUnescapedPipes)].map((cells, rowIndex) => ({
    cells: Array.from({ length: columnCount }, (_, index) => unescapeTableCell(cells[index] ?? '')),
    header: rowIndex === 0,
  }));

  return {
    ok: true,
    alignments,
    columnCount,
    range,
    rows,
    source: tableSource,
  };
};

export const parseMarkdownRichPipeTable = (source, range) => {
  const parsedTable = parseMarkdownPipeTable(source, range);
  if (!parsedTable.ok) return parsedTable;
  const rows = [];
  for (const row of parsedTable.rows) {
    const cells = [];
    for (const cell of row.cells) {
      const parsedCell = parseMarkdownRichInline(cell);
      if (!parsedCell.ok) return parsedCell;
      cells.push(parsedCell.segments);
    }
    rows.push({
      ...row,
      cells,
    });
  }
  return {
    ...parsedTable,
    rows,
  };
};

export const serializeMarkdownPipeTable = (table) => {
  const rows = Array.isArray(table?.rows) ? table.rows : [];
  const columnCount = Math.max(
    Number.isInteger(table?.columnCount) ? table.columnCount : 0,
    ...rows.map((row) => (Array.isArray(row?.cells) ? row.cells.length : 0)),
  );
  if (columnCount <= 0 || rows.length === 0) return '';
  const header = rows[0] ?? { cells: [] };
  const bodyRows = rows.slice(1);
  const alignments = Array.from(
    { length: columnCount },
    (_, index) => table?.alignments?.[index] ?? 'none',
  );
  const serializeRow = (row) =>
    `| ${Array.from({ length: columnCount }, (_, index) => escapeTableCell(row?.cells?.[index] ?? '')).join(' | ')} |`;

  return [
    serializeRow(header),
    `| ${alignments.map(serializeDelimiter).join(' | ')} |`,
    ...bodyRows.map(serializeRow),
  ].join('\n');
};

export const patchMarkdownPipeTable = (source, range, table) => {
  const replacement = serializeMarkdownPipeTable(table);
  if (!replacement) return createFailure('empty_table');
  return patchSourceRange(source, range, replacement);
};

const isImageWhitespaceCode = (code) => (
  (code >= 0x0009 && code <= 0x000d) ||
  code === 0x0020 ||
  code === 0x00a0 ||
  code === 0x1680 ||
  (code >= 0x2000 && code <= 0x200a) ||
  code === 0x2028 ||
  code === 0x2029 ||
  code === 0x202f ||
  code === 0x205f ||
  code === 0x3000 ||
  code === 0xfeff
);

const hasImageLineTerminator = (value) => {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0x000a || code === 0x000d || code === 0x2028 || code === 0x2029) {
      return true;
    }
  }
  return false;
};

const parseMarkdownImageSource = (value) => {
  const source = String(value ?? '');
  if (
    !source.startsWith('![')
    || !source.endsWith(')')
    || hasImageLineTerminator(source)
  ) return null;

  let cursor = 2;
  let rawAlt = '';
  let altClosed = false;
  while (cursor < source.length) {
    const char = source[cursor];
    if (char === '\\' && cursor + 1 < source.length) {
      rawAlt += char + source[cursor + 1];
      cursor += 2;
      continue;
    }
    if (char === ']') {
      altClosed = true;
      cursor += 1;
      break;
    }
    rawAlt += char;
    cursor += 1;
  }
  if (!altClosed || source[cursor] !== '(') return null;
  cursor += 1;

  const contentEnd = source.length - 1;
  const urlStart = cursor;
  while (
    cursor < contentEnd &&
    !isImageWhitespaceCode(source.charCodeAt(cursor))
  ) {
    cursor += 1;
  }
  if (cursor === urlStart) return null;
  const url = source.slice(urlStart, cursor);

  let title = '';
  if (cursor < contentEnd) {
    while (
      cursor < contentEnd &&
      isImageWhitespaceCode(source.charCodeAt(cursor))
    ) {
      cursor += 1;
    }
    const quote = source[cursor];
    if ((quote !== '"' && quote !== "'") || cursor + 1 >= contentEnd) return null;
    cursor += 1;
    let rawTitle = '';
    let titleClosed = false;
    while (cursor < contentEnd) {
      const char = source[cursor];
      if (char === '\\' && cursor + 1 < contentEnd) {
        rawTitle += char + source[cursor + 1];
        cursor += 2;
        continue;
      }
      if (char === quote) {
        titleClosed = true;
        cursor += 1;
        break;
      }
      rawTitle += char;
      cursor += 1;
    }
    if (!titleClosed || cursor !== contentEnd) return null;
    title = unescapeMarkdownCharacters(rawTitle, new Set(['\\', quote]));
  }

  return {
    alt: unescapeMarkdownCharacters(rawAlt, new Set(['\\', ']'])),
    title,
    url,
  };
};

export const parseMarkdownImage = (source, range) => {
  const text = String(source ?? '');
  const validation = validateSourceRange(text, range);
  if (!validation.ok) return validation;
  const imageSource = text.slice(validation.startOffset, validation.endOffset).trim();
  const parsed = parseMarkdownImageSource(imageSource);
  if (!parsed) return createFailure('invalid_image');
  return {
    ok: true,
    alt: parsed.alt,
    range,
    source: imageSource,
    title: parsed.title,
    url: parsed.url,
  };
};

export const serializeMarkdownImage = ({ alt = '', title = '', url = '' }) => {
  const safeAlt = String(alt)
    .replace(/\\/g, '\\\\')
    .replace(/]/g, '\\]')
    .replace(/\r\n|\r|\n/g, ' ');
  const safeUrl = String(url).trim();
  if (!safeUrl || /[\s)]/.test(safeUrl)) return '';
  const safeTitle = String(title)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r\n|\r|\n/g, ' ')
    .trim();
  return `![${safeAlt}](${safeUrl}${safeTitle ? ` "${safeTitle}"` : ''})`;
};

export const patchMarkdownImage = (source, range, image) => {
  const replacement = serializeMarkdownImage(image);
  if (!replacement) return createFailure('invalid_image');
  return patchSourceRange(source, range, replacement);
};

const isMarkdownWhitespace = (char) => {
  if (!char) return false;
  const code = char.charCodeAt(0);
  return (
    (code >= 0x0009 && code <= 0x000d) ||
    code === 0x0020 ||
    code === 0x00a0 ||
    code === 0x1680 ||
    (code >= 0x2000 && code <= 0x200a) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x202f ||
    code === 0x205f ||
    code === 0x3000 ||
    code === 0xfeff
  );
};

const isSpaceOrTab = (char) => char === ' ' || char === '\t';
const isLineTerminator = (char) =>
  char === '\n' || char === '\r' || char === '\u2028' || char === '\u2029';

const readCodeFenceMarker = (line) => {
  const text = String(line ?? '');
  let cursor = 0;
  while (cursor < 3 && text[cursor] === ' ') cursor += 1;

  const markerChar = text[cursor];
  if (markerChar !== '`' && markerChar !== '~') return null;
  const markerStart = cursor;
  while (text[cursor] === markerChar) cursor += 1;
  if (cursor - markerStart < 3) return null;

  return {
    cursor,
    marker: text.slice(markerStart, cursor),
    text,
  };
};

const parseCodeFenceOpenLine = (line) => {
  const parsedMarker = readCodeFenceMarker(line);
  if (!parsedMarker) return null;
  const { marker, text } = parsedMarker;
  let { cursor } = parsedMarker;

  while (cursor < text.length && isMarkdownWhitespace(text[cursor])) cursor += 1;
  const languageStart = cursor;
  while (
    cursor < text.length &&
    !isMarkdownWhitespace(text[cursor]) &&
    text[cursor] !== '`' &&
    text[cursor] !== '~'
  ) {
    cursor += 1;
  }
  const languageEnd = cursor;
  while (cursor < text.length) {
    if (isLineTerminator(text[cursor])) return null;
    cursor += 1;
  }

  return {
    language: text.slice(languageStart, languageEnd),
    marker,
  };
};

const isCodeFenceCloseLine = (line, openingFence) => {
  const close = readCodeFenceMarker(line);
  const openingMarker = String(openingFence ?? '');
  if (
    !close ||
    !openingMarker ||
    close.marker[0] !== openingMarker[0] ||
    close.marker.length < openingMarker.length
  ) {
    return false;
  }
  while (close.cursor < close.text.length && isMarkdownWhitespace(close.text[close.cursor])) {
    close.cursor += 1;
  }
  return close.cursor === close.text.length;
};

const getSourceRangeForLineSpan = (lines, startIndex, endIndex) => {
  const startLine = lines[startIndex];
  const endLine = lines[endIndex];
  if (!startLine || !endLine) return null;
  return {
    startLine: startIndex + 1,
    startColumn: 1,
    endLine: endIndex + 1,
    endColumn: endLine.text.length + 1,
  };
};

const sliceLineSpanSource = (source, lines, startIndex, endIndex) => {
  const start = lines[startIndex]?.offset ?? 0;
  const endLine = lines[endIndex];
  const end = endLine ? endLine.offset + endLine.text.length : start;
  return source.slice(start, end);
};

const isMarkdownImageOnlyLine = (line) => Boolean(
  parseMarkdownImageSource(String(line ?? '').trim()),
);

const isPipeTableDelimiterLine = (line) => {
  const cells = splitUnescapedPipes(String(line ?? ''));
  return cells.length > 0 && cells.every(isDelimiterCell);
};

const isPipeTableStart = (lines, index) => {
  const line = lines[index]?.text ?? '';
  const nextLine = lines[index + 1]?.text ?? '';
  return /^\s*\|.*\|\s*$/.test(line) && /^\s*\|.*\|\s*$/.test(nextLine) && isPipeTableDelimiterLine(nextLine);
};

const parseListLine = (line) => {
  const text = String(line ?? '');
  let cursor = 0;
  while (cursor < 8 && isMarkdownWhitespace(text[cursor])) cursor += 1;
  const indent = cursor;

  let marker = '';
  let ordered = false;
  if (text[cursor] === '-' || text[cursor] === '+' || text[cursor] === '*') {
    marker = text[cursor];
    cursor += 1;
  } else {
    const markerStart = cursor;
    while (text[cursor] >= '0' && text[cursor] <= '9') cursor += 1;
    if (cursor === markerStart || (text[cursor] !== '.' && text[cursor] !== ')')) return null;
    cursor += 1;
    marker = text.slice(markerStart, cursor);
    ordered = true;
  }

  if (!isSpaceOrTab(text[cursor])) return null;
  while (isSpaceOrTab(text[cursor])) cursor += 1;
  for (let index = cursor; index < text.length; index += 1) {
    if (isLineTerminator(text[index])) return null;
  }
  return {
    indent,
    marker,
    ordered,
    text: text.slice(cursor),
  };
};

const isListLine = (line) => Boolean(parseListLine(line));

const isBlockquoteLine = (line) => /^\s*>[ \t]?/.test(String(line ?? ''));

const parseHeadingLine = (line) => {
  const text = String(line ?? '');
  let cursor = 0;
  while (cursor < 3 && isMarkdownWhitespace(text[cursor])) cursor += 1;

  const markerStart = cursor;
  while (cursor - markerStart < 6 && text[cursor] === '#') cursor += 1;
  const depth = cursor - markerStart;
  if (depth === 0 || text[cursor] === '#' || !isSpaceOrTab(text[cursor])) return null;

  while (isSpaceOrTab(text[cursor])) cursor += 1;
  const contentStart = cursor;
  for (let index = contentStart; index < text.length; index += 1) {
    if (isLineTerminator(text[index])) return null;
  }
  let trailingCursor = text.length;
  while (trailingCursor > contentStart && isSpaceOrTab(text[trailingCursor - 1])) {
    trailingCursor -= 1;
  }
  const closingMarkerEnd = trailingCursor;
  while (trailingCursor > contentStart && text[trailingCursor - 1] === '#') {
    trailingCursor -= 1;
  }

  let contentEnd = text.length;
  if (trailingCursor < closingMarkerEnd) {
    const closingMarkerStart = trailingCursor;
    while (trailingCursor > contentStart && isSpaceOrTab(text[trailingCursor - 1])) {
      trailingCursor -= 1;
    }
    if (trailingCursor < closingMarkerStart) contentEnd = trailingCursor;
  }

  return {
    depth,
    text: text.slice(contentStart, contentEnd),
  };
};

const hasHeadingPrefix = (line) => {
  const text = String(line ?? '');
  let cursor = 0;
  while (cursor < 3 && isMarkdownWhitespace(text[cursor])) cursor += 1;
  const markerStart = cursor;
  while (cursor - markerStart < 6 && text[cursor] === '#') cursor += 1;
  return cursor > markerStart && text[cursor] !== '#' && isSpaceOrTab(text[cursor]);
};

const isHeadingLine = (line) => hasHeadingPrefix(line);

const isMarkdownIslandBlockStart = (lines, index) =>
  isPipeTableStart(lines, index) ||
  isHeadingLine(lines[index]?.text) ||
  isListLine(lines[index]?.text) ||
  isBlockquoteLine(lines[index]?.text);

const makeSegment = (source, lines, startIndex, endIndex, kind, artifactKind = '') => {
  const sourceRange = getSourceRangeForLineSpan(lines, startIndex, endIndex);
  return {
    artifactKind,
    kind,
    source: sliceLineSpanSource(source, lines, startIndex, endIndex),
    sourceRange,
  };
};

const makeMarkdownIslandSegment = (source, lines, startIndex, endIndex) => {
  let islandStartIndex = startIndex;
  let islandEndIndex = endIndex;
  while (islandStartIndex <= islandEndIndex && !lines[islandStartIndex]?.text.trim()) {
    islandStartIndex += 1;
  }
  while (islandEndIndex >= islandStartIndex && !lines[islandEndIndex]?.text.trim()) {
    islandEndIndex -= 1;
  }
  if (islandStartIndex > islandEndIndex) return null;
  return makeSegment(source, lines, islandStartIndex, islandEndIndex, 'markdown-island');
};

export const splitPreviewMarkdownSegments = (source) => {
  const fullSource = String(source ?? '');
  const lines = getLinesWithOffsets(fullSource);
  const segments = [];
  let islandStart = null;

  const flushIsland = (endIndex) => {
    if (islandStart === null || endIndex < islandStart) return;
    const segment = makeMarkdownIslandSegment(fullSource, lines, islandStart, endIndex);
    if (segment?.source.length > 0) segments.push(segment);
    islandStart = null;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].text;
    const fence = parseCodeFenceOpenLine(line);
    if (fence) {
      flushIsland(index - 1);
      const openingFence = fence.marker;
      let endIndex = index;
      for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
        endIndex = cursor;
        if (isCodeFenceCloseLine(lines[cursor].text, openingFence)) break;
      }
      const fenceLanguage = (fence.language || 'code').trim().toLowerCase() || 'code';
      const languageKind = getCodeFenceLanguageKind(fenceLanguage);
      const EDITABLE_KINDS = new Set([
        CODE_FENCE_LANGUAGE_KINDS.CODE,
        CODE_FENCE_LANGUAGE_KINDS.JSON,
        CODE_FENCE_LANGUAGE_KINDS.JSON5,
        CODE_FENCE_LANGUAGE_KINDS.MARKDOWN,
      ]);
      const fenceSegmentKind = EDITABLE_KINDS.has(languageKind)
        ? 'editable-code'
        : 'readonly-artifact';
      segments.push(makeSegment(
        fullSource,
        lines,
        index,
        endIndex,
        fenceSegmentKind,
        fenceLanguage,
      ));
      index = endIndex;
      continue;
    }

    if (isMarkdownImageOnlyLine(line)) {
      flushIsland(index - 1);
      segments.push(makeSegment(
        fullSource,
        lines,
        index,
        index,
        'readonly-artifact',
        'image',
      ));
      continue;
    }

    if (islandStart === null) islandStart = index;
  }

  flushIsland(lines.length - 1);
  return segments.filter((segment) => segment.sourceRange);
};

const parseRichInlineLine = (line) => {
  const parsed = parseMarkdownRichInline(line);
  return parsed.ok ? parsed.segments : parsed;
};

const parseRichInlineLines = (lines) => {
  const parsedLines = [];
  for (const line of lines) {
    const parsed = parseRichInlineLine(line);
    if (!Array.isArray(parsed)) return parsed;
    parsedLines.push(parsed);
  }
  return { ok: true, lines: parsedLines };
};

const readParagraphLines = (lines, lineRecords, startIndex) => {
  let endIndex = startIndex;
  while (endIndex < lines.length) {
    const line = lines[endIndex];
    if (!line.trim()) break;
    if (
      endIndex !== startIndex
      && isMarkdownIslandBlockStart(lineRecords, endIndex)
    ) break;
    endIndex += 1;
  }
  return {
    endIndex: Math.max(startIndex, endIndex - 1),
    lines: lines.slice(startIndex, endIndex),
  };
};

const normalizeMarkdownListItem = (item) => {
  if (Array.isArray(item)) return { children: [], segments: item };
  return {
    children: Array.isArray(item?.children) ? item.children : [],
    segments: Array.isArray(item?.segments) ? item.segments : [],
  };
};

const parseListBlock = (lines, startIndex, baseIndent = null) => {
  const firstLine = parseListLine(lines[startIndex]);
  if (!firstLine) return createFailure('invalid_list');
  const indent = baseIndent ?? firstLine.indent;
  const ordered = firstLine.ordered;
  const items = [];
  let index = startIndex;

  while (index < lines.length) {
    const currentLine = parseListLine(lines[index]);
    if (!currentLine) break;
    if (currentLine.indent < indent) break;

    if (currentLine.indent > indent) {
      if (items.length === 0) break;
      const nested = parseListBlock(lines, index, currentLine.indent);
      if (!nested.ok) return nested;
      const previousItem = items[items.length - 1];
      previousItem.children.push(nested.block);
      index = nested.nextIndex;
      continue;
    }

    if (currentLine.ordered !== ordered) break;
    const parsed = parseRichInlineLine(currentLine.text);
    if (!Array.isArray(parsed)) return parsed;
    items.push({
      children: [],
      segments: parsed,
    });
    index += 1;
  }

  return {
    ok: true,
    block: {
      type: 'list',
      indent,
      ordered,
      items,
    },
    nextIndex: index,
  };
};

export const parseMarkdownIsland = (source) => {
  const rawLines = String(source ?? '').split(/\r\n|\r|\n/);
  const lines = rawLines.filter((line, index) => index < rawLines.length - 1 || line.length > 0);
  const lineRecords = lines.map(text => ({ text }));
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (isPipeTableStart(lineRecords, index)) {
      let endIndex = index + 2;
      while (endIndex < lines.length && /^\s*\|.*\|\s*$/.test(lines[endIndex])) {
        endIndex += 1;
      }
      const tableLines = lines.slice(index, endIndex);
      const tableSource = tableLines.join('\n');
      const table = parseMarkdownRichPipeTable(tableSource, {
        startLine: 1,
        startColumn: 1,
        endLine: tableLines.length,
        endColumn: tableLines[tableLines.length - 1].length + 1,
      });
      if (!table.ok) return table;
      blocks.push({
        type: 'table',
        alignments: table.alignments,
        columnCount: table.columnCount,
        rows: table.rows,
      });
      index = endIndex;
      continue;
    }

    const heading = parseHeadingLine(line);
    if (heading) {
      const parsed = parseRichInlineLine(heading.text);
      if (!Array.isArray(parsed)) return parsed;
      blocks.push({
        type: 'heading',
        depth: heading.depth,
        segments: parsed,
        sourceRange: {
          startLine: index + 1,
          startColumn: 1,
          endLine: index + 1,
          endColumn: line.length + 1,
        },
      });
      index += 1;
      continue;
    }

    if (isBlockquoteLine(line)) {
      const quoteLines = [];
      while (index < lines.length && isBlockquoteLine(lines[index])) {
        quoteLines.push(lines[index].replace(/^\s*>[ \t]?/, ''));
        index += 1;
      }
      const parsed = parseRichInlineLines(quoteLines);
      if (!parsed.ok) return parsed;
      blocks.push({
        type: 'quote',
        lines: parsed.lines,
      });
      continue;
    }

    if (isListLine(line)) {
      const parsedList = parseListBlock(lines, index);
      if (!parsedList.ok) return parsedList;
      blocks.push(parsedList.block);
      index = parsedList.nextIndex;
      continue;
    }

    const paragraph = readParagraphLines(lines, lineRecords, index);
    const parsed = parseRichInlineLines(paragraph.lines);
    if (!parsed.ok) return parsed;
    blocks.push({
      type: 'paragraph',
      lines: parsed.lines,
    });
    index = paragraph.endIndex + 1;
  }

  return { ok: true, blocks };
};

const serializeRichInlineLine = (segments) => serializeMarkdownRichInline(segments ?? []);

const serializeMarkdownListBlock = (block, depth = 0) => {
  const fallbackIndent = depth * 2;
  const indentSize = Number.isInteger(block?.indent) ? block.indent : fallbackIndent;
  const indent = ' '.repeat(Math.max(0, indentSize));
  return (block?.items ?? []).map((rawItem, index) => {
    const item = normalizeMarkdownListItem(rawItem);
    const marker = block.ordered ? `${index + 1}.` : '-';
    const itemLine = `${indent}${marker} ${serializeRichInlineLine(item.segments)}`;
    const childLines = item.children
      .filter((child) => child?.type === 'list')
      .map((child) => serializeMarkdownListBlock(child, depth + 1))
      .filter(Boolean)
      .join('\n');
    return childLines ? `${itemLine}\n${childLines}` : itemLine;
  }).join('\n');
};

export const serializeMarkdownIsland = (blocks) => {
  const chunks = [];
  for (const block of Array.isArray(blocks) ? blocks : []) {
    if (!block) continue;
    switch (block.type) {
      case 'heading':
        chunks.push(`${'#'.repeat(Math.max(1, Math.min(6, block.depth || 1)))} ${serializeRichInlineLine(block.segments)}`);
        break;
      case 'quote':
        chunks.push((block.lines ?? [[]]).map((line) => `> ${serializeRichInlineLine(line)}`).join('\n'));
        break;
      case 'list':
        chunks.push(serializeMarkdownListBlock(block));
        break;
      case 'table':
        chunks.push(serializeMarkdownPipeTable(block));
        break;
      case 'paragraph':
      default:
        chunks.push((block.lines ?? [[]]).map(serializeRichInlineLine).join('\n'));
        break;
    }
  }
  return chunks.filter((chunk) => chunk.trim().length > 0).join('\n\n');
};

const offsetMarkdownBlockSourceRange = (range, lineOffset) => {
  if (!range) return null;
  return {
    ...range,
    startLine: range.startLine + lineOffset,
    endLine: range.endLine + lineOffset,
  };
};

const offsetMarkdownIslandBlockSourceRanges = (blocks, segmentSourceRange) => {
  if (!segmentSourceRange) return blocks;
  const lineOffset = segmentSourceRange.startLine - 1;
  return blocks.map((block) => {
    const sourceRange = offsetMarkdownBlockSourceRange(block?.sourceRange, lineOffset);
    return sourceRange ? { ...block, sourceRange } : block;
  });
};

const offsetDocumentSourceRange = (range, segmentSourceRange) => {
  if (!range || !segmentSourceRange) return range ?? null;
  return offsetMarkdownBlockSourceRange(range, segmentSourceRange.startLine - 1);
};

const getRawMarkdownFallbackLanguage = (source) => {
  const firstNonEmptyLine = String(source ?? '')
    .split(/\r\n|\r|\n/)
    .find((line) => line.trim());
  return /^<\/?[a-z][\w:-]*(?:\s|>|\/>)/i.test(firstNonEmptyLine?.trimStart() ?? '')
    ? 'html'
    : 'markdown';
};

const createMarkdownIslandDocumentBlock = (parsedBlocks, source, sourceRange) => ({
  blocks: offsetMarkdownIslandBlockSourceRanges(parsedBlocks, sourceRange),
  source,
  sourceRange,
  type: 'markdown-island',
});

const parseMarkdownIslandWithInlineHtmlFallback = (segment) => {
  const parsed = parseMarkdownIsland(segment.source);
  if (parsed.ok) {
    return {
      ok: true,
      blocks: [
        createMarkdownIslandDocumentBlock(parsed.blocks, segment.source, segment.sourceRange),
      ],
    };
  }
  if (parsed.reason !== 'unsupported_inline_html') return parsed;

  const lines = getLinesWithOffsets(segment.source);
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    while (index < lines.length && !lines[index]?.text.trim()) index += 1;
    if (index >= lines.length) break;

    const startIndex = index;
    while (index < lines.length && lines[index]?.text.trim()) index += 1;
    const endIndex = index - 1;
    const source = sliceLineSpanSource(segment.source, lines, startIndex, endIndex);
    const sourceRange = offsetDocumentSourceRange(
      getSourceRangeForLineSpan(lines, startIndex, endIndex),
      segment.sourceRange,
    );
    const chunk = parseMarkdownIsland(source);

    if (chunk.ok) {
      blocks.push(createMarkdownIslandDocumentBlock(chunk.blocks, source, sourceRange));
      continue;
    }
    if (chunk.reason !== 'unsupported_inline_html') return chunk;

    blocks.push({
      language: getRawMarkdownFallbackLanguage(source),
      source,
      sourceFormat: 'raw',
      sourceRange,
      type: 'code-block',
    });
  }

  return { ok: true, blocks };
};

export const parsePreviewMarkdownDocument = (source) => {
  const blocks = [];
  for (const segment of splitPreviewMarkdownSegments(source)) {
    if (segment.kind === 'markdown-island') {
      const parsed = parseMarkdownIslandWithInlineHtmlFallback(segment);
      if (!parsed.ok) return parsed;
      blocks.push(...parsed.blocks);
      continue;
    }

    if (segment.kind === 'editable-code') {
      const fenceLanguage = segment.artifactKind || 'code';
      blocks.push({
        language: fenceLanguage,
        source: segment.source,
        sourceRange: segment.sourceRange || null,
        type: 'code-block',
      });
      continue;
    }

    blocks.push({
      artifactKind: segment.artifactKind || 'code',
      source: segment.source,
      sourceRange: segment.sourceRange,
      type: 'artifact',
    });
  }
  return { ok: true, blocks };
};

export const serializePreviewMarkdownDocument = (blocks) =>
  (Array.isArray(blocks) ? blocks : [])
    .map((block) => {
      if (!block) return '';
      if (block.type === 'artifact') return String(block.source ?? '');
      if (block.type === 'code-block') return String(block.source ?? '');
      if (block.type === 'markdown-island') return serializeMarkdownIsland(block.blocks);
      return '';
    })
    .filter((chunk) => chunk.length > 0)
    .join('\n\n');

export const patchMarkdownIslandSource = (source, segment, replacement) => {
  if (!segment?.sourceRange) return createFailure('invalid_segment');
  return patchSourceRange(source, segment.sourceRange, replacement);
};
