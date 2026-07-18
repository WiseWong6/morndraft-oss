import { useLayoutEffect, useRef, type RefObject } from 'react';

export const syncHtmlPreviewLiveFrameSource = (
  frame: Pick<HTMLIFrameElement, 'srcdoc'> | null,
  previousSource: string | null,
  nextSource: string,
) => {
  if (!frame || (previousSource === nextSource && frame.srcdoc === nextSource)) return false;
  // Chromium can retain the previous iframe document when React reconciles a
  // srcdoc update after a trusted-edit commit. Own the live-frame navigation
  // through the DOM property without changing the iframe's stable identity.
  frame.srcdoc = nextSource;
  return true;
};

export const useHtmlPreviewLiveFrameSource = ({
  enabled,
  frameRef,
  source,
}: {
  enabled: boolean;
  frameRef: RefObject<HTMLIFrameElement | null>;
  source: string;
}) => {
  const committedSourceRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!enabled || !frame || !source) return;
    const previousSource = committedSourceRef.current;
    committedSourceRef.current = source;
    syncHtmlPreviewLiveFrameSource(frame, previousSource, source);
  }, [enabled, frameRef, source]);
};
