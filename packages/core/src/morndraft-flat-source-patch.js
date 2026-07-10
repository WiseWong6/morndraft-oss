import JSON5 from 'json5';

const createFailure = (reason, extra = {}) => ({ ok: false, reason, ...extra });

const isWhitespace = (char) => /\s/.test(char);
const isIdentifierStart = (char) => /[$_A-Za-z]/.test(char);
const isIdentifierPart = (char) => /[$_A-Za-z0-9-]/.test(char);
const SIMPLE_KEY_RE = /^[A-Za-z_$][A-Za-z0-9_$-]*$/;

const appendObjectPath = (path, key) =>
  SIMPLE_KEY_RE.test(key)
    ? `${path}.${key}`
    : `${path}[${JSON.stringify(key)}]`;

const skipTrivia = (source, index) => {
  let cursor = index;
  while (cursor < source.length) {
    const char = source[cursor];
    if (isWhitespace(char)) {
      cursor += 1;
      continue;
    }
    if (char === '/' && source[cursor + 1] === '/') {
      cursor += 2;
      while (cursor < source.length && source[cursor] !== '\n' && source[cursor] !== '\r') cursor += 1;
      continue;
    }
    if (char === '/' && source[cursor + 1] === '*') {
      cursor += 2;
      while (cursor < source.length && !(source[cursor] === '*' && source[cursor + 1] === '/')) cursor += 1;
      cursor = Math.min(source.length, cursor + 2);
      continue;
    }
    break;
  }
  return cursor;
};

const readIdentifier = (source, index) => {
  if (!isIdentifierStart(source[index])) return null;
  let cursor = index + 1;
  while (cursor < source.length && isIdentifierPart(source[cursor])) cursor += 1;
  return {
    end: cursor,
    raw: source.slice(index, cursor),
    start: index,
    type: 'identifier',
    value: source.slice(index, cursor),
  };
};

const readString = (source, index) => {
  const quote = source[index];
  if (quote !== '"' && quote !== "'") return null;
  let cursor = index + 1;
  while (cursor < source.length) {
    const char = source[cursor];
    if (char === '\\') {
      cursor += 2;
      continue;
    }
    if (char === quote) {
      const raw = source.slice(index, cursor + 1);
      let value = '';
      try {
        value = String(JSON5.parse(raw));
      } catch {
        value = source.slice(index + 1, cursor);
      }
      return {
        end: cursor + 1,
        quote,
        raw,
        start: index,
        type: 'string',
        value,
        valueEnd: cursor,
        valueStart: index + 1,
      };
    }
    cursor += 1;
  }
  return null;
};

const readObjectKey = (source, index) =>
  readString(source, index) ?? readIdentifier(source, index);

const skipBareValue = (source, index) => {
  let cursor = index;
  while (cursor < source.length && !/[,\]}]/.test(source[cursor])) cursor += 1;
  return cursor;
};

const parseValue = (source, index, path, entries) => {
  const start = skipTrivia(source, index);
  const char = source[start];
  if (char === '{') return parseObject(source, start, path, entries);
  if (char === '[') return parseArray(source, start, path, entries);

  const stringToken = readString(source, start);
  if (stringToken) {
    if (path) {
      entries[path] = {
        path,
        quote: stringToken.quote,
        range: {
          end: stringToken.valueEnd,
          start: stringToken.valueStart,
        },
        value: stringToken.value,
      };
    }
    return stringToken.end;
  }

  return skipBareValue(source, start);
};

function parseObject(source, index, path, entries) {
  let cursor = index + 1;
  while (cursor < source.length) {
    cursor = skipTrivia(source, cursor);
    if (source[cursor] === '}') return cursor + 1;
    const keyToken = readObjectKey(source, cursor);
    if (!keyToken) return skipBareValue(source, cursor);
    cursor = skipTrivia(source, keyToken.end);
    if (source[cursor] !== ':') return skipBareValue(source, cursor);
    cursor = parseValue(source, cursor + 1, appendObjectPath(path, keyToken.value), entries);
    cursor = skipTrivia(source, cursor);
    if (source[cursor] === ',') {
      cursor += 1;
      continue;
    }
    if (source[cursor] === '}') return cursor + 1;
  }
  return cursor;
}

function parseArray(source, index, path, entries) {
  const arrayEntry = path
    ? {
        path,
        type: 'array',
        range: { start: index, end: index + 1 },
        items: [],
        closeStart: null,
      }
    : null;
  if (arrayEntry) entries[path] = arrayEntry;
  let cursor = index + 1;
  let itemIndex = 0;
  while (cursor < source.length) {
    cursor = skipTrivia(source, cursor);
    if (source[cursor] === ']') {
      if (arrayEntry) {
        arrayEntry.closeStart = cursor;
        arrayEntry.range.end = cursor + 1;
      }
      return cursor + 1;
    }
    const itemPath = `${path}[${itemIndex}]`;
    const itemStart = cursor;
    cursor = parseValue(source, cursor, itemPath, entries);
    if (arrayEntry) {
      arrayEntry.items.push({
        path: itemPath,
        range: { start: itemStart, end: cursor },
        raw: source.slice(itemStart, cursor),
      });
    }
    itemIndex += 1;
    cursor = skipTrivia(source, cursor);
    if (source[cursor] === ',') {
      cursor += 1;
      continue;
    }
    if (source[cursor] === ']') {
      if (arrayEntry) {
        arrayEntry.closeStart = cursor;
        arrayEntry.range.end = cursor + 1;
      }
      return cursor + 1;
    }
  }
  return cursor;
}

const escapeStringContent = (value, quote) => {
  const escaped = JSON.stringify(String(value)).slice(1, -1);
  return quote === "'" ? escaped.replace(/'/g, "\\'") : escaped;
};

const getLineStart = (source, index) => {
  const lineStart = source.lastIndexOf('\n', Math.max(0, index - 1));
  return lineStart < 0 ? 0 : lineStart + 1;
};

const getLineIndent = (source, index) => {
  const start = getLineStart(source, index);
  const match = source.slice(start, index).match(/^[ \t]*/);
  return match?.[0] ?? '';
};

const isRecord = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const formatInlineValue = (value, quoteKeys = false) => {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    return `[${value.map((item) => formatInlineValue(item, quoteKeys)).join(', ')}]`;
  }
  if (isRecord(value)) {
    return formatInlineObject(value, quoteKeys);
  }
  return JSON.stringify(String(value ?? ''));
};

function formatInlineObject(value, quoteKeys = false) {
  const fields = Object.entries(value)
    .filter(([, fieldValue]) => fieldValue !== undefined)
    .map(([key, fieldValue]) => {
      const keySource = quoteKeys || !SIMPLE_KEY_RE.test(key) ? JSON.stringify(key) : key;
      return `${keySource}: ${formatInlineValue(fieldValue, quoteKeys)}`;
    });
  return `{ ${fields.join(', ')} }`;
}

const inferQuotedKeys = (arrayEntry) =>
  arrayEntry?.items?.some((item) => /"[$_A-Za-z][$_A-Za-z0-9-]*"\s*:/.test(item.raw));

const getArrayEntry = (entries, path) => {
  const entry = entries[path];
  if (!entry || entry.type !== 'array' || !Array.isArray(entry.items)) return null;
  if (!Number.isFinite(entry.closeStart)) return null;
  return entry;
};

const replaceRange = (source, start, end, replacement) =>
  `${source.slice(0, start)}${replacement}${source.slice(end)}`;

const getCommaIndexAfterTrivia = (source, start, end) => {
  const cursor = skipTrivia(source, start);
  return cursor < end && source[cursor] === ',' ? cursor : -1;
};

const getTrailingCommaRemovalEnd = (source, itemEnd, closeStart) => {
  const commaIndex = getCommaIndexAfterTrivia(source, itemEnd, closeStart);
  if (commaIndex < 0) return null;
  let end = commaIndex + 1;
  while (end < closeStart && /[ \t]/.test(source[end])) end += 1;
  return end;
};

export const createMornDraftFlatSourceEditMap = (source) => {
  const text = String(source ?? '');
  const entries = {};
  parseValue(text, 0, '$', entries);
  return entries;
};

export const patchMornDraftFlatSourceValues = (source, edits) => {
  const text = String(source ?? '');
  const entries = createMornDraftFlatSourceEditMap(text);
  const normalizedEdits = new Map();

  for (const edit of edits ?? []) {
    if (!edit || typeof edit.path !== 'string') continue;
    normalizedEdits.set(edit.path, String(edit.value ?? ''));
  }

  const replacements = [];
  for (const [path, value] of normalizedEdits) {
    const entry = entries[path];
    if (!entry) return createFailure('missing_path', { path });
    if (entry.value === value) continue;
    replacements.push({
      end: entry.range.end,
      replacement: escapeStringContent(value, entry.quote),
      start: entry.range.start,
    });
  }

  if (!replacements.length) return { ok: true, source: text, changed: false };

  const ordered = replacements.sort((left, right) => right.start - left.start);
  let nextSource = text;
  for (const replacement of ordered) {
    nextSource = `${nextSource.slice(0, replacement.start)}${replacement.replacement}${nextSource.slice(replacement.end)}`;
  }
  return { ok: true, source: nextSource, changed: true };
};

export const patchMornDraftFlatSourceItems = (source, operation = {}) => {
  const text = String(source ?? '');
  const entries = createMornDraftFlatSourceEditMap(text);
  const itemsEntry = getArrayEntry(entries, '$.items');
  if (!itemsEntry) return createFailure('missing_items_array');

  const action = operation.action;
  const isMultiline = text.slice(itemsEntry.range.start, itemsEntry.range.end).includes('\n');
  const quotedKeys = inferQuotedKeys(itemsEntry);

  if (action === 'append') {
    if (!isRecord(operation.item)) return createFailure('invalid_item');
    const itemSource = formatInlineObject(operation.item, quotedKeys);
    if (!isMultiline) {
      if (itemsEntry.items.length) {
        const lastItem = itemsEntry.items[itemsEntry.items.length - 1];
        const trailingCommaEnd = getTrailingCommaRemovalEnd(text, lastItem.range.end, itemsEntry.closeStart);
        if (trailingCommaEnd !== null) {
          return {
            ok: true,
            source: replaceRange(text, lastItem.range.end, trailingCommaEnd, `, ${itemSource},`),
            changed: true,
          };
        }
      }
      const insertion = `${itemsEntry.items.length ? ', ' : ''}${itemSource}`;
      return {
        ok: true,
        source: replaceRange(text, itemsEntry.closeStart, itemsEntry.closeStart, insertion),
        changed: true,
      };
    }

    const closingIndent = getLineIndent(text, itemsEntry.closeStart);
    const itemIndent = itemsEntry.items.length
      ? getLineIndent(text, itemsEntry.items[itemsEntry.items.length - 1].range.start)
      : `${closingIndent}  `;

    if (!itemsEntry.items.length) {
      const insertion = `\n${itemIndent}${itemSource}\n${closingIndent}`;
      return {
        ok: true,
        source: replaceRange(text, itemsEntry.closeStart, itemsEntry.closeStart, insertion),
        changed: true,
      };
    }

    const lastItem = itemsEntry.items[itemsEntry.items.length - 1];
    const closingLineStart = getLineStart(text, itemsEntry.closeStart);
    const betweenLastAndClose = text.slice(lastItem.range.end, closingLineStart);
    const hasTrailingComma = betweenLastAndClose.trimStart().startsWith(',');
    const separator = hasTrailingComma ? betweenLastAndClose : `,${betweenLastAndClose}`;
    const newItemSuffix = hasTrailingComma ? ',' : '';
    return {
      ok: true,
      source: replaceRange(
        text,
        lastItem.range.end,
        closingLineStart,
        `${separator}${itemIndent}${itemSource}${newItemSuffix}\n`,
      ),
      changed: true,
    };
  }

  if (action === 'prepend') {
    if (!isRecord(operation.item)) return createFailure('invalid_item');
    const itemSource = formatInlineObject(operation.item, quotedKeys);
    if (!isMultiline) {
      if (!itemsEntry.items.length) {
        return {
          ok: true,
          source: replaceRange(text, itemsEntry.closeStart, itemsEntry.closeStart, itemSource),
          changed: true,
        };
      }
      const firstItem = itemsEntry.items[0];
      return {
        ok: true,
        source: replaceRange(text, firstItem.range.start, firstItem.range.start, `${itemSource}, `),
        changed: true,
      };
    }

    const closingIndent = getLineIndent(text, itemsEntry.closeStart);
    const itemIndent = itemsEntry.items.length
      ? getLineIndent(text, itemsEntry.items[0].range.start)
      : `${closingIndent}  `;

    if (!itemsEntry.items.length) {
      const insertion = `\n${itemIndent}${itemSource}\n${closingIndent}`;
      return {
        ok: true,
        source: replaceRange(text, itemsEntry.closeStart, itemsEntry.closeStart, insertion),
        changed: true,
      };
    }

    const firstItem = itemsEntry.items[0];
    const firstLineStart = getLineStart(text, firstItem.range.start);
    return {
      ok: true,
      source: replaceRange(text, firstLineStart, firstLineStart, `${itemIndent}${itemSource},\n`),
      changed: true,
    };
  }

  if (action === 'remove-last') {
    if (!itemsEntry.items.length) return createFailure('empty_items_array');
    const lastItem = itemsEntry.items[itemsEntry.items.length - 1];
    const trailingCommaEnd = getTrailingCommaRemovalEnd(text, lastItem.range.end, itemsEntry.closeStart);
    if (!isMultiline) {
      if (itemsEntry.items.length === 1) {
        return {
          ok: true,
          source: replaceRange(text, lastItem.range.start, trailingCommaEnd ?? lastItem.range.end, ''),
          changed: true,
        };
      }
      const previousItem = itemsEntry.items[itemsEntry.items.length - 2];
      const separatorCommaIndex = getCommaIndexAfterTrivia(
        text,
        previousItem.range.end,
        lastItem.range.start,
      );
      const start = trailingCommaEnd
        ? lastItem.range.start
        : separatorCommaIndex >= 0
          ? separatorCommaIndex
          : lastItem.range.start;
      return {
        ok: true,
        source: replaceRange(text, start, trailingCommaEnd ?? lastItem.range.end, ''),
        changed: true,
      };
    }

    const start = getLineStart(text, lastItem.range.start);
    const end = getLineStart(text, itemsEntry.closeStart);
    let nextSource = replaceRange(text, start, end, '');
    if (!trailingCommaEnd && itemsEntry.items.length > 1) {
      const previousItem = itemsEntry.items[itemsEntry.items.length - 2];
      const separatorCommaIndex = getCommaIndexAfterTrivia(
        text,
        previousItem.range.end,
        lastItem.range.start,
      );
      if (separatorCommaIndex >= 0) {
        nextSource = replaceRange(nextSource, separatorCommaIndex, separatorCommaIndex + 1, '');
      }
    }
    return {
      ok: true,
      source: nextSource,
      changed: true,
    };
  }

  if (action === 'remove-first') {
    if (!itemsEntry.items.length) return createFailure('empty_items_array');
    const firstItem = itemsEntry.items[0];
    const trailingCommaEnd = getTrailingCommaRemovalEnd(text, firstItem.range.end, itemsEntry.closeStart);
    if (!isMultiline) {
      return {
        ok: true,
        source: replaceRange(text, firstItem.range.start, trailingCommaEnd ?? firstItem.range.end, ''),
        changed: true,
      };
    }

    const start = getLineStart(text, firstItem.range.start);
    const secondItem = itemsEntry.items[1];
    const end = secondItem ? getLineStart(text, secondItem.range.start) : getLineStart(text, itemsEntry.closeStart);
    return {
      ok: true,
      source: replaceRange(text, start, end, ''),
      changed: true,
    };
  }

  return createFailure('unsupported_action', { action });
};
