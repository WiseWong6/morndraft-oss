import React, { useMemo } from 'react';
import { HTML_PREVIEW_MIN_HEIGHT } from './htmlPreviewReporter';

type HtmlPreviewFit = {
  iframeWidth: number | null;
  renderedHeight: number;
  renderedWidth: number | null;
  scale: number;
};

export const useHtmlPreviewFrameStyles = ({
  animateHeight = true,
  fit,
  isFullscreen = false,
  mobileStaticImageStatus,
  mobileStaticImageWidth,
  previewHeight,
  stageAvailableWidth,
}: {
  animateHeight?: boolean;
  fit: HtmlPreviewFit;
  isFullscreen?: boolean;
  mobileStaticImageStatus?: string;
  mobileStaticImageWidth?: number | null;
  previewHeight: number;
  stageAvailableWidth: number;
}) => {
  const heightTransition = isFullscreen || !animateHeight ? 'none' : 'height 160ms ease-out';
  const clampedRenderedWidth = fit.renderedWidth && stageAvailableWidth > 0
    ? Math.min(fit.renderedWidth, stageAvailableWidth)
    : fit.renderedWidth;
  const stageStyle = useMemo<React.CSSProperties>(() => ({
    height: isFullscreen ? '100%' : `${fit.renderedHeight}px`,
    maxWidth: '100%',
    minHeight: isFullscreen ? 0 : `${HTML_PREVIEW_MIN_HEIGHT}px`,
    overflow: 'hidden',
    transition: heightTransition,
  }), [fit.renderedHeight, heightTransition, isFullscreen]);
  const mobileStaticStageStyle = useMemo<React.CSSProperties>(() => ({
    margin: '0 auto',
    maxWidth: '100%',
    minHeight: mobileStaticImageStatus === 'ready' ? undefined : `${HTML_PREVIEW_MIN_HEIGHT}px`,
    width: mobileStaticImageStatus === 'ready' && mobileStaticImageWidth && stageAvailableWidth > 0
      ? `${Math.min(mobileStaticImageWidth, stageAvailableWidth)}px`
      : '100%',
  }), [mobileStaticImageStatus, mobileStaticImageWidth, stageAvailableWidth]);
  const viewportStyle = useMemo<React.CSSProperties>(() => ({
    width: isFullscreen ? '100%' : clampedRenderedWidth ? `${clampedRenderedWidth}px` : '100%',
    maxWidth: '100%',
    height: isFullscreen ? '100%' : `${fit.renderedHeight}px`,
    marginLeft: !isFullscreen && clampedRenderedWidth && clampedRenderedWidth < stageAvailableWidth ? 'auto' : undefined,
    marginRight: !isFullscreen && clampedRenderedWidth && clampedRenderedWidth < stageAvailableWidth ? 'auto' : undefined,
    overflow: 'hidden',
    transition: heightTransition,
  }), [clampedRenderedWidth, fit.renderedHeight, heightTransition, isFullscreen, stageAvailableWidth]);
  const normalIframeStyle = useMemo<React.CSSProperties>(() => ({
    width: fit.iframeWidth ? `${fit.iframeWidth}px` : '100%',
    height: `${previewHeight}px`,
    transform: `scale(${fit.scale})`,
    transformOrigin: '0 0',
  }), [fit.iframeWidth, fit.scale, previewHeight]);
  const iframeStyle = useMemo<React.CSSProperties>(() => (
    isFullscreen
      ? {
        width: '100%',
        height: '100%',
        transform: 'none',
        transformOrigin: '0 0',
      }
      : normalIframeStyle
  ), [isFullscreen, normalIframeStyle]);
  const staticCaptureIframeStyle = useMemo<React.CSSProperties>(() => ({
    ...normalIframeStyle,
    left: '-100000px',
    opacity: 0,
    pointerEvents: 'none',
    position: 'fixed',
    top: 0,
  }), [normalIframeStyle]);

  return {
    iframeStyle,
    mobileStaticStageStyle,
    stageStyle,
    staticCaptureIframeStyle,
    viewportStyle,
  };
};
