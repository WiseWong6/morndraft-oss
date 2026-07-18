const TOKEN_LABELS = {
  AMP: '连接符 &',
  BRKT: '方括号',
  COLON: '冒号',
  COMMA: '逗号',
  DEFAULT: '默认分支或默认值',
  DOWN: '向下连接符',
  EOF: '内容结束',
  MINUS: '短横线或箭头的一部分',
  NODE_STRING: '节点名或节点文本',
  NUM: '数字',
  PIPE: '竖线分隔符',
  TESTSTR: '节点或文本内容',
  UNICODE_TEXT: '普通文本',
};

const normalizeToken = (token) => String(token ?? '').replace(/^'|'$/g, '').trim();

const getTokenLabel = (token) => {
  const normalized = normalizeToken(token);
  return TOKEN_LABELS[normalized] ?? normalized;
};

const getErrorMessage = (error) => (error instanceof Error ? error.message : String(error ?? ''));
const getErrorCode = (error) => error && typeof error === 'object' ? error.code : null;

const applyLineOffset = (line, lineOffset = 0) => line + lineOffset;

const formatDisplayRawMessage = (message, lineOffset = 0) =>
  lineOffset
    ? message.replace(/\bline\s+(\d+)\b/gi, (match, line) => {
      const prefix = match.toLowerCase().startsWith('line') ? 'line' : 'Line';
      return `${prefix} ${applyLineOffset(Number.parseInt(line, 10), lineOffset)}`;
    })
    : message;

const extractParserLine = (message) => {
  const match = message.match(/\bline\s+(\d+)\b/i);
  return match ? Number.parseInt(match[1], 10) : null;
};

const getExpectedTokens = (error, message) => {
  const hashExpected = error?.hash?.expected;
  if (Array.isArray(hashExpected) && hashExpected.length > 0) {
    return hashExpected.map(normalizeToken).filter(Boolean);
  }

  const match = message.match(/Expecting\s+([\s\S]*?),\s+got\s+'?([A-Z_]+)'?/i);
  if (!match) return [];
  return match[1]
    .split(',')
    .map(normalizeToken)
    .filter(Boolean);
};

const getReceivedToken = (error, message) => {
  const hashToken = normalizeToken(error?.hash?.token);
  if (hashToken) return hashToken;
  return normalizeToken(message.match(/got\s+'?([A-Z_]+)'?/i)?.[1]);
};

const summarizeExpectedTokens = (tokens) => {
  const labels = Array.from(new Set(tokens.map(getTokenLabel).filter(Boolean)));
  if (labels.length === 0) return '';
  return labels.join('、');
};

const formatLineHint = (line) => (
  line ? `位置：第 ${line} 行附近。` : '位置：图表内容附近。'
);

export const formatMermaidErrorMessage = (error, options = {}) => {
  const rawMessage = getErrorMessage(error);
  const locale = options.locale ?? 'zh';
  const lineOffset = Number.isFinite(options.lineOffset) ? options.lineOffset : 0;
  const displayRawMessage = formatDisplayRawMessage(rawMessage, lineOffset);

  if (locale !== 'zh') {
    return displayRawMessage || 'Mermaid syntax error';
  }

  if (getErrorCode(error) === 'MERMAID_RENDER_TIMEOUT') {
    return [
      'Mermaid 图表渲染超时，没有在限定时间内完成。',
      '位置：图表内容附近。',
      '建议检查：图表是否写完整，尤其是箭头后的节点、括号、引号和分隔符是否缺失；如果图表很大，也可以先拆成更小的几段预览。',
      '当前没有可靠的自动修复，请在源码中修改后再预览。',
    ].join('\n\n');
  }

  const expectedTokens = getExpectedTokens(error, displayRawMessage);
  const receivedToken = getReceivedToken(error, displayRawMessage);
  const expectedSummary = summarizeExpectedTokens(expectedTokens);
  const receivedLabel = receivedToken ? getTokenLabel(receivedToken) : '';
  const displayLine = extractParserLine(rawMessage);
  const locationHint = formatLineHint(displayLine ? applyLineOffset(displayLine, lineOffset) : null);

  if (expectedTokens.length > 0 || receivedToken) {
    const explanation = receivedToken === 'EOF'
      ? '图表语法在这里提前结束了：Mermaid 还在等待节点名、连接符、文本或分隔符，但内容已经结束。通常是箭头后面少了节点，或某一行没有写完整。'
      : `Mermaid 读到的是「${receivedLabel || receivedToken}」，但这里更像是需要「${expectedSummary || '节点、连接符或文本'}」。请检查这一行附近的箭头、节点名称和括号是否完整。`;
    const expectedLine = expectedSummary
      ? `建议检查：这里通常需要 ${expectedSummary}。`
      : '';
    return [explanation, locationHint, expectedLine, '当前没有可靠的自动修复，请在源码中补全这一行后再预览。'].filter(Boolean).join('\n\n');
  }

  return [
    'Mermaid 图表没有渲染成功。',
    locationHint,
    '建议检查：图表类型、箭头连接、节点名称和括号是否完整。',
    '当前没有可靠的自动修复，请在源码中修改后再预览。',
  ].join('\n\n');
};

export const getMermaidErrorDisplayLine = (error, options = {}) => {
  const rawMessage = getErrorMessage(error);
  const line = extractParserLine(rawMessage);
  if (!line) return null;
  const lineOffset = Number.isFinite(options.lineOffset) ? options.lineOffset : 0;
  return applyLineOffset(line, lineOffset);
};

export const __getMermaidTokenLabelForTests = getTokenLabel;
