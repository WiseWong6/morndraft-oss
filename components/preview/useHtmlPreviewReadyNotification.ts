import { useEffect, useRef } from 'react';

export const useHtmlPreviewReadyNotification = ({
  isPreviewReady,
  onPreviewReady,
  resetKey,
}: {
  isPreviewReady: boolean;
  onPreviewReady?: () => void;
  resetKey: string;
}) => {
  const onPreviewReadyRef = useRef(onPreviewReady);
  const hasNotifiedPreviewReadyRef = useRef(false);

  useEffect(() => {
    onPreviewReadyRef.current = onPreviewReady;
  }, [onPreviewReady]);

  useEffect(() => {
    hasNotifiedPreviewReadyRef.current = false;
  }, [resetKey]);

  useEffect(() => {
    if (!isPreviewReady || hasNotifiedPreviewReadyRef.current) return;
    hasNotifiedPreviewReadyRef.current = true;
    onPreviewReadyRef.current?.();
  }, [isPreviewReady]);
};
