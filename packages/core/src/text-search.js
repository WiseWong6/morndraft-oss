const createLineStarts = (source) => {
  const lineStarts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '\n') lineStarts.push(index + 1);
  }
  return lineStarts;
};

const getLineIndexAtOffset = (lineStarts, offset) => {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lineStarts[mid] <= offset) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return Math.max(0, high);
};

const getLineText = (source, lineStart) => {
  const lineEnd = source.indexOf('\n', lineStart);
  return source.slice(lineStart, lineEnd === -1 ? source.length : lineEnd).replace(/\r$/, '');
};

export const findTextSearchMatches = (source, query, { caseSensitive = false, maxMatches = 100 } = {}) => {
  const text = String(source ?? '');
  const needle = String(query ?? '').trim();
  if (!text || !needle || maxMatches < 1) return [];

  const haystack = caseSensitive ? text : text.toLocaleLowerCase();
  const normalizedNeedle = caseSensitive ? needle : needle.toLocaleLowerCase();
  const lineStarts = createLineStarts(text);
  const matches = [];
  let offset = 0;

  while (matches.length < maxMatches) {
    const index = haystack.indexOf(normalizedNeedle, offset);
    if (index === -1) break;

    const lineIndex = getLineIndexAtOffset(lineStarts, index);
    const lineStart = lineStarts[lineIndex];
    matches.push({
      id: `match-${matches.length + 1}-${index}`,
      line: lineIndex + 1,
      column: index - lineStart + 1,
      start: index,
      end: index + needle.length,
      lineText: getLineText(text, lineStart),
    });

    offset = index + Math.max(1, normalizedNeedle.length);
  }

  return matches;
};
