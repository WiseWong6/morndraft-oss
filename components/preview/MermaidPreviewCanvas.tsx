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
  const canvasRef = React.useRef<HTMLDivElement | null>(null);
  // Wide/tall diagrams render at natural size; the initial scroll position must
  // target the drawn content (getBBox) rather than the viewBox origin, which
  // can be empty whitespace for layouts with padded corners. The Final pane can
  // be display:none when the SVG first renders (single-pane source/final
  // switch), so re-apply once the container actually becomes visible.
  React.useEffect(() => {
    if (isMobilePreview || scale !== 1 || !svgContent) return undefined;
    const canvas = canvasRef.current;
    const container = canvas?.closest('.mermaid-container');
    const svg = canvas?.querySelector('svg');
    if (!canvas || !container || !svg) return undefined;
    let wasHidden = container.clientWidth === 0;
    const scrollToContent = () => {
      try {
        const svgRect = svg.getBoundingClientRect();
        if (container.clientWidth <= 0 || svgRect.width <= 0) return;
        // Anchor to the topmost drawn node: a full-bbox anchor can land on
        // empty whitespace for L/J-shaped layouts (tall subgraphs on one side).
        // Node <g> elements carry their own translate transforms, so measure
        // viewport rects instead of transform-agnostic getBBox calls. All
        // values stay in CSS pixels, matching the scrollTo coordinate space.
        let anchor: { cx: number; top: number } | null = null;
        for (const el of svg.querySelectorAll('g.node, g.cluster')) {
          const r = el.getBoundingClientRect();
          if (r.width <= 0 && r.height <= 0) continue;
          if (!anchor || r.top < anchor.top) {
            anchor = { cx: r.x + r.width / 2, top: r.top };
          }
        }
        if (!anchor) return;
        container.scrollTo({
          left: Math.max(0, anchor.cx - svgRect.x - container.clientWidth / 2),
          top: Math.max(0, anchor.top - svgRect.y - 24),
        });
      } catch {
        // Measurement is unavailable for detached SVG; keep the default position.
      }
    };
    const frame = window.requestAnimationFrame(scrollToContent);
    const observer = new ResizeObserver(() => {
      const isHidden = container.clientWidth === 0;
      if (wasHidden && !isHidden) {
        wasHidden = false;
        window.requestAnimationFrame(scrollToContent);
        observer.disconnect();
        return;
      }
      wasHidden = isHidden;
    });
    observer.observe(container);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [isMobilePreview, scale, svgContent]);
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
      ref={canvasRef}
      className="mermaid-diagram-canvas"
      data-mobile-mermaid-fit={isMobilePreview ? 'height' : undefined}
      style={{ width: isMobilePreview ? undefined : `min(100%, ${canvasWidth}px)` }}
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
