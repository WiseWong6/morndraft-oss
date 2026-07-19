import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ArtifactMapEntry } from '@morndraft/features-personal';
import {
  buildArtifactCollapseIndex,
  getCollapsedHeadingRanges,
  getHiddenArtifactMapEntryIds,
  isCollapsibleArtifactMapEntry,
} from './artifactMapContract';

export const reconcileCollapsedArtifactIds = (
  collapsedEntryIds: ReadonlySet<string>,
  previousEntries: readonly ArtifactMapEntry[],
  nextEntries: readonly ArtifactMapEntry[],
) => {
  if (collapsedEntryIds.size === 0) return collapsedEntryIds;

  const previousIndex = buildArtifactCollapseIndex(previousEntries);
  const nextIndex = buildArtifactCollapseIndex(nextEntries);
  const nextIds = new Set<string>();
  let changed = false;

  collapsedEntryIds.forEach((id) => {
    if (nextIndex.collapsibleEntryIds.has(id)) {
      nextIds.add(id);
      return;
    }

    const previousCollapseKey = previousIndex.collapseKeyById.get(id);
    const migratedId = previousCollapseKey
      ? nextIndex.collapsibleIdByKey.get(previousCollapseKey)
      : undefined;
    if (migratedId) {
      nextIds.add(migratedId);
      changed = true;
      return;
    }

    changed = true;
  });

  if (!changed && nextIds.size === collapsedEntryIds.size) return collapsedEntryIds;
  return nextIds;
};

export const usePreviewArtifactEntries = (
  artifactMapEntries: readonly ArtifactMapEntry[],
  collapsedEntryIds: ReadonlySet<string>,
  contentType: string,
) => {
  const hiddenSourceRanges = useMemo(
    () => getCollapsedHeadingRanges(artifactMapEntries, collapsedEntryIds),
    [artifactMapEntries, collapsedEntryIds],
  );

  const hiddenEntryIds = useMemo(
    () => getHiddenArtifactMapEntryIds(artifactMapEntries, hiddenSourceRanges),
    [artifactMapEntries, hiddenSourceRanges],
  );

  const artifactMapDisplayEntries = useMemo(
    () => artifactMapEntries.filter((entry) => !hiddenEntryIds.has(entry.id)),
    [artifactMapEntries, hiddenEntryIds],
  );
  const isSourceLineHidden = useCallback((line: number) => (
    hiddenSourceRanges.some((range) => line >= range.startLine && line <= range.endLine)
  ), [hiddenSourceRanges]);

  const collapsibleArtifactEntryIds = useMemo(
    () => new Set(artifactMapDisplayEntries.filter(isCollapsibleArtifactMapEntry).map((entry) => entry.id)),
    [artifactMapDisplayEntries],
  );

  const portableArtifactMapEntries = useMemo(
    () => (contentType === 'html' ? [] : artifactMapDisplayEntries),
    [artifactMapDisplayEntries, contentType],
  );

  return {
    artifactMapDisplayEntries,
    collapsibleArtifactEntryIds,
    hiddenSourceRanges,
    isSourceLineHidden,
    portableArtifactMapEntries,
  };
};

export const usePreviewArtifactCollapse = (artifactMapEntries: readonly ArtifactMapEntry[]) => {
  const [collapsedArtifactIds, setCollapsedArtifactIds] = useState<ReadonlySet<string>>(() => new Set());
  const previousArtifactMapEntriesRef = useRef<readonly ArtifactMapEntry[]>([]);

  useEffect(() => {
    setCollapsedArtifactIds((current) => reconcileCollapsedArtifactIds(
      current,
      previousArtifactMapEntriesRef.current,
      artifactMapEntries,
    ));
    previousArtifactMapEntriesRef.current = artifactMapEntries;
  }, [artifactMapEntries]);

  const toggleArtifactCollapsed = useCallback((artifactId: string) => {
    setCollapsedArtifactIds((current) => {
      const next = new Set(current);
      if (next.has(artifactId)) next.delete(artifactId);
      else next.add(artifactId);
      return next;
    });
  }, []);

  const onToggleEntryCollapsed = useCallback((entry: ArtifactMapEntry) => {
    toggleArtifactCollapsed(entry.id);
  }, [toggleArtifactCollapsed]);

  const collapseContext = useMemo(
    () => ({
      collapsedArtifactIds,
      onToggleArtifactCollapsed: toggleArtifactCollapsed,
    }),
    [collapsedArtifactIds, toggleArtifactCollapsed],
  );

  return {
    collapseContext,
    collapsedArtifactIds,
    onToggleEntryCollapsed,
  };
};
