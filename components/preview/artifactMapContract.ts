import type { ArtifactMapEntry } from '@morndraft/features-personal';
import type { SourceLineMap, SourcePositionRange } from './sourcePosition';

export type PreviewHiddenSourceRange = {
  id: string;
  startLine: number;
  endLine: number;
};

const mapArtifactLine = (line: number | undefined, lineMap?: SourceLineMap) => {
  if (!Number.isFinite(line)) return undefined;
  const numericLine = Number(line);
  return lineMap?.[numericLine - 1] ?? numericLine;
};

const createEntrySourceRange = (
  line: number,
  sectionEndLine?: number,
): SourcePositionRange => ({
  startLine: line,
  startColumn: 1,
  endLine: Math.max(line, sectionEndLine ?? line),
  endColumn: 1,
});

const createMappedEntrySourceRange = (
  entry: ArtifactMapEntry,
  line: number,
  sectionEndLine?: number,
  lineMap?: SourceLineMap,
): SourcePositionRange => {
  if (!entry.sourceRange) return createEntrySourceRange(line, sectionEndLine);
  const startLine = mapArtifactLine(entry.sourceRange.startLine, lineMap) ?? line;
  const endLine = mapArtifactLine(entry.sourceRange.endLine, lineMap) ?? sectionEndLine ?? startLine;
  return {
    ...entry.sourceRange,
    startLine,
    endLine: Math.max(startLine, endLine),
  };
};

export const isBlockCollapsibleArtifactMapEntry = (entry: { kind: string }) =>
  entry.kind !== 'heading' && entry.kind !== 'image';

export const isCollapsibleArtifactMapEntry = (entry: ArtifactMapEntry) =>
  Boolean(entry.hasChildren) || isBlockCollapsibleArtifactMapEntry(entry);

const normalizeArtifactCollapseKeyPart = (value: unknown) => String(value ?? '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

const buildArtifactCollapseKeys = (entries: readonly ArtifactMapEntry[]) => {
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  const baseKeyById = new Map<string, string>();
  const seenBaseKeys = new Map<string, number>();

  const getBaseKey = (entry: ArtifactMapEntry): string => {
    const cached = baseKeyById.get(entry.id);
    if (cached) return cached;
    const parent = entry.parentId ? entryById.get(entry.parentId) : undefined;
    const parentKey = parent ? getBaseKey(parent) : 'root';
    const titleKey = normalizeArtifactCollapseKeyPart(entry.title);
    const key = `${parentKey}/${entry.kind}:${entry.level}:${titleKey}`;
    baseKeyById.set(entry.id, key);
    return key;
  };

  return new Map(entries.map((entry) => {
    const baseKey = getBaseKey(entry);
    const ordinal = (seenBaseKeys.get(baseKey) ?? 0) + 1;
    seenBaseKeys.set(baseKey, ordinal);
    return [entry.id, `${baseKey}#${ordinal}`];
  }));
};

export const createPreviewArtifactMapEntries = (
  entries: readonly ArtifactMapEntry[],
  lineMap?: SourceLineMap,
): ArtifactMapEntry[] => {
  const mappedEntries = entries.map((entry) => {
    const line = mapArtifactLine(entry.line, lineMap) ?? entry.line;
    const sectionEndLine = mapArtifactLine(entry.sectionEndLine, lineMap);
    return {
      ...entry,
      anchorId: entry.anchorId ?? entry.id,
      line,
      sectionEndLine: sectionEndLine ?? entry.sectionEndLine,
      sourceRange: createMappedEntrySourceRange(entry, line, sectionEndLine ?? entry.sectionEndLine, lineMap),
      targetId: entry.targetId ?? entry.id,
    };
  });
  const collapseKeyById = buildArtifactCollapseKeys(mappedEntries);
  return mappedEntries.map((entry) => ({
    ...entry,
    collapseKey: entry.collapseKey ?? collapseKeyById.get(entry.id),
  }));
};

export const buildArtifactCollapseIndex = (entries: readonly ArtifactMapEntry[]) => {
  const collapseKeyById = new Map<string, string>();
  const collapsibleIdByKey = new Map<string, string>();
  const collapsibleEntryIds = new Set<string>();
  const entriesWithKeys = entries.every((entry) => entry.collapseKey)
    ? entries
    : createPreviewArtifactMapEntries(entries);

  entriesWithKeys.forEach((entry) => {
    const collapseKey = entry.collapseKey;
    if (!collapseKey) return;
    collapseKeyById.set(entry.id, collapseKey);
    if (isCollapsibleArtifactMapEntry(entry)) {
      collapsibleEntryIds.add(entry.id);
      collapsibleIdByKey.set(collapseKey, entry.id);
    }
  });

  return { collapseKeyById, collapsibleEntryIds, collapsibleIdByKey };
};

export const getCollapsedHeadingRanges = (
  entries: readonly ArtifactMapEntry[],
  collapsedEntryIds: ReadonlySet<string>,
): PreviewHiddenSourceRange[] => entries.flatMap((entry) => {
  if (
    entry.kind !== 'heading' ||
    !entry.hasChildren ||
    !collapsedEntryIds.has(entry.id)
  ) {
    return [];
  }
  let endLine = entry.line;
  if (Number.isFinite(entry.sourceRange?.endLine)) {
    endLine = Number(entry.sourceRange?.endLine);
  } else if (Number.isFinite(entry.sectionEndLine)) {
    endLine = Number(entry.sectionEndLine);
  }
  if (endLine <= entry.line) return [];
  return [{
    id: entry.id,
    startLine: entry.line + 1,
    endLine,
  }];
});

export const isArtifactMapEntryHiddenByRange = (
  entry: ArtifactMapEntry,
  hiddenRanges: readonly PreviewHiddenSourceRange[],
) => hiddenRanges.some((range) => entry.line >= range.startLine && entry.line <= range.endLine);

export const getHiddenArtifactMapEntryIds = (
  entries: readonly ArtifactMapEntry[],
  hiddenRanges: readonly PreviewHiddenSourceRange[],
) => new Set(entries
  .filter((entry) => isArtifactMapEntryHiddenByRange(entry, hiddenRanges))
  .map((entry) => entry.id));
