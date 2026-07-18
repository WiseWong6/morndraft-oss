import {
  extractInvalidJsonCharacter,
  extractJsonErrorLocation,
  getActionableJsonErrorLocation,
  getJsonLine,
  getPreviousSignificantJsonChar,
  isJsonValueTerminator,
} from '../packages/core/src/json-error-location.js';

const JSON_VALUE_HINT = '字符串、数字、对象、数组、true、false 或 null';

const applyLineOffset = (line, lineOffset = 0) => line + lineOffset;

const getErrorMessage = (error) => (error instanceof Error ? error.message : String(error ?? ''));

const formatDisplayLocation = (location, lineOffset = 0) =>
  location
    ? `第 ${applyLineOffset(location.line, lineOffset)} 行附近`
    : 'JSON 内容附近';

const formatDisplayRawMessage = (message, lineOffset = 0) =>
  lineOffset
    ? message.replace(/\bat\s+(\d+):(\d+)\b/g, (_match, line, column) => (
      `at ${applyLineOffset(Number.parseInt(line, 10), lineOffset)}:${column}`
    ))
    : message;

const inferChineseReason = ({ source, message, location }) => {
  const invalidCharacter = extractInvalidJsonCharacter(message);
  const previousSignificantChar = getPreviousSignificantJsonChar(source, location);

  if (
    /invalid character/i.test(message) &&
    ['{', '[', '"', "'"].includes(invalidCharacter) &&
    isJsonValueTerminator(previousSignificantChar)
  ) {
    return '相邻 JSON 条目之间可能缺少逗号：请检查上一行末尾是否需要补一个逗号。';
  }

  if ((invalidCharacter === '}' || invalidCharacter === ']') && previousSignificantChar === ':') {
    return `JSON 值不完整：冒号后面缺少${JSON_VALUE_HINT}。`;
  }

  if ((invalidCharacter === '}' || invalidCharacter === ']') && previousSignificantChar === ',') {
    return `JSON 条目不完整：逗号后面还需要继续写一个值，或者删除这个多余的逗号。`;
  }

  if (invalidCharacter === ',') {
    return `JSON 列表或对象里出现了多余的逗号：请检查前后是否缺少值。`;
  }

  if (/unterminated string/i.test(message)) {
    return '字符串没有正确结束：请检查引号是否成对出现。';
  }

  if (/invalid end of input/i.test(message)) {
    return 'JSON 内容提前结束了：请检查字符串引号、对象或数组括号是否已经补全。';
  }

  if (/invalid character/i.test(message)) {
    return `这里出现了 JSON5 无法识别的字符${invalidCharacter ? `「${invalidCharacter}」` : ''}：请检查键、值、逗号和括号是否完整。`;
  }

  return 'JSON 格式不完整或不合法：请检查键名、冒号、逗号、括号和值是否完整。';
};

export const formatJsonErrorMessage = (error, source, options = {}) => {
  const rawMessage = getErrorMessage(error);
  const locale = options.locale ?? 'zh';
  const lineOffset = Number.isFinite(options.lineOffset) ? options.lineOffset : 0;
  const includeSourceHint = options.includeSourceHint === true;
  const showLocationInBody = options.showLocationInBody !== false;
  const repairHint = options.repairHint === false
    ? ''
    : typeof options.repairHint === 'string'
      ? options.repairHint
      : '当前没有可靠的自动修复，请在源码中修改后再预览。';
  const displayRawMessage = formatDisplayRawMessage(rawMessage, lineOffset);

  if (locale !== 'zh') {
    return displayRawMessage || 'Invalid JSON';
  }

  const location = extractJsonErrorLocation(rawMessage);
  const actionableLocation = getActionableJsonErrorLocation(source, rawMessage) ?? location;
  const reason = inferChineseReason({ source, message: rawMessage, location });
  const locationText = formatDisplayLocation(actionableLocation, lineOffset);
  const line = actionableLocation ? getJsonLine(source, actionableLocation.line).trim() : '';
  const sourceHint = includeSourceHint && line ? `附近源码：${line}` : '';
  const parserHint = showLocationInBody && location && actionableLocation && actionableLocation.line !== location.line
    ? `解析器报错在第 ${applyLineOffset(location.line, lineOffset)} 行；通常需要先修改第 ${applyLineOffset(actionableLocation.line, lineOffset)} 行末尾。`
    : '';
  const summary = showLocationInBody
    ? `当前 JSON 不合法：${locationText}的格式有问题。${reason}`
    : reason;

  return [
    summary,
    parserHint,
    sourceHint,
    repairHint,
  ].filter(Boolean).join('\n\n');
};

export const getJsonErrorDisplayLine = (error, options = {}) => {
  const rawMessage = getErrorMessage(error);
  const lineOffset = Number.isFinite(options.lineOffset) ? options.lineOffset : 0;
  const source = typeof options.source === 'string' ? options.source : '';
  const location = extractJsonErrorLocation(rawMessage);
  const actionableLocation = getActionableJsonErrorLocation(source, rawMessage);
  if (!location && !actionableLocation) return null;
  return applyLineOffset(actionableLocation?.line ?? location.line, lineOffset);
};

export const __getJsonErrorLocationForTests = extractJsonErrorLocation;
