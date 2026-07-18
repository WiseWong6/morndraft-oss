import React, { useCallback, useMemo } from 'react';
import { buildArtifactMap } from '@morndraft/core';
import type { ArtifactMapEntry } from '@morndraft/features-personal';
import { trackMornDraftClick } from '../../utils/analytics';
import {
  PreviewArtifactTargetProvider,
  preservePreviewScrollAnchorForElement,
} from './CollapsibleArtifactBlock';
import { createPreviewArtifactMapEntries } from './artifactMapContract';
import { getPreviewSourceLineTargetElement } from './previewDiagnosticLineNavigation';
import type { SourceLineMap } from './sourcePosition';

export type ArtifactMapScrollBehavior = 'smooth' | 'instant';
export type ArtifactMapTargetIntent = 'artifact' | 'source';

const escapeCssAttributeValue = (value: string) =>
  value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const getArtifactIdTargetElement = (
  scrollContainer: HTMLElement | null | undefined,
  artifactId: string,
) => {
  if (!scrollContainer || !artifactId) return null;
  const selector = artifactId ? `[data-artifact-id="${escapeCssAttributeValue(artifactId)}"]` : '';
  const target = selector ? scrollContainer.querySelector<HTMLElement>(selector) : null;
  if (!target) return null;

  const visibleHeader = Array.from(target.querySelectorAll<HTMLElement>('.aad-block-header'))
    .find((element) => {
      const style = window.getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    });
  return visibleHeader ?? target;
};

export const getArtifactMapTargetElement = (
  scrollContainer: HTMLElement | null | undefined,
  artifactId: string,
  sourceLine?: number | null,
  intent: ArtifactMapTargetIntent = 'source',
) => {
  if (!scrollContainer || (!artifactId && !sourceLine)) return null;
  const artifactTarget = artifactId ? getArtifactIdTargetElement(scrollContainer, artifactId) : null;
  if (intent === 'artifact' && artifactTarget) return artifactTarget;

  const sourceLineTarget = Number.isFinite(sourceLine)
    ? getPreviewSourceLineTargetElement(scrollContainer, Number(sourceLine))
    : null;
  if (sourceLineTarget) return sourceLineTarget;
  return artifactTarget;
};

export const getArtifactMapTargetScrollPosition = (
  scrollContainer: HTMLElement | null | undefined,
  artifactId: string,
  sourceLine?: number | null,
  intent: ArtifactMapTargetIntent = 'source',
) => {
  const scrollTarget = getArtifactMapTargetElement(scrollContainer, artifactId, sourceLine, intent);
  if (!scrollContainer || !scrollTarget) return null;
  const stickyControls = scrollContainer.querySelector<HTMLElement>('.aad-preview-display-controls-bar');
  const stickyHeight = stickyControls ? stickyControls.getBoundingClientRect().height : 0;
  const targetTop = scrollTarget.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top;
  return {
    left: scrollContainer.scrollLeft,
    top: Math.max(0, scrollContainer.scrollTop + targetTop - stickyHeight - 8),
  };
};

export const scrollArtifactMapTargetIntoView = (
  scrollContainer: HTMLElement | null | undefined,
  artifactId: string,
  sourceLine?: number | null,
  scrollBehavior: ArtifactMapScrollBehavior = 'smooth',
  intent: ArtifactMapTargetIntent = 'source',
) => {
  const scrollPosition = getArtifactMapTargetScrollPosition(scrollContainer, artifactId, sourceLine, intent);
  if (!scrollContainer || !scrollPosition) return false;
  scrollContainer.scrollTo({
    top: scrollPosition.top,
    behavior: scrollBehavior,
  });
  return true;
};

export const preserveArtifactMapTargetScrollAnchor = (
  scrollContainer: HTMLElement | null | undefined,
  artifactId: string,
  sourceLine?: number | null,
  intent: ArtifactMapTargetIntent = 'artifact',
) => {
  preservePreviewScrollAnchorForElement(
    getArtifactMapTargetElement(scrollContainer, artifactId, sourceLine, intent),
  );
};

export const useArtifactMapNavigation = ({
  code,
  isEnabled,
  lineMap,
  onPreviewNavigateToArtifact,
  scrollContainerRef,
}: {
  code: string;
  isEnabled: boolean;
  lineMap?: SourceLineMap;
  onPreviewNavigateToArtifact?: (artifactId: string) => void;
  scrollContainerRef: React.RefObject<HTMLElement | null>;
}) => {
  const entries = useMemo<ArtifactMapEntry[]>(
    () => {
      if (!isEnabled) return [];
      return createPreviewArtifactMapEntries(buildArtifactMap(code), lineMap);
    },
    [code, isEnabled, lineMap],
  );
  const entryByLine = useMemo(
    () => new Map(entries.map((entry) => [entry.line, entry])),
    [entries],
  );

  const getArtifactIdForSourceLine = useCallback((line: number) => {
    if (!isEnabled) return '';
    const sourceLine = Number(line);
    return Number.isFinite(sourceLine) ? entryByLine.get(sourceLine)?.id ?? '' : '';
  }, [entryByLine, isEnabled]);

  const getArtifactIdForNode = useCallback((node: any) => {
    if (!isEnabled) return '';
    const nodeLine = Number(node?.position?.start?.line);
    const line = Number.isFinite(nodeLine) ? lineMap?.[nodeLine - 1] ?? nodeLine : nodeLine;
    return Number.isFinite(line) ? getArtifactIdForSourceLine(line) : '';
  }, [getArtifactIdForSourceLine, isEnabled, lineMap]);

  const withArtifactTarget = useCallback((node: any, element: React.ReactElement) => {
    const artifactId = getArtifactIdForNode(node);
    return artifactId ? (
      <PreviewArtifactTargetProvider artifactId={artifactId}>
        <div data-artifact-id={artifactId}>{element}</div>
      </PreviewArtifactTargetProvider>
    ) : element;
  }, [getArtifactIdForNode]);

  const navigateToEntry = useCallback((entry: ArtifactMapEntry) => {
    scrollArtifactMapTargetIntoView(
      scrollContainerRef.current,
      entry.targetId ?? entry.id,
      entry.line,
      'smooth',
      'artifact',
    );
    onPreviewNavigateToArtifact?.(entry.id);
    trackMornDraftClick('morndraft_artifact_map_navigate', {
      target: { type: 'button', text: entry.title },
      context: { component: 'artifact_map' },
      metadata: { kind: entry.kind, line: entry.line },
    });
  }, [onPreviewNavigateToArtifact, scrollContainerRef]);

  return {
    entries,
    getArtifactIdForSourceLine,
    getArtifactIdForNode,
    navigateToEntry,
    withArtifactTarget,
  };
};
