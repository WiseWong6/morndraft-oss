const getErrorMessage = (error) => (error instanceof Error ? error.message : String(error ?? ''));

const offsetToJsonLocation = (source, offset) => {
  const before = String(source ?? '').slice(0, Math.max(0, offset));
  const lines = before.split(/\r?\n/);
  return {
    line: lines.length,
    column: (lines[lines.length - 1] ?? '').length + 1,
  };
};

export const extractJsonErrorLocation = (errorOrMessage) => {
  const message = getErrorMessage(errorOrMessage);
  const match = message.match(/\bat\s+(\d+):(\d+)\b/i) ?? message.match(/\bline\s+(\d+)\D+column\s+(\d+)/i);
  if (!match) return null;
  return {
    line: Number.parseInt(match[1], 10),
    column: Number.parseInt(match[2], 10),
  };
};

const normalizeInvalidJsonCharacter = (value) => {
  switch (value) {
    case '\\"':
      return '"';
    case "\\'":
      return "'";
    case '\\n':
      return '\n';
    case '\\r':
      return '\r';
    case '\\t':
      return '\t';
    default:
      return value;
  }
};

export const extractInvalidJsonCharacter = (message) => {
  const value = String(message ?? '').match(/invalid character '([^']+)'/i)?.[1] ?? '';
  return normalizeInvalidJsonCharacter(value);
};

export const getJsonLine = (source, lineNumber) => String(source ?? '').split(/\r?\n/)[lineNumber - 1] ?? '';

const getPreviousSignificantLine = (source, lineNumber) => {
  const lines = String(source ?? '').split(/\r?\n/);
  for (let index = Math.min(lines.length, lineNumber - 1) - 1; index >= 0; index -= 1) {
    if (/\S/.test(lines[index] ?? '')) return index + 1;
  }
  return null;
};

const getUnexpectedJsonTokenLocation = (source, message) => {
  const token = normalizeInvalidJsonCharacter(String(message ?? '').match(/Unexpected token '([^']+)'/i)?.[1] ?? '');
  if (!token) return null;
  const offset = String(source ?? '').indexOf(token);
  if (offset < 0) return null;
  return offsetToJsonLocation(source, offset);
};

export const getPreviousSignificantJsonChar = (source, location) => {
  if (!location) return '';
  const lines = String(source ?? '').split(/\r?\n/);
  const beforeLines = lines.slice(0, location.line - 1);
  const currentPrefix = (lines[location.line - 1] ?? '').slice(0, Math.max(0, location.column - 1));
  return [...beforeLines, currentPrefix].join('\n').match(/\S(?=\s*$)/)?.[0] ?? '';
};

export const isJsonValueTerminator = (value) =>
  ['}', ']', '"', "'"].includes(value) || /[0-9eElL]/.test(value);

export const getActionableJsonErrorLocation = (source, errorOrMessage) => {
  const message = getErrorMessage(errorOrMessage);
  const parserLocation = extractJsonErrorLocation(message);
  if (!parserLocation) return getUnexpectedJsonTokenLocation(source, message);

  const invalidCharacter = extractInvalidJsonCharacter(message);
  const previousSignificantChar = getPreviousSignificantJsonChar(source, parserLocation);
  if (
    /^Expected ',' or '[}\]]' after /i.test(message) &&
    isJsonValueTerminator(previousSignificantChar) &&
    !/\S/.test(getJsonLine(source, parserLocation.line).slice(0, Math.max(0, parserLocation.column - 1)))
  ) {
    const previousLine = getPreviousSignificantLine(source, parserLocation.line);
    if (previousLine && previousLine < parserLocation.line) {
      return {
        line: previousLine,
        column: Math.max(1, getJsonLine(source, previousLine).length + 1),
        parserLine: parserLocation.line,
        parserColumn: parserLocation.column,
      };
    }
  }
  if (
    /invalid character/i.test(message) &&
    ['{', '[', '"', "'"].includes(invalidCharacter) &&
    isJsonValueTerminator(previousSignificantChar)
  ) {
    const previousLine = getPreviousSignificantLine(source, parserLocation.line);
    if (previousLine && previousLine < parserLocation.line) {
      return {
        line: previousLine,
        column: Math.max(1, getJsonLine(source, previousLine).length + 1),
        parserLine: parserLocation.line,
        parserColumn: parserLocation.column,
      };
    }
  }

  return parserLocation;
};
