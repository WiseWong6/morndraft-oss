import React from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import ZoomableWrapper from '../ZoomableWrapper';

type MermaidPreviewCanvasProps = {
  canvasWidth: number;
  closeLargeLabel?: string;
  fitMode?: 'contain' | 'none';
  isMobilePreview: boolean;
  openLargeLabel?: string;
  scale: number;
  svgContent: string;
};

const MOBILE_MERMAID_MAX_HEIGHT = 'min(58vh, 460px)';
const MOBILE_MERMAID_VERTICAL_PADDING = '1.5rem';
const MOBILE_MERMAID_LIGHTBOX_MAX_HEIGHT = 'min(82vh, 760px)';
const MOBILE_MERMAID_LIGHTBOX_PADDING = '2rem';

const getSvgViewBoxMetrics = (svgContent: string) => {
  const viewBox = svgContent.match(/\bviewBox=(["'])([^"']+)\1/i)?.[2];
  if (!viewBox) return null;
  const parts = viewBox.split(/\s+|,/).filter(Boolean).map(Number.parseFloat);
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return null;
  const [, , width, height] = parts;
  if (width <= 0 || height <= 0) return null;
  return {
    aspectRatio: `${Number(width.toFixed(3))} / ${Number(height.toFixed(3))}`,
    ratio: Number((width / height).toFixed(6)),
  };
};

const MermaidPreviewCanvasImpl: React.FC<MermaidPreviewCanvasProps> = ({
  canvasWidth,
  closeLargeLabel = 'Close large diagram',
  fitMode = 'none',
  isMobilePreview,
  openLargeLabel = 'Open large diagram',
  scale,
  svgContent,
}) => {
  const [isLightboxOpen, setIsLightboxOpen] = React.useState(false);
  const mobileMetrics = React.useMemo(
    () => getSvgViewBoxMetrics(svgContent),
    [svgContent],
  );
  const mobileCanvasStyle = isMobilePreview && mobileMetrics
    ? {
      '--aad-mermaid-mobile-aspect-ratio': mobileMetrics.aspectRatio,
      '--aad-mermaid-mobile-fit-width': `calc((${MOBILE_MERMAID_MAX_HEIGHT} - ${MOBILE_MERMAID_VERTICAL_PADDING}) * ${mobileMetrics.ratio})`,
      '--aad-mermaid-mobile-max-height': MOBILE_MERMAID_MAX_HEIGHT,
    } as React.CSSProperties
    : undefined;
  const mobileLightboxStyle = isMobilePreview && mobileMetrics
    ? {
      '--aad-mermaid-lightbox-fit-width': `calc((${MOBILE_MERMAID_LIGHTBOX_MAX_HEIGHT} - ${MOBILE_MERMAID_LIGHTBOX_PADDING}) * ${mobileMetrics.ratio})`,
    } as React.CSSProperties
    : undefined;
  const canOpenLightbox = isMobilePreview && Boolean(svgContent);

  React.useEffect(() => {
    if (!isLightboxOpen) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsLightboxOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLightboxOpen]);

  React.useEffect(() => {
    if (!svgContent) setIsLightboxOpen(false);
  }, [svgContent]);

  const content = !svgContent ? (
    <div className="flex items-center justify-center w-full">
      <Loader2 size={20} className="animate-spin" style={{ color: 'var(--aad-accent)' }} />
    </div>
  ) : (
    <div
      className="mermaid-diagram-canvas"
      data-mobile-mermaid-fit={isMobilePreview ? 'height' : undefined}
      style={{ width: isMobilePreview ? undefined : `${canvasWidth}px` }}
      dangerouslySetInnerHTML={{ __html: svgContent }}
    />
  );

  return isMobilePreview ? (
    <>
      <div
        className="mermaid-container aad-mermaid-canvas aad-mermaid-canvas--mobile"
        style={mobileCanvasStyle}
        role={canOpenLightbox ? 'button' : undefined}
        tabIndex={canOpenLightbox ? 0 : undefined}
        aria-label={canOpenLightbox ? openLargeLabel : undefined}
        onClick={canOpenLightbox ? () => setIsLightboxOpen(true) : undefined}
        onKeyDown={canOpenLightbox ? (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          setIsLightboxOpen(true);
        } : undefined}
      >
        {content}
      </div>
      {isLightboxOpen && typeof document !== 'undefined' ? createPortal(
        <div
          className="aad-mermaid-lightbox"
          data-mobile-mermaid-lightbox="true"
          role="dialog"
          aria-modal="true"
          aria-label={openLargeLabel}
          style={mobileLightboxStyle}
          onClick={(event) => {
            if (event.target === event.currentTarget) setIsLightboxOpen(false);
          }}
        >
          <button
            type="button"
            className="aad-mermaid-lightbox-close"
            aria-label={closeLargeLabel}
            title={closeLargeLabel}
            onClick={() => setIsLightboxOpen(false)}
          >
            <X size={18} />
          </button>
          <div className="aad-mermaid-lightbox-scroll">
            <div
              className="aad-mermaid-lightbox-surface"
              dangerouslySetInnerHTML={{ __html: svgContent }}
            />
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  ) : (
    <ZoomableWrapper
      scale={scale}
      fullWidth
      fitMode={fitMode}
      maxPanHeight={fitMode === 'contain' ? undefined : '70vh'}
      className="mermaid-container aad-mermaid-canvas flex justify-center p-4 [&_svg]:h-auto"
    >
      {content}
    </ZoomableWrapper>
  );
};

export const MermaidPreviewCanvas = React.memo(
  MermaidPreviewCanvasImpl,
  (previous, next) => (
    previous.canvasWidth === next.canvasWidth &&
    previous.closeLargeLabel === next.closeLargeLabel &&
    previous.fitMode === next.fitMode &&
    previous.isMobilePreview === next.isMobilePreview &&
    previous.openLargeLabel === next.openLargeLabel &&
    previous.scale === next.scale &&
    previous.svgContent === next.svgContent
  ),
);
