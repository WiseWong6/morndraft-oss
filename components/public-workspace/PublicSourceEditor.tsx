import React, { useEffect, useMemo, useRef, useState } from 'react';
import { applyPublicInsert, findPublicSlashTrigger } from './publicDocument';
import type { PublicFlatInsertEntry, PublicTextSelection, PublicWorkspaceLocale, SourceChangeMeta } from './types';

type PublicSourceEditorProps = {
  source: string;
  locale: PublicWorkspaceLocale;
  origin: SourceChangeMeta['origin'];
  flatInsertEntries?: readonly PublicFlatInsertEntry[];
  onSourceChange(next: string, meta: SourceChangeMeta): void;
  ariaLabel: string;
  className?: string;
  onSelectionChange?(selection: PublicTextSelection | null): void;
};

type SlashTrigger = { start: number; end: number; query: string };

const MARKDOWN_TABLE_ENTRY: PublicFlatInsertEntry = {
  id: 'markdown-table',
  label: 'Markdown table',
  keywords: ['table', '表格', 'grid'],
  source: '| Column 1 | Column 2 | Column 3 |\n|---|---|---|\n|  |  |  |\n|  |  |  |',
};

const resolveEntrySource = async (entry: PublicFlatInsertEntry) => (
  typeof entry.source === 'function' ? entry.source() : entry.source
);

export const PublicSourceEditor: React.FC<PublicSourceEditorProps> = ({
  source,
  locale,
  origin,
  flatInsertEntries = [],
  onSourceChange,
  ariaLabel,
  className,
  onSelectionChange,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const latestSourceRef = useRef(source);
  const [slashTrigger, setSlashTrigger] = useState<SlashTrigger | null>(null);
  const [insertError, setInsertError] = useState('');
  const entries = useMemo(() => [MARKDOWN_TABLE_ENTRY, ...flatInsertEntries], [flatInsertEntries]);
  const visibleEntries = useMemo(() => {
    if (!slashTrigger) return [];
    const query = slashTrigger.query;
    if (!query) return entries;
    return entries.filter((entry) => (
      [entry.id, entry.label, ...(entry.keywords ?? [])].some((value) => value.toLowerCase().includes(query))
    ));
  }, [entries, slashTrigger]);

  useEffect(() => {
    latestSourceRef.current = source;
  }, [source]);

  const updateSlashTrigger = (next: string, cursor: number | null) => {
    setSlashTrigger(cursor === null ? null : findPublicSlashTrigger(next, cursor));
  };

  const updateSelection = (textarea: HTMLTextAreaElement) => {
    const { selectionStart: start, selectionEnd: end, value } = textarea;
    const text = value.slice(start, end);
    onSelectionChange?.(end > start ? { start, end, text, sourceText: text, source: value } : null);
  };

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = event.currentTarget.value;
    latestSourceRef.current = next;
    setInsertError('');
    onSourceChange(next, { origin });
    updateSlashTrigger(next, event.currentTarget.selectionStart);
  };

  const insertEntry = async (entry: PublicFlatInsertEntry) => {
    if (!slashTrigger) return;
    try {
      const insertion = await resolveEntrySource(entry);
      const result = applyPublicInsert(latestSourceRef.current, slashTrigger, insertion);
      latestSourceRef.current = result.source;
      setSlashTrigger(null);
      onSourceChange(result.source, { origin: 'insert' });
      window.requestAnimationFrame(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(result.cursor, result.cursor);
      });
    } catch {
      setInsertError(locale === 'zh' ? '无法插入这个组件。' : 'Unable to insert this component.');
    }
  };

  return (
    <div className={`md-public-source-editor ${className ?? ''}`}>
      <textarea
        ref={textareaRef}
        aria-label={ariaLabel}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        value={source}
        onBlur={() => window.setTimeout(() => setSlashTrigger(null), 120)}
        onChange={handleChange}
        onClick={(event) => {
          updateSlashTrigger(event.currentTarget.value, event.currentTarget.selectionStart);
          updateSelection(event.currentTarget);
        }}
        onSelect={(event) => updateSelection(event.currentTarget)}
        onKeyUp={(event) => {
          if (event.key === 'Escape') {
            setSlashTrigger(null);
            return;
          }
          updateSlashTrigger(event.currentTarget.value, event.currentTarget.selectionStart);
        }}
      />
      {slashTrigger && (
        <div className="md-public-insert-menu" role="menu" aria-label={locale === 'zh' ? '插入内容' : 'Insert content'}>
          {visibleEntries.length > 0 ? visibleEntries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="menuitem"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void insertEntry(entry)}
            >
              <span>{entry.label}</span>
            </button>
          )) : (
            <span className="md-public-insert-empty">{locale === 'zh' ? '没有匹配项' : 'No matches'}</span>
          )}
        </div>
      )}
      {insertError && <p className="md-public-inline-error" role="alert">{insertError}</p>}
    </div>
  );
};
