import JSON5 from 'json5';

export type PublicDeterministicRepairFormat = 'auto' | 'json' | 'json5' | 'markdown';

export type PublicDeterministicRepairCode =
  | 'json.trailing_closure'
  | 'json5.trailing_closure'
  | 'markdown.redundant_json_fence'
  | 'markdown.unclosed_fence';

export type PublicDeterministicRepairEdit = Readonly<{
  end: number;
  replacement: string;
  start: number;
}>;

export type PublicDeterministicRepairDiagnostic = Readonly<{
  code: PublicDeterministicRepairCode;
  column: number;
  line: number;
  messageEn: string;
  messageZh: string;
  severity: 'warning';
}>;

export type PublicDeterministicRepairCandidate = Readonly<{
  code: PublicDeterministicRepairCode;
  edits: readonly PublicDeterministicRepairEdit[];
  source: string;
}>;

export type PublicDeterministicRepairAnalysis = Readonly<{
  candidate: PublicDeterministicRepairCandidate | null;
  candidateSource: string | null;
  diagnostics: readonly PublicDeterministicRepairDiagnostic[];
  source: string;
}>;

type JsonFormat = 'json' | 'json5';

type SourceLine = Readonly<{
  end: number;
  fullEnd: number;
  line: number;
  newline: string;
  start: number;
  text: string;
}>;

type OpenFence = Readonly<{
  language: string;
  line: SourceLine;
  marker: string;
  markerChar: '`' | '~';
  markerLength: number;
}>;

type ClosedFence = Readonly<{
  closing: SourceLine;
  contentEnd: number;
  contentStart: number;
  opening: OpenFence;
}>;

const JSON_LANGUAGES = new Set<JsonFormat>(['json', 'json5']);

const getSourceLines = (source: string): SourceLine[] => {
  const lines: SourceLine[] = [];
  let start = 0;
  let line = 1;

  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== '\n' && source[index] !== '\r') continue;
    const newline = source[index] === '\r' && source[index + 1] === '\n' ? '\r\n' : source[index];
    const end = index;
    const fullEnd = end + newline.length;
    lines.push({ end, fullEnd, line, newline, start, text: source.slice(start, end) });
    start = fullEnd;
    line += 1;
    if (newline === '\r\n') index += 1;
  }

  lines.push({ end: source.length, fullEnd: source.length, line, newline: '', start, text: source.slice(start) });
  return lines;
};

const parseOpeningFence = (line: SourceLine): OpenFence | null => {
  const match = line.text.match(/^( {0,3})(`{3,}|~{3,})([^\r\n]*)$/u);
  if (!match) return null;
  const marker = match[2];
  const info = match[3].trim();
  if (marker[0] === '`' && info.includes('`')) return null;
  return {
    language: info.split(/\s+/u, 1)[0]?.toLowerCase() ?? '',
    line,
    marker,
    markerChar: marker[0] as '`' | '~',
    markerLength: marker.length,
  };
};

const isClosingFence = (line: SourceLine, fence: OpenFence) => {
  const marker = fence.markerChar === '`' ? '`' : '~';
  return new RegExp(`^ {0,3}${marker}{${fence.markerLength},}[ \\t]*$`, 'u').test(line.text);
};

const scanFences = (source: string) => {
  const lines = getSourceLines(source);
  const closed: ClosedFence[] = [];
  let open: OpenFence | null = null;

  for (const line of lines) {
    if (open) {
      if (isClosingFence(line, open)) {
        closed.push({
          closing: line,
          contentEnd: line.start,
          contentStart: open.line.fullEnd,
          opening: open,
        });
        open = null;
      }
      continue;
    }
    open = parseOpeningFence(line);
  }

  return { closed, lines, open };
};

const parseJson = (source: string, format: JsonFormat) => {
  try {
    if (format === 'json5') JSON5.parse(source);
    else JSON.parse(source);
    return true;
  } catch {
    return false;
  }
};

const getTrailingContainerCompletion = (content: string, format: JsonFormat) => {
  if (parseJson(content, format)) return null;
  const stack: string[] = [];
  const trailingWhitespace = content.match(/\s*$/u)?.[0] ?? '';
  const insertionOffset = content.length - trailingWhitespace.length;
  let quote: string | null = null;
  let escaped = false;
  let lineComment = false;
  let insertionIsInLineComment = false;
  let blockComment = false;
  let sawContainer = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (index === insertionOffset && lineComment) insertionIsInLineComment = true;
    if (lineComment) {
      if (char === '\n' || char === '\r') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (format === 'json5' && char === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (format === 'json5' && char === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === '"' || (format === 'json5' && char === "'")) {
      quote = char;
      continue;
    }
    if (char === '{' || char === '[') {
      sawContainer = true;
      stack.push(char);
      continue;
    }
    if (char !== '}' && char !== ']') continue;
    const expected = char === '}' ? '{' : '[';
    if (stack.at(-1) !== expected) return null;
    stack.pop();
  }

  if (insertionOffset === content.length && lineComment) insertionIsInLineComment = true;
  if (!sawContainer || quote || escaped || blockComment || stack.length === 0) return null;

  const closingContainers = [...stack]
    .reverse()
    .map(opening => opening === '{' ? '}' : ']')
    .join('');
  const lineEnding = trailingWhitespace.includes('\r\n') || content.includes('\r\n')
    ? '\r\n'
    : trailingWhitespace.includes('\r') || content.includes('\r') ? '\r' : '\n';
  const completion = insertionIsInLineComment ? `${lineEnding}${closingContainers}` : closingContainers;
  const corrected = `${content.slice(0, insertionOffset)}${completion}${content.slice(insertionOffset)}`;
  if (!parseJson(corrected, format)) return null;
  return { completion, corrected, insertionOffset };
};

const applyEdits = (source: string, edits: readonly PublicDeterministicRepairEdit[]) => {
  let next = source;
  let previousStart = source.length + 1;
  for (const edit of [...edits].sort((left, right) => right.start - left.start)) {
    if (edit.start < 0 || edit.end < edit.start || edit.end > source.length || edit.end > previousStart) {
      throw new Error('Public deterministic repair edits must be valid and non-overlapping.');
    }
    next = `${next.slice(0, edit.start)}${edit.replacement}${next.slice(edit.end)}`;
    previousStart = edit.start;
  }
  return next;
};

const createResult = (
  source: string,
  code: PublicDeterministicRepairCode,
  line: number,
  edits: readonly PublicDeterministicRepairEdit[],
): PublicDeterministicRepairAnalysis => {
  const messages: Record<PublicDeterministicRepairCode, readonly [string, string]> = {
    'json.trailing_closure': ['JSON 尾部缺少可唯一确定的结束括号。', 'JSON is missing deterministic trailing closing brackets.'],
    'json5.trailing_closure': ['JSON5 尾部缺少可唯一确定的结束括号。', 'JSON5 is missing deterministic trailing closing brackets.'],
    'markdown.redundant_json_fence': ['JSON/JSON5 代码块包含一组可安全移除的重复围栏。', 'The JSON/JSON5 block contains a redundant fence pair that can be removed safely.'],
    'markdown.unclosed_fence': ['Markdown 代码块缺少结束围栏。', 'The Markdown code block is missing its closing fence.'],
  };
  const candidateSource = applyEdits(source, edits);
  const diagnostic: PublicDeterministicRepairDiagnostic = {
    code,
    column: 1,
    line,
    messageZh: messages[code][0],
    messageEn: messages[code][1],
    severity: 'warning',
  };
  return {
    candidate: { code, edits, source: candidateSource },
    candidateSource,
    diagnostics: [diagnostic],
    source,
  };
};

const emptyResult = (source: string): PublicDeterministicRepairAnalysis => ({
  candidate: null,
  candidateSource: null,
  diagnostics: [],
  source,
});

const getContentLineBounds = (content: string) => {
  const lines = getSourceLines(content);
  const indexes = lines.flatMap((line, index) => line.text.trim() ? [index] : []);
  if (indexes.length < 2) return null;
  return { first: lines[indexes[0]], last: lines[indexes.at(-1)!], lines };
};

const getRedundantNestedFenceBody = (content: string, format: JsonFormat) => {
  const bounds = getContentLineBounds(content);
  if (!bounds) return null;
  const inner = parseOpeningFence(bounds.first);
  if (!inner || inner.language !== format || !isClosingFence(bounds.last, inner)) return null;
  const body = content.slice(bounds.first.fullEnd, bounds.last.start);
  return parseJson(body, format) ? body : null;
};

const findRedundantFenceRepair = (source: string, closed: readonly ClosedFence[], lines: readonly SourceLine[]) => {
  for (const block of closed) {
    const format = block.opening.language as JsonFormat;
    if (!JSON_LANGUAGES.has(format)) continue;
    const content = source.slice(block.contentStart, block.contentEnd);
    const nestedBody = getRedundantNestedFenceBody(content, format);
    if (nestedBody !== null) {
      return createResult(source, 'markdown.redundant_json_fence', block.opening.line.line, [{
        end: block.contentEnd,
        replacement: nestedBody,
        start: block.contentStart,
      }]);
    }

    const contentLines = getSourceLines(content);
    const firstContent = contentLines.find(line => line.text.trim());
    const inner = firstContent ? parseOpeningFence(firstContent) : null;
    if (!inner || inner.language !== format || inner.marker !== block.opening.marker) continue;
    const body = content.slice(firstContent!.fullEnd);
    if (!parseJson(body, format)) continue;
    const closingLineIndex = lines.findIndex(line => line.start === block.closing.start);
    const duplicateClosing = lines.slice(closingLineIndex + 1).find(line => line.text.trim());
    if (!duplicateClosing || duplicateClosing.text.trim() !== block.opening.marker) continue;
    const between = source.slice(block.closing.fullEnd, duplicateClosing.start);
    if (between.trim()) continue;

    const replacement = `${block.opening.line.text}${block.opening.line.newline}${body}${block.closing.text}`;
    return createResult(source, 'markdown.redundant_json_fence', block.opening.line.line, [{
      end: duplicateClosing.end,
      replacement,
      start: block.opening.line.start,
    }]);
  }
  return null;
};

const findFencedJsonRepair = (source: string, closed: readonly ClosedFence[]) => {
  for (const block of closed) {
    const format = block.opening.language as JsonFormat;
    if (!JSON_LANGUAGES.has(format)) continue;
    const content = source.slice(block.contentStart, block.contentEnd);
    const repair = getTrailingContainerCompletion(content, format);
    if (!repair) continue;
    return createResult(source, `${format}.trailing_closure`, block.opening.line.line, [{
      end: block.contentStart + repair.insertionOffset,
      replacement: repair.completion,
      start: block.contentStart + repair.insertionOffset,
    }]);
  }
  return null;
};

const findStandaloneJsonRepair = (source: string, format: JsonFormat) => {
  const repair = getTrailingContainerCompletion(source, format);
  if (!repair) return null;
  return createResult(source, `${format}.trailing_closure`, 1, [{
    end: repair.insertionOffset,
    replacement: repair.completion,
    start: repair.insertionOffset,
  }]);
};

const findUnclosedFenceRepair = (source: string, open: OpenFence | null) => {
  if (!open) return null;
  const content = source.slice(open.line.fullEnd);
  if (!open.language && !content.trim()) return null;
  const lineEnding = source.includes('\r\n') ? '\r\n' : source.includes('\r') ? '\r' : '\n';
  const prefix = !source || source.endsWith('\n') || source.endsWith('\r') ? '' : lineEnding;
  const suffix = source.endsWith('\n') || source.endsWith('\r') ? lineEnding : '';
  return createResult(source, 'markdown.unclosed_fence', open.line.line, [{
    end: source.length,
    replacement: `${prefix}${open.marker}${suffix}`,
    start: source.length,
  }]);
};

export const analyzePublicDeterministicRepair = (
  input: string,
  options: Readonly<{ format?: PublicDeterministicRepairFormat }> = {},
): PublicDeterministicRepairAnalysis => {
  const source = String(input ?? '');
  const requestedFormat = options.format ?? 'auto';
  const trimmed = source.trimStart();
  const looksStandaloneJson = trimmed.startsWith('{') || trimmed.startsWith('[');

  if (requestedFormat === 'json' || requestedFormat === 'json5') {
    return findStandaloneJsonRepair(source, requestedFormat) ?? emptyResult(source);
  }
  if (requestedFormat === 'auto' && looksStandaloneJson && !trimmed.startsWith('```') && !trimmed.startsWith('~~~')) {
    return findStandaloneJsonRepair(source, 'json')
      ?? findStandaloneJsonRepair(source, 'json5')
      ?? emptyResult(source);
  }

  const { closed, lines, open } = scanFences(source);
  return findRedundantFenceRepair(source, closed, lines)
    ?? findFencedJsonRepair(source, closed)
    ?? (() => {
      if (open && JSON_LANGUAGES.has(open.language as JsonFormat)) {
        const content = source.slice(open.line.fullEnd);
        const format = open.language as JsonFormat;
        const repair = getTrailingContainerCompletion(content, format);
        if (repair) {
          return createResult(source, `${format}.trailing_closure`, open.line.line, [{
            end: open.line.fullEnd + repair.insertionOffset,
            replacement: repair.completion,
            start: open.line.fullEnd + repair.insertionOffset,
          }]);
        }
      }
      return findUnclosedFenceRepair(source, open);
    })()
    ?? emptyResult(source);
};
