import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ArtifactPreviewTranslations } from '../../i18n';

export type MermaidLabel = {
  contextLabel?: string;
  group?: string;
  id: number;
  kind: string;
  original: string;
  readOnlyReason?: string;
  replacementMode?: string;
  sourceOffset: number;
  sourceLength: number;
};

const KIND_GROUP_NAMES_BY_LOCALE: Record<string, Record<string, string>> = {
  zh: {
    node: '节点标签',
    edge: '边标签',
    participant: '参与者',
    message: '消息',
    class: '类名',
    attribute: '属性',
    method: '方法',
    state: '状态',
    entity: '实体',
    fieldType: '字段类型',
    field: '字段名',
    relation: '关系',
    task: '任务',
    title: '标题',
    section: '分组',
    slice: '扇区',
    branch: '分支',
    axis: '坐标轴',
    quadrant: '象限',
    point: '点',
    commit: '提交',
    tag: '标签',
    requirement: '需求',
    text: '正文',
    label: '标签',
    column: '列',
    note: '备注',
    group: '分组',
  },
  en: {
    node: 'Node Labels',
    edge: 'Edge Labels',
    participant: 'Participants',
    message: 'Messages',
    class: 'Class',
    attribute: 'Attribute',
    method: 'Method',
    state: 'State',
    entity: 'Entity',
    fieldType: 'Field Types',
    field: 'Field Names',
    relation: 'Relation',
    task: 'Task',
    title: 'Titles',
    section: 'Groups',
    slice: 'Slice',
    branch: 'Branch',
    axis: 'Axes',
    quadrant: 'Quadrants',
    point: 'Points',
    commit: 'Commits',
    tag: 'Tags',
    requirement: 'Requirements',
    text: 'Text',
    label: 'Labels',
    column: 'Columns',
    note: 'Notes',
    group: 'Groups',
  },
};

const GROUP_ORDER = [
  'title',
  'node', 'edge', 'participant', 'message',
  'class', 'attribute', 'method',
  'state', 'entity', 'fieldType', 'field', 'relation',
  'section', 'task', 'slice', 'branch',
  'axis', 'quadrant', 'point', 'commit', 'tag', 'requirement', 'text', 'label', 'column', 'note', 'group',
];

type MermaidLabelEditorProps = {
  availabilityReason?: string;
  blockKey: string;
  error?: string | null;
  labels: MermaidLabel[];
  onCancel: () => void;
  onCloseAfterCommit: () => void;
  onCommit: (edits: Map<number, string>) => boolean | Promise<boolean>;
  onDraftChange?: () => void;
  sessionId: string;
  t: ArtifactPreviewTranslations;
};

type MermaidLabelCommitOptions = {
  closeOnSuccess?: boolean;
};

type MermaidLabelEditSession = {
  commit: (options?: MermaidLabelCommitOptions) => Promise<boolean>;
  root: () => HTMLElement | null;
  sessionId: string;
};

type MermaidLabelEditDraft = {
  blockKey: string;
  values: Map<number, string>;
};

let activeMermaidLabelEditSession: MermaidLabelEditSession | null = null;
let activeMermaidLabelEditDraft: MermaidLabelEditDraft | null = null;
let pendingMermaidLabelFocusTarget: { type: 'label'; id: number } | { type: 'search' } | { type: 'none' } | null = null;

type MermaidLabelFilter = 'node' | 'edge' | 'all';

const CONCRETE_LABEL_FILTERS: MermaidLabelFilter[] = ['node', 'edge'];

const getLabelGroup = (label: MermaidLabel) => label.group ?? label.kind;

const matchesLabelFilter = (label: MermaidLabel, filter: MermaidLabelFilter) => {
  if (filter === 'all') return true;
  return getLabelGroup(label) === filter;
};

const getAvailableLabelFilters = (labels: MermaidLabel[]): MermaidLabelFilter[] => {
  const editableLabels = labels.filter((label) => !label.readOnlyReason);
  const concreteFilters = CONCRETE_LABEL_FILTERS.filter((filter) => (
    editableLabels.some((label) => matchesLabelFilter(label, filter))
  ));
  return concreteFilters.length >= 2 ? [...concreteFilters, 'all'] : [];
};

const getDefaultFilter = (labels: MermaidLabel[]): MermaidLabelFilter => {
  const filters = getAvailableLabelFilters(labels);
  return filters[0] ?? 'all';
};

const registerMermaidLabelEditSession = (session: MermaidLabelEditSession) => {
  activeMermaidLabelEditSession = session;
  return () => {
    if (activeMermaidLabelEditSession?.sessionId === session.sessionId) {
      activeMermaidLabelEditSession = null;
    }
  };
};

export const requestMermaidLabelEditActivation = async (sessionId: string) => {
  const activeSession = activeMermaidLabelEditSession;
  if (!activeSession || activeSession.sessionId === sessionId) return true;
  return activeSession.commit({ closeOnSuccess: true });
};

export const activateMermaidLabelEditDraft = (blockKey: string, labels: MermaidLabel[]) => {
  activeMermaidLabelEditDraft = {
    blockKey,
    values: new Map(labels.map((label) => [label.id, label.original])),
  };
};

export const clearMermaidLabelEditDraft = (blockKey: string) => {
  if (activeMermaidLabelEditDraft?.blockKey === blockKey) {
    activeMermaidLabelEditDraft = null;
  }
};

export const clearActiveMermaidLabelEditDraft = () => {
  activeMermaidLabelEditDraft = null;
};

export const getMermaidLabelEditDraftValues = (blockKey: string) => (
  activeMermaidLabelEditDraft?.blockKey === blockKey
    ? new Map(activeMermaidLabelEditDraft.values)
    : null
);

export const isMermaidLabelEditDraftActive = (blockKey: string) => (
  activeMermaidLabelEditDraft?.blockKey === blockKey
);

export const updateMermaidLabelEditDraft = (blockKey: string, values: Map<number, string>) => {
  if (activeMermaidLabelEditDraft?.blockKey === blockKey) {
    activeMermaidLabelEditDraft.values = new Map(values);
  }
};

export const MermaidLabelEditor: React.FC<MermaidLabelEditorProps> = ({
  availabilityReason,
  blockKey,
  error,
  labels,
  onCancel,
  onCloseAfterCommit,
  onCommit,
  onDraftChange,
  sessionId,
  t,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef(labels);
  const valuesRef = useRef<Map<number, string>>(new Map(labels.map((label) => [label.id, label.original])));
  const commitPromiseRef = useRef<Promise<boolean> | null>(null);
  const closeAfterCommitRef = useRef(false);
  const ignoreDocumentClickUntilRef = useRef(0);
  const initialValues = useMemo(
    () => getMermaidLabelEditDraftValues(blockKey) ?? new Map(labels.map((label) => [label.id, label.original])),
    [blockKey, labels],
  );
  const [values, setValues] = useState(initialValues);
  const [activeFilter, setActiveFilter] = useState<MermaidLabelFilter>(() => getDefaultFilter(labels));
  const [searchQuery, setSearchQuery] = useState('');
  const [commitState, setCommitState] = useState<'saved' | 'dirty' | 'validating'>('saved');

  useEffect(() => {
    labelsRef.current = labels;
  }, [labels]);

  useEffect(() => {
    const nextValues = getMermaidLabelEditDraftValues(blockKey) ?? new Map(labels.map((label) => [label.id, label.original]));
    setValues(nextValues);
    valuesRef.current = nextValues;
    setCommitState('saved');
  }, [blockKey, labels]);

  useEffect(() => {
    valuesRef.current = values;
    updateMermaidLabelEditDraft(blockKey, values);
  }, [blockKey, values]);

  const locale = t.locale || 'zh';
  const groupNames = KIND_GROUP_NAMES_BY_LOCALE[locale] ?? KIND_GROUP_NAMES_BY_LOCALE.zh;
  const editableLabels = labels.filter((label) => !label.readOnlyReason);
  const availableFilters = useMemo(() => getAvailableLabelFilters(labels), [labels]);
  const hasPendingChanges = labels.some((label) => (
    !label.readOnlyReason
    && values.get(label.id) !== undefined
    && values.get(label.id) !== label.original
  ));
  const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase();
  const labelsForDisplay = availableFilters.length > 0
    ? editableLabels.filter((label) => matchesLabelFilter(label, activeFilter))
    : editableLabels;
  const filterLabels = (label: MermaidLabel) => {
    if (!normalizedSearchQuery) return true;
    const currentValue = values.get(label.id) ?? label.original;
    return [
      label.original,
      currentValue,
      label.contextLabel ?? '',
      groupNames[getLabelGroup(label)] ?? getLabelGroup(label),
    ].some((part) => part.toLocaleLowerCase().includes(normalizedSearchQuery));
  };
  const visibleLabels = labelsForDisplay.filter(filterLabels);
  const statusLabel = error
    ? t.mermaidEditorPending
    : commitState === 'validating'
      ? t.mermaidEditorChecking
      : hasPendingChanges || commitState === 'dirty'
        ? t.mermaidEditorPending
        : t.mermaidEditorChecked;
  const statusTone = error || hasPendingChanges || commitState === 'dirty'
    ? 'pending'
    : commitState === 'validating'
      ? 'checking'
      : 'checked';

  const emptyHint = availabilityReason === 'unknown-diagram'
    ? t.mermaidEditUnavailable
    : t.mermaidNoLabels;

  const handleChange = useCallback(
    (id: number, value: string) => {
      setValues((current) => {
        const next = new Map(current);
        next.set(id, value);
        return next;
      });
      setCommitState('dirty');
      onDraftChange?.();
    },
    [onDraftChange],
  );

  const handleCommit = useCallback(
    (options: MermaidLabelCommitOptions = {}) => {
      if (options.closeOnSuccess) closeAfterCommitRef.current = true;
      if (commitPromiseRef.current) return commitPromiseRef.current;
      const edits = new Map<number, string>();
      for (const label of labelsRef.current) {
        if (label.readOnlyReason) continue;
        const nextValue = valuesRef.current.get(label.id);
        if (nextValue !== undefined && nextValue !== label.original) {
          edits.set(label.id, nextValue);
        }
      }
      setCommitState('validating');
      const commitPromise = Promise.resolve(onCommit(edits))
        .then((success) => {
          if (success) {
            setCommitState('saved');
            if (closeAfterCommitRef.current) onCloseAfterCommit();
          } else {
            setCommitState('dirty');
          }
          return success;
        })
        .finally(() => {
          commitPromiseRef.current = null;
          closeAfterCommitRef.current = false;
        });
      commitPromiseRef.current = commitPromise;
      return commitPromise;
    },
    [onCloseAfterCommit, onCommit],
  );

  useEffect(() => registerMermaidLabelEditSession({
    commit: handleCommit,
    root: () => rootRef.current,
    sessionId,
  }), [handleCommit, sessionId]);

  useEffect(() => {
    ignoreDocumentClickUntilRef.current = Date.now() + 120;
    const animationFrameId = window.requestAnimationFrame(() => {
      const focusTarget = pendingMermaidLabelFocusTarget;
      pendingMermaidLabelFocusTarget = null;
      if (focusTarget?.type === 'none') return;
      const input = focusTarget?.type === 'label'
        ? rootRef.current?.querySelector<HTMLInputElement>(`.aad-label-input[data-mermaid-label-id="${focusTarget.id}"]:not(:disabled)`)
        : focusTarget?.type === 'search'
          ? rootRef.current?.querySelector<HTMLInputElement>('.aad-label-search')
          : rootRef.current?.querySelector<HTMLInputElement>('.aad-label-input:not(:disabled)');
      if (!input) return;
      try {
        input.focus({ preventScroll: true });
      } catch {
        input.focus();
      }
      input.select();
    });
    return () => window.cancelAnimationFrame(animationFrameId);
  }, []);

  useEffect(() => {
    if (availableFilters.length === 0) {
      if (activeFilter !== 'all') setActiveFilter('all');
      return;
    }
    if (!availableFilters.includes(activeFilter)) {
      const defaultFilter = getDefaultFilter(labels);
      setActiveFilter(defaultFilter);
    }
  }, [activeFilter, availableFilters, labels]);

  const handleInputBlur = useCallback((event: React.FocusEvent<HTMLInputElement>) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof HTMLElement && rootRef.current?.contains(nextTarget)) {
      const labelId = nextTarget.getAttribute('data-mermaid-label-id');
      if (labelId) {
        pendingMermaidLabelFocusTarget = { type: 'label', id: Number(labelId) };
      } else if (nextTarget.classList.contains('aad-label-search')) {
        pendingMermaidLabelFocusTarget = { type: 'search' };
      } else {
        pendingMermaidLabelFocusTarget = { type: 'none' };
      }
    } else {
      pendingMermaidLabelFocusTarget = null;
    }
  }, []);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    onCancel();
  }, [onCancel]);

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      if (Date.now() < ignoreDocumentClickUntilRef.current) return;
      const root = rootRef.current;
      const target = event.target;
      if (!root || !(target instanceof Node) || root.contains(target)) return;
      void handleCommit({ closeOnSuccess: true });
    };
    document.addEventListener('click', handleDocumentClick);
    return () => document.removeEventListener('click', handleDocumentClick);
  }, [handleCommit]);

  if (editableLabels.length === 0) {
    return (
      <div
        ref={rootRef}
        className="aad-mermaid-label-editor"
        onKeyDown={handleKeyDown}
        data-copy-remove="true"
      >
        <div className="aad-label-editor-heading-row">
          <div>
            <div className="aad-label-editor-heading">{t.mermaidEditTitle}</div>
            <div className="aad-label-editor-count">{t.mermaidEditorEditableCount(0)}</div>
          </div>
        </div>
        <div className="aad-label-empty-hint">{emptyHint}</div>
      </div>
    );
  }

  // Group labels by kind, preserving GROUP_ORDER
  const grouped = new Map<string, MermaidLabel[]>();
  for (const label of visibleLabels) {
    const group = getLabelGroup(label);
    const list = grouped.get(group) ?? [];
    list.push(label);
    grouped.set(group, list);
  }
  const orderedKinds = [
    ...GROUP_ORDER.filter((k) => grouped.has(k)),
    ...[...grouped.keys()].filter((k) => !GROUP_ORDER.includes(k)),
  ];

  return (
    <div
      ref={rootRef}
      className="aad-mermaid-label-editor"
      onKeyDown={handleKeyDown}
      data-copy-remove="true"
    >
      <div className="aad-label-editor-heading-row">
        <div>
          <div className="aad-label-editor-heading">{t.mermaidEditTitle}</div>
          <div className="aad-label-editor-count">{t.mermaidEditorEditableCount(editableLabels.length)}</div>
        </div>
        <div className={`aad-label-status is-${statusTone}`} aria-live="polite">
          <span className="aad-label-status-dot" />
          <span>{statusLabel}</span>
        </div>
      </div>
      <input
        type="search"
        className="aad-label-search"
        data-mermaid-focus-target="search"
        placeholder={t.mermaidEditorSearchPlaceholder}
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
      />
      {availableFilters.length > 0 && (
        <div className="aad-label-filter-tabs" role="tablist" aria-label={t.mermaidEditTitle}>
          {availableFilters.map((filter) => (
            <button
              key={filter}
              type="button"
              className={`aad-label-filter-tab ${activeFilter === filter ? 'is-active' : ''}`.trim()}
              role="tab"
              aria-selected={activeFilter === filter}
              onClick={() => setActiveFilter(filter)}
            >
              {filter === 'node'
                ? t.mermaidEditorNodeTab
                : filter === 'edge'
                  ? t.mermaidEditorEdgeTab
                  : t.mermaidEditorAllTab}
            </button>
          ))}
        </div>
      )}
      {error ? <div className="aad-label-error">{t.mermaidValidationFailed}: {error}</div> : null}
      {visibleLabels.length === 0 ? <div className="aad-label-empty-hint">{t.mermaidEditorNoMatches}</div> : null}
      {orderedKinds.map((kind) => {
        const groupLabels = grouped.get(kind)!;
        const groupTitle = groupNames[kind] ?? kind;
        return (
          <div key={kind} className="aad-label-group">
            <div className="aad-label-group-title">{groupTitle}</div>
            {groupLabels.map((label) => (
              <label
                key={label.id}
                className={`aad-label-row ${label.readOnlyReason ? 'is-readonly' : ''}`}
              >
                <span className="aad-label-context">
                  {label.contextLabel ? `${groupTitle} · ${label.contextLabel}` : groupTitle}
                  {label.readOnlyReason ? <span className="aad-label-readonly">{t.mermaidReadOnlyLabel}</span> : null}
                </span>
                <span className="aad-label-original" title={label.original}>
                  {label.original}
                </span>
                <input
                  type="text"
                  className="aad-label-input"
                  data-mermaid-label-id={label.id}
                  disabled={Boolean(label.readOnlyReason)}
                  value={values.get(label.id) ?? label.original}
                  onChange={(e) => handleChange(label.id, e.target.value)}
                  onBlur={handleInputBlur}
                />
              </label>
            ))}
          </div>
        );
      })}
    </div>
  );
};
