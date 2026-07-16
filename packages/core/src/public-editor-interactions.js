const clampSourceOffset = (source, offset) => (
  Number.isFinite(offset)
    ? Math.min(source.length, Math.max(0, Math.trunc(offset)))
    : 0
);

export const getPublicSourceLineSelectionRange = (source, offset) => {
  const anchor = clampSourceOffset(source, offset);
  const { end, start } = getPublicSourcePhysicalLineBounds(source, anchor, anchor);
  return { start, end };
};

export const getPublicSourcePhysicalLineBounds = (source, rangeStart, rangeEnd = rangeStart) => {
  const startAnchor = clampSourceOffset(source, rangeStart);
  const endAnchor = clampSourceOffset(source, rangeEnd);
  let start = startAnchor;
  while (start > 0 && source[start - 1] !== '\n' && source[start - 1] !== '\r') start -= 1;
  let end = Math.max(start, endAnchor);
  while (end < source.length && source[end] !== '\n' && source[end] !== '\r') end += 1;
  return { start, end };
};

export const shouldHandlePublicPlainMouseGesture = ({
  altKey,
  button,
  ctrlKey,
  detail = undefined,
  metaKey,
  pointerType,
  shiftKey,
}) => (
  pointerType === 'mouse'
  && button === 0
  && (detail === undefined || detail === 2)
  && !altKey
  && !ctrlKey
  && !metaKey
  && !shiftKey
);

export const resolvePublicBlankLineInsertionTarget = (clientY, blocks) => {
  if (!Number.isFinite(clientY)) return null;
  const visibleBlocks = blocks
    .filter((block) => (
      Number.isFinite(block.top)
      && Number.isFinite(block.bottom)
      && Number.isSafeInteger(block.sourceStart)
      && Number.isSafeInteger(block.sourceEnd)
      && block.bottom >= block.top
      && block.sourceEnd >= block.sourceStart
    ))
    .slice()
    .sort((left, right) => left.top - right.top || left.bottom - right.bottom);
  if (visibleBlocks.length === 0) return null;
  if (visibleBlocks.some((block) => clientY >= block.top && clientY <= block.bottom)) return null;
  const nextBlock = visibleBlocks.find((block) => clientY < block.top);
  if (nextBlock) {
    return {
      placement: 'before',
      sourceOffset: nextBlock.sourceStart,
      visualTop: nextBlock.top,
    };
  }
  const previousBlock = visibleBlocks.at(-1);
  return previousBlock ? {
    placement: 'after',
    sourceOffset: previousBlock.sourceEnd,
    visualTop: previousBlock.bottom,
  } : null;
};

const readLineBreak = (source) => /\r\n|\r|\n/u.exec(source)?.[0] ?? '\n';

export const insertPublicMarkdownParagraph = (source, offset, value) => {
  const paragraph = String(value ?? '').trim();
  if (!paragraph) return source;
  const anchor = clampSourceOffset(source, offset);
  const lineBreak = readLineBreak(source);
  const before = source.slice(0, anchor);
  const after = source.slice(anchor);
  const prefix = before.length === 0
    ? ''
    : before.endsWith(`${lineBreak}${lineBreak}`)
      ? ''
      : before.endsWith(lineBreak) ? lineBreak : `${lineBreak}${lineBreak}`;
  const suffix = after.length === 0
    ? ''
    : after.startsWith(`${lineBreak}${lineBreak}`)
      ? ''
      : after.startsWith(lineBreak) ? lineBreak : `${lineBreak}${lineBreak}`;
  return `${before}${prefix}${paragraph}${suffix}${after}`;
};
