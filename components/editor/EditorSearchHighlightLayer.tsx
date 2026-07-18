import React, { useMemo } from 'react';
import type { TextSearchMatch } from '@morndraft/features-personal';

const MAX_EDITOR_SEARCH_HIGHLIGHTS = 500;

const getRenderableSearchMatches = (
  matches: readonly TextSearchMatch[],
  activeMatchId: string | null,
) => {
  if (matches.length <= MAX_EDITOR_SEARCH_HIGHLIGHTS) return matches;
  if (!activeMatchId) return [];
  const activeMatch = matches.find((match) => match.id === activeMatchId);
  return activeMatch ? [activeMatch] : [];
};

const buildSearchSegments = (
  value: string,
  matches: readonly TextSearchMatch[],
  activeMatchId: string | null,
) => {
  const segments: Array<{
    key: string;
    text: string;
    isMatch: boolean;
    isActive: boolean;
  }> = [];
  let cursor = 0;

  matches
    .filter((match) => (
      Number.isFinite(match.start) &&
      Number.isFinite(match.end) &&
      match.start >= 0 &&
      match.end > match.start &&
      match.end <= value.length
    ))
    .sort((a, b) => a.start - b.start)
    .forEach((match) => {
      if (match.start < cursor) return;
      if (match.start > cursor) {
        segments.push({
          key: `text-${cursor}`,
          text: value.slice(cursor, match.start),
          isMatch: false,
          isActive: false,
        });
      }
      segments.push({
        key: match.id,
        text: value.slice(match.start, match.end),
        isMatch: true,
        isActive: match.id === activeMatchId,
      });
      cursor = match.end;
    });

  if (cursor < value.length) {
    segments.push({
      key: `text-${cursor}`,
      text: value.slice(cursor),
      isMatch: false,
      isActive: false,
    });
  }

  return segments;
};

export const EditorSearchHighlightLayer: React.FC<{
  activeMatchId: string | null;
  matches: readonly TextSearchMatch[];
  scrollTop: number;
  value: string;
}> = ({ activeMatchId, matches, scrollTop, value }) => {
  const renderableMatches = useMemo(
    () => getRenderableSearchMatches(matches, activeMatchId),
    [activeMatchId, matches],
  );
  const segments = useMemo(
    () => buildSearchSegments(value, renderableMatches, activeMatchId),
    [activeMatchId, renderableMatches, value],
  );

  if (renderableMatches.length === 0) return null;

  return (
    <div className="aad-editor-search-layer" aria-hidden="true">
      <div className="aad-editor-search-layer-inner" style={{ transform: `translateY(-${scrollTop}px)` }}>
        {segments.map((segment) => segment.isMatch ? (
          <mark
            key={segment.key}
            className={`aad-editor-search-hit ${segment.isActive ? 'is-active' : ''}`}
          >
            {segment.text}
          </mark>
        ) : (
          <span key={segment.key}>{segment.text}</span>
        ))}
      </div>
    </div>
  );
};
