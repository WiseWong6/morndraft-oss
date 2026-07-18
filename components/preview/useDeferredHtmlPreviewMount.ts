import { useEffect, useState, type RefObject } from 'react';
import { MOUNT_DEFERRED_HTML_PREVIEWS_EVENT } from './htmlPreviewDeferredMount';

export const useDeferredHtmlPreviewMount = ({
  frameId,
  shouldDeferLiveIframeMount,
  stageRef,
}: {
  frameId: string;
  shouldDeferLiveIframeMount: boolean;
  stageRef: RefObject<HTMLDivElement | null>;
}) => {
  const [shouldMountLiveIframe, setShouldMountLiveIframe] = useState(!shouldDeferLiveIframeMount);

  useEffect(() => {
    setShouldMountLiveIframe(!shouldDeferLiveIframeMount);
  }, [frameId, shouldDeferLiveIframeMount]);

  useEffect(() => {
    if (!shouldDeferLiveIframeMount || shouldMountLiveIframe) return undefined;

    let didMount = false;
    let observer: IntersectionObserver | null = null;
    const mountLiveIframe = () => {
      if (didMount) return;
      didMount = true;
      setShouldMountLiveIframe(true);
      observer?.disconnect();
    };

    document.addEventListener(MOUNT_DEFERRED_HTML_PREVIEWS_EVENT, mountLiveIframe);

    const target = stageRef.current;
    if (!target || typeof IntersectionObserver === 'undefined') {
      mountLiveIframe();
      return () => {
        document.removeEventListener(MOUNT_DEFERRED_HTML_PREVIEWS_EVENT, mountLiveIframe);
        observer?.disconnect();
      };
    }

    const rect = target.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    if (rect.bottom >= -240 && rect.top <= viewportHeight + 960) {
      mountLiveIframe();
    } else {
      observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting || entry.intersectionRatio > 0)) {
          mountLiveIframe();
        }
      }, { rootMargin: '960px 0px' });
      observer.observe(target);
    }

    return () => {
      document.removeEventListener(MOUNT_DEFERRED_HTML_PREVIEWS_EVENT, mountLiveIframe);
      observer?.disconnect();
    };
  }, [frameId, shouldDeferLiveIframeMount, shouldMountLiveIframe, stageRef]);

  return shouldMountLiveIframe;
};
