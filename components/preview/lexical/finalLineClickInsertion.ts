export type FinalLineClickBlockBounds = Readonly<{
  bottom: number;
  nodeKey: string;
  top: number;
}>;

export type FinalLineClickInsertionTarget = Readonly<{
  nodeKey: string;
  placement: 'after' | 'before';
}>;

export type FinalLineClickPointerInput = Readonly<{
  altKey: boolean;
  button: number;
  ctrlKey: boolean;
  isInteractiveTarget: boolean;
  metaKey: boolean;
  pointerType: string;
  shiftKey: boolean;
}>;

export const shouldHandleFinalLineClickPointer = (input: FinalLineClickPointerInput) => (
  input.pointerType === 'mouse' &&
  input.button === 0 &&
  !input.altKey &&
  !input.ctrlKey &&
  !input.metaKey &&
  !input.shiftKey &&
  !input.isInteractiveTarget
);

export const resolveFinalLineClickInsertionTarget = (
  clientY: number,
  blocks: readonly FinalLineClickBlockBounds[],
): FinalLineClickInsertionTarget | null => {
  if (!Number.isFinite(clientY)) return null;
  const visibleBlocks = blocks
    .filter((block) => Number.isFinite(block.top) && Number.isFinite(block.bottom) && block.bottom >= block.top)
    .slice()
    .sort((left, right) => left.top - right.top || left.bottom - right.bottom);
  if (visibleBlocks.length === 0) return null;

  const containingBlock = visibleBlocks.find((block) => clientY >= block.top && clientY <= block.bottom);
  if (containingBlock) return null;

  const nextBlock = visibleBlocks.find((block) => clientY < block.top);
  if (nextBlock) return { nodeKey: nextBlock.nodeKey, placement: 'before' };

  const previousBlock = visibleBlocks[visibleBlocks.length - 1];
  return previousBlock ? { nodeKey: previousBlock.nodeKey, placement: 'after' } : null;
};
