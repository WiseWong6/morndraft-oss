import {
  CODE_FENCE_LANGUAGE_KINDS,
  getCodeFenceLanguageKind,
  normalizeCodeFenceLanguage,
} from './code-fence-language.js';
import { correctArtifact } from './artifact-correction.js';
import {
  validateDocumentSpec,
} from './document-spec.js';
import { detectArtifactContent } from './content-detection.js';

const FIXABLE_FORMAT_KINDS = new Set([
  CODE_FENCE_LANGUAGE_KINDS.JSON,
  CODE_FENCE_LANGUAGE_KINDS.JSON5,
  CODE_FENCE_LANGUAGE_KINDS.HTML_PREVIEW,
  CODE_FENCE_LANGUAGE_KINDS.MERMAID,
  CODE_FENCE_LANGUAGE_KINDS.DOCUMENT_SPEC,
]);

const getLineStarts = (source) => {
  const starts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '\n') starts.push(index + 1);
  }
  return starts;
};

const offsetToLocation = (lineStarts, offset) => {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lineStarts[mid] <= offset) low = mid + 1;
    else high = mid - 1;
  }
  const lineIndex = Math.max(0, high);
  return {
    line: lineIndex + 1,
    column: offset - lineStarts[lineIndex] + 1,
  };
};

const getLineText = (source, line) => source.split(/\r?\n/)[Math.max(0, line - 1)] ?? '';

const JSON_LIKE_FENCE_KINDS = new Set([
  CODE_FENCE_LANGUAGE_KINDS.DOCUMENT_SPEC,
  CODE_FENCE_LANGUAGE_KINDS.JSON,
  CODE_FENCE_LANGUAGE_KINDS.JSON5,
]);

const getFenceLabel = (languageKind) => {
  switch (languageKind) {
    case CODE_FENCE_LANGUAGE_KINDS.DOCUMENT_SPEC:
      return { zh: 'DocumentSpec', en: 'DocumentSpec' };
    case CODE_FENCE_LANGUAGE_KINDS.JSON:
      return { zh: 'JSON', en: 'JSON' };
    case CODE_FENCE_LANGUAGE_KINDS.JSON5:
      return { zh: 'JSON5', en: 'JSON5' };
    default:
      return { zh: 'Markdown', en: 'Markdown' };
  }
};

export const getJsonLikeFenceEndOffset = (source, startOffset) => {
  let index = Math.max(0, startOffset);
  while (index < source.length && /\s/.test(source[index])) index += 1;
  const opening = source[index];
  if (opening !== '{' && opening !== '[') return null;

  const stack = [];
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (lineComment) {
      if (char === '\n') lineComment = false;
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
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '{' || char === '[') {
      stack.push(char);
      continue;
    }
    if (char !== '}' && char !== ']') continue;

    const expectedOpening = char === '}' ? '{' : '[';
    if (stack[stack.length - 1] !== expectedOpening) return null;
    stack.pop();
    if (stack.length === 0) {
      let endOffset = index + 1;
      while (endOffset < source.length && /[ \t]/.test(source[endOffset])) endOffset += 1;
      if (source[endOffset] === '\r' && source[endOffset + 1] === '\n') {
        endOffset += 2;
      } else if (source[endOffset] === '\n') {
        endOffset += 1;
      }
      return endOffset;
    }
  }

  return null;
};

const getUnclosedFenceContentEndOffset = (source, fence) => {
  if (!JSON_LIKE_FENCE_KINDS.has(fence.languageKind)) return null;
  return getJsonLikeFenceEndOffset(source, fence.contentStartOffset);
};

const getLineInsertionIndexForOffset = (source, offset) => {
  const before = source.slice(0, Math.max(0, offset));
  const lineCount = before.split(/\r?\n/).length;
  return before.endsWith('\n') || before.endsWith('\r\n') ? lineCount - 1 : lineCount;
};

export const recoverMarkdownFencesForPreview = (input) => {
  const source = String(input ?? '');
  const lines = source.split(/\r?\n/);
  const lineMap = lines.map((_, index) => index + 1);
  let offset = 0;
  let fence = null;
  let recovery = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineStart = offset;
    const lineEnd = lineStart + line.length;
    const newlineLength = source.slice(lineEnd, lineEnd + 2) === '\r\n'
      ? 2
      : source[lineEnd] === '\n' ? 1 : 0;

    if (fence) {
      const closePattern = new RegExp(`^\\s*${fence.markerChar}{${fence.markerLength},}\\s*$`);
      if (closePattern.test(line)) {
        fence = null;
      }
    } else {
      const match = line.match(/^(\s*)(`{3,}|~{3,})\s*([^\s`~]*)?/);
      if (match) {
        const language = normalizeCodeFenceLanguage(match[3]);
        fence = {
          marker: match[2],
          markerChar: match[2][0],
          markerLength: match[2].length,
          languageKind: getCodeFenceLanguageKind(language),
          line: index + 1,
          contentStartOffset: lineEnd + newlineLength,
        };
      }
    }

    offset = lineEnd + newlineLength;
  }

  if (fence) {
    const contentEndOffset = getUnclosedFenceContentEndOffset(source, fence);
    if (contentEndOffset) {
      recovery = {
        insertionIndex: getLineInsertionIndexForOffset(source, contentEndOffset),
        marker: fence.marker,
        sourceLine: fence.line,
      };
    }
  }

  if (!recovery) {
    return { source, lineMap, recoveries: [] };
  }

  const recoveredLines = [...lines];
  const recoveredLineMap = [...lineMap];
  recoveredLines.splice(recovery.insertionIndex, 0, recovery.marker);
  recoveredLineMap.splice(recovery.insertionIndex, 0, recovery.sourceLine);

  return {
    source: recoveredLines.join('\n'),
    lineMap: recoveredLineMap,
    recoveries: [recovery],
  };
};

const getClosingFenceInsertion = (source, insertionOffset, marker) => {
  const previous = source[Math.max(0, insertionOffset - 1)] ?? '';
  return `${previous === '\n' || previous === '' ? '' : '\n'}${marker}\n`;
};

const createFix = ({ id, labelZh, labelEn, scope, range, replacement, preview }) => ({
  id,
  labelZh,
  labelEn,
  scope,
  range,
  replacement,
  preview,
});

const createDiagnostic = ({
  id,
  code,
  severity,
  messageZh,
  messageEn,
  line,
  column,
  endLine,
  endColumn,
  fix = null,
}) => ({
  id,
  code,
  severity,
  messageZh,
  messageEn,
  ...(line ? { line } : {}),
  ...(column ? { column } : {}),
  ...(endLine ? { endLine } : {}),
  ...(endColumn ? { endColumn } : {}),
  ...(fix ? { fix, fixId: fix.id } : {}),
});

const getJsonParseMessageZh = () =>
  'JSON 格式不完整或不合法：请检查键名、冒号、逗号、括号和值是否完整。';

const getArtifactDiagnosticMessage = (diagnostic, line) => {
  switch (diagnostic.code) {
    case 'markdown.unclosed_fence': {
      const label = diagnostic.fenceLabel ?? getFenceLabel(diagnostic.languageKind);
      return {
        zh: `${label.zh} 代码块缺少结束标记：第 ${line} 行打开的代码块需要补上结束围栏。`,
        en: `${label.en} code fence opened on line ${line} is missing a closing fence.`,
      };
    }
    case 'json.formatted':
      return {
        zh: 'JSON5 可以转换为严格 JSON，并统一缩进格式。',
        en: 'JSON5 can be converted to strict, consistently formatted JSON.',
      };
    case 'json.parse_error':
      return {
        zh: getJsonParseMessageZh(),
        en: diagnostic.message || 'Invalid JSON.',
      };
    case 'html.fragment_wrapped':
      return {
        zh: 'HTML 片段可以补全为完整文档结构，包含 doctype、html、head 和 body。',
        en: 'HTML fragment can be wrapped in a complete document shell.',
      };
    case 'html.head_meta_added':
      return {
        zh: 'HTML 文档缺少必要的 charset 或 viewport meta，可以自动补齐。',
        en: 'HTML document is missing charset or viewport metadata.',
      };
    case 'html.empty':
      return {
        zh: 'HTML 内容为空，无法预览或修复。',
        en: 'HTML source is empty.',
      };
    case 'html.not_detected':
      return {
        zh: '这段内容不像 HTML：请确认是否以有效 HTML 标签开头。',
        en: 'Source does not look like HTML.',
      };
    case 'mermaid.unknown_diagram':
      return {
        zh: '未识别 Mermaid 图类型：请使用 flowchart、sequenceDiagram、classDiagram、stateDiagram 等支持的图类型。',
        en: diagnostic.message || 'Unknown Mermaid diagram type.',
      };
    case 'mermaid.incomplete_edge':
      return {
        zh: 'Mermaid 连线语句不完整：箭头后面需要补上目标节点，或删除未完成的箭头。',
        en: diagnostic.message || 'Mermaid edge or arrow is incomplete.',
      };
    case 'mermaid.single_arrow_flow_edge':
      return {
        zh: 'Mermaid flowchart 不能使用自然语言单箭头：请改成节点 ID 和 `A --> B` 这类 Mermaid 连线。',
        en: diagnostic.message || 'Mermaid flowchart edge must use Mermaid arrows such as A --> B.',
      };
    case 'mermaid.unclosed_node_label':
      return {
        zh: 'Mermaid 节点标签不完整：请检查这一行的方括号是否成对出现。',
        en: diagnostic.message || 'Mermaid node label is missing a closing bracket.',
      };
    default:
      return {
        zh: diagnostic.message || diagnostic.code,
        en: diagnostic.message || diagnostic.code,
      };
  }
};

const getDocumentSpecMessage = (diagnostic) => {
  switch (diagnostic.code) {
    case 'document_spec.parse_error':
      return {
        zh: `DocumentSpec 语法不合法：${getJsonParseMessageZh()}`,
        en: diagnostic.message || 'Invalid DocumentSpec syntax.',
      };
    case 'document_spec.not_object':
      return {
        zh: 'DocumentSpec 必须是一个 JSON/JSON5 对象。',
        en: 'DocumentSpec must be a JSON object.',
      };
    case 'document_spec.invalid_version':
      return {
        zh: 'DocumentSpec version 不合法：当前只支持 v1。',
        en: diagnostic.message,
      };
    case 'document_spec.invalid_target':
      return {
        zh: 'DocumentSpec target 不合法：当前支持 3:4 或 16:9。',
        en: diagnostic.message,
      };
    case 'document_spec.invalid_theme_scheme':
      return {
        zh: 'DocumentSpec theme.scheme 不合法：当前支持 K、L、M。',
        en: diagnostic.message,
      };
    case 'document_spec.invalid_theme_family':
      return {
        zh: 'DocumentSpec theme.family 不合法：请使用已支持的主题 family。',
        en: diagnostic.message,
      };
    case 'document_spec.pages_required':
      return {
        zh: 'DocumentSpec 至少需要一个 page。',
        en: diagnostic.message,
      };
    case 'document_spec.layout_required':
      return {
        zh: 'DocumentSpec 每个 page 都必须填写 layout。',
        en: diagnostic.message,
      };
    case 'document_spec.unknown_layout': {
      const layout = diagnostic.value ? `：${diagnostic.value}` : '';
      return {
        zh: `未知的 DocumentSpec 布局${layout}。请改成已支持的 layout，例如 cover、process、timeline、matrix、radar。`,
        en: diagnostic.message,
      };
    }
    case 'document_spec.invalid_slots':
      return {
        zh: 'DocumentSpec page.slots 必须是对象，值应为字符串、数字或布尔值等可展示内容。',
        en: diagnostic.message,
      };
    case 'document_spec.invalid_items':
      return {
        zh: 'DocumentSpec page.items 必须是数组。',
        en: diagnostic.message,
      };
    default:
      return {
        zh: diagnostic.message || diagnostic.code,
        en: diagnostic.message || diagnostic.code,
      };
  }
};

const createReplacementFix = ({
  diagnostics,
  code,
  severity,
  messageZh,
  messageEn,
  line,
  column,
  endColumn,
  range,
  replacement,
  labelZh,
  labelEn,
  scope,
  preview,
}) => {
  const id = `${code}:${line}:${column || 1}:${diagnostics.length + 1}`;
  const fix = createFix({
    id: `${id}:fix`,
    labelZh,
    labelEn,
    scope,
    range,
    replacement,
    preview,
  });
  diagnostics.push(createDiagnostic({
    id,
    code,
    severity,
    messageZh,
    messageEn,
    line,
    column,
    endLine: line,
    endColumn,
    fix,
  }));
  return fix;
};

const findNthLayoutRange = (content, occurrenceIndex) => {
  const pattern = /(\blayout\s*:\s*|["']layout["']\s*:\s*)(["'])(.*?)\2/gs;
  let match = null;
  for (let index = 0; index <= occurrenceIndex; index += 1) {
    match = pattern.exec(content);
    if (!match) return null;
  }
  const valueStart = match.index + match[1].length + 1;
  const valueEnd = valueStart + match[3].length;
  return {
    start: valueStart,
    end: valueEnd,
    value: match[3],
    lineText: content.slice(match.index, content.indexOf('\n', match.index) === -1 ? content.length : content.indexOf('\n', match.index)).trim(),
  };
};

const getDocumentSpecDiagnosticLocation = ({ content, blockStartOffset, lineStarts, diagnostic }) => {
  const pageMatch = String(diagnostic.path ?? '').match(/^\$\.pages\[(\d+)]\.(layout|slots|items)$/);
  if (pageMatch && pageMatch[2] === 'layout') {
    const range = findNthLayoutRange(content, Number(pageMatch[1]));
    if (range) {
      const start = blockStartOffset + range.start;
      const end = blockStartOffset + range.end;
      return {
        ...offsetToLocation(lineStarts, start),
        endColumn: offsetToLocation(lineStarts, end).column,
        range,
        absoluteRange: { start, end },
      };
    }
  }

  if (diagnostic.line) {
    return {
      line: offsetToLocation(lineStarts, blockStartOffset).line + diagnostic.line - 1,
      column: diagnostic.column,
    };
  }

  return offsetToLocation(lineStarts, blockStartOffset);
};

const analyzeDocumentSpecBlock = ({ content, blockStartOffset, lineStarts, diagnostics }) => {
  const result = validateDocumentSpec(content);
  result.diagnostics
    .filter((item) => item.severity === 'error')
    .forEach((item) => {
      const location = getDocumentSpecDiagnosticLocation({ content, blockStartOffset, lineStarts, diagnostic: item });
      const value = location.range?.value ?? '';
      const message = getDocumentSpecMessage({ ...item, value });
      const canFixUnknownLayout = item.code === 'document_spec.unknown_layout' && location.absoluteRange;
      const replacement = 'cover';
      const preview = canFixUnknownLayout
        ? {
          before: location.range.lineText,
          after: location.range.lineText.replace(value, replacement),
        }
        : null;
      const fix = canFixUnknownLayout
        ? createFix({
          id: `document_spec.unknown_layout:${location.line}:${location.column}:fix`,
          labelZh: '一键修复',
          labelEn: 'Fix',
          scope: 'block',
          range: location.absoluteRange,
          replacement,
          preview,
        })
        : null;
      diagnostics.push(createDiagnostic({
        id: `${item.code}:${location.line}:${location.column || 1}:${diagnostics.length + 1}`,
        code: item.code,
        severity: 'error',
        messageZh: message.zh,
        messageEn: message.en,
        line: location.line,
        column: location.column,
        endLine: location.line,
        endColumn: location.endColumn,
        fix,
      }));
    });
};

const getRedundantJsonFenceBody = ({ content, format, languageKind }) => {
  const lines = getLineRecords(content);
  const contentLineIndexes = lines
    .map((line, index) => (line.text.trim() ? index : -1))
    .filter((index) => index >= 0);
  if (contentLineIndexes.length < 2) return null;

  const openingLine = lines[contentLineIndexes[0]];
  const closingLine = lines[contentLineIndexes[contentLineIndexes.length - 1]];
  const openingMatch = openingLine.text.match(/^\s*(`{3,}|~{3,})\s*([^\s`~]+)\s*$/);
  if (!openingMatch) return null;

  const innerLanguageKind = getCodeFenceLanguageKind(normalizeCodeFenceLanguage(openingMatch[2]));
  if (innerLanguageKind !== languageKind) return null;

  const markerChar = openingMatch[1][0];
  const markerLength = openingMatch[1].length;
  const closingPattern = new RegExp(`^\\s*${markerChar}{${markerLength},}\\s*$`);
  if (!closingPattern.test(closingLine.text)) return null;

  const bodyStartOffset = openingLine.end + openingLine.newlineLength;
  const bodyEndOffset = closingLine.start;
  if (bodyEndOffset < bodyStartOffset) return null;

  const body = content.slice(bodyStartOffset, bodyEndOffset);
  if (!correctArtifact({ format, source: body }).ok) return null;
  return body;
};

const getSplitRedundantJsonFenceRepair = ({ content, fence, closingLine, nextLine }) => {
  const format = fence.languageKind === CODE_FENCE_LANGUAGE_KINDS.JSON
    ? 'json'
    : fence.languageKind === CODE_FENCE_LANGUAGE_KINDS.JSON5 ? 'json5' : null;
  if (!format || !nextLine) return null;

  const escapedMarker = fence.markerChar === '`' ? '`' : '~';
  const exactClosingPattern = new RegExp(`^\\s*${escapedMarker}{${fence.markerLength}}\\s*$`);
  if (!exactClosingPattern.test(closingLine.text) || !exactClosingPattern.test(nextLine.text)) return null;

  const lines = getLineRecords(content);
  const openingLine = lines.find(line => line.text.trim());
  const openingMatch = openingLine?.text.match(/^\s*(`{3,}|~{3,})\s*([^\s`~]+)\s*$/);
  if (!openingMatch) return null;
  if (openingMatch[1][0] !== fence.markerChar || openingMatch[1].length !== fence.markerLength) return null;

  const innerLanguageKind = getCodeFenceLanguageKind(normalizeCodeFenceLanguage(openingMatch[2]));
  if (innerLanguageKind !== fence.languageKind) return null;

  const bodyStartOffset = openingLine.end + openingLine.newlineLength;
  const body = content.slice(bodyStartOffset);
  if (!correctArtifact({ format, source: body }).ok) return null;

  return { body, format };
};

const addSplitRedundantJsonFenceDiagnostic = ({
  source,
  fence,
  closingLine,
  nextLine,
  repair,
  lineStarts,
  diagnostics,
}) => {
  const location = offsetToLocation(lineStarts, fence.contentStartOffset);
  const message = getArtifactDiagnosticMessage({ code: 'json.parse_error' }, location.line);
  const replacement = `${repair.body}${closingLine.text}`;
  const fix = createFix({
    id: `json.parse_error:${location.line}:${location.column}:split-redundant-fence-fix`,
    labelZh: `移除多余 ${repair.format.toUpperCase()} 围栏`,
    labelEn: `Remove redundant ${repair.format.toUpperCase()} fence`,
    scope: 'block',
    range: { start: fence.contentStartOffset, end: nextLine.end },
    replacement,
    preview: {
      before: getLineText(source, location.line).trim(),
      after: repair.body.trim().split(/\r?\n/)[0] || '',
    },
  });
  diagnostics.push(createDiagnostic({
    id: `json.parse_error:${location.line}:${location.column}:${diagnostics.length + 1}`,
    code: 'json.parse_error',
    severity: 'error',
    messageZh: message.zh,
    messageEn: message.en,
    line: location.line,
    column: location.column,
    endLine: location.line,
    endColumn: location.column + 1,
    fix,
  }));
};

const getTrailingJsonContainerRepair = ({ content, format }) => {
  const stack = [];
  const trailingWhitespace = content.match(/\s*$/)?.[0] ?? '';
  const insertionOffset = content.length - trailingWhitespace.length;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let insertionIsInLineComment = false;
  let blockComment = false;

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
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '{' || char === '[') {
      stack.push(char);
      continue;
    }
    if (char !== '}' && char !== ']') continue;

    const expectedOpening = char === '}' ? '{' : '[';
    if (stack[stack.length - 1] !== expectedOpening) return null;
    stack.pop();
  }

  if (insertionOffset === content.length && lineComment) insertionIsInLineComment = true;
  if (quote || escaped || blockComment || stack.length === 0) return null;

  const closingContainers = stack
    .reverse()
    .map(opening => (opening === '{' ? '}' : ']'))
    .join('');
  const lineEnding = trailingWhitespace.includes('\r\n') || (!trailingWhitespace.includes('\n') && content.includes('\r\n'))
    ? '\r\n'
    : '\n';
  const completion = insertionIsInLineComment
    ? `${lineEnding}${closingContainers}`
    : closingContainers;
  const corrected = `${content.slice(0, insertionOffset)}${completion}${content.slice(insertionOffset)}`;
  if (!correctArtifact({ format, source: corrected }).ok) return null;

  return { completion, insertionOffset };
};

const analyzeCorrectableBlock = ({
  source,
  content,
  format,
  blockStartOffset,
  blockEndOffset,
  lineStarts,
  diagnostics,
}) => {
  const result = correctArtifact({ format, source: content });
  const redundantJsonFenceBody = (format === 'json' || format === 'json5')
    ? getRedundantJsonFenceBody({ content, format, languageKind: getCodeFenceLanguageKind(format) })
    : null;
  const trailingJsonContainerRepair = !result.ok && (format === 'json' || format === 'json5')
    ? getTrailingJsonContainerRepair({ content, format })
    : null;
  const visibleDiagnostics = result.diagnostics.filter((item) => (
    item.code !== 'json.formatted' &&
    (item.severity !== 'info' || result.changed)
  ));
  visibleDiagnostics.forEach((item) => {
    if (item.code === 'mermaid.diagram_detected') return;
    const innerLine = item.line || 1;
    const innerColumn = item.column || 1;
    const blockLines = content.split(/\r?\n/);
    const relativeOffset = blockLines.slice(0, innerLine - 1).reduce((sum, line) => sum + line.length + 1, 0) + innerColumn - 1;
    const location = offsetToLocation(lineStarts, blockStartOffset + relativeOffset);
    const message = getArtifactDiagnosticMessage(item, location.line);
    const canReplaceBlock = result.ok && result.changed && ['json.formatted', 'html.fragment_wrapped', 'html.head_meta_added'].includes(item.code);
    const canRemoveRedundantJsonFence = item.code === 'json.parse_error' && redundantJsonFenceBody !== null;
    const canCompleteTrailingJsonContainers = item.code === 'json.parse_error' && trailingJsonContainerRepair !== null;
    const fix = canRemoveRedundantJsonFence
      ? createFix({
        id: `${item.code}:${location.line}:${location.column}:redundant-fence-fix`,
        labelZh: `移除多余 ${format.toUpperCase()} 围栏`,
        labelEn: `Remove redundant ${format.toUpperCase()} fence`,
        scope: 'block',
        range: { start: blockStartOffset, end: blockEndOffset },
        replacement: redundantJsonFenceBody,
        preview: {
          before: content.trim().split(/\r?\n/)[0] || '',
          after: redundantJsonFenceBody.trim().split(/\r?\n/)[0] || '',
        },
      })
      : canCompleteTrailingJsonContainers
      ? createFix({
        id: `${item.code}:${location.line}:${location.column}:trailing-container-fix`,
        labelZh: `补全缺失的 ${format.toUpperCase()} 结束括号`,
        labelEn: `Complete missing ${format.toUpperCase()} closing brackets`,
        scope: 'block',
        range: {
          start: blockStartOffset + trailingJsonContainerRepair.insertionOffset,
          end: blockStartOffset + trailingJsonContainerRepair.insertionOffset,
        },
        replacement: trailingJsonContainerRepair.completion,
        preview: {
          before: '',
          after: trailingJsonContainerRepair.completion,
        },
      })
      : canReplaceBlock
      ? createFix({
        id: `${item.code}:${location.line}:${location.column}:fix`,
        labelZh: item.code.startsWith('json') ? '格式化 JSON' : '修复 HTML',
        labelEn: item.code.startsWith('json') ? 'Format JSON' : 'Fix HTML',
        scope: 'block',
        range: { start: blockStartOffset, end: blockEndOffset },
        replacement: result.corrected,
        preview: {
          before: getLineText(source, location.line).trim() || content.trim().split(/\r?\n/)[0] || '',
          after: result.corrected.trim().split(/\r?\n/)[0] || '',
        },
      })
      : null;
    diagnostics.push(createDiagnostic({
      id: `${item.code}:${location.line}:${location.column || 1}:${diagnostics.length + 1}`,
      code: item.code,
      severity: item.severity === 'info' ? 'warning' : item.severity,
      messageZh: message.zh,
      messageEn: message.en,
      line: location.line,
      column: item.column ? location.column : undefined,
      endLine: location.line,
      endColumn: item.column ? location.column + 1 : undefined,
      fix,
    }));
  });
};

const analyzeBlock = (args) => {
  const { languageKind } = args;
  if (languageKind === CODE_FENCE_LANGUAGE_KINDS.DOCUMENT_SPEC) {
    analyzeDocumentSpecBlock(args);
    return;
  }
  if (languageKind === CODE_FENCE_LANGUAGE_KINDS.JSON) {
    analyzeCorrectableBlock({ ...args, format: 'json' });
    return;
  }
  if (languageKind === CODE_FENCE_LANGUAGE_KINDS.JSON5) {
    analyzeCorrectableBlock({ ...args, format: 'json5' });
    return;
  }
  if (languageKind === CODE_FENCE_LANGUAGE_KINDS.HTML_PREVIEW) {
    analyzeCorrectableBlock({ ...args, format: 'html' });
    return;
  }
  if (languageKind === CODE_FENCE_LANGUAGE_KINDS.MERMAID) {
    analyzeCorrectableBlock({ ...args, format: 'mermaid' });
  }
};

const getLineRecords = (source) => {
  const records = [];
  let offset = 0;
  const matches = source.matchAll(/.*(?:\r?\n|$)/g);
  for (const match of matches) {
    const raw = match[0];
    if (!raw && offset >= source.length) break;
    const newlineMatch = raw.match(/\r?\n$/);
    const text = newlineMatch ? raw.slice(0, -newlineMatch[0].length) : raw;
    records.push({
      text,
      start: offset,
      end: offset + text.length,
      newlineLength: newlineMatch?.[0].length ?? 0,
    });
    offset += raw.length;
  }
  return records.length ? records : [{ text: '', start: 0, end: 0, newlineLength: 0 }];
};

export const analyzeArtifactDocument = (input) => {
  const source = String(input ?? '');
  const lineStarts = getLineStarts(source);
  const lines = getLineRecords(source);
  const diagnostics = [];
  let fence = null;
  let sawFence = false;
  const consumedFenceLineIndexes = new Set();

  lines.forEach((line, index) => {
    if (consumedFenceLineIndexes.has(index)) return;
    if (fence) {
      const closePattern = new RegExp(`^\\s*${fence.markerChar}{${fence.markerLength},}\\s*$`);
      if (closePattern.test(line.text)) {
        const content = source.slice(fence.contentStartOffset, line.start);
        let nextFenceLineIndex = index + 1;
        while (lines[nextFenceLineIndex] && !lines[nextFenceLineIndex].text.trim()) {
          nextFenceLineIndex += 1;
        }
        const nextLine = lines[nextFenceLineIndex];
        const splitRepair = getSplitRedundantJsonFenceRepair({ content, fence, closingLine: line, nextLine });
        if (splitRepair) {
          addSplitRedundantJsonFenceDiagnostic({
            source,
            fence,
            closingLine: line,
            nextLine,
            repair: splitRepair,
            lineStarts,
            diagnostics,
          });
          for (let consumedIndex = index + 1; consumedIndex <= nextFenceLineIndex; consumedIndex += 1) {
            consumedFenceLineIndexes.add(consumedIndex);
          }
        } else {
          analyzeBlock({
            source,
            content,
            blockStartOffset: fence.contentStartOffset,
            blockEndOffset: line.start,
            languageKind: fence.languageKind,
            lineStarts,
            diagnostics,
          });
        }
        fence = null;
      }
      return;
    }

    const match = line.text.match(/^(\s*)(`{3,}|~{3,})\s*([^\s`~]*)?/);
    if (!match) return;
    sawFence = true;
    const language = normalizeCodeFenceLanguage(match[3]);
    const languageKind = getCodeFenceLanguageKind(language);
    fence = {
      marker: match[2],
      markerChar: match[2][0],
      markerLength: match[2].length,
      languageKind,
      line: index + 1,
      contentStartOffset: line.end + line.newlineLength,
    };
  });

  if (fence) {
    const contentEndOffset = getUnclosedFenceContentEndOffset(source, fence);
    const insertionOffset = contentEndOffset ?? source.length;
    if (contentEndOffset) {
      const content = source.slice(fence.contentStartOffset, contentEndOffset);
      analyzeBlock({
        source,
        content,
        blockStartOffset: fence.contentStartOffset,
        blockEndOffset: contentEndOffset,
        languageKind: fence.languageKind,
        lineStarts,
        diagnostics,
      });
    }
    const insertion = getClosingFenceInsertion(source, insertionOffset, fence.marker);
    const line = fence.line;
    const fenceLabel = getFenceLabel(fence.languageKind);
    const message = getArtifactDiagnosticMessage({
      code: 'markdown.unclosed_fence',
      fenceLabel,
      languageKind: fence.languageKind,
    }, line);
    createReplacementFix({
      diagnostics,
      code: 'markdown.unclosed_fence',
      severity: 'warning',
      messageZh: message.zh,
      messageEn: message.en,
      line,
      column: 1,
      endColumn: Math.max(2, getLineText(source, line).length + 1),
      range: { start: insertionOffset, end: insertionOffset },
      replacement: insertion,
      labelZh: `补全 ${fenceLabel.zh} 结束标记`,
      labelEn: `Close ${fenceLabel.en} code fence`,
      scope: 'document',
      preview: {
        before: '缺少结束代码围栏',
        after: fence.marker,
      },
    });
  }

  if (!sawFence && source.trim()) {
    const detected = detectArtifactContent(source);
    const languageKind = {
      json: CODE_FENCE_LANGUAGE_KINDS.JSON,
      html: CODE_FENCE_LANGUAGE_KINDS.HTML_PREVIEW,
      mermaid: CODE_FENCE_LANGUAGE_KINDS.MERMAID,
    }[detected.primaryType];
    if (languageKind && FIXABLE_FORMAT_KINDS.has(languageKind)) {
      analyzeBlock({
        source,
        content: source,
        blockStartOffset: 0,
        blockEndOffset: source.length,
        languageKind,
        lineStarts,
        diagnostics,
      });
    }
  }

  const fixes = diagnostics.map((diagnostic) => diagnostic.fix).filter(Boolean);
  return { diagnostics, fixes };
};

export const applyArtifactFix = (source, fix) => {
  if (!fix?.range) return String(source ?? '');
  const input = String(source ?? '');
  const start = Math.max(0, Math.min(input.length, Number(fix.range.start)));
  const end = Math.max(start, Math.min(input.length, Number(fix.range.end)));
  return `${input.slice(0, start)}${String(fix.replacement ?? '')}${input.slice(end)}`;
};

export const applyArtifactFixes = (source, fixes) => {
  let output = String(source ?? '');
  const ordered = [...(Array.isArray(fixes) ? fixes : [])]
    .filter((fix) => fix?.range)
    .sort((a, b) => Number(b.range.start) - Number(a.range.start));
  for (const fix of ordered) {
    output = applyArtifactFix(output, fix);
  }
  return output;
};
