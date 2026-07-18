import React from 'react';
import { ChevronDown, ListTree, PanelLeftClose, X } from 'lucide-react';

export type ArtifactMapSourceRange = {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
};

export type ArtifactMapEntry = {
  anchorId?: string;
  collapseKey?: string;
  id: string;
  kind: string;
  kindLabel: string;
  line: number;
  level: number;
  parentId?: string;
  sectionEndLine?: number;
  sourceRange?: ArtifactMapSourceRange;
  targetId?: string;
  hasChildren?: boolean;
  title: string;
};

export type ArtifactMapProps = {
  collapsedEntryIds?: ReadonlySet<string>;
  collapsibleEntryIds?: ReadonlySet<string>;
  entries: readonly ArtifactMapEntry[];
  title: string;
  emptyLabel: string;
  closeLabel: string;
  expandEntryLabel?: (entry: ArtifactMapEntry) => string;
  collapseEntryLabel?: (entry: ArtifactMapEntry) => string;
  lineLabel: (line: number) => string;
  onNavigate: (entry: ArtifactMapEntry) => void;
  onToggleEntryCollapsed?: (entry: ArtifactMapEntry) => void;
  onClose?: () => void;
};

export type ArtifactMapShellProps = ArtifactMapProps & {
  children: React.ReactNode;
  isEnabled: boolean;
  isOpen: boolean;
  isPanelOpen?: boolean;
  overlay?: React.ReactNode;
  reserveRailSlot?: boolean;
  panelExpandLabel?: string;
  panelCollapseLabel?: string;
  onPanelToggle?: () => void;
};

export type ArtifactMapToggleProps = {
  isVisible: boolean;
  label: string;
  title: string;
  onOpen: () => void;
};

type ArtifactMapContentProps = ArtifactMapProps & {
  controlKind?: 'close' | 'collapse';
  controlLabel?: string;
  onControl?: () => void;
};

const ArtifactMapContent: React.FC<ArtifactMapContentProps> = ({
  entries,
  collapsedEntryIds,
  collapsibleEntryIds,
  title,
  emptyLabel,
  closeLabel,
  expandEntryLabel,
  collapseEntryLabel,
  onNavigate,
  onToggleEntryCollapsed,
  onClose,
  controlKind = 'close',
  controlLabel,
  onControl,
}) => {
  const handleControl = onControl ?? onClose;
  const resolvedControlLabel = controlLabel ?? closeLabel;
  return (
    <>
      <div className="aad-artifact-map-header">
        <div className="aad-artifact-map-title">
          <span>{title}</span>
        </div>
        {handleControl && (
          <button
            type="button"
            className="aad-icon-button aad-artifact-map-header-control"
            title={resolvedControlLabel}
            aria-label={resolvedControlLabel}
            onClick={handleControl}
          >
            {controlKind === 'collapse' ? <PanelLeftClose size={14} /> : <X size={14} />}
          </button>
        )}
      </div>
      {entries.length > 0 ? (
        <nav className="aad-artifact-map-nav" aria-label={title}>
          <ol>
            {entries.map((entry) => {
              const canCollapse = Boolean(collapsibleEntryIds?.has(entry.id) && onToggleEntryCollapsed);
              const isCollapsed = Boolean(collapsedEntryIds?.has(entry.id));
              const toggleLabel = isCollapsed
                ? expandEntryLabel?.(entry) ?? entry.title
                : collapseEntryLabel?.(entry) ?? entry.title;
              return (
                <li key={entry.id}>
                  <div
                    className="aad-artifact-map-item"
                    data-kind={entry.kind}
                    style={{ '--aad-map-depth': Math.min(6, Math.max(1, entry.level)) } as React.CSSProperties}
                  >
                    {canCollapse ? (
                      <button
                        type="button"
                        className="aad-icon-button aad-artifact-map-item-collapse"
                        aria-expanded={!isCollapsed}
                        aria-label={toggleLabel}
                        title={toggleLabel}
                        onClick={(event) => {
                          event.stopPropagation();
                          onToggleEntryCollapsed?.(entry);
                        }}
                      >
                        <ChevronDown size={13} />
                      </button>
                    ) : (
                      <span className="aad-artifact-map-item-collapse-spacer" aria-hidden="true" />
                    )}
                    <button
                      type="button"
                      className="aad-artifact-map-item-title-button"
                      onClick={() => onNavigate(entry)}
                    >
                      <span className="aad-artifact-map-item-title">{entry.title}</span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        </nav>
      ) : (
        <div className="aad-artifact-map-empty">{emptyLabel}</div>
      )}
    </>
  );
};

export const ArtifactMapPanel: React.FC<ArtifactMapProps & {
  collapseLabel?: string;
  onCollapse?: () => void;
}> = ({ collapseLabel, onCollapse, ...props }) => (
  <aside className="aad-artifact-map-panel" aria-label={props.title}>
    <ArtifactMapContent
      {...props}
      controlKind="collapse"
      controlLabel={collapseLabel}
      onControl={onCollapse}
    />
  </aside>
);

export const ArtifactMapRail: React.FC<{
  title: string;
  openLabel: string;
  onOpen?: () => void;
}> = ({ title, openLabel, onOpen }) => (
  <aside className="aad-artifact-map-rail" aria-label={title}>
    <button
      type="button"
      className="aad-icon-button aad-toolbar-icon-button aad-artifact-map-rail-button"
      title={openLabel}
      aria-label={openLabel}
      onClick={onOpen}
    >
      <ListTree size={15} />
    </button>
  </aside>
);

export const ArtifactMapDrawer: React.FC<ArtifactMapProps> = (props) => (
  <div className="aad-artifact-map-drawer" role="dialog" aria-modal="true" aria-label={props.title}>
    <div className="aad-artifact-map-drawer-scrim" onClick={props.onClose} />
    <aside className="aad-artifact-map-drawer-panel">
      <ArtifactMapContent {...props} />
    </aside>
  </div>
);

export const ArtifactMapToggle: React.FC<ArtifactMapToggleProps> = ({ isVisible, label, title, onOpen }) => isVisible ? (
  <button
    onClick={onOpen}
    className="aad-action-button aad-artifact-map-toggle"
    title={title}
    aria-label={title}
  >
    <ListTree size={14} />
    <span className="hidden md:inline">{label}</span>
  </button>
) : null;

export const ArtifactMapShell: React.FC<ArtifactMapShellProps> = ({
  children,
  isEnabled,
  isOpen,
  isPanelOpen = true,
  overlay,
  reserveRailSlot = false,
  onClose,
  onPanelToggle,
  panelExpandLabel,
  panelCollapseLabel,
  ...mapProps
}) => {
  const canShowMap = isEnabled;
  const shouldReserveRailSlot = !canShowMap && reserveRailSlot;
  const showPanel = canShowMap && isPanelOpen;
  const showRail = canShowMap && !showPanel;

  return (
    <>
      {isEnabled && isOpen && <ArtifactMapDrawer {...mapProps} onClose={onClose} />}
      <div className={`aad-preview-content-frame ${showPanel ? 'has-artifact-map' : ''} ${showRail ? 'has-artifact-map-rail' : ''}`.trim()}>
        {overlay}
        {canShowMap ? (
          <div className={`aad-artifact-map-sidecar ${showPanel ? 'is-open' : 'is-collapsed'}`}>
            <ArtifactMapPanel
              {...mapProps}
              collapseLabel={panelCollapseLabel}
              onCollapse={onPanelToggle}
            />
            <ArtifactMapRail
              title={mapProps.title}
              openLabel={panelExpandLabel ?? mapProps.title}
              onOpen={onPanelToggle}
            />
          </div>
        ) : shouldReserveRailSlot ? (
          <div className="aad-artifact-map-sidecar is-collapsed is-placeholder" aria-hidden="true" />
        ) : null}
        {children}
      </div>
    </>
  );
};
