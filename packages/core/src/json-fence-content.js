import JSON5 from 'json5';

export const normalizeJsonStringNewlines = (source) => {
  const input = String(source ?? '');
  let output = '';
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  let changed = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (lineComment) {
      output += char;
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      output += char;
      if (char === '*' && next === '/') {
        output += next;
        index += 1;
        blockComment = false;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        output += char;
        escaped = false;
      } else if (char === '\\') {
        output += char;
        escaped = true;
      } else if (char === quote) {
        output += char;
        quote = null;
      } else if (char === '\r' || char === '\n') {
        output += '\\n';
        changed = true;
        if (char === '\r' && next === '\n') index += 1;
      } else {
        output += char;
      }
      continue;
    }

    if (char === '/' && next === '/') {
      output += char + next;
      index += 1;
      lineComment = true;
      continue;
    }
    if (char === '/' && next === '*') {
      output += char + next;
      index += 1;
      blockComment = true;
      continue;
    }
    if (char === '"' || char === "'") {
      output += char;
      quote = char;
      continue;
    }
    output += char;
  }

  return { changed, source: output };
};

const parseJsonValue = (source, parseMode = 'json') => {
  const normalized = normalizeJsonStringNewlines(source);
  const parsed = parseMode === 'json5'
    ? JSON5.parse(normalized.source)
    : JSON.parse(normalized.source);
  const formatted = JSON.stringify(parsed, null, 2);
  if (typeof formatted !== 'string') throw new Error('JSON value is not serializable');
  return {
    formatted,
    normalizedSource: normalized.source,
    normalizedChanged: normalized.changed,
    value: JSON.parse(formatted),
  };
};

export const classifyJsonFenceContent = (source, options = {}) => {
  const raw = String(source ?? '');
  const parseMode = options?.parseMode === 'json5' ? 'json5' : 'json';

  try {
    const parsed = parseJsonValue(raw, parseMode);
    return { kind: 'single', source: raw, ...parsed };
  } catch (error) {
    return { kind: 'invalid', source: raw, error };
  }
};
