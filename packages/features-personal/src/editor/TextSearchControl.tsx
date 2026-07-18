import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { findTextSearchMatches } from '@morndraft/core';

export type TextSearchMatch = ReturnType<typeof findTextSearchMatches>[number];
const SEARCH_COMMIT_DEBOUNCE_MS = 450;

export type TextSearchLabels = {
  placeholder: string;
  previous: string;
  next: string;
  clear: string;
  noMatches: string;
  matchStatus: (current: number, total: number) => string;
};

export type TextSearchState = {
  query: string;
  activeIndex: number;
  matches: TextSearchMatch[];
  activeMatch: TextSearchMatch | null;
  navigationRequestId: number;
};

const SEARCH_KEY_GUARD_MS = 500;

export type TextSearchControlProps = {
  value: string;
  labels: TextSearchLabels;
  onNavigate: (match: TextSearchMatch) => void;
  onSearchStateChange?: (state: TextSearchState) => void;
};

const TextSearchControl: React.FC<TextSearchControlProps> = ({
  value,
  labels,
  onNavigate,
  onSearchStateChange,
}) => {
  const [draftQuery, setDraftQuery] = useState('');
  const [committedQuery, setCommittedQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  const [navigationRequestId, setNavigationRequestId] = useState(0);
  const [hasNavigatedCommittedQuery, setHasNavigatedCommittedQuery] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const handledNativeKeyEventsRef = useRef<WeakSet<Event>>(new WeakSet());
  const suppressEditableEnterUntilRef = useRef(0);
  const matches = useMemo(() => findTextSearchMatches(value, committedQuery), [committedQuery, value]);
  const hasDraftQuery = draftQuery.trim().length > 0;
  const hasCommittedQuery = committedQuery.trim().length > 0;
  const isDraftPending = draftQuery !== committedQuery;
  const hasMatches = matches.length > 0;
  const activeMatch = hasMatches ? matches[Math.min(activeIndex, matches.length - 1)] : null;

  const restoreSearchFocus = useCallback(() => {
    const focusInput = () => inputRef.current?.focus({ preventScroll: true });
    window.requestAnimationFrame(() => {
      focusInput();
      window.requestAnimationFrame(focusInput);
    });
  }, []);

  const armEditableKeyGuard = useCallback(() => {
    suppressEditableEnterUntilRef.current = Date.now() + SEARCH_KEY_GUARD_MS;
  }, []);

  const commitQuery = useCallback((nextQuery: string, nextIndex = 0, shouldNavigate = false) => {
    const nextMatches = findTextSearchMatches(value, nextQuery);
    const hasNextMatches = nextMatches.length > 0;
    const normalizedIndex = hasNextMatches
      ? ((nextIndex % nextMatches.length) + nextMatches.length) % nextMatches.length
      : 0;

    setCommittedQuery(nextQuery);
    setActiveIndex(normalizedIndex);
    setHasNavigatedCommittedQuery(shouldNavigate && hasNextMatches);

    if (shouldNavigate && hasNextMatches) {
      armEditableKeyGuard();
      setNavigationRequestId((requestId) => requestId + 1);
      onNavigate(nextMatches[normalizedIndex]);
      restoreSearchFocus();
    }
  }, [armEditableKeyGuard, onNavigate, restoreSearchFocus, value]);

  const closeSearch = useCallback(() => {
    setDraftQuery('');
    commitQuery('', 0, false);
    setHasNavigatedCommittedQuery(false);
    inputRef.current?.blur();
    setIsFocused(false);
  }, [commitQuery]);

  useEffect(() => {
    if (!draftQuery.trim()) {
      if (committedQuery) {
        commitQuery('', 0, false);
      }
      return undefined;
    }
    if (draftQuery === committedQuery) return undefined;

    const timeoutId = window.setTimeout(() => {
      commitQuery(draftQuery, 0, false);
    }, SEARCH_COMMIT_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [commitQuery, committedQuery, draftQuery]);

  useEffect(() => {
    if (activeIndex >= matches.length) {
      setActiveIndex(Math.max(0, matches.length - 1));
    }
  }, [activeIndex, matches.length]);

  useEffect(() => {
    onSearchStateChange?.({
      query: committedQuery,
      activeIndex: hasMatches ? Math.min(activeIndex, matches.length - 1) : 0,
      matches,
      activeMatch,
      navigationRequestId,
    });
  }, [activeIndex, activeMatch, committedQuery, hasMatches, matches, navigationRequestId, onSearchStateChange]);

  const navigateTo = (nextIndex: number) => {
    if (!hasMatches) return;
    const normalizedIndex = (nextIndex + matches.length) % matches.length;
    setActiveIndex(normalizedIndex);
    setHasNavigatedCommittedQuery(true);
    armEditableKeyGuard();
    setNavigationRequestId((requestId) => requestId + 1);
    onNavigate(matches[normalizedIndex]);
    restoreSearchFocus();
  };

  const handleSearchInputKeyDown = useCallback((event: KeyboardEvent | React.KeyboardEvent<HTMLInputElement>) => {
    const nativeEvent = 'nativeEvent' in event ? event.nativeEvent : event;
    if (nativeEvent.key !== 'Escape' && nativeEvent.key !== 'Enter') return false;
    if (handledNativeKeyEventsRef.current.has(nativeEvent)) return true;
    handledNativeKeyEventsRef.current.add(nativeEvent);
    event.preventDefault();
    event.stopPropagation();
    nativeEvent.stopImmediatePropagation?.();
    if (nativeEvent.key === 'Escape') {
      closeSearch();
      return true;
    }
    armEditableKeyGuard();
    const direction = nativeEvent.shiftKey ? -1 : 1;
    const nextIndex = isDraftPending || !hasNavigatedCommittedQuery
      ? (nativeEvent.shiftKey ? -1 : 0)
      : activeIndex + direction;
    commitQuery(draftQuery, nextIndex, true);
    return true;
  }, [
    activeIndex,
    armEditableKeyGuard,
    closeSearch,
    commitQuery,
    draftQuery,
    hasNavigatedCommittedQuery,
    isDraftPending,
  ]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return undefined;
    const handleNativeKeyDown = (event: KeyboardEvent) => {
      handleSearchInputKeyDown(event);
    };
    const handleNativeBeforeInput = (event: InputEvent) => {
      if (event.inputType !== 'insertLineBreak') return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    input.addEventListener('keydown', handleNativeKeyDown, true);
    input.addEventListener('beforeinput', handleNativeBeforeInput, true);
    return () => {
      input.removeEventListener('keydown', handleNativeKeyDown, true);
      input.removeEventListener('beforeinput', handleNativeBeforeInput, true);
    };
  }, [handleSearchInputKeyDown]);

  useEffect(() => {
    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' && event.key !== 'Enter') return;
      const input = inputRef.current;
      const root = rootRef.current;
      const target = event.target;
      const isSearchTarget = target instanceof Node && (
        target === input ||
        Boolean(root?.contains(target))
      );
      const shouldGuardSearchKey =
        isSearchTarget ||
        document.activeElement === input ||
        Date.now() < suppressEditableEnterUntilRef.current;
      if (!shouldGuardSearchKey) return;
      handleSearchInputKeyDown(event);
    };
    window.addEventListener('keydown', handleWindowKeyDown, true);
    return () => window.removeEventListener('keydown', handleWindowKeyDown, true);
  }, [handleSearchInputKeyDown]);

  const canNavigate = !isDraftPending && Boolean(activeMatch);
  const statusLabel = !isDraftPending && hasMatches
    ? labels.matchStatus(Math.min(activeIndex + 1, matches.length), matches.length)
    : (!isDraftPending && hasCommittedQuery ? labels.noMatches : '');

  return (
    <div
      ref={rootRef}
      className={`aad-text-search ${isFocused || hasDraftQuery ? 'is-open' : ''}`}
      role="search"
      onMouseDown={(event) => {
        event.stopPropagation();
        if (event.target !== inputRef.current) {
          event.preventDefault();
          inputRef.current?.focus({ preventScroll: true });
        }
      }}
      onClick={() => inputRef.current?.focus({ preventScroll: true })}
    >
      <span className="aad-text-search-icon" aria-hidden="true">
        <Search size={13} />
      </span>
      <input
        ref={inputRef}
        value={draftQuery}
        onChange={(event) => setDraftQuery(event.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onKeyDownCapture={handleSearchInputKeyDown}
        className="aad-text-search-input"
        placeholder={labels.placeholder}
        aria-label={labels.placeholder}
      />
      <span className="aad-text-search-status" aria-live="polite">
        {statusLabel}
      </span>
      {hasDraftQuery && (
        <button
          type="button"
          className="aad-icon-button aad-text-search-button"
          title={labels.clear}
          aria-label={labels.clear}
          onClick={(event) => {
            event.stopPropagation();
            setDraftQuery('');
            commitQuery('', 0, false);
            setHasNavigatedCommittedQuery(false);
            inputRef.current?.focus();
          }}
        >
          <X size={13} />
        </button>
      )}
      <button
        type="button"
        className="aad-icon-button aad-text-search-button"
        title={labels.previous}
        aria-label={labels.previous}
        disabled={!canNavigate}
        onClick={(event) => {
          event.stopPropagation();
          navigateTo(hasNavigatedCommittedQuery ? activeIndex - 1 : -1);
          inputRef.current?.focus();
        }}
      >
        <ChevronUp size={13} />
      </button>
      <button
        type="button"
        className="aad-icon-button aad-text-search-button"
        title={labels.next}
        aria-label={labels.next}
        disabled={!canNavigate}
        onClick={(event) => {
          event.stopPropagation();
          navigateTo(hasNavigatedCommittedQuery ? activeIndex + 1 : 0);
          inputRef.current?.focus();
        }}
      >
        <ChevronDown size={13} />
      </button>
    </div>
  );
};

export default TextSearchControl;
