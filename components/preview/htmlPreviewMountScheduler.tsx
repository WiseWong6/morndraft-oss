import React, { useCallback, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { MOUNT_DEFERRED_HTML_PREVIEWS_EVENT } from './htmlPreviewDeferredMount';
import { debugHtmlPreview } from './htmlPreviewDebug';
import { useDeferredHtmlPreviewMount } from './useDeferredHtmlPreviewMount';

type HtmlPreviewMountFrame = {
  frameId: string;
  order: number;
  ready: boolean;
  shouldRequestMount: boolean;
  top: number | null;
};

type HtmlPreviewMountRegistration = {
  frameId: string;
  shouldRequestMount: boolean;
  top: number | null;
};

type HtmlPreviewMountListener = () => void;

export type HtmlPreviewMountSchedulerStore = {
  getFrameGrantSnapshot: (frameId: string) => boolean;
  registerFrame: (registration: HtmlPreviewMountRegistration) => void;
  reset: () => void;
  setForceMountAll: (forceMountAll: boolean) => void;
  setFrameReady: (frameId: string, ready: boolean) => void;
  setMaxActiveMounts: (maxActiveMounts: number) => void;
  subscribeFrame: (frameId: string, listener: HtmlPreviewMountListener) => () => void;
  unregisterFrame: (frameId: string) => void;
};

const normalizeActiveLimit = (maxActiveMounts: number) => (
  Math.max(1, Math.floor(maxActiveMounts))
);

const sortMountFrames = (frames: HtmlPreviewMountFrame[]) => frames.sort((left, right) => {
  if (left.top != null && right.top != null && left.top !== right.top) return left.top - right.top;
  if (left.top != null && right.top == null) return -1;
  if (left.top == null && right.top != null) return 1;
  return left.order - right.order;
});

export const createHtmlPreviewMountSchedulerStore = (
  maxActiveMounts: number,
): HtmlPreviewMountSchedulerStore => {
  const frames = new Map<string, HtmlPreviewMountFrame>();
  const frameListeners = new Map<string, Set<HtmlPreviewMountListener>>();
  let activeLimit = normalizeActiveLimit(maxActiveMounts);
  let forceMountAll = false;
  let grantedFrameIds = new Set<string>();
  let nextOrder = 0;

  const resolveGrantedFrameIds = () => {
    const granted = new Set<string>();
    const requestedFrames = sortMountFrames(
      Array.from(frames.values()).filter((frame) => frame.shouldRequestMount),
    );
    if (forceMountAll) {
      requestedFrames.forEach((frame) => granted.add(frame.frameId));
      return granted;
    }
    let activeLoadingCount = 0;
    requestedFrames.forEach((frame) => {
      if (frame.ready) {
        granted.add(frame.frameId);
        return;
      }
      if (activeLoadingCount < activeLimit) {
        activeLoadingCount += 1;
        granted.add(frame.frameId);
      }
    });
    return granted;
  };

  const refreshGrants = () => {
    const previousGrantedFrameIds = grantedFrameIds;
    const nextGrantedFrameIds = resolveGrantedFrameIds();
    grantedFrameIds = nextGrantedFrameIds;
    frameListeners.forEach((listeners, frameId) => {
      if (previousGrantedFrameIds.has(frameId) === nextGrantedFrameIds.has(frameId)) return;
      Array.from(listeners).forEach((listener) => listener());
    });
  };

  const registerFrame = (registration: HtmlPreviewMountRegistration) => {
    const existing = frames.get(registration.frameId);
    if (
      existing &&
      existing.shouldRequestMount === registration.shouldRequestMount &&
      existing.top === registration.top
    ) {
      return;
    }
    frames.set(registration.frameId, {
      frameId: registration.frameId,
      order: existing?.order ?? nextOrder++,
      ready: existing?.ready ?? false,
      shouldRequestMount: registration.shouldRequestMount,
      top: registration.top,
    });
    refreshGrants();
  };

  const unregisterFrame = (frameId: string) => {
    if (!frames.delete(frameId)) return;
    refreshGrants();
  };

  const setFrameReady = (frameId: string, ready: boolean) => {
    const existing = frames.get(frameId);
    // The scheduler only limits a frame's initial mount. Once it has reported
    // ready, a srcdoc refresh must not put it back into the initial-load queue.
    if (!existing || !ready || existing.ready) return;
    frames.set(frameId, { ...existing, ready: true });
    refreshGrants();
  };

  const setForceMountAll = (nextForceMountAll: boolean) => {
    if (forceMountAll === nextForceMountAll) return;
    forceMountAll = nextForceMountAll;
    refreshGrants();
  };

  const setMaxActiveMounts = (nextMaxActiveMounts: number) => {
    const nextActiveLimit = normalizeActiveLimit(nextMaxActiveMounts);
    if (activeLimit === nextActiveLimit) return;
    activeLimit = nextActiveLimit;
    refreshGrants();
  };

  const subscribeFrame = (frameId: string, listener: HtmlPreviewMountListener) => {
    const listeners = frameListeners.get(frameId) ?? new Set<HtmlPreviewMountListener>();
    listeners.add(listener);
    frameListeners.set(frameId, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) frameListeners.delete(frameId);
    };
  };

  return {
    getFrameGrantSnapshot: (frameId) => grantedFrameIds.has(frameId),
    registerFrame,
    reset: () => setForceMountAll(false),
    setForceMountAll,
    setFrameReady,
    setMaxActiveMounts,
    subscribeFrame,
    unregisterFrame,
  };
};

const HtmlPreviewMountSchedulerContext = React.createContext<HtmlPreviewMountSchedulerStore | null>(null);

const getFrameTop = (stage: HTMLElement | null) => {
  if (!stage || typeof window === 'undefined') return null;
  return stage.getBoundingClientRect().top + (window.scrollY || window.pageYOffset || 0);
};

export const HtmlPreviewMountSchedulerProvider: React.FC<{
  children: React.ReactNode;
  maxActiveMounts: number;
  resetKey: string;
}> = ({ children, maxActiveMounts, resetKey }) => {
  const [scheduler] = useState(() => createHtmlPreviewMountSchedulerStore(maxActiveMounts));

  useEffect(() => {
    scheduler.setMaxActiveMounts(maxActiveMounts);
  }, [maxActiveMounts, scheduler]);

  useEffect(() => {
    debugHtmlPreview('mount-scheduler-reset', { resetKey });
    // Reset only releases a previous force-mount request. Registrations belong
    // to mounted child effects and must survive a document reset with stable ids.
    scheduler.reset();
  }, [resetKey, scheduler]);

  useEffect(() => {
    const forceMount = () => scheduler.setForceMountAll(true);
    document.addEventListener(MOUNT_DEFERRED_HTML_PREVIEWS_EVENT, forceMount);
    return () => document.removeEventListener(MOUNT_DEFERRED_HTML_PREVIEWS_EVENT, forceMount);
  }, [scheduler]);

  return (
    <HtmlPreviewMountSchedulerContext.Provider value={scheduler}>
      {children}
    </HtmlPreviewMountSchedulerContext.Provider>
  );
};

const subscribeToNoopStore = () => () => {};

export const useHtmlPreviewMountScheduler = ({
  frameId,
  shouldRequestMount,
  stageRef,
}: {
  frameId: string;
  shouldRequestMount: boolean;
  stageRef: React.RefObject<HTMLDivElement | null>;
}) => {
  const scheduler = useContext(HtmlPreviewMountSchedulerContext);
  const registrationRef = React.useRef<Omit<HtmlPreviewMountRegistration, 'top'>>({
    frameId,
    shouldRequestMount,
  });
  registrationRef.current = {
    frameId,
    shouldRequestMount,
  };
  const registerCurrentFrame = useCallback(() => {
    const registration = registrationRef.current;
    scheduler?.registerFrame({
      ...registration,
      top: getFrameTop(stageRef.current),
    });
  }, [scheduler, stageRef]);

  const subscribe = useCallback(
    (listener: HtmlPreviewMountListener) => (
      scheduler?.subscribeFrame(frameId, listener) ?? subscribeToNoopStore()
    ),
    [frameId, scheduler],
  );
  const getSnapshot = useCallback(
    () => shouldRequestMount && (scheduler?.getFrameGrantSnapshot(frameId) ?? true),
    [frameId, scheduler, shouldRequestMount],
  );
  const isGranted = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    if (!scheduler) return undefined;
    registerCurrentFrame();
    return () => scheduler.unregisterFrame(frameId);
  }, [frameId, registerCurrentFrame, scheduler]);

  useEffect(() => {
    registerCurrentFrame();
  }, [frameId, registerCurrentFrame, shouldRequestMount]);

  return isGranted;
};

export const useHtmlPreviewMountFrameReady = ({
  frameId,
  isFrameReady,
}: {
  frameId: string;
  isFrameReady: boolean;
}) => {
  const scheduler = useContext(HtmlPreviewMountSchedulerContext);

  useEffect(() => {
    scheduler?.setFrameReady(frameId, isFrameReady);
  }, [frameId, isFrameReady, scheduler]);
};

export const useScheduledHtmlPreviewLiveMount = ({
  deferMountUntilVisible,
  effectiveIsEditing,
  frameId,
  isMobilePreview,
  stageRef,
}: {
  deferMountUntilVisible: boolean;
  effectiveIsEditing: boolean;
  frameId: string;
  isMobilePreview: boolean;
  stageRef: React.RefObject<HTMLDivElement | null>;
}) => {
  const shouldDeferLiveIframeMount = Boolean(deferMountUntilVisible && !isMobilePreview && !effectiveIsEditing);
  const isDeferredLiveIframeEligible = useDeferredHtmlPreviewMount({
    frameId,
    shouldDeferLiveIframeMount,
    stageRef,
  });
  return useHtmlPreviewMountScheduler({
    frameId,
    shouldRequestMount: !shouldDeferLiveIframeMount || isDeferredLiveIframeEligible,
    stageRef,
  });
};
