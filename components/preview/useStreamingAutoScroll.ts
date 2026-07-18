import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

export const STREAMING_AUTO_SCROLL_BOTTOM_THRESHOLD_PX = 36;
export const STREAMING_AUTO_SCROLL_RESUME_IDLE_MS = 1200;
export const STREAMING_AUTO_SCROLL_FOLLOWING_ATTR = 'data-streaming-auto-following';

const STREAMING_AUTO_SCROLL_KEYS = new Set([
  'ArrowDown',
  'ArrowUp',
  'End',
  'Home',
  'PageDown',
  'PageUp',
  ' ',
  'Spacebar',
]);

export const isStreamingScrollElementNearBottom = (
  element: Pick<HTMLElement, 'clientHeight' | 'scrollHeight' | 'scrollTop'> | null,
  threshold = STREAMING_AUTO_SCROLL_BOTTOM_THRESHOLD_PX,
) => {
  if (!element) return true;
  return element.scrollHeight - element.scrollTop - element.clientHeight <= threshold;
};

export const scrollStreamingElementToBottom = (
  element: Pick<HTMLElement, 'clientHeight' | 'scrollHeight' | 'scrollTop'> | null,
) => {
  if (!element) return;
  element.scrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
};

export const isStreamingAutoScrollKey = (key: string) =>
  STREAMING_AUTO_SCROLL_KEYS.has(key);

export const setStreamingAutoScrollFollowing = (
  element: Pick<HTMLElement, 'removeAttribute' | 'setAttribute'> | null,
  following: boolean,
) => {
  if (!element) return;
  if (following) {
    element.setAttribute(STREAMING_AUTO_SCROLL_FOLLOWING_ATTR, 'true');
    return;
  }
  element.removeAttribute(STREAMING_AUTO_SCROLL_FOLLOWING_ATTR);
};

export const useStreamingAutoScroll = <T extends HTMLElement>(active: boolean) => {
  const elementRef = useRef<T | null>(null);
  const shouldFollowBottomRef = useRef(true);
  const userPausedRef = useRef(false);
  const programmaticScrollRef = useRef(false);
  const programmaticFrameRef = useRef<number | null>(null);
  const resumeTimerRef = useRef<number | null>(null);
  const wasActiveRef = useRef(false);

  const clearResumeTimer = useCallback(() => {
    if (resumeTimerRef.current === null) return;
    window.clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = null;
  }, []);

  const clearProgrammaticFrame = useCallback(() => {
    if (programmaticFrameRef.current === null) return;
    window.cancelAnimationFrame(programmaticFrameRef.current);
    programmaticFrameRef.current = null;
  }, []);

  const syncFollowingAttribute = useCallback((element = elementRef.current) => {
    setStreamingAutoScrollFollowing(
      element,
      active && shouldFollowBottomRef.current && !userPausedRef.current,
    );
  }, [active]);

  const markProgrammaticScroll = useCallback(() => {
    programmaticScrollRef.current = true;
    clearProgrammaticFrame();
    programmaticFrameRef.current = window.requestAnimationFrame(() => {
      programmaticFrameRef.current = null;
      programmaticScrollRef.current = false;
    });
  }, [clearProgrammaticFrame]);

  const scrollElementToBottomFromAuto = useCallback((element: T | null) => {
    if (!element) return;
    markProgrammaticScroll();
    scrollStreamingElementToBottom(element);
  }, [markProgrammaticScroll]);

  const resumeAutoFollow = useCallback(() => {
    clearResumeTimer();
    const element = elementRef.current;
    userPausedRef.current = false;
    shouldFollowBottomRef.current = true;
    syncFollowingAttribute(element);
    if (!active || !element) return;
    scrollElementToBottomFromAuto(element);
  }, [active, clearResumeTimer, scrollElementToBottomFromAuto, syncFollowingAttribute]);

  const scheduleAutoResume = useCallback(() => {
    clearResumeTimer();
    resumeTimerRef.current = window.setTimeout(
      resumeAutoFollow,
      STREAMING_AUTO_SCROLL_RESUME_IDLE_MS,
    );
  }, [clearResumeTimer, resumeAutoFollow]);

  const pauseAutoFollowForUserScroll = useCallback(() => {
    if (!active) return;
    userPausedRef.current = true;
    shouldFollowBottomRef.current = false;
    syncFollowingAttribute();
    scheduleAutoResume();
  }, [active, scheduleAutoResume, syncFollowingAttribute]);

  useEffect(() => {
    const previouslyActive = wasActiveRef.current;
    const element = elementRef.current;
    if (active && !previouslyActive) {
      clearResumeTimer();
      userPausedRef.current = false;
      shouldFollowBottomRef.current = true;
      syncFollowingAttribute(element);
    }
    if (!active) {
      clearResumeTimer();
      userPausedRef.current = false;
      setStreamingAutoScrollFollowing(element, false);
    }
    wasActiveRef.current = active;
    if (!active || !previouslyActive || !element || !shouldFollowBottomRef.current) return undefined;
    let secondFrameId: number | null = null;
    let firstFrameId: number | null = window.requestAnimationFrame(() => {
      firstFrameId = null;
      scrollElementToBottomFromAuto(element);
      secondFrameId = window.requestAnimationFrame(() => {
        secondFrameId = null;
        scrollElementToBottomFromAuto(element);
      });
    });
    return () => {
      if (firstFrameId !== null) window.cancelAnimationFrame(firstFrameId);
      if (secondFrameId !== null) window.cancelAnimationFrame(secondFrameId);
      if (active) setStreamingAutoScrollFollowing(element, false);
    };
  }, [active, clearResumeTimer, scrollElementToBottomFromAuto, syncFollowingAttribute]);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return undefined;
    const handleScroll = () => {
      if (programmaticScrollRef.current) {
        syncFollowingAttribute(element);
        return;
      }
      if (userPausedRef.current) {
        scheduleAutoResume();
        return;
      }
      shouldFollowBottomRef.current = isStreamingScrollElementNearBottom(element);
      syncFollowingAttribute(element);
    };
    const handleUserScrollIntent = () => {
      pauseAutoFollowForUserScroll();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isStreamingAutoScrollKey(event.key)) return;
      pauseAutoFollowForUserScroll();
    };
    handleScroll();
    element.addEventListener('scroll', handleScroll, { passive: true });
    element.addEventListener('wheel', handleUserScrollIntent, { passive: true });
    element.addEventListener('touchstart', handleUserScrollIntent, { passive: true });
    element.addEventListener('touchmove', handleUserScrollIntent, { passive: true });
    element.addEventListener('pointerdown', handleUserScrollIntent, { passive: true });
    element.addEventListener('keydown', handleKeyDown);
    return () => {
      element.removeEventListener('scroll', handleScroll);
      element.removeEventListener('wheel', handleUserScrollIntent);
      element.removeEventListener('touchstart', handleUserScrollIntent);
      element.removeEventListener('touchmove', handleUserScrollIntent);
      element.removeEventListener('pointerdown', handleUserScrollIntent);
      element.removeEventListener('keydown', handleKeyDown);
    };
  }, [pauseAutoFollowForUserScroll, scheduleAutoResume, syncFollowingAttribute]);

  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!active || !element || !shouldFollowBottomRef.current) {
      syncFollowingAttribute(element);
      return;
    }
    syncFollowingAttribute(element);
    scrollElementToBottomFromAuto(element);
  });

  useEffect(() => {
    const element = elementRef.current;
    if (!active || !element) return undefined;

    const keepAtBottom = () => {
      if (!shouldFollowBottomRef.current || userPausedRef.current) {
        syncFollowingAttribute(element);
        return;
      }
      syncFollowingAttribute(element);
      scrollElementToBottomFromAuto(element);
    };

    let frameId: number | null = null;
    const scheduleKeepAtBottom = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        keepAtBottom();
      });
    };

    scheduleKeepAtBottom();
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(scheduleKeepAtBottom);
      resizeObserver.observe(element);
      Array.from(element.children).forEach((child) => {
        if (child instanceof HTMLElement) resizeObserver?.observe(child);
      });
    }
    let mutationObserver: MutationObserver | null = null;
    if (typeof MutationObserver !== 'undefined') {
      mutationObserver = new MutationObserver(() => {
        scheduleKeepAtBottom();
        if (!resizeObserver) return;
        Array.from(element.children).forEach((child) => {
          if (child instanceof HTMLElement) resizeObserver?.observe(child);
        });
      });
      mutationObserver.observe(element, {
        characterData: true,
        childList: true,
        subtree: true,
      });
    }

    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
    };
  }, [active, scrollElementToBottomFromAuto, syncFollowingAttribute]);

  useEffect(() => () => {
    clearResumeTimer();
    clearProgrammaticFrame();
    setStreamingAutoScrollFollowing(elementRef.current, false);
  }, [clearProgrammaticFrame, clearResumeTimer]);

  return elementRef;
};
