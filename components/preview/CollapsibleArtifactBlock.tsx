import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, Maximize2, Minimize2 } from 'lucide-react';

const EMPTY_COLLAPSED_ARTIFACT_IDS = new Set<string>();

export type PreviewArtifactCollapseContextValue = {
  artifactId?: string;
  collapsedArtifactIds?: ReadonlySet<string>;
  onToggleArtifactCollapsed?: (artifactId: string) => void;
};

export const PreviewArtifactCollapseContext = React.createContext<PreviewArtifactCollapseContextValue>({
  collapsedArtifactIds: EMPTY_COLLAPSED_ARTIFACT_IDS,
});

const getPreviewScrollContainer = (element: HTMLElement) => {
  const explicitContainer = element.closest<HTMLElement>('.aad-preview-scroll');
  if (explicitContainer) return explicitContainer;

  let current = element.parentElement;
  while (current) {
    const style = window.getComputedStyle(current);
    if (
      current.scrollHeight > current.clientHeight &&
      (style.overflowY === 'auto' || style.overflowY === 'scroll')
    ) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
};

export const preservePreviewScrollAnchorForElement = (
  anchorElement: HTMLElement | null | undefined,
) => {
  if (typeof window === 'undefined' || !anchorElement) return;
  const scrollContainer = getPreviewScrollContainer(anchorElement);
  if (!scrollContainer) return;

  const anchorTop =
    anchorElement.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top;
  const restoreAnchor = () => {
    if (!anchorElement.isConnected || !scrollContainer.isConnected) return;
    const nextTop =
      anchorElement.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top;
    const delta = nextTop - anchorTop;
    if (Math.abs(delta) > 0.5) scrollContainer.scrollTop += delta;
  };

  window.requestAnimationFrame(() => {
    restoreAnchor();
    window.requestAnimationFrame(restoreAnchor);
  });
  window.setTimeout(restoreAnchor, 80);
  window.setTimeout(restoreAnchor, 180);
  window.setTimeout(restoreAnchor, 320);
};

export const PreviewArtifactTargetProvider: React.FC<{
  artifactId?: string;
  children: React.ReactNode;
}> = ({ artifactId, children }) => {
  const parentContext = React.useContext(PreviewArtifactCollapseContext);
  const value = React.useMemo(
    () => (artifactId ? { ...parentContext, artifactId } : parentContext),
    [artifactId, parentContext],
  );

  if (!artifactId) return <>{children}</>;
  return (
    <PreviewArtifactCollapseContext.Provider value={value}>
      {children}
    </PreviewArtifactCollapseContext.Provider>
  );
};

export type CollapsibleArtifactBlockProps = {
  label: React.ReactNode;
  meta?: React.ReactNode;
  controls?: React.ReactNode;
  actions?: React.ReactNode;
  fullscreen?: {
    enterLabel: string;
    exitLabel: string;
    onChange?: (active: boolean) => void;
  };
  children: React.ReactNode;
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
  copyRole?: string;
  resetKey: string;
  blockRef?: React.Ref<HTMLDivElement>;
  dataAttributes?: Record<string, string>;
  expandLabel: string;
  collapseLabel: string;
};

export const CollapsibleArtifactBlock: React.FC<CollapsibleArtifactBlockProps> = ({
  label,
  meta,
  controls,
  actions,
  fullscreen,
  children,
  className = '',
  headerClassName = '',
  bodyClassName = '',
  copyRole,
  resetKey,
  blockRef,
  dataAttributes,
  expandLabel,
  collapseLabel,
}) => {
  const collapseContext = React.useContext(PreviewArtifactCollapseContext);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFullscreenSupported, setIsFullscreenSupported] = useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const bodyId = React.useId();
  const artifactId = collapseContext.artifactId;
  const isControlled = Boolean(artifactId && collapseContext.onToggleArtifactCollapsed);
  const collapsedArtifactIds = collapseContext.collapsedArtifactIds ?? EMPTY_COLLAPSED_ARTIFACT_IDS;
  const resolvedIsCollapsed = isControlled && artifactId ? collapsedArtifactIds.has(artifactId) : isCollapsed;
  const toggleLabel = resolvedIsCollapsed ? expandLabel : collapseLabel;
  const fullscreenEnabled = Boolean(fullscreen);
  const fullscreenLabel = isFullscreen ? fullscreen?.exitLabel : fullscreen?.enterLabel;
  const fullscreenOnChange = fullscreen?.onChange;

  const setRootRef = useCallback((element: HTMLDivElement | null) => {
    rootRef.current = element;
    if (!blockRef) return;
    if (typeof blockRef === 'function') {
      blockRef(element);
      return;
    }
    (blockRef as React.MutableRefObject<HTMLDivElement | null>).current = element;
  }, [blockRef]);

  const handleToggle = useCallback(() => {
    const headerElement =
      rootRef.current?.querySelector<HTMLElement>(':scope > .aad-block-header') ?? rootRef.current;
    preservePreviewScrollAnchorForElement(headerElement);
    if (isControlled && artifactId) {
      collapseContext.onToggleArtifactCollapsed?.(artifactId);
      return;
    }
    setIsCollapsed((value) => !value);
  }, [artifactId, collapseContext, isControlled]);

  const handleFullscreenToggle = useCallback(() => {
    if (!fullscreenEnabled || typeof document === 'undefined') return;
    const rootElement = rootRef.current;
    if (!rootElement?.requestFullscreen) return;
    if (document.fullscreenElement === rootElement) {
      const result = document.exitFullscreen?.();
      void result?.catch(() => {});
      return;
    }
    void rootElement.requestFullscreen().catch(() => {});
  }, [fullscreenEnabled]);

  useEffect(() => {
    if (!isControlled) setIsCollapsed(false);
  }, [isControlled, resetKey]);

  useEffect(() => {
    if (!fullscreenEnabled || typeof document === 'undefined') {
      setIsFullscreen(false);
      setIsFullscreenSupported(false);
      return undefined;
    }

    const syncFullscreenState = () => {
      const rootElement = rootRef.current;
      setIsFullscreen(Boolean(rootElement && document.fullscreenElement === rootElement));
      setIsFullscreenSupported(Boolean(document.fullscreenEnabled && rootElement?.requestFullscreen));
    };

    syncFullscreenState();
    document.addEventListener('fullscreenchange', syncFullscreenState);
    return () => document.removeEventListener('fullscreenchange', syncFullscreenState);
  }, [fullscreenEnabled]);

  useEffect(() => {
    fullscreenOnChange?.(isFullscreen);
  }, [fullscreenOnChange, isFullscreen]);

  return (
    <div
      ref={setRootRef}
      className={`aad-artifact-block aad-collapsible-block ${className}`.trim()}
      data-copy-role={copyRole}
      data-collapsible-block="true"
      data-collapsed={resolvedIsCollapsed ? 'true' : 'false'}
      {...dataAttributes}
    >
      <div
        className={`aad-block-header aad-collapsible-header ${headerClassName}`.trim()}
        data-copy-remove="true"
      >
        <div className="aad-block-header-main">
          <button
            type="button"
            className="aad-icon-button aad-collapsible-toggle"
            aria-controls={bodyId}
            aria-expanded={!resolvedIsCollapsed}
            aria-label={toggleLabel}
            title={toggleLabel}
            onClick={handleToggle}
          >
            <ChevronDown size={14} />
          </button>
          <span className="aad-block-label">{label}</span>
          {fullscreenLabel && isFullscreenSupported && !resolvedIsCollapsed && (
            <button
              type="button"
              className="aad-icon-button aad-block-fullscreen-toggle"
              aria-label={fullscreenLabel}
              title={fullscreenLabel}
              data-copy-remove="true"
              onClick={handleFullscreenToggle}
            >
              {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          )}
          {!resolvedIsCollapsed && controls}
        </div>
        <div className="aad-block-header-actions">
          {meta && <span className="aad-block-meta">{meta}</span>}
          {!resolvedIsCollapsed && actions}
        </div>
      </div>
      <div
        id={bodyId}
        className={`aad-collapsible-body ${bodyClassName}`.trim()}
        aria-hidden={resolvedIsCollapsed}
      >
        <div className="aad-collapsible-body-inner">
          {children}
        </div>
      </div>
    </div>
  );
};
