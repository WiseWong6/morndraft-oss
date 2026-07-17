import JSON5 from 'json5';
import {
  MERMAID_KEYWORDS,
  getMermaidDiagramKeyword,
  looksLikeHtml,
} from './content-detection.js';
import {
  extractJsonErrorLocation,
  getActionableJsonErrorLocation,
} from './json-error-location.js';
import { normalizeJsonStringNewlines } from './json-fence-content.js';

export const ARTIFACT_CORRECTION_FORMATS = Object.freeze({
  HTML: 'html',
  JSON: 'json',
  JSON5: 'json5',
  MARKDOWN: 'markdown',
  MERMAID: 'mermaid',
});

const FORMAT_ALIASES = Object.freeze({
  html: ARTIFACT_CORRECTION_FORMATS.HTML,
  htmlpreview: ARTIFACT_CORRECTION_FORMATS.HTML,
  json: ARTIFACT_CORRECTION_FORMATS.JSON,
  json5: ARTIFACT_CORRECTION_FORMATS.JSON5,
  markdown: ARTIFACT_CORRECTION_FORMATS.MARKDOWN,
  md: ARTIFACT_CORRECTION_FORMATS.MARKDOWN,
  mermaid: ARTIFACT_CORRECTION_FORMATS.MERMAID,
});

const createDiagnostic = ({ code, message, severity = 'info', line = null, column = null }) => ({
  code,
  message,
  severity,
  ...(line ? { line } : {}),
  ...(column ? { column } : {}),
});

export const normalizeArtifactCorrectionFormat = (format) => {
  const key = String(format ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
  return FORMAT_ALIASES[key] ?? '';
};

const getJsonErrorMessage = (error) => (error instanceof Error ? error.message : String(error));

const parseJsonErrorLocation = (error, source = '') => {
  return getActionableJsonErrorLocation(source, error) ?? extractJsonErrorLocation(error) ?? {};
};

const getOpenMarkdownFence = (source) => {
  const lines = source.split(/\r?\n/);
  let openFence = null;

  lines.forEach((line, index) => {
    const match = line.match(/^(\s*)(`{3,}|~{3,})(.*)$/);
    if (!match) return;

    const markerText = match[2];
    const markerChar = markerText[0];
    const markerLength = markerText.length;
    const trailing = match[3].trim();

    if (!openFence) {
      openFence = {
        marker: markerText,
        markerChar,
        markerLength,
        line: index + 1,
      };
      return;
    }

    if (
      markerChar === openFence.markerChar &&
      markerLength >= openFence.markerLength &&
      trailing === ''
    ) {
      openFence = null;
    }
  });

  return openFence;
};

const correctMarkdown = (source) => {
  const diagnostics = [];
  const normalized = source.replace(/\r\n?/g, '\n');
  const openFence = getOpenMarkdownFence(normalized);
  let corrected = normalized;

  if (openFence) {
    corrected = `${normalized.trimEnd()}\n${openFence.marker}\n`;
    diagnostics.push(createDiagnostic({
      code: 'markdown.unclosed_fence',
      line: openFence.line,
      severity: 'warning',
      message: `Closed an unterminated Markdown code fence opened on line ${openFence.line}.`,
    }));
  }

  if (corrected !== source && !openFence) {
    diagnostics.push(createDiagnostic({
      code: 'markdown.normalized_line_endings',
      severity: 'info',
      message: 'Normalized Markdown line endings to LF.',
    }));
  }

  return {
    ok: true,
    corrected,
    changed: corrected !== source,
    diagnostics,
  };
};

const correctJson = (source, parseMode = 'json') => {
  const normalized = normalizeJsonStringNewlines(source);
  try {
    const parsed = parseMode === ARTIFACT_CORRECTION_FORMATS.JSON5
      ? JSON5.parse(normalized.source)
      : JSON.parse(normalized.source);
    const corrected = `${JSON.stringify(parsed, null, 2)}\n`;
    return {
      ok: true,
      corrected,
      changed: corrected !== source,
      diagnostics: corrected === source
        ? []
        : [createDiagnostic({
          code: 'json.formatted',
          severity: 'info',
          message: parseMode === ARTIFACT_CORRECTION_FORMATS.JSON5
            ? 'Parsed JSON5 and formatted it as strict JSON.'
            : 'Parsed JSON and formatted it as strict JSON.',
        })],
    };
  } catch (error) {
    return {
      ok: false,
      corrected: source,
      changed: false,
      diagnostics: [createDiagnostic({
        code: 'json.parse_error',
        severity: 'error',
        message: getJsonErrorMessage(error),
        ...parseJsonErrorLocation(error, source),
      })],
    };
  }
};

const hasCharsetMeta = (source) => /<meta\b[^>]*charset\s*=/i.test(source);
const hasViewportMeta = (source) => /<meta\b[^>]*name=["']viewport["']/i.test(source);
const hasFullHtmlDocument = (source) => /^<!doctype\s+html[\s>]/i.test(source.trim()) || /<html[\s>]/i.test(source);

const getRequiredHeadMeta = (source) => [
  ...(!hasCharsetMeta(source) ? ['<meta charset="utf-8">'] : []),
  ...(!hasViewportMeta(source) ? ['<meta name="viewport" content="width=device-width, initial-scale=1">'] : []),
];

const insertHeadMeta = (source, metaLines) => {
  if (metaLines.length === 0) return source;
  const meta = metaLines.join('\n');

  if (/<head[\s>]/i.test(source)) {
    return source.replace(/<head([^>]*)>/i, `<head$1>\n${meta}`);
  }

  if (/<html[\s>]/i.test(source)) {
    return source.replace(/<html([^>]*)>/i, `<html$1>\n<head>\n${meta}\n</head>`);
  }

  const bodySource = source
    .trim()
    .replace(/^<!doctype\s+html[^>]*>\s*/i, '')
    .replace(/^<body([^>]*)>/i, '')
    .replace(/<\/body>\s*$/i, '')
    .trim();

  return `<!doctype html>
<html lang="zh-CN">
<head>
${meta}
</head>
<body>
${bodySource}
</body>
</html>
`;
};

const correctHtml = (source) => {
  const trimmed = source.trim();
  const diagnostics = [];

  if (!trimmed) {
    return {
      ok: false,
      corrected: source,
      changed: false,
      diagnostics: [createDiagnostic({
        code: 'html.empty',
        severity: 'error',
        message: 'HTML source is empty.',
      })],
    };
  }

  if (!looksLikeHtml(trimmed)) {
    return {
      ok: false,
      corrected: source,
      changed: false,
      diagnostics: [createDiagnostic({
        code: 'html.not_detected',
        severity: 'error',
        message: 'Source does not look like HTML.',
      })],
    };
  }

  let corrected = source.replace(/\r\n?/g, '\n').trim();

  if (!hasFullHtmlDocument(corrected)) {
    diagnostics.push(createDiagnostic({
      code: 'html.fragment_wrapped',
      severity: 'info',
      message: 'Wrapped an HTML fragment in a complete document shell.',
    }));
    corrected = insertHeadMeta(corrected, getRequiredHeadMeta(corrected));
  } else {
    const metaLines = getRequiredHeadMeta(corrected);
    if (metaLines.length > 0) {
      diagnostics.push(createDiagnostic({
        code: 'html.head_meta_added',
        severity: 'info',
        message: 'Added missing charset or viewport metadata.',
      }));
      corrected = insertHeadMeta(corrected, metaLines);
    }
  }

  if (!corrected.endsWith('\n')) corrected += '\n';

  return {
    ok: true,
    corrected,
    changed: corrected !== source,
    diagnostics,
  };
};

const MERMAID_EDGE_SUFFIXES = Object.freeze(['-->', '---', '==>', '-.->', '--o', '--x']);

const endsWithMermaidEdge = (value) => {
  const normalized = value.trimEnd().toLowerCase();
  return MERMAID_EDGE_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
};

const getIncompleteMermaidEdgeLine = (source) => {
  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (endsWithMermaidEdge(lines[index])) {
      return index + 1;
    }
  }
  return null;
};

const hasSingleArrowMermaidFlowEdge = (line) => {
  let quote = null;
  let escaped = false;
  let labelDepth = 0;
  let pipeLabel = false;
  for (let index = 0; index < line.length - 1; index += 1) {
    const char = line[index];
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
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (labelDepth === 0 && char === '|') {
      if (pipeLabel) {
        pipeLabel = false;
        continue;
      }
      if (endsWithMermaidEdge(line.slice(0, index))) {
        pipeLabel = true;
        continue;
      }
    }
    if (pipeLabel) {
      continue;
    }
    if (char === '[' || char === '(' || char === '{') {
      labelDepth += 1;
      continue;
    }
    if ((char === ']' || char === ')' || char === '}') && labelDepth > 0) {
      labelDepth -= 1;
      continue;
    }
    if (labelDepth > 0) continue;
    if (char !== '-' || line[index + 1] !== '>') continue;
    const previous = line[index - 1] ?? '';
    if (previous === '-' || previous === '.' || previous === '=') continue;
    return true;
  }
  return false;
};

const getSingleArrowMermaidFlowLine = (source) => {
  const lines = source.split(/\r?\n/);
  const keyword = getMermaidDiagramKeyword(source);
  if (keyword !== 'flowchart' && keyword !== 'graph') return null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line || line.startsWith('%%')) continue;
    if (/^(?:flowchart|graph)\b/iu.test(line)) continue;
    if (/^(?:subgraph|end|classDef|class|style|linkStyle|click)\b/iu.test(line)) continue;
    if (hasSingleArrowMermaidFlowEdge(line)) {
      return index + 1;
    }
  }
  return null;
};

const getUnclosedMermaidNodeLabelLine = (source) => {
  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line || line.startsWith('%%')) continue;
    let quote = null;
    let escaped = false;
    let squareDepth = 0;
    for (const char of line) {
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
      if (char === '"' || char === "'") {
        quote = char;
        continue;
      }
      if (char === '[') {
        squareDepth += 1;
      } else if (char === ']' && squareDepth > 0) {
        squareDepth -= 1;
      }
    }
    if (squareDepth > 0) return index + 1;
  }
  return null;
};

const correctMermaid = (source) => {
  const trimmed = source.trim();
  if (!trimmed) {
    return {
      ok: false,
      corrected: source,
      changed: false,
      diagnostics: [createDiagnostic({
        code: 'mermaid.empty',
        severity: 'error',
        message: 'Mermaid source is empty.',
      })],
    };
  }

  const keyword = getMermaidDiagramKeyword(trimmed);
  if (!keyword || !MERMAID_KEYWORDS.has(keyword)) {
    return {
      ok: false,
      corrected: source,
      changed: false,
      diagnostics: [createDiagnostic({
        code: 'mermaid.unknown_diagram',
        severity: 'error',
        message: keyword
          ? `Unknown Mermaid diagram keyword "${keyword}".`
          : 'Could not find a Mermaid diagram keyword.',
      })],
    };
  }

  const unclosedNodeLabelLine = getUnclosedMermaidNodeLabelLine(source);
  if (unclosedNodeLabelLine) {
    return {
      ok: false,
      corrected: source,
      changed: false,
      diagnostics: [createDiagnostic({
        code: 'mermaid.unclosed_node_label',
        severity: 'error',
        line: unclosedNodeLabelLine,
        message: 'Mermaid node label is missing a closing bracket.',
      })],
    };
  }

  const incompleteEdgeLine = getIncompleteMermaidEdgeLine(source);
  if (incompleteEdgeLine) {
    return {
      ok: false,
      corrected: source,
      changed: false,
      diagnostics: [createDiagnostic({
        code: 'mermaid.incomplete_edge',
        severity: 'error',
        line: incompleteEdgeLine,
        message: 'Mermaid edge or arrow is incomplete.',
      })],
    };
  }

  const singleArrowLine = getSingleArrowMermaidFlowLine(source);
  if (singleArrowLine) {
    return {
      ok: false,
      corrected: source,
      changed: false,
      diagnostics: [createDiagnostic({
        code: 'mermaid.single_arrow_flow_edge',
        severity: 'error',
        line: singleArrowLine,
        message: 'Mermaid flowchart edges must use node ids and Mermaid arrows such as A --> B, not prose arrows such as 开始 -> 处理.',
      })],
    };
  }

  const corrected = `${source.replace(/\r\n?/g, '\n').trim()}\n`;
  return {
    ok: true,
    corrected,
    changed: corrected !== source,
    diagnostics: [createDiagnostic({
      code: 'mermaid.diagram_detected',
      severity: 'info',
      message: `Detected Mermaid diagram keyword "${keyword}".`,
    })],
  };
};

export const correctArtifact = ({ format, source }) => {
  const normalizedFormat = normalizeArtifactCorrectionFormat(format);
  const rawSource = String(source ?? '');

  if (!normalizedFormat) {
    return {
      ok: false,
      format: '',
      corrected: rawSource,
      changed: false,
      diagnostics: [createDiagnostic({
        code: 'artifact.unknown_format',
        severity: 'error',
        message: `Unsupported artifact format "${format}".`,
      })],
    };
  }

  const result = {
    [ARTIFACT_CORRECTION_FORMATS.HTML]: correctHtml,
    [ARTIFACT_CORRECTION_FORMATS.JSON]: correctJson,
    [ARTIFACT_CORRECTION_FORMATS.JSON5]: (sourceValue) => correctJson(sourceValue, ARTIFACT_CORRECTION_FORMATS.JSON5),
    [ARTIFACT_CORRECTION_FORMATS.MARKDOWN]: correctMarkdown,
    [ARTIFACT_CORRECTION_FORMATS.MERMAID]: correctMermaid,
  }[normalizedFormat](rawSource);

  return {
    format: normalizedFormat,
    ...result,
  };
};
