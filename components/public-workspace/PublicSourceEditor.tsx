import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  getPublicSourceLineSelectionRange,
  shouldHandlePublicPlainMouseGesture,
} from '@morndraft/core/oss-public';
import { applyPublicInsert, findPublicSlashTrigger } from './publicDocument';
import {
  getFirstPublicClipboardImageFile,
  insertPublicClipboardImageMarkdown,
  resolvePublicClipboardImageMarkdown,
} from './publicClipboardImage';
import type { PublicFlatInsertEntry, PublicTextSelection, PublicWorkspaceLocale, SourceChangeMeta } from './types';

type PublicSourceEditorProps = {
  source: string;
  locale: PublicWorkspaceLocale;
  origin: SourceChangeMeta['origin'];
  flatInsertEntries?: readonly PublicFlatInsertEntry[];
  onSourceChange(next: string, meta: SourceChangeMeta): void;
  ariaLabel: string;
  allowImagePaste?: boolean;
  className?: string;
  onSelectionChange?(selection: PublicTextSelection | null): void;
  onAiGenerateRequest?(range: { start: number; end: number }): void;
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
  allowImagePaste = true,
  className,
  onSelectionChange,
  onAiGenerateRequest,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const latestSourceRef = useRef(source);
  const renderedSourceRef = useRef(source);
  const insertOperationRef = useRef(0);
  const lastPointerTypeRef = useRef<string | null>(null);
  const lastSelectionRef = useRef({ start: 0, end: 0 });
  const selectionEpochRef = useRef(0);
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

  // Keep async insertions pinned to the exact committed controlled value that
  // opened the menu. A layout effect runs before browser input can target the
  // new tree, without mutating refs during a render React may later discard.
  useLayoutEffect(() => {
    if (renderedSourceRef.current === source) return;
    renderedSourceRef.current = source;
    latestSourceRef.current = source;
    insertOperationRef.current += 1;
  }, [source]);

  useEffect(() => () => {
    insertOperationRef.current += 1;
  }, []);

  const updateSlashTrigger = (next: string, cursor: number | null) => {
    setSlashTrigger(cursor === null ? null : findPublicSlashTrigger(next, cursor));
  };

  const updateSelection = (textarea: HTMLTextAreaElement) => {
    const { selectionStart: start, selectionEnd: end, value } = textarea;
    if (lastSelectionRef.current.start !== start || lastSelectionRef.current.end !== end) {
      lastSelectionRef.current = { start, end };
      selectionEpochRef.current += 1;
    }
    const text = value.slice(start, end);
    onSelectionChange?.(end > start ? { start, end, text, sourceText: text, source: value } : null);
  };

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = event.currentTarget.value;
    insertOperationRef.current += 1;
    latestSourceRef.current = next;
    setInsertError('');
    onSourceChange(next, { origin });
    updateSlashTrigger(next, event.currentTarget.selectionStart);
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!allowImagePaste) return;
    const file = getFirstPublicClipboardImageFile(event.clipboardData);
    if (!file) return;
    const textarea = event.currentTarget;
    const requestSource = textarea.value;
    const requestRange = { start: textarea.selectionStart, end: textarea.selectionEnd };
    lastSelectionRef.current = requestRange;
    const requestSelectionEpoch = selectionEpochRef.current;
    const operation = insertOperationRef.current + 1;
    insertOperationRef.current = operation;
    event.preventDefault();
    setInsertError('');
    void resolvePublicClipboardImageMarkdown(file).then((markdown) => {
      if (
        !markdown
        || insertOperationRef.current !== operation
        || latestSourceRef.current !== requestSource
        || selectionEpochRef.current !== requestSelectionEpoch
        || textareaRef.current?.selectionStart !== requestRange.start
        || textareaRef.current?.selectionEnd !== requestRange.end
        || textareaRef.current?.ownerDocument.activeElement !== textareaRef.current
      ) return;
      const result = insertPublicClipboardImageMarkdown(requestSource, requestRange, markdown);
      if (!result.ok) return;
      latestSourceRef.current = result.source;
      onSourceChange(result.source, { origin: 'paste-image' });
      window.requestAnimationFrame(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(result.insertedRange.end, result.insertedRange.end);
        if (textareaRef.current) updateSelection(textareaRef.current);
      });
    }).catch(() => {
      if (insertOperationRef.current !== operation || latestSourceRef.current !== requestSource) return;
      setInsertError(locale === 'zh' ? '无法粘贴这张图片。' : 'Unable to paste this image.');
    });
  };

  const handleDoubleClick = (event: React.MouseEvent<HTMLTextAreaElement>) => {
    const pointerType = lastPointerTypeRef.current;
    lastPointerTypeRef.current = null;
    if (!shouldHandlePublicPlainMouseGesture({
      altKey: event.altKey,
      button: event.button,
      ctrlKey: event.ctrlKey,
      detail: event.detail,
      metaKey: event.metaKey,
      pointerType,
      shiftKey: event.shiftKey,
    })) return;
    const textarea = event.currentTarget;
    const range = getPublicSourceLineSelectionRange(textarea.value, textarea.selectionStart);
    event.preventDefault();
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(range.start, range.end, 'forward');
    updateSelection(textarea);
  };

  const insertEntry = async (entry: PublicFlatInsertEntry) => {
    if (!slashTrigger) return;
    const requestSource = latestSourceRef.current;
    const requestTrigger = slashTrigger;
    const operation = insertOperationRef.current + 1;
    insertOperationRef.current = operation;
    try {
      const insertion = await resolveEntrySource(entry);
      if (insertOperationRef.current !== operation || latestSourceRef.current !== requestSource) return;
      const result = applyPublicInsert(requestSource, requestTrigger, insertion);
      latestSourceRef.current = result.source;
      setSlashTrigger(null);
      onSourceChange(result.source, { origin: 'insert' });
      window.requestAnimationFrame(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(result.cursor, result.cursor);
      });
    } catch {
      if (insertOperationRef.current !== operation || latestSourceRef.current !== requestSource) return;
      setInsertError(locale === 'zh' ? '无法插入这个组件。' : 'Unable to insert this component.');
    }
  };

  const canShowAiGenerate = Boolean(
    onAiGenerateRequest && slashTrigger && (!slashTrigger.query || 'ai generate 生成'.includes(slashTrigger.query)),
  );

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
        onDoubleClick={handleDoubleClick}
        onPaste={handlePaste}
        onPointerDown={(event) => { lastPointerTypeRef.current = event.pointerType; }}
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
          {canShowAiGenerate && (
            <button
              type="button"
              role="menuitem"
              data-testid="oss-ai-generate"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setSlashTrigger(null);
                onAiGenerateRequest?.({ start: slashTrigger.start, end: slashTrigger.end });
              }}
            >
              <span>{locale === 'zh' ? 'AI 生成' : 'AI generate'}</span>
            </button>
          )}
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
