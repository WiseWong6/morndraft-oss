import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  getCachedMermaidSvg,
  renderMermaidSvg,
} from '../../utils/mermaid-renderer.js';
import { normalizeMermaidSourceForRender } from '../../utils/mermaid-source.js';
import { getMermaidDiagramScale } from '../../utils/mermaid-theme.js';
import { formatMermaidErrorMessage, getMermaidErrorDisplayLine } from '../../utils/mermaid-error-message.js';

type PreviewTheme = 'dark' | 'light';

export const MERMAID_RENDER_REQUEST_EVENT = 'morndraft:mermaid-render-request';

const MERMAID_CANVAS_BASE_WIDTH = 580;
const MERMAID_DISPLAY_MAX_HEIGHT = 560;

const makeMermaidRenderKey = (code: string, theme: PreviewTheme) => `${theme}\n${code}`;

const getMermaidDisplayWidth = (code: string, svg: string) => {
  const fallbackWidth = Math.max(
    1,
    Math.round(MERMAID_CANVAS_BASE_WIDTH * getMermaidDiagramScale(code)),
  );
  if (!svg) return fallbackWidth;
  const template = document.createElement('template');
  template.innerHTML = svg;
  const svgEl = template.content.querySelector('svg');
  const viewBox = svgEl?.getAttribute('viewBox');
  if (!viewBox) return fallbackWidth;
  const parts = viewBox.split(/\s+|,/).filter(Boolean).map(Number.parseFloat);
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    return fallbackWidth;
  }
  const [, , width, height] = parts;
  if (width <= 0 || height <= 0) return fallbackWidth;
  const projectedHeight = (fallbackWidth * height) / width;
  if (projectedHeight <= MERMAID_DISPLAY_MAX_HEIGHT) {
    return fallbackWidth;
  }
  return Math.max(1, Math.round((MERMAID_DISPLAY_MAX_HEIGHT * width) / height));
};

export const useMermaidSvgRenderer = ({
  code,
  coreDiagnostic,
  theme,
  locale,
  lineOffset,
  normalizeSvg,
  onRenderDiagnosticChange,
  onSvgReady,
}: {
  code: string;
  coreDiagnostic?: unknown | null;
  theme: PreviewTheme;
  locale: string;
  lineOffset: number;
  normalizeSvg: (svg: string, theme: PreviewTheme) => string;
  onRenderDiagnosticChange?: (diagnostic: { line: number | null; messageZh: string; messageEn?: string } | null) => void;
  onSvgReady?: (svg: string) => void;
}) => {
  const [svgContent, setSvgContent] = useState<string>('');
  const [svgTheme, setSvgTheme] = useState<PreviewTheme | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorLine, setErrorLine] = useState<number | null>(null);
  const onSvgReadyRef = useRef(onSvgReady);
  const onRenderDiagnosticChangeRef = useRef(onRenderDiagnosticChange);
  const blockRef = useRef<HTMLDivElement>(null);
  const renderCode = useMemo(() => normalizeMermaidSourceForRender(code), [code]);
  const latestRenderRef = useRef({ code: renderCode, theme });
  const isVisibleRef = useRef(false);
  const svgContentRef = useRef('');
  const renderedKeyRef = useRef('');
  const inflightKeyRef = useRef('');
  const canvasWidth = useMemo(
    () => getMermaidDisplayWidth(renderCode, svgContent),
    [renderCode, svgContent],
  );
  latestRenderRef.current = { code: renderCode, theme };

  useEffect(() => { onSvgReadyRef.current = onSvgReady; }, [onSvgReady]);
  useEffect(() => { onRenderDiagnosticChangeRef.current = onRenderDiagnosticChange; }, [onRenderDiagnosticChange]);
  useEffect(() => { svgContentRef.current = svgContent; }, [svgContent]);

  const applyRenderedSvg = useCallback((svg: string, renderedTheme: PreviewTheme, renderedCode = renderCode) => {
    const cleanedSvg = normalizeSvg(svg, renderedTheme);
    svgContentRef.current = cleanedSvg;
    renderedKeyRef.current = makeMermaidRenderKey(renderedCode, renderedTheme);
    setSvgContent(cleanedSvg);
    setSvgTheme(renderedTheme);
    setError(null);
    setErrorLine(null);
    onRenderDiagnosticChangeRef.current?.(null);
    onSvgReadyRef.current?.(cleanedSvg);
  }, [normalizeSvg, renderCode]);

  const requestRender = useCallback(
    async (priority: 'high' | 'normal' | 'low' = 'normal') => {
      if (coreDiagnostic) return;
      const requestedCode = renderCode;
      const requestedTheme = theme;
      const requestedKey = makeMermaidRenderKey(requestedCode, requestedTheme);
      if (renderedKeyRef.current === requestedKey || inflightKeyRef.current === requestedKey) return;
      inflightKeyRef.current = requestedKey;
      try {
        const svg = await renderMermaidSvg({ code: requestedCode, theme: requestedTheme, priority });
        const latest = latestRenderRef.current;
        if (latest.code !== requestedCode || latest.theme !== requestedTheme) return;
        applyRenderedSvg(svg, requestedTheme, requestedCode);
      } catch (e) {
        const latest = latestRenderRef.current;
        if (latest.code !== requestedCode || latest.theme !== requestedTheme) return;
        renderedKeyRef.current = requestedKey;
        const messageZh = formatMermaidErrorMessage(e, { locale: 'zh', lineOffset });
        const displayLine = getMermaidErrorDisplayLine(e, { lineOffset });
        setError(formatMermaidErrorMessage(e, { locale, lineOffset }));
        setErrorLine(displayLine);
        onRenderDiagnosticChangeRef.current?.({
          line: displayLine,
          messageZh,
          messageEn: formatMermaidErrorMessage(e, { locale: 'en', lineOffset }),
        });
      } finally {
        if (inflightKeyRef.current === requestedKey) {
          inflightKeyRef.current = '';
        }
      }
    },
    [applyRenderedSvg, coreDiagnostic, lineOffset, renderCode, theme, locale],
  );

  useEffect(() => {
    if (coreDiagnostic) return;
    const cachedSvg = getCachedMermaidSvg({ code: renderCode, theme });
    if (cachedSvg) {
      applyRenderedSvg(cachedSvg, theme);
      return;
    }
    setError(null);
    setErrorLine(null);
    if (renderedKeyRef.current !== makeMermaidRenderKey(renderCode, theme)) {
      void requestRender(isVisibleRef.current ? 'high' : 'normal');
    }
  }, [applyRenderedSvg, coreDiagnostic, renderCode, requestRender, theme]);

  useLayoutEffect(() => {
    svgContentRef.current = '';
    renderedKeyRef.current = '';
    inflightKeyRef.current = '';
    setSvgContent('');
    setSvgTheme(null);
    setError(null);
    setErrorLine(null);
    onRenderDiagnosticChangeRef.current?.(null);
  }, [renderCode, theme]);

  useEffect(() => {
    if (!coreDiagnostic) return;
    svgContentRef.current = '';
    renderedKeyRef.current = '';
    inflightKeyRef.current = '';
    setSvgContent('');
    setSvgTheme(null);
    setError(null);
    setErrorLine(null);
  }, [coreDiagnostic]);

  useEffect(() => () => onRenderDiagnosticChangeRef.current?.(null), []);

  useEffect(() => {
    const block = blockRef.current;
    if (coreDiagnostic) return undefined;
    if (!block || typeof IntersectionObserver === 'undefined') {
      isVisibleRef.current = true;
      void requestRender('high');
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const isVisible = entries.some((entry) => entry.isIntersecting);
        isVisibleRef.current = isVisible;
        if (isVisible && renderedKeyRef.current !== makeMermaidRenderKey(renderCode, theme)) {
          void requestRender('high');
        }
      },
      { rootMargin: '360px 0px' },
    );
    observer.observe(block);
    return () => observer.disconnect();
  }, [coreDiagnostic, renderCode, requestRender, theme]);

  useEffect(() => {
    if (coreDiagnostic) return undefined;
    const handleRenderRequest = () => { void requestRender('high'); };
    window.addEventListener(MERMAID_RENDER_REQUEST_EVENT, handleRenderRequest);
    return () => window.removeEventListener(MERMAID_RENDER_REQUEST_EVENT, handleRenderRequest);
  }, [coreDiagnostic, requestRender]);

  return {
    svgContent,
    svgTheme,
    error,
    errorLine,
    canvasWidth,
    blockRef,
    renderCode,
  };
};
