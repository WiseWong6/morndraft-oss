import type { SourcePositionRange } from './sourcePosition';

export type ArtifactSourceOverrideMap = Map<string, string>;
export type ArtifactSourceOverridePatch = {
  nodeKey?: string;
  source: string | null;
  sourceRange: SourcePositionRange | null;
};

const getRangeKey = (range: SourcePositionRange | null | undefined) => (
  range?.startLine ? `range:${range.startLine}` : ''
);

const getNodeKey = (nodeKey: string | null | undefined) => (
  nodeKey ? `node:${nodeKey}` : ''
);

export const replaceArtifactSourceOverrides = (
  overrides: ArtifactSourceOverrideMap,
  blocks: readonly {
    source: string;
    sourceRange: SourcePositionRange | null;
    type: string;
  }[],
) => {
  overrides.clear();
  blocks.forEach((block) => {
    if (block.type !== 'artifact') return;
    const key = getRangeKey(block.sourceRange);
    if (key) overrides.set(key, block.source);
  });
};

export const resolveArtifactSourceOverride = (
  overrides: ArtifactSourceOverrideMap | undefined,
  nodeKey: string | null | undefined,
  sourceRange: SourcePositionRange | null | undefined,
  fallback: string | null,
) => overrides?.get(getNodeKey(nodeKey)) ?? overrides?.get(getRangeKey(sourceRange)) ?? fallback;

export const writeArtifactSourceOverride = (
  overrides: ArtifactSourceOverrideMap,
  nodeKey: string | null | undefined,
  sourceRange: SourcePositionRange | null | undefined,
  source: string | null,
) => {
  const key = getNodeKey(nodeKey) || getRangeKey(sourceRange);
  if (key && source) overrides.set(key, source);
};
