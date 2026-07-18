import React from 'react';
import { ChevronDown } from 'lucide-react';
import type { ArtifactPreviewTranslations } from '../../i18n';
import { preservePreviewScrollAnchorForElement } from './CollapsibleArtifactBlock';
import { JsonValue } from './JsonPreviewSyntax';

type JsonPath = string;

const isJsonContainer = (value: unknown): value is Record<string, unknown> | unknown[] => (
  value !== null && typeof value === 'object'
);

const getJsonContainerEntries = (value: Record<string, unknown> | unknown[]) => (
  Array.isArray(value)
    ? value.map((child, index) => ({ key: index, value: child }))
    : Object.entries(value).map(([key, child]) => ({ key, value: child }))
);

const getJsonChildPath = (parentPath: JsonPath, key: string | number) => {
  if (typeof key === 'number') return `${parentPath}[${key}]`;
  if (/^[A-Za-z_$][\w$]*$/.test(key)) return `${parentPath}.${key}`;
  return `${parentPath}[${JSON.stringify(key)}]`;
};

const JsonTreeLine: React.FC<{
  children: React.ReactNode;
  depth: number;
  kind: 'collapsed' | 'close' | 'leaf' | 'open';
  path?: JsonPath;
}> = ({ children, depth, kind, path }) => (
  <div
    className="aad-json-line aad-json-tree-line"
    data-json-depth={depth}
    data-json-path={path}
    data-json-tree-line={kind}
    style={{ '--aad-json-depth': depth } as React.CSSProperties}
  >
    {children}
  </div>
);

const JsonTreeSpacer = () => <span className="aad-json-tree-spacer" aria-hidden="true" />;

const getJsonPrimitiveDisplay = (value: unknown) => {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return 'null';
};

const renderJsonPropertyLabel = (propertyKey?: string | number) => {
  if (propertyKey === undefined) return null;
  const label = typeof propertyKey === 'number' ? String(propertyKey) : JSON.stringify(propertyKey);
  return (
    <>
      <span className="aad-json-key">{label}:</span>
      <span className="aad-json-punctuation"> </span>
    </>
  );
};

const getJsonNodeSummary = (value: Record<string, unknown> | unknown[]) => {
  if (Array.isArray(value)) return `[${value.length} item${value.length === 1 ? '' : 's'}]`;
  return '{ ... }';
};

const JsonTreeToggle: React.FC<{
  isCollapsed: boolean;
  onToggle: (button: HTMLButtonElement) => void;
  path: JsonPath;
  summary: string;
  t: ArtifactPreviewTranslations;
}> = ({ isCollapsed, onToggle, path, summary, t }) => {
  const label = isCollapsed ? t.expandBlock : t.collapseBlock;
  return (
    <button
      type="button"
      className="aad-json-tree-toggle"
      aria-expanded={!isCollapsed}
      aria-label={label}
      title={label}
      data-copy-remove="true"
      data-json-path={path}
      data-json-tree-summary={summary}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggle(event.currentTarget);
      }}
    >
      <ChevronDown size={13} />
    </button>
  );
};

const JsonTreeValue: React.FC<{
  value: unknown;
  path: JsonPath;
  depth: number;
  propertyKey?: string | number;
  isLast?: boolean;
  collapsedPaths: ReadonlySet<JsonPath>;
  onTogglePath: (path: JsonPath, button: HTMLButtonElement) => void;
  t: ArtifactPreviewTranslations;
}> = ({ value, path, depth, propertyKey, isLast = true, collapsedPaths, onTogglePath, t }) => {
  const suffix = isLast ? '' : ',';
  if (!isJsonContainer(value)) {
    return (
      <JsonTreeLine depth={depth} kind="leaf" path={path}>
        <JsonTreeSpacer />
        {renderJsonPropertyLabel(propertyKey)}
        <JsonValue value={getJsonPrimitiveDisplay(value)} />
        {suffix && <span className="aad-json-punctuation">{suffix}</span>}
      </JsonTreeLine>
    );
  }

  const entries = getJsonContainerEntries(value);
  const isArray = Array.isArray(value);
  const isCollapsed = collapsedPaths.has(path);
  const opening = isArray ? '[' : '{';
  const closing = isArray ? ']' : '}';

  if (entries.length === 0) {
    return (
      <JsonTreeLine depth={depth} kind="leaf" path={path}>
        <JsonTreeSpacer />
        {renderJsonPropertyLabel(propertyKey)}
        <span className="aad-json-punctuation">{opening}{closing}{suffix}</span>
      </JsonTreeLine>
    );
  }

  if (isCollapsed) {
    return (
      <JsonTreeLine depth={depth} kind="collapsed" path={path}>
        <JsonTreeToggle
          isCollapsed={isCollapsed}
          onToggle={(button) => onTogglePath(path, button)}
          path={path}
          summary={`${getJsonNodeSummary(value)}${suffix}`}
          t={t}
        />
        {renderJsonPropertyLabel(propertyKey)}
        <span className="aad-json-node-summary">{getJsonNodeSummary(value)}</span>
        {suffix && <span className="aad-json-punctuation">{suffix}</span>}
      </JsonTreeLine>
    );
  }

  return (
    <>
      <JsonTreeLine depth={depth} kind="open" path={path}>
        <JsonTreeToggle
          isCollapsed={isCollapsed}
          onToggle={(button) => onTogglePath(path, button)}
          path={path}
          summary={`${getJsonNodeSummary(value)}${suffix}`}
          t={t}
        />
        {renderJsonPropertyLabel(propertyKey)}
        <span className="aad-json-punctuation aad-json-opening">{opening}</span>
        <span className="aad-json-node-summary aad-json-collapsed-summary" hidden>{getJsonNodeSummary(value)}{suffix}</span>
      </JsonTreeLine>
      {entries.map((entry, index) => (
        <JsonTreeValue
          key={getJsonChildPath(path, entry.key)}
          value={entry.value}
          path={getJsonChildPath(path, entry.key)}
          depth={depth + 1}
          propertyKey={isArray ? undefined : entry.key}
          isLast={index === entries.length - 1}
          collapsedPaths={collapsedPaths}
          onTogglePath={onTogglePath}
          t={t}
        />
      ))}
      <JsonTreeLine depth={depth} kind="close" path={path}>
        <JsonTreeSpacer />
        <span className="aad-json-punctuation">{closing}{suffix}</span>
      </JsonTreeLine>
    </>
  );
};

export const JsonTreeView: React.FC<{ t: ArtifactPreviewTranslations; value: unknown }> = ({ t, value }) => {
  const [collapsedPaths, setCollapsedPaths] = React.useState<ReadonlySet<JsonPath>>(() => new Set());
  const handleTogglePath = React.useCallback((path: JsonPath, button: HTMLButtonElement) => {
    preservePreviewScrollAnchorForElement(button.closest<HTMLElement>('.aad-json-tree-line') ?? button);
    setCollapsedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  return <JsonTreeValue value={value} path="$" depth={0} collapsedPaths={collapsedPaths} onTogglePath={handleTogglePath} t={t} />;
};
