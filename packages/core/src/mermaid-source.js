const GANTT_CONTINUATION_RE =
  /^((?:\d{4}-\d{2}(?:-\d{2})?|\d+(?:ms|s|m|h|d|w)|after\s+[\w-]+|until\s+[\w-]+)\b.*)$/i;
const BLOCK_DIAGRAM_TYPES = new Set(['block', 'block-beta']);
const BLOCK_CHAIN_EDGE_RE = /\s*(<-->|-\.->|-->)\s*/;
const BLOCK_NODE_RE = /^([A-Za-z_][\w-]*)(.*)$/u;
const BLOCK_NODE_DECLARATION_RE = /^\s*(?:\[[\s\S]*\]|\([\s\S]*\)|\{[\s\S]*\})\s*$/u;
const BLOCK_NODE_DECLARATION_TOKEN_RE = /([A-Za-z_][\w-]*)(\[[^\]\n]*\]|\([^)\n]*\)|\{[^}\n]*\})/gu;
const BLOCK_EDGE_LINE_RE = /^\s*([A-Za-z_][\w-]*)\s*(<-->|-\.->|-->)\s*([A-Za-z_][\w-]*)\s*$/u;
const BLOCK_GROUP_RE = /^\s*block:([A-Za-z_][\w-]*)(?::\d+)?\s*$/u;

export const getMermaidDiagramType = (code) => {
  const lines = code
    .trim()
    .split('\n')
    .map((line) => line.trim());
  const frontmatterEndIndex = lines[0] === '---'
    ? lines.slice(1).findIndex((line) => line === '---')
    : -1;
  const bodyLines = frontmatterEndIndex >= 0
    ? lines.slice(frontmatterEndIndex + 2)
    : lines;
  const firstLine = bodyLines.find((line) => line && !line.startsWith('%%'));

  return firstLine?.split(/\s+/)[0] ?? '';
};

const parseBlockChainNode = (rawNode) => {
  const node = rawNode.trim();
  const match = node.match(BLOCK_NODE_RE);
  if (!match) return null;

  const [, id, suffix] = match;
  return {
    declaration: BLOCK_NODE_DECLARATION_RE.test(suffix) ? `${id}${suffix.trim()}` : null,
    id,
  };
};

const normalizeBlockChainLine = (rawLine) => {
  if (!BLOCK_CHAIN_EDGE_RE.test(rawLine)) return { columns: 0, lines: [rawLine] };

  const indent = rawLine.match(/^\s*/)?.[0] ?? '';
  const trimmed = rawLine.trim();
  const parts = trimmed.split(BLOCK_CHAIN_EDGE_RE).filter((part) => part.trim());
  if (parts.length < 3) return { columns: 0, lines: [rawLine] };

  const nodes = [];
  const edges = [];
  for (let index = 0; index < parts.length; index += 2) {
    const node = parseBlockChainNode(parts[index]);
    if (!node) return { columns: 0, lines: [rawLine] };
    nodes.push(node);
  }

  if (nodes.length < 2 || nodes.every((node) => !node.declaration)) {
    return { columns: 0, lines: [rawLine] };
  }

  for (let index = 1; index < parts.length; index += 2) {
    const edge = parts[index].trim();
    if (!['-->', '-.->', '<-->'].includes(edge)) {
      return { columns: 0, lines: [rawLine] };
    }
    edges.push(edge);
  }

  const layoutParts = [];
  const declared = new Set();
  for (const node of nodes) {
    if (!node.declaration || declared.has(node.id)) continue;
    declared.add(node.id);
    layoutParts.push(node.declaration);
  }

  const layoutLine = `${indent}${layoutParts.join(' space ')}`;
  const edgeLines = edges.map((edge, index) => `${indent}${nodes[index].id} ${edge} ${nodes[index + 1].id}`);
  return {
    columns: nodes.length * 2 - 1,
    lines: [layoutLine, ...edgeLines],
  };
};

const splitBlockNodeDeclarationLine = (rawLine) => {
  const indent = rawLine.match(/^\s*/)?.[0] ?? '';
  const trimmed = rawLine.trim();
  const declarations = [];
  let cursor = 0;

  for (const match of trimmed.matchAll(BLOCK_NODE_DECLARATION_TOKEN_RE)) {
    const [declaration] = match;
    const prefix = trimmed.slice(cursor, match.index);
    if (prefix.trim()) return null;

    declarations.push(declaration);
    cursor = match.index + declaration.length;
  }

  if (trimmed.slice(cursor).trim() || declarations.length < 2) return null;
  return declarations.map((declaration) => `${indent}${declaration}`);
};

const normalizeBlockDiagramSource = (code) => {
  const lines = code.split('\n');
  const outputLines = [];
  let didWriteFlowHeader = false;
  let blockGroupDepth = 0;

  for (const line of lines) {
    const normalized = normalizeBlockChainLine(line);
    for (const normalizedLine of normalized.lines) {
      const indent = normalizedLine.match(/^\s*/)?.[0] ?? '';
      const trimmed = normalizedLine.trim();

      if (!trimmed) continue;
      if (BLOCK_DIAGRAM_TYPES.has(trimmed.split(/\s+/)[0] ?? '')) {
        if (!didWriteFlowHeader) {
          outputLines.push('flowchart LR');
          didWriteFlowHeader = true;
        }
        continue;
      }
      if (/^columns\s+\d+\s*$/i.test(trimmed) || /^space(?:\s+\d+|:\d+)?\s*$/i.test(trimmed)) {
        continue;
      }

      const groupMatch = normalizedLine.match(BLOCK_GROUP_RE);
      if (groupMatch) {
        outputLines.push(`${indent}subgraph ${groupMatch[1]}["${groupMatch[1]}"]`);
        blockGroupDepth += 1;
        continue;
      }

      if (/^end\s*$/i.test(trimmed) && blockGroupDepth > 0) {
        outputLines.push(`${indent}end`);
        blockGroupDepth -= 1;
        continue;
      }

      const spacedDeclarations = trimmed.split(/\s+space\s+/i).map((part) => parseBlockChainNode(part)?.declaration);
      if (spacedDeclarations.length > 1 && spacedDeclarations.every(Boolean)) {
        outputLines.push(...spacedDeclarations.map((declaration) => `${indent}${declaration}`));
        continue;
      }

      const splitDeclarations = splitBlockNodeDeclarationLine(normalizedLine);
      if (splitDeclarations) {
        outputLines.push(...splitDeclarations);
        continue;
      }

      const edgeMatch = normalizedLine.match(BLOCK_EDGE_LINE_RE);
      if (edgeMatch) {
        outputLines.push(`${indent}${edgeMatch[1]} ${edgeMatch[2]} ${edgeMatch[3]}`);
        continue;
      }

      const node = parseBlockChainNode(trimmed);
      if (node?.declaration) {
        outputLines.push(`${indent}${node.declaration}`);
        continue;
      }

      outputLines.push(normalizedLine);
    }
  }

  return outputLines.join('\n');
};

const normalizeGanttSource = (code) => {
  const lines = code.split('\n');
  const normalizedLines = [];

  for (const rawLine of lines) {
    const continuation = rawLine.trim();
    const previousIndex = normalizedLines.length - 1;
    const previousLine = previousIndex >= 0 ? normalizedLines[previousIndex] : '';

    if (
      previousLine.trimEnd().endsWith(',') &&
      continuation &&
      GANTT_CONTINUATION_RE.test(continuation)
    ) {
      normalizedLines[previousIndex] = `${previousLine.trimEnd()} ${continuation}`;
      continue;
    }

    normalizedLines.push(rawLine.replace(/(:\s*)planned\s*,\s*/i, '$1'));
  }

  return normalizedLines.join('\n');
};

export const normalizeMermaidSourceForRender = (code) => {
  const diagramType = getMermaidDiagramType(code);
  if (diagramType === 'gantt') return normalizeGanttSource(code);
  if (BLOCK_DIAGRAM_TYPES.has(diagramType)) return normalizeBlockDiagramSource(code);
  return code;
};
