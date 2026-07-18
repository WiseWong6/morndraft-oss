import { getMermaidDiagramType } from './mermaid-source.js';

const DIAGRAM_TYPE_ALIASES = new Map([
  ['architecture', 'architecture'],
  ['architecture-beta', 'architecture'],
  ['block', 'block'],
  ['block-beta', 'block'],
  ['c4component', 'c4'],
  ['c4container', 'c4'],
  ['c4context', 'c4'],
  ['c4deployment', 'c4'],
  ['c4dynamic', 'c4'],
  ['classdiagram', 'classDiagram'],
  ['erdiagram', 'erDiagram'],
  ['flowchart', 'flowchart'],
  ['gantt', 'gantt'],
  ['gitgraph', 'gitGraph'],
  ['graph', 'graph'],
  ['ishikawa-beta', 'genericQuoted'],
  ['journey', 'journey'],
  ['kanban', 'kanban'],
  ['mindmap', 'mindmap'],
  ['packet', 'packet'],
  ['packet-beta', 'packet'],
  ['pie', 'pie'],
  ['quadrantchart', 'quadrantChart'],
  ['radar', 'radar'],
  ['radar-beta', 'radar'],
  ['requirementdiagram', 'requirementDiagram'],
  ['sankey', 'sankey'],
  ['sankey-beta', 'sankey'],
  ['sequencediagram', 'sequenceDiagram'],
  ['statediagram', 'stateDiagram'],
  ['statediagram-v2', 'stateDiagram-v2'],
  ['timeline', 'timeline'],
  ['treemap', 'treemap'],
  ['treemap-beta', 'treemap'],
  ['venn-beta', 'genericQuoted'],
  ['xychart', 'xychart'],
  ['xychart-beta', 'xychart'],
]);

const KNOWN_EDIT_DIAGRAM_TYPES = new Set(DIAGRAM_TYPE_ALIASES.values());

const normalizeMermaidEditDiagramType = (type) => {
  const key = String(type ?? '').trim().replace(/:$/, '').toLowerCase();
  return DIAGRAM_TYPE_ALIASES.get(key) ?? '';
};

const getMermaidEditDiagramType = (source) =>
  normalizeMermaidEditDiagramType(getMermaidDiagramType(source));

// ---------------------------------------------------------------------------
// Public support contract
// ---------------------------------------------------------------------------

export const isMermaidEditSupported = (source) =>
  getMermaidEditAvailability(source).supported;

export const getMermaidEditAvailability = (source) => {
  const diagramType = getMermaidEditDiagramType(source);
  const knownDiagram = Boolean(diagramType && KNOWN_EDIT_DIAGRAM_TYPES.has(diagramType));
  const labels = knownDiagram ? extractMermaidLabels(source) : [];
  const editableCount = labels.filter((label) => !label.readOnlyReason).length;
  let reason = '';
  if (!knownDiagram) reason = 'unknown-diagram';
  else if (editableCount === 0) reason = 'no-editable-labels';

  return {
    diagramType,
    editable: editableCount > 0,
    editableCount,
    knownDiagram,
    labels,
    reason,
    supported: knownDiagram,
  };
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let nextId = 1;

const resetId = () => { nextId = 1; };

const makeLabel = (kind, original, sourceOffset, sourceLength, metadata = {}) => {
  const label = {
    id: nextId++,
    kind,
    group: metadata.group ?? kind,
    original,
    sourceOffset,
    sourceLength,
  };
  for (const key of ['contextLabel', 'replacementMode', 'readOnlyReason']) {
    if (metadata[key]) label[key] = metadata[key];
  }
  return label;
};

const getHeaderLineIndex = (lines) => {
  let startIndex = 0;
  if (lines[0]?.trim() === '---') {
    const endIndex = lines.slice(1).findIndex((line) => line.trim() === '---');
    if (endIndex >= 0) startIndex = endIndex + 2;
  }
  for (let index = startIndex; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (trimmed && !trimmed.startsWith('%%')) return index;
  }
  return -1;
};

const walkLines = (source, skip, visitor) => {
  const lines = source.split('\n');
  const headerIndex = getHeaderLineIndex(lines);
  if (headerIndex < 0) return;
  let offset = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (index < headerIndex + skip || !trimmed || trimmed.startsWith('%%')) {
      offset += line.length + 1;
      continue;
    }
    visitor(line, index, offset);
    offset += line.length + 1;
  }
};

const findTextOffset = (line, lineOff, text, fromIndex = 0) => {
  const index = line.indexOf(text, fromIndex);
  return index < 0 ? lineOff : lineOff + index;
};

const overlaps = (used, start, len) => {
  const end = start + len;
  for (const [s, l] of used) {
    if (start < s + l && end > s) return true;
  }
  return false;
};

const pushLabel = (out, kind, line, lineOff, text, fromIndex = 0, metadata = {}) => {
  const original = String(text ?? '').trim();
  if (!original) return;
  const offset = findTextOffset(line, lineOff, original, fromIndex);
  out.push(makeLabel(kind, original, offset, original.length, metadata));
};

const extractQuotedStrings = (source, out, kind = 'label', group = kind) => {
  walkLines(source, 1, (line, _i, lineOff) => {
    const re = /"((?:\\"|[^"])*)"/g;
    let match;
    while ((match = re.exec(line)) !== null) {
      out.push(makeLabel(kind, match[1], lineOff + match.index + 1, match[1].length, { group }));
    }
  });
};

const extractBracketLabels = (source, out, kind = 'node', group = kind) => {
  walkLines(source, 1, (line, _i, lineOff) => {
    const re = /([A-Za-z_][\w-]*)\s*(?:\[\[([^\]\n]*)\]\]|\[([^\]\n]*)\]|\(([^)\n]*)\)|\{([^}\n]*)\})/g;
    let match;
    const used = [];
    while ((match = re.exec(line)) !== null) {
      const text = match[2] ?? match[3] ?? match[4] ?? match[5] ?? '';
      if (!text) continue;
      const quoted = text.match(/^"([^"]*)"$/) ?? text.match(/^'([^']*)'$/);
      const labelText = quoted ? quoted[1] : text;
      const bracketIndex = match[0].indexOf(text);
      const offset = lineOff + match.index + bracketIndex + (quoted ? 1 : 0);
      if (overlaps(used, offset, labelText.length)) continue;
      used.push([offset, labelText.length]);
      out.push(makeLabel(kind, labelText, offset, labelText.length, {
        contextLabel: match[1],
        group,
      }));
    }
  });
};

// ---------------------------------------------------------------------------
// Flowchart
// ---------------------------------------------------------------------------

const FLOW_NODE_PATTERNS = [
  { re: /\b([A-Za-z_]\w*)\s*\(\(([^)\n]*)\)\)/g, openLen: 2, kind: 'node' },
  { re: /\b([A-Za-z_]\w*)\s*\[\[([^\]\n]*)\]\]/g, openLen: 2, kind: 'node' },
  { re: /\b([A-Za-z_]\w*)\s*\(\[([^)\n]*)\]\)/g, openLen: 2, kind: 'node' },
  { re: /\b([A-Za-z_]\w*)\s*\[\(([^)\n]*)\)\]/g, openLen: 2, kind: 'node' },
  { re: /\b([A-Za-z_]\w*)\s*\[([^\]\n]*)\]/g, openLen: 1, kind: 'node' },
  { re: /\b([A-Za-z_]\w*)\s*\(([^)\n]*)\)/g, openLen: 1, kind: 'node' },
  { re: /\b([A-Za-z_]\w*)\s*\{([^}\n]*)\}/g, openLen: 1, kind: 'node' },
  { re: /\b([A-Za-z_]\w*)\s*>([^\]\n]*)\]/g, openLen: 1, kind: 'node' },
];

const FLOW_EDGE_PIPE_RE = /(-+>>?|==>>?|-\.->|<-+>)\s*\|([^|)\n]*)\|/g;
const FLOW_EDGE_MID_RE = /--\s+([^-\n][^-]*?)\s+-->/g;
const FLOW_EDGE_INLINE_RE = /--([\w][\w ]*)-->/g;
const FLOW_SUBGRAPH_BRACKET_RE = /^\s*subgraph\s+([A-Za-z_][\w-]*)\s*\[([^\]\n]+)\]/i;
const FLOW_SUBGRAPH_TEXT_RE = /^\s*subgraph\s+(.+)$/i;

const extractFlowchart = (source, out) => {
  walkLines(source, 1, (line, _i, lineOff) => {
    let match;
    if ((match = FLOW_SUBGRAPH_BRACKET_RE.exec(line))) {
      pushLabel(out, 'group', line, lineOff, match[2], line.indexOf('['), { group: 'group', contextLabel: match[1] });
    } else if ((match = FLOW_SUBGRAPH_TEXT_RE.exec(line))) {
      const label = match[1].trim();
      if (!/^[A-Za-z_][\w-]*$/.test(label)) {
        pushLabel(out, 'group', line, lineOff, label, line.indexOf(match[1]), { group: 'group' });
      }
    }

    FLOW_EDGE_PIPE_RE.lastIndex = 0;
    while ((match = FLOW_EDGE_PIPE_RE.exec(line)) !== null) {
      const text = match[2];
      const pipeIdx = match[0].indexOf('|');
      out.push(makeLabel('edge', text, lineOff + match.index + pipeIdx + 1, text.length));
    }

    FLOW_EDGE_MID_RE.lastIndex = 0;
    while ((match = FLOW_EDGE_MID_RE.exec(line)) !== null) {
      const raw = match[1];
      const text = raw.trim();
      out.push(makeLabel('edge', text, lineOff + match.index + 2 + raw.indexOf(text), text.length));
    }

    FLOW_EDGE_INLINE_RE.lastIndex = 0;
    while ((match = FLOW_EDGE_INLINE_RE.exec(line)) !== null) {
      const raw = match[1];
      const text = raw.trim();
      out.push(makeLabel('edge', text, lineOff + match.index + 2 + raw.indexOf(text), text.length));
    }

    const usedRanges = [];
    for (const { re, openLen, kind } of FLOW_NODE_PATTERNS) {
      re.lastIndex = 0;
      while ((match = re.exec(line)) !== null) {
        const text = match[2];
        if (text === undefined) continue;
        const fullMatch = match[0];
        const nodeId = match[1];
        const idEndInMatch = fullMatch.indexOf(nodeId) + nodeId.length;
        const afterId = fullMatch.slice(idEndInMatch);
        const wsLen = afterId.length - afterId.trimStart().length;
        const bracketPos = idEndInMatch + wsLen;
        const textStart = lineOff + match.index + bracketPos + openLen;
        if (overlaps(usedRanges, textStart, text.length)) continue;
        usedRanges.push([textStart, text.length]);
        out.push(makeLabel(kind, text, textStart, text.length, { contextLabel: nodeId }));
      }
    }
  });
};

// ---------------------------------------------------------------------------
// Sequence diagram
// ---------------------------------------------------------------------------

const SEQ_PARTICIPANT_RE = /^\s*(?:participant|actor)\s+([A-Za-z_]\w*)(?:\s+as\s+(.+))?/i;
const SEQ_MESSAGE_RE = /^\s*([A-Za-z_]\w*)\s*([-.]?(?:->>|-->>|->|-->)[-.]?)\s*([A-Za-z_]\w*)\s*:\s*(.+)$/;
const SEQ_NOTE_RE = /^\s*Note\s+(?:over|left of|right of)\s+[^:]+:\s*(.+)$/i;

const extractSequence = (source, out) => {
  walkLines(source, 1, (line, _i, lineOff) => {
    let match;
    if ((match = SEQ_PARTICIPANT_RE.exec(line))) {
      const alias = match[2];
      if (alias) {
        const label = alias.trim();
        out.push(makeLabel('participant', label, findTextOffset(line, lineOff, label, line.indexOf(' as ')), label.length, {
          contextLabel: match[1],
        }));
      } else {
        const name = match[1];
        out.push(makeLabel('participant', name, findTextOffset(line, lineOff, name), name.length, {
          replacementMode: 'sequenceActor',
        }));
      }
    } else if ((match = SEQ_MESSAGE_RE.exec(line))) {
      pushLabel(out, 'message', line, lineOff, match[4], line.lastIndexOf(':') + 1, { group: 'message' });
    } else if ((match = SEQ_NOTE_RE.exec(line))) {
      pushLabel(out, 'note', line, lineOff, match[1], line.lastIndexOf(':') + 1, { group: 'message' });
    }
  });
};

const collectSequenceActorReferenceRanges = (source) => {
  const ranges = [];
  walkLines(source, 1, (line, _i, lineOff) => {
    let match;
    if ((match = SEQ_PARTICIPANT_RE.exec(line)) && !match[2]) {
      ranges.push({ original: match[1], sourceOffset: findTextOffset(line, lineOff, match[1]), sourceLength: match[1].length });
      return;
    }
    if ((match = SEQ_MESSAGE_RE.exec(line))) {
      ranges.push({ original: match[1], sourceOffset: findTextOffset(line, lineOff, match[1]), sourceLength: match[1].length });
      ranges.push({ original: match[3], sourceOffset: findTextOffset(line, lineOff, match[3], line.indexOf(match[2]) + match[2].length), sourceLength: match[3].length });
      return;
    }
    const actorCommand = /^\s*(?:activate|deactivate|destroy)\s+([A-Za-z_]\w*)/i.exec(line);
    if (actorCommand) {
      ranges.push({ original: actorCommand[1], sourceOffset: findTextOffset(line, lineOff, actorCommand[1]), sourceLength: actorCommand[1].length });
      return;
    }
    const noteTargets = /^\s*Note\s+(?:over|left of|right of)\s+([^:]+):/i.exec(line);
    if (noteTargets) {
      for (const rawTarget of noteTargets[1].split(',')) {
        const target = rawTarget.trim();
        if (/^[A-Za-z_]\w*$/.test(target)) {
          ranges.push({ original: target, sourceOffset: findTextOffset(line, lineOff, target), sourceLength: target.length });
        }
      }
    }
  });
  return ranges;
};

// ---------------------------------------------------------------------------
// Class diagram
// ---------------------------------------------------------------------------

const CLASS_DECL_RE = /^\s*class\s+([A-Za-z_]\w*)/;

const extractClass = (source, out) => {
  let currentClass = '';
  walkLines(source, 1, (line, _i, lineOff) => {
    const trimmed = line.trim();
    const classMatch = CLASS_DECL_RE.exec(line);
    if (classMatch) {
      currentClass = classMatch[1];
      out.push(makeLabel('class', currentClass, findTextOffset(line, lineOff, currentClass), currentClass.length, {
        replacementMode: 'className',
      }));
      return;
    }
    if (trimmed === '}') {
      currentClass = '';
      return;
    }
    if (currentClass && trimmed && !trimmed.startsWith('<<')) {
      const kind = trimmed.includes('(') ? 'method' : 'attribute';
      out.push(makeLabel(kind, trimmed, lineOff + line.indexOf(trimmed), trimmed.length, {
        contextLabel: currentClass,
      }));
    }
  });
};

const collectClassReferenceRanges = (source) => {
  const ranges = [];
  walkLines(source, 1, (line, _i, lineOff) => {
    let match = CLASS_DECL_RE.exec(line);
    if (match) {
      ranges.push({ original: match[1], sourceOffset: findTextOffset(line, lineOff, match[1]), sourceLength: match[1].length });
      return;
    }
    match = /^\s*([A-Za-z_]\w*)\s+[-.<|>*o]+\s+([A-Za-z_]\w*)/.exec(line);
    if (match) {
      ranges.push({ original: match[1], sourceOffset: findTextOffset(line, lineOff, match[1]), sourceLength: match[1].length });
      ranges.push({ original: match[2], sourceOffset: findTextOffset(line, lineOff, match[2], line.indexOf(match[1]) + match[1].length), sourceLength: match[2].length });
      return;
    }
    match = /^\s*([A-Za-z_]\w*)\s*:/.exec(line);
    if (match) {
      ranges.push({ original: match[1], sourceOffset: findTextOffset(line, lineOff, match[1]), sourceLength: match[1].length });
    }
  });
  return ranges;
};

// ---------------------------------------------------------------------------
// State diagram
// ---------------------------------------------------------------------------

const STATE_NAMED_RE = /^\s*state\s+"([^"]+)"\s+as\s+([A-Za-z_]\w*)/;
const STATE_TRANSITION_RE = /^\s*([A-Za-z_]\w*|\[\*\])\s*-->\s*([A-Za-z_]\w*|\[\*\])(?:\s*:\s*(.+))?/;

const extractState = (source, out) => {
  walkLines(source, 1, (line, _i, lineOff) => {
    let match;
    if ((match = STATE_NAMED_RE.exec(line))) {
      out.push(makeLabel('state', match[1], lineOff + line.indexOf('"') + 1, match[1].length, {
        contextLabel: match[2],
      }));
    } else if ((match = STATE_TRANSITION_RE.exec(line))) {
      for (const stateName of [match[1], match[2]]) {
        if (stateName === '[*]') continue;
        out.push(makeLabel('state', stateName, findTextOffset(line, lineOff, stateName), stateName.length, {
          replacementMode: 'stateId',
        }));
      }
      if (match[3]) pushLabel(out, 'edge', line, lineOff, match[3], line.lastIndexOf(':') + 1, { group: 'edge' });
    }
  });
};

const collectStateIdentifierRanges = (source) => {
  const ranges = [];
  walkLines(source, 1, (line, _i, lineOff) => {
    let match = STATE_NAMED_RE.exec(line);
    if (match) {
      ranges.push({ original: match[2], sourceOffset: findTextOffset(line, lineOff, match[2], line.indexOf(' as ')), sourceLength: match[2].length });
      return;
    }
    match = STATE_TRANSITION_RE.exec(line);
    if (match) {
      for (const stateName of [match[1], match[2]]) {
        if (stateName === '[*]') continue;
        ranges.push({ original: stateName, sourceOffset: findTextOffset(line, lineOff, stateName), sourceLength: stateName.length });
      }
    }
  });
  return ranges;
};

// ---------------------------------------------------------------------------
// ER diagram
// ---------------------------------------------------------------------------

const ER_IDENTIFIER_RE = '[A-Za-z_]\\w*';
const ER_RELATION_RE = new RegExp(`^(\\s*)(${ER_IDENTIFIER_RE})(\\s+)([|o}{]+--[|o}{]+)(\\s+)(${ER_IDENTIFIER_RE})(?:\\s*:\\s*(.*?))?\\s*$`);
const ER_ENTITY_DECL_RE = new RegExp(`^(\\s*)(${ER_IDENTIFIER_RE})\\s*\\{\\s*$`);
const ER_ENTITY_STANDALONE_RE = new RegExp(`^(\\s*)(${ER_IDENTIFIER_RE})\\s*$`);
const ER_BLOCK_END_RE = /^\s*}\s*$/;
const ER_FIELD_RE = /^(\s*)(\S+)(?:\s+([A-Za-z_][\w-]*))?/;

const collectERDeclaredEntities = (source) => {
  const declared = new Set();
  let inEntityBlock = false;
  walkLines(source, 1, (line) => {
    const trimmed = line.trim();
    if (inEntityBlock) {
      if (ER_BLOCK_END_RE.test(trimmed)) inEntityBlock = false;
      return;
    }
    if (ER_RELATION_RE.test(line)) return;
    const blockMatch = ER_ENTITY_DECL_RE.exec(line);
    if (blockMatch) {
      declared.add(blockMatch[2]);
      inEntityBlock = true;
      return;
    }
    const standaloneMatch = ER_ENTITY_STANDALONE_RE.exec(line);
    if (standaloneMatch) declared.add(standaloneMatch[2]);
  });
  return declared;
};

const collectEREntityReferenceRanges = (source) => {
  const ranges = [];
  walkLines(source, 1, (line, _i, lineOff) => {
    const relationMatch = ER_RELATION_RE.exec(line);
    if (!relationMatch) return;
    const [, leading, from, betweenFromAndOp, operator, betweenOpAndTo, to] = relationMatch;
    const fromOff = lineOff + leading.length;
    const toOff = lineOff + leading.length + from.length + betweenFromAndOp.length + operator.length + betweenOpAndTo.length;
    ranges.push({ original: from, sourceOffset: fromOff, sourceLength: from.length });
    ranges.push({ original: to, sourceOffset: toOff, sourceLength: to.length });
  });
  return ranges;
};

const extractER = (source, out) => {
  const declaredEntities = collectERDeclaredEntities(source);
  let inEntityBlock = false;
  let currentEntity = '';

  walkLines(source, 1, (line, _i, lineOff) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (inEntityBlock) {
      if (ER_BLOCK_END_RE.test(trimmed)) {
        inEntityBlock = false;
        currentEntity = '';
        return;
      }
      const fieldMatch = ER_FIELD_RE.exec(line);
      if (!fieldMatch) return;
      const [, leading, fieldType, fieldName] = fieldMatch;
      out.push(makeLabel('fieldType', fieldType, lineOff + leading.length, fieldType.length, {
        contextLabel: currentEntity,
      }));
      if (fieldName) {
        out.push(makeLabel('field', fieldName, findTextOffset(line, lineOff, fieldName, leading.length + fieldType.length), fieldName.length, {
          contextLabel: `${currentEntity}.${fieldName}`,
        }));
      }
      return;
    }

    const relationMatch = ER_RELATION_RE.exec(line);
    if (relationMatch) {
      const [, leading, from, betweenFromAndOp, operator, betweenOpAndTo, to, rawLabel = ''] = relationMatch;
      const fromOff = lineOff + leading.length;
      const toOff = lineOff + leading.length + from.length + betweenFromAndOp.length + operator.length + betweenOpAndTo.length;
      if (!declaredEntities.has(from)) {
        out.push(makeLabel('entity', from, fromOff, from.length, {
          contextLabel: from,
          replacementMode: 'erEntity',
        }));
      }
      if (!declaredEntities.has(to)) {
        out.push(makeLabel('entity', to, toOff, to.length, {
          contextLabel: to,
          replacementMode: 'erEntity',
        }));
      }
      const label = rawLabel.trim();
      if (label) {
        pushLabel(out, 'relation', line, lineOff, label, line.indexOf(':', toOff - lineOff + to.length) + 1, {
          contextLabel: `${from} -> ${to}`,
          group: 'relation',
        });
      }
      return;
    }

    const entityBlockMatch = ER_ENTITY_DECL_RE.exec(line);
    if (entityBlockMatch) {
      const entity = entityBlockMatch[2];
      out.push(makeLabel('entity', entity, lineOff + entityBlockMatch[1].length, entity.length, {
        contextLabel: entity,
        replacementMode: 'erEntity',
      }));
      currentEntity = entity;
      inEntityBlock = true;
      return;
    }

    const standaloneEntityMatch = ER_ENTITY_STANDALONE_RE.exec(line);
    if (standaloneEntityMatch) {
      const entity = standaloneEntityMatch[2];
      out.push(makeLabel('entity', entity, lineOff + standaloneEntityMatch[1].length, entity.length, {
        contextLabel: entity,
        replacementMode: 'erEntity',
      }));
    }
  });
};

// ---------------------------------------------------------------------------
// Diagram-specific light parsers
// ---------------------------------------------------------------------------

const extractGantt = (source, out) => {
  walkLines(source, 1, (line, _i, lineOff) => {
    const trimmed = line.trim();
    if (/^title\s+/i.test(trimmed)) {
      pushLabel(out, 'title', line, lineOff, trimmed.replace(/^title\s+/i, ''), line.toLowerCase().indexOf('title') + 5, { group: 'title' });
      return;
    }
    if (/^section\s+/i.test(trimmed)) {
      pushLabel(out, 'section', line, lineOff, trimmed.replace(/^section\s+/i, ''), line.toLowerCase().indexOf('section') + 7, { group: 'section' });
      return;
    }
    const colonIndex = line.indexOf(':');
    if (colonIndex <= 0 || /^[A-Za-z]+\s/.test(trimmed) && /^(dateFormat|axisFormat|excludes|todayMarker|inclusiveEndDates|topAxis|weekday)\b/i.test(trimmed)) return;
    const rawTask = line.slice(0, colonIndex).trim();
    const task = rawTask.replace(/^(?:(?:active|done|crit)\s+)*task\s+/i, '').trim();
    pushLabel(out, 'task', line, lineOff, task, line.indexOf(rawTask), { group: 'task' });
  });
};

const extractPie = (source, out) => {
  const firstLine = source.trim().split('\n')[0] ?? '';
  if (/^pie\s+title\s+/i.test(firstLine)) {
    const title = firstLine.replace(/^pie\s+title\s+/i, '').trim();
    out.push(makeLabel('title', title, source.indexOf(title), title.length, { group: 'title' }));
  }
  extractQuotedStrings(source, out, 'slice', 'slice');
};

const extractMindmap = (source, out) => {
  walkLines(source, 1, (line, _i, lineOff) => {
    const trimmed = line.trim();
    let text = trimmed;
    const shapeStrip = text.match(/^(?:\(\(|\[\[|\(|\[|\{)([\s\S]+?)(?:\)\)|\]\]|\)|\]|\})$/);
    if (shapeStrip) text = shapeStrip[1].trim();
    pushLabel(out, 'branch', line, lineOff, text, line.indexOf(trimmed), { group: 'branch' });
  });
};

const extractTimeline = (source, out) => {
  walkLines(source, 1, (line, _i, lineOff) => {
    const trimmed = line.trim();
    if (/^title\s+/i.test(trimmed)) {
      pushLabel(out, 'title', line, lineOff, trimmed.replace(/^title\s+/i, ''), line.toLowerCase().indexOf('title') + 5, { group: 'title' });
      return;
    }
    if (/^section\s+/i.test(trimmed)) {
      pushLabel(out, 'section', line, lineOff, trimmed.replace(/^section\s+/i, ''), line.toLowerCase().indexOf('section') + 7, { group: 'section' });
      return;
    }
    if (!line.includes(':')) return;
    for (const part of line.split(':')) {
      const label = part.trim();
      if (label) pushLabel(out, 'event', line, lineOff, label, 0, { group: 'event' });
    }
  });
};

const extractJourney = (source, out) => {
  walkLines(source, 1, (line, _i, lineOff) => {
    const trimmed = line.trim();
    if (/^title\s+/i.test(trimmed)) {
      pushLabel(out, 'title', line, lineOff, trimmed.replace(/^title\s+/i, ''), line.toLowerCase().indexOf('title') + 5, { group: 'title' });
      return;
    }
    if (/^section\s+/i.test(trimmed)) {
      pushLabel(out, 'section', line, lineOff, trimmed.replace(/^section\s+/i, ''), line.toLowerCase().indexOf('section') + 7, { group: 'section' });
      return;
    }
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) pushLabel(out, 'task', line, lineOff, line.slice(0, colonIndex), 0, { group: 'task' });
  });
};

const extractGitGraph = (source, out) => {
  walkLines(source, 1, (line, _i, lineOff) => {
    const commitLabel = /^\s*commit\s+"([^"]+)"/i.exec(line);
    if (commitLabel) {
      out.push(makeLabel('commit', commitLabel[1], lineOff + line.indexOf('"') + 1, commitLabel[1].length, { group: 'commit' }));
      return;
    }
    for (const match of line.matchAll(/\b(?:id|tag):"([^"]+)"/g)) {
      out.push(makeLabel(match[0].startsWith('tag') ? 'tag' : 'commit', match[1], lineOff + match.index + match[0].indexOf('"') + 1, match[1].length, { group: 'commit' }));
    }
  });
};

const extractRequirement = (source, out) => {
  walkLines(source, 1, (line, _i, lineOff) => {
    const blockTitle = /^\s*(?:requirement|functionalRequirement|interfaceRequirement|performanceRequirement|physicalRequirement|designConstraint|element)\s+"([^"]+)"/i.exec(line);
    if (blockTitle) {
      out.push(makeLabel('requirement', blockTitle[1], lineOff + line.indexOf('"') + 1, blockTitle[1].length, { group: 'requirement' }));
      return;
    }
    const textField = /^\s*text:\s*"([^"]*)"/i.exec(line);
    if (textField) {
      out.push(makeLabel('text', textField[1], lineOff + line.indexOf('"') + 1, textField[1].length, { group: 'message' }));
    }
  });
};

const extractQuadrant = (source, out) => {
  walkLines(source, 1, (line, _i, lineOff) => {
    const trimmed = line.trim();
    const keywordLabel = /^(title|x-axis|y-axis|quadrant-[1-4])\s+(.+)$/i.exec(trimmed);
    if (keywordLabel) {
      for (const part of keywordLabel[2].split(/\s+-->\s+/)) {
        pushLabel(out, keywordLabel[1].toLowerCase().startsWith('quadrant') ? 'quadrant' : 'axis', line, lineOff, part, line.indexOf(keywordLabel[2]), { group: keywordLabel[1].startsWith('quadrant') ? 'quadrant' : 'axis' });
      }
      return;
    }
    const point = /^(.+?)\s*:\s*\[[^\]]+\]\s*$/.exec(trimmed);
    if (point) pushLabel(out, 'point', line, lineOff, point[1], 0, { group: 'point' });
  });
};

const extractXyChart = (source, out) => {
  extractQuotedStrings(source, out, 'label', 'axis');
};

const extractBlock = (source, out) => {
  extractBracketLabels(source, out, 'node', 'node');
};

const extractKanban = (source, out) => {
  walkLines(source, 1, (line, _i, lineOff) => {
    const bracket = /(?:[A-Za-z_][\w-]*)?\[([^\]\n]+)\]/g;
    let match;
    let foundBracket = false;
    while ((match = bracket.exec(line)) !== null) {
      foundBracket = true;
      out.push(makeLabel('task', match[1], lineOff + match.index + match[0].indexOf('[') + 1, match[1].length, { group: 'task' }));
    }
    const trimmed = line.trim();
    if (!foundBracket && trimmed && !trimmed.startsWith('@') && !trimmed.includes('{')) {
      pushLabel(out, 'column', line, lineOff, trimmed, line.indexOf(trimmed), { group: 'section' });
    }
  });
};

const extractArchitecture = (source, out) => {
  walkLines(source, 1, (line, _i, lineOff) => {
    const service = /^\s*(?:service|group|junction)\s+([A-Za-z_][\w-]*)[^[\n]*\[([^\]\n]*)\]/i.exec(line);
    if (service) {
      out.push(makeLabel('node', service[2], lineOff + line.indexOf('[') + 1, service[2].length, {
        contextLabel: service[1],
        group: 'node',
      }));
    }
    for (const match of line.matchAll(/-\[([^\]\n]+)\]-/g)) {
      out.push(makeLabel('edge', match[1], lineOff + match.index + 2, match[1].length, { group: 'edge' }));
    }
  });
};

const extractRadar = (source, out) => {
  extractQuotedStrings(source, out, 'label', 'axis');
};

const extractTreemap = (source, out) => {
  extractQuotedStrings(source, out, 'node', 'node');
};

const extractPacket = (source, out) => {
  extractQuotedStrings(source, out, 'field', 'field');
  walkLines(source, 1, (line, _i, lineOff) => {
    const field = /^\s*[^:]+:\s*([^#]+)$/i.exec(line);
    if (field && !line.includes('"')) pushLabel(out, 'field', line, lineOff, field[1], line.indexOf(':') + 1, { group: 'field' });
  });
};

const extractSankey = (source, out) => {
  const seen = new Set();
  walkLines(source, 1, (line, _i, lineOff) => {
    const parts = line.split(',');
    if (parts.length < 3) return;
    for (const raw of parts.slice(0, 2)) {
      const label = raw.trim();
      if (!label || seen.has(label)) continue;
      seen.add(label);
      out.push(makeLabel('node', label, findTextOffset(line, lineOff, label), label.length, {
        group: 'node',
        replacementMode: 'sankeyNode',
      }));
    }
  });
};

const collectSankeyNodeRanges = (source) => {
  const ranges = [];
  walkLines(source, 1, (line, _i, lineOff) => {
    const parts = line.split(',');
    if (parts.length < 3) return;
    let cursor = 0;
    for (const raw of parts.slice(0, 2)) {
      const label = raw.trim();
      if (!label) continue;
      const partOffset = line.indexOf(raw, cursor);
      const labelOffset = partOffset + raw.indexOf(label);
      ranges.push({ original: label, sourceOffset: lineOff + labelOffset, sourceLength: label.length });
      cursor = partOffset + raw.length + 1;
    }
  });
  return ranges;
};

const extractGenericQuoted = (source, out) => {
  extractQuotedStrings(source, out, 'label', 'label');
};

// ---------------------------------------------------------------------------
// Main extract
// ---------------------------------------------------------------------------

const EXTRACTORS = Object.freeze({
  architecture: extractArchitecture,
  block: extractBlock,
  c4: extractGenericQuoted,
  classDiagram: extractClass,
  erDiagram: extractER,
  flowchart: extractFlowchart,
  gantt: extractGantt,
  genericQuoted: extractGenericQuoted,
  gitGraph: extractGitGraph,
  graph: extractFlowchart,
  journey: extractJourney,
  kanban: extractKanban,
  mindmap: extractMindmap,
  packet: extractPacket,
  pie: extractPie,
  quadrantChart: extractQuadrant,
  radar: extractRadar,
  requirementDiagram: extractRequirement,
  sankey: extractSankey,
  sequenceDiagram: extractSequence,
  stateDiagram: extractState,
  'stateDiagram-v2': extractState,
  timeline: extractTimeline,
  treemap: extractTreemap,
  xychart: extractXyChart,
});

export const extractMermaidLabels = (source) => {
  resetId();
  const type = getMermaidEditDiagramType(source);
  const extractor = EXTRACTORS[type];
  if (!extractor) return [];
  const labels = [];
  extractor(source, labels);
  return labels;
};

// ---------------------------------------------------------------------------
// Replace
// ---------------------------------------------------------------------------

const addReplacementRanges = (replaceMap, ranges, editsByOriginal) => {
  for (const range of ranges) {
    const newText = editsByOriginal.get(range.original);
    if (newText !== undefined) {
      replaceMap.set(range.sourceOffset, {
        newText,
        length: range.sourceLength,
      });
    }
  }
};

export const replaceMermaidLabels = (source, edits) => {
  const labels = extractMermaidLabels(source);
  const replaceMap = new Map();
  const globalEdits = {
    className: new Map(),
    erEntity: new Map(),
    sankeyNode: new Map(),
    sequenceActor: new Map(),
    stateId: new Map(),
  };

  for (const label of labels) {
    const newText = edits.get(label.id);
    if (newText === undefined || label.readOnlyReason) continue;
    replaceMap.set(label.sourceOffset, {
      newText,
      length: label.sourceLength,
    });
    if (label.replacementMode && globalEdits[label.replacementMode]) {
      globalEdits[label.replacementMode].set(label.original, newText);
    }
  }

  if (globalEdits.erEntity.size > 0) {
    addReplacementRanges(replaceMap, collectEREntityReferenceRanges(source), globalEdits.erEntity);
  }
  if (globalEdits.sequenceActor.size > 0) {
    addReplacementRanges(replaceMap, collectSequenceActorReferenceRanges(source), globalEdits.sequenceActor);
  }
  if (globalEdits.className.size > 0) {
    addReplacementRanges(replaceMap, collectClassReferenceRanges(source), globalEdits.className);
  }
  if (globalEdits.stateId.size > 0) {
    addReplacementRanges(replaceMap, collectStateIdentifierRanges(source), globalEdits.stateId);
  }
  if (globalEdits.sankeyNode.size > 0) {
    addReplacementRanges(replaceMap, collectSankeyNodeRanges(source), globalEdits.sankeyNode);
  }

  if (replaceMap.size === 0) return source;

  const sorted = [...replaceMap.entries()].sort((a, b) => b[0] - a[0]);
  let result = source;
  for (const [offset, { newText, length }] of sorted) {
    result = result.slice(0, offset) + newText + result.slice(offset + length);
  }
  return result;
};
