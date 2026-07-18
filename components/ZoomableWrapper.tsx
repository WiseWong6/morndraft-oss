import React, { useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import { getZoomPanLayout } from '@morndraft/core';

interface ZoomableWrapperProps {
  children: React.ReactNode;
  className?: string;
  fitMode?: 'contain' | 'none';
  scale: number;
  fullWidth?: boolean;
  maxPanHeight?: string;
}

const ZoomableWrapper: React.FC<ZoomableWrapperProps> = ({ children, className = '', fitMode = 'none', scale, fullWidth, maxPanHeight }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const measureFrameRef = useRef<number | null>(null);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const scrollLayoutRef = useRef<{
    maxScrollLeft: number;
    maxScrollTop: number;
    scale: number;
    spacerHeight: number;
    spacerWidth: number;
    viewportHeight: number;
    viewportWidth: number;
  } | null>(null);

  // Measure natural size on mount / when children change, and keep observing
  useEffect(() => {
    if (!contentRef.current) return;
    const measure = () => {
      if (measureFrameRef.current) return;
      measureFrameRef.current = window.requestAnimationFrame(() => {
        measureFrameRef.current = null;
        const el = contentRef.current;
        if (!el) return;
        const container = containerRef.current;
        const containerStyle = container ? window.getComputedStyle(container) : null;
        const paddingX = containerStyle
          ? Number.parseFloat(containerStyle.paddingLeft || '0') + Number.parseFloat(containerStyle.paddingRight || '0')
          : 0;
        const paddingY = containerStyle
          ? Number.parseFloat(containerStyle.paddingTop || '0') + Number.parseFloat(containerStyle.paddingBottom || '0')
          : 0;
        const viewport = {
          width: Math.max(0, (container?.clientWidth ?? 0) - paddingX),
          height: Math.max(0, (container?.clientHeight ?? 0) - paddingY),
        };
        const originalTransform = el.style.transform;
        el.style.transform = 'none';
        const rect = el.getBoundingClientRect();
        el.style.transform = originalTransform;
        const nextSize = {
          width: Math.round(Math.max(rect.width, el.scrollWidth)),
          height: Math.round(Math.max(rect.height, el.scrollHeight) + 24),
        };
        setNaturalSize((currentSize) => (
          Math.abs(currentSize.width - nextSize.width) < 1 &&
          Math.abs(currentSize.height - nextSize.height) < 1
            ? currentSize
            : nextSize
        ));
        setViewportSize((current) => (
          Math.abs(current.width - viewport.width) < 1 &&
          Math.abs(current.height - viewport.height) < 1
            ? current
            : viewport
        ));
      });
    };
    measure();
    const timer = setTimeout(measure, 800);

    const ro = new ResizeObserver(measure);
    ro.observe(contentRef.current);
    if (containerRef.current) ro.observe(containerRef.current);

    return () => {
      clearTimeout(timer);
      if (measureFrameRef.current) {
        window.cancelAnimationFrame(measureFrameRef.current);
        measureFrameRef.current = null;
      }
      ro.disconnect();
    };
  }, [children]);

  useEffect(() => {
    if (scale !== 1) return undefined;
    const frame = window.requestAnimationFrame(() => {
      containerRef.current?.scrollTo({ left: 0, top: 0 });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [children, scale]);

  // Drag-to-pan using scrollLeft/scrollTop
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const container = containerRef.current;
    if (!container || scale === 1) return;
    setIsPanning(true);
    const startX = e.clientX;
    const startY = e.clientY;
    const startScrollLeft = container.scrollLeft;
    const startScrollTop = container.scrollTop;

    const onMove = (ev: MouseEvent) => {
      container.scrollLeft = startScrollLeft + (startX - ev.clientX);
      container.scrollTop = startScrollTop + (startY - ev.clientY);
    };
    const onUp = () => {
      setIsPanning(false);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    e.preventDefault();
  }, [scale]);

  const containScale = React.useMemo(() => {
    if (fitMode !== 'contain') return 1;
    if (
      naturalSize.width <= 0 ||
      naturalSize.height <= 0 ||
      viewportSize.width <= 0 ||
      viewportSize.height <= 0
    ) return 1;

    return Math.max(
      0.1,
      Math.min(8, viewportSize.width / naturalSize.width, viewportSize.height / naturalSize.height),
    );
  }, [fitMode, naturalSize.height, naturalSize.width, viewportSize.height, viewportSize.width]);
  const effectiveScale = scale * containScale;
  const isUserPannable = scale !== 1;
  const shouldCenterFittedContent = fitMode === 'contain' && !isUserPannable;

  const {
    contentLeft,
    contentTop,
    contentWidth,
    maxScrollLeft,
    maxScrollTop,
    minSpacerWidth,
    spacerHeight,
    spacerWidth,
  } = getZoomPanLayout({
    fullWidth,
    naturalHeight: naturalSize.height,
    naturalWidth: naturalSize.width,
    scale: effectiveScale,
    viewportHeight: viewportSize.height,
    viewportWidth: viewportSize.width,
  });

  useLayoutEffect(() => {
    const container = containerRef.current;
    const numericSpacerWidth = Number(spacerWidth);
    const numericSpacerHeight = Number(spacerHeight);
    const nextMaxScrollLeft = maxScrollLeft ?? Math.max(0, numericSpacerWidth - viewportSize.width);
    const nextMaxScrollTop = maxScrollTop ?? Math.max(0, numericSpacerHeight - viewportSize.height);
    const nextLayout = {
      maxScrollLeft: nextMaxScrollLeft,
      maxScrollTop: nextMaxScrollTop,
      scale: effectiveScale,
      spacerHeight: numericSpacerHeight,
      spacerWidth: numericSpacerWidth,
      viewportHeight: viewportSize.height,
      viewportWidth: viewportSize.width,
    };
    const previousLayout = scrollLayoutRef.current;
    scrollLayoutRef.current = nextLayout;
    if (!container || !previousLayout) return;
    if (
      !Number.isFinite(numericSpacerWidth) ||
      !Number.isFinite(numericSpacerHeight) ||
      viewportSize.width <= 0 ||
      viewportSize.height <= 0 ||
      Math.abs(previousLayout.scale - effectiveScale) < 0.0001
    ) {
      return;
    }

    const clamp = (value: number, max: number) => Math.max(0, Math.min(max, Math.round(value)));
    const keepAxisCenter = (nextMaxScroll: number) => (
      nextMaxScroll <= 0 ? 0 : nextMaxScroll / 2
    );

    const targetScroll = {
      left: clamp(keepAxisCenter(nextMaxScrollLeft), nextMaxScrollLeft),
      top: clamp(keepAxisCenter(nextMaxScrollTop), nextMaxScrollTop),
    };
    container.scrollTo(targetScroll);
    const frame = window.requestAnimationFrame(() => {
      container.scrollTo(targetScroll);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [effectiveScale, maxScrollLeft, maxScrollTop, spacerHeight, spacerWidth, viewportSize.height, viewportSize.width]);

  return (
    <div
      ref={containerRef}
      className={`overflow-auto ${className}`}
      onMouseDown={handleMouseDown}
      style={{
        alignItems: shouldCenterFittedContent ? 'center' : 'flex-start',
        cursor: isPanning ? 'grabbing' : isUserPannable ? 'grab' : 'default',
        justifyContent: isUserPannable ? 'flex-start' : shouldCenterFittedContent ? 'center' : undefined,
        maxHeight: isUserPannable ? maxPanHeight : undefined,
        overscrollBehavior: isUserPannable ? 'contain' : undefined,
      }}
    >
      <div
        style={{
          width: spacerWidth,
          minWidth: minSpacerWidth,
          height: spacerHeight,
          minHeight: spacerHeight,
          flexShrink: 0,
          position: 'relative',
        }}
      >
        <div
          ref={contentRef}
          style={{
            transform: `scale(${effectiveScale})`,
            transformOrigin: 'center center',
            display: fullWidth ? 'block' : 'inline-block',
            left: contentLeft,
            position: 'absolute',
            top: contentTop,
            width: contentWidth,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
};

export default ZoomableWrapper;
