export type PublicFinalBlankLineBlock = Readonly<{
  bottom: number;
  id: string;
  sourceEnd: number | null;
  sourceStart: number | null;
  top: number;
}>;

export type PublicFinalBlankLineTarget = Readonly<{
  id: string | null;
  offset: number;
  placement: 'after' | 'append' | 'before';
}>;

export type PublicFinalBlankLinePointerInput = Readonly<{
  altKey: boolean;
  button: number;
  ctrlKey: boolean;
  isInteractiveTarget: boolean;
  metaKey: boolean;
  pointerType: string;
  shiftKey: boolean;
}>;

export const shouldHandlePublicFinalBlankLinePointer = (
  input: PublicFinalBlankLinePointerInput,
) => (
  input.pointerType === 'mouse'
  && input.button === 0
  && !input.altKey
  && !input.ctrlKey
  && !input.metaKey
  && !input.shiftKey
  && !input.isInteractiveTarget
);

export const resolvePublicFinalBlankLineTarget = (
  clientY: number,
  blocks: readonly PublicFinalBlankLineBlock[],
  emptyDocumentOffset = 0,
): PublicFinalBlankLineTarget | null => {
  if (!Number.isFinite(clientY) || !Number.isSafeInteger(emptyDocumentOffset) || emptyDocumentOffset < 0) {
    return null;
  }
  const visibleBlocks = blocks
    .filter((block) => (
      Number.isFinite(block.top)
      && Number.isFinite(block.bottom)
      && block.bottom >= block.top
    ))
    .slice()
    .sort((left, right) => left.top - right.top || left.bottom - right.bottom);
  if (visibleBlocks.length === 0) {
    return { id: null, offset: emptyDocumentOffset, placement: 'append' };
  }
  if (visibleBlocks.some((block) => clientY >= block.top && clientY <= block.bottom)) {
    return null;
  }

  const nextIndex = visibleBlocks.findIndex((block) => clientY < block.top);
  const nextBlock = nextIndex >= 0 ? visibleBlocks[nextIndex] : null;
  if (
    nextBlock
    && nextBlock.sourceStart !== null
    && Number.isSafeInteger(nextBlock.sourceStart)
    && nextBlock.sourceStart >= 0
  ) {
    return { id: nextBlock.id, offset: nextBlock.sourceStart, placement: 'before' };
  }

  const previousBlock = nextIndex < 0
    ? visibleBlocks[visibleBlocks.length - 1]
    : visibleBlocks[nextIndex - 1];
  if (
    previousBlock
    && clientY > previousBlock.bottom
    && previousBlock.sourceEnd !== null
    && Number.isSafeInteger(previousBlock.sourceEnd)
    && previousBlock.sourceEnd >= 0
  ) {
    return { id: previousBlock.id, offset: previousBlock.sourceEnd, placement: 'after' };
  }
  return null;
};

const detectSourceLineEnding = (source: string) => {
  const match = /\r\n|\r|\n/u.exec(source);
  return match?.[0] ?? '\n';
};

const endsWithLineEnding = (value: string) => /(?:\r\n|\r|\n)$/u.test(value);
const startsWithLineEnding = (value: string) => /^(?:\r\n|\r|\n)/u.test(value);
const endsWithBlankLine = (value: string) => /(?:\r\n|\r|\n)[\t ]*(?:\r\n|\r|\n)$/u.test(value);
const startsWithBlankLine = (value: string) => /^(?:\r\n|\r|\n)[\t ]*(?:\r\n|\r|\n)/u.test(value);

export const insertPublicFinalBlankLineSource = (
  source: string,
  offset: number,
  input: string,
) => {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > source.length) return null;
  const paragraph = input.replace(/\r\n|\r|\n/gu, ' ').trim();
  if (!paragraph) return source;
  const lineEnding = detectSourceLineEnding(source);
  const prefix = source.slice(0, offset);
  const suffix = source.slice(offset);
  const before = !prefix || endsWithBlankLine(prefix)
    ? ''
    : endsWithLineEnding(prefix) ? lineEnding : `${lineEnding}${lineEnding}`;
  const after = !suffix || startsWithBlankLine(suffix)
    ? ''
    : startsWithLineEnding(suffix) ? lineEnding : `${lineEnding}${lineEnding}`;
  return `${prefix}${before}${paragraph}${after}${suffix}`;
};
