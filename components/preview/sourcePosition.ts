export type SourcePositionRange = {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
};

export type SourcePositionMatch = {
  line: number;
  column: number;
};

export type SourceLineMap = readonly number[] | null | undefined;

const toPositiveNumber = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

const mapSourceLine = (line: number, lineMap?: SourceLineMap) =>
  lineMap?.[line - 1] ?? line;

export const mapSourcePositionRange = (
  range: SourcePositionRange | null,
  lineMap?: SourceLineMap,
): SourcePositionRange | null => {
  if (!range) return null;
  return {
    ...range,
    startLine: mapSourceLine(range.startLine, lineMap),
    endLine: mapSourceLine(range.endLine, lineMap),
  };
};

export const getNodeSourceRange = (node: any, lineMap?: SourceLineMap): SourcePositionRange | null => {
  const startLine = toPositiveNumber(node?.position?.start?.line);
  const startColumn = toPositiveNumber(node?.position?.start?.column);
  const endLine = toPositiveNumber(node?.position?.end?.line);
  const endColumn = toPositiveNumber(node?.position?.end?.column);

  if (!startLine || !startColumn || !endLine || !endColumn) return null;

  return mapSourcePositionRange({
    startLine,
    startColumn,
    endLine,
    endColumn,
  }, lineMap);
};

const getCodeBlockEndColumn = (node: any, code?: string): number => {
  const source = typeof code === 'string'
    ? code
    : typeof node?.value === 'string'
      ? node.value
      : null;
  if (source === null) return toPositiveNumber(node?.position?.end?.column) ?? 1;
  const lines = source.split(/\r\n|\r|\n/);
  return (lines[lines.length - 1] ?? '').length + 1;
};

export const getCodeBlockContentSourceRange = (
  node: any,
  lineMap?: SourceLineMap,
  code?: string,
): SourcePositionRange | null => {
  const range = getNodeSourceRange(node);
  if (!range || range.endLine <= range.startLine) return null;

  return mapSourcePositionRange({
    startLine: range.startLine + 1,
    startColumn: 1,
    endLine: Math.max(range.startLine + 1, range.endLine - 1),
    endColumn: getCodeBlockEndColumn(node, code),
  }, lineMap);
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const hasClosedCodeFenceSourceRange = (
  source: string | null | undefined,
  node: any,
  lineMap?: SourceLineMap,
) => {
  if (typeof source !== 'string') return false;
  const range = getNodeSourceRange(node, lineMap);
  if (!range || range.endLine <= range.startLine) return false;
  const lines = source.split(/\r?\n/);
  const openingLine = lines[range.startLine - 1] ?? '';
  const closingLine = lines[range.endLine - 1] ?? '';
  const openingMatch = openingLine.match(/^\s*(`{3,}|~{3,})/);
  if (!openingMatch) return false;
  const marker = openingMatch[1];
  const markerChar = marker[0];
  const markerLength = marker.length;
  const closePattern = new RegExp(`^\\s*${escapeRegExp(markerChar)}{${markerLength},}\\s*$`);
  return closePattern.test(closingLine);
};

export const sourcePositionAttributes = (
  range: SourcePositionRange | null,
  lineMap?: SourceLineMap,
) => {
  const mappedRange = mapSourcePositionRange(range, lineMap);
  if (!mappedRange) return {};
  return {
    'data-source-start-line': String(mappedRange.startLine),
    'data-source-start-column': String(mappedRange.startColumn),
    'data-source-end-line': String(mappedRange.endLine),
    'data-source-end-column': String(mappedRange.endColumn),
  };
};

export const sourceRangeContainsMatch = (
  range: SourcePositionRange,
  match: SourcePositionMatch,
) => {
  if (match.line < range.startLine || match.line > range.endLine) return false;
  if (match.line === range.startLine && match.column < range.startColumn) return false;
  if (match.line === range.endLine && match.column > range.endColumn) return false;
  return true;
};
