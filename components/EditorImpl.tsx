import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { MORNDRAFT_CAPABILITIES, isCapabilityEnabled } from '@morndraft/core';
import { trackMornDraftClick } from '../utils/analytics';
import { formatCompactCount, getEditorTextMetrics } from '../utils/text-metrics';
import { EditorDiagnosticPanel } from './editor/EditorDiagnosticPanel';
import { getPendingFixRowCount } from './editor/EditorPendingFixOverlay';
import { EditorSourceArea } from './editor/EditorSourceArea';
import { EditorToolbar } from './editor/EditorToolbar';
import type { EditorProps } from './editor/EditorTypes';
import { getScrollToTopBehavior } from './ScrollToTopButton';
import { getExplicitSelectionRange, getLineSelectionRange, getSelectionTextRange } from './editor/editorLineSelection';
import { downloadTextFile } from '../utils/downloadTextFile';
import './editor/editorImport.css';
import { useEditorImport, type EditorImportContentMeta } from './editor/useEditorImport';

const EDITOR_METRICS_DEBOUNCE_MS = 320;

const getEditorLineCount = (value: string) => {
  if (!value) return 1;
  let count = 1;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '\n') count += 1;
  }
  return count;
};

const useDeferredEditorMetrics = (value: string) => {
  const [metrics, setMetrics] = useState(() => getEditorTextMetrics(value));

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setMetrics(getEditorTextMetrics(value));
    }, EDITOR_METRICS_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [value]);

  return metrics;
};

const Editor: React.FC<EditorProps> = ({
  value,
  brandSlot,
  onChange,
  onUserEdit,
  onImportComplete,
  deliveryAccess,
  diagnostics = [],
  fixes = [],
  pendingFixReview = null,
  lastAppliedFix = null,
  fixApplyVersion = 0,
  enabledCapabilities = [],
  lineFocusRequest,
  loadingNotice = null,
  searchState,
  isDiagnosticModeOpen: controlledDiagnosticModeOpen,
  onDiagnosticModeOpenChange,
  isDraftSidebarCollapsed,
  isAuthenticated = true,
  onRequireSignIn,
  onToggleDraftSidebar,
  collapseDraftSidebarLabel,
  expandDraftSidebarLabel,
  showBackToTop = false,
  onWorkspaceModeToggle,
  workspaceModeSwitchLabel,
  onSourceCursorLineChange,
  onRequestPreviewLineFocus,
  onBeginFixReview,
  onConfirmFixReview, onCancelFixReview, onUndoLastFix,
  locale = 'zh',
  t,
  placeholder,
  upgradeNotice,
}) => {
  const [copied, setCopied] = useState(false);
  const [focusedLine, setFocusedLine] = useState<number | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [uncontrolledDiagnosticModeOpen, setUncontrolledDiagnosticModeOpen] = useState(false);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const valueRef = useRef(value);
  const editorScrollTopRef = useRef(0);
  const lastFixApplyVersionRef = useRef(fixApplyVersion);
  const handledLineFocusRequestIdRef = useRef<number | null>(null);
  const pasteImageSelectionRef = useRef<{ start: number; end: number } | null>(null);
  const metrics = useDeferredEditorMetrics(value);
  const compactCharacters = formatCompactCount(metrics.characters);
  const compactTokens = formatCompactCount(metrics.estimatedTokens);
  const metricsLabel = t.metricsAria(metrics.characters, metrics.estimatedTokens);
  const lineCount = pendingFixReview ? getPendingFixRowCount(pendingFixReview) : getEditorLineCount(value);
  const lineNumberDigits = String(lineCount).length;
  const editorLineNumberStyle = useMemo(
    () => ({ '--aad-editor-line-number-digits': lineNumberDigits } as React.CSSProperties),
    [lineNumberDigits],
  );
  const isDiagnosticModeControlled = controlledDiagnosticModeOpen !== undefined;
  const isDiagnosticModeOpen = controlledDiagnosticModeOpen ?? uncontrolledDiagnosticModeOpen;
  const setDiagnosticModeOpen = useCallback((next: boolean | ((current: boolean) => boolean)) => {
    const resolved = typeof next === 'function' ? next(isDiagnosticModeOpen) : next;
    if (!isDiagnosticModeControlled) setUncontrolledDiagnosticModeOpen(resolved);
    onDiagnosticModeOpenChange?.(resolved);
  }, [isDiagnosticModeControlled, isDiagnosticModeOpen, onDiagnosticModeOpenChange]);
  const handleEditorImportContent = useCallback(async (content: string, meta: EditorImportContentMeta) => {
    if (meta.source === 'paste-image' && pasteImageSelectionRef.current) {
      const selection = pasteImageSelectionRef.current;
      pasteImageSelectionRef.current = null;
      const nextContent = `${valueRef.current.slice(0, selection.start)}${content}${valueRef.current.slice(selection.end)}`;
      onChange(nextContent);
      await onImportComplete?.({ content: nextContent, suggestedTitle: meta.suggestedTitle });
      return;
    }
    onChange(content);
    await onImportComplete?.({ content, suggestedTitle: meta.suggestedTitle });
  }, [onChange, onImportComplete]);
  const {
    handleImportDrop,
    handleImportPasteImages,
    importNotice,
  } =
    useEditorImport({
      deliveryAccess,
      onImportContent: handleEditorImportContent,
      t,
    });
  const canNavigateToPreview = Boolean(onRequestPreviewLineFocus) &&
    value.trim().length > 0 &&
    isCapabilityEnabled(enabledCapabilities, MORNDRAFT_CAPABILITIES.ARTIFACT_MAP);
  const hasVisibleDiagnostics = diagnostics.some((diagnostic) => diagnostic.line && diagnostic.severity !== 'info');
  valueRef.current = value;
  const focusEditorRange = useCallback((target: { line: number; start: number; end: number }, options?: { highlight?: boolean }) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus();
    textarea.setSelectionRange(target.start, target.end);

    const computedStyle = window.getComputedStyle(textarea);
    const fontSize = Number.parseFloat(computedStyle.fontSize) || 14;
    const lineHeight = Number.parseFloat(computedStyle.lineHeight) || fontSize * 1.6;
    const paddingTop = Number.parseFloat(computedStyle.paddingTop) || 0;
    const targetLineCenter = paddingTop + (target.line - 1) * lineHeight + lineHeight / 2;
    textarea.scrollTop = Math.max(0, targetLineCenter - textarea.clientHeight / 2);
    if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = textarea.scrollTop;
    if (options?.highlight !== false) {
      setFocusedLine(target.line);
    } else {
      setFocusedLine(null);
    }
  }, []);

  const handleCopy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      trackMornDraftClick('morndraft_copy_source', {
        target: { type: 'button', text: t.copySource },
        context: { component: 'editor' },
        metadata: { characters: metrics.characters, estimated_tokens: metrics.estimatedTokens },
      });
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleClear = useCallback(() => {
    trackMornDraftClick('morndraft_clear_source', {
      target: { type: 'button', text: t.clear },
      context: { component: 'editor' },
      metadata: { characters: metrics.characters, estimated_tokens: metrics.estimatedTokens },
    });
    onChange('');
  }, [metrics.characters, metrics.estimatedTokens, onChange, t.clear]);

  const handleDownloadSource = useCallback(() => {
    if (!value) return;
    downloadTextFile(value, 'morndraft.md', 'text/markdown;charset=utf-8');
    trackMornDraftClick('morndraft_download_source', {
      target: { type: 'button', text: t.downloadSource },
      context: { component: 'editor' },
      metadata: { characters: metrics.characters, estimated_tokens: metrics.estimatedTokens },
    });
  }, [metrics.characters, metrics.estimatedTokens, t.downloadSource, value]);

  const handleEditorScroll = (event: React.UIEvent<HTMLTextAreaElement>) => {
    editorScrollTopRef.current = event.currentTarget.scrollTop;
    setScrollTop(event.currentTarget.scrollTop);
    if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = event.currentTarget.scrollTop;
  };

  const handleBackToTop = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const behavior = getScrollToTopBehavior();
    textarea.scrollTo({ top: 0, left: textarea.scrollLeft, behavior });
    lineNumbersRef.current?.scrollTo({ top: 0, behavior });
    editorScrollTopRef.current = 0;
    if (behavior === 'auto') setScrollTop(0);
  }, []);

  const handleDiagnosticModeToggle = useCallback(() => {
    if (pendingFixReview) {
      onCancelFixReview?.();
      setDiagnosticModeOpen(true);
      return;
    }
    setDiagnosticModeOpen((value) => !value);
  }, [onCancelFixReview, pendingFixReview, setDiagnosticModeOpen]);

  const handleBeginFixReview = useCallback((fixId: string | 'all') => {
    if (!isAuthenticated) {
      onRequireSignIn?.();
      return;
    }
    onBeginFixReview?.(fixId);
  }, [isAuthenticated, onBeginFixReview, onRequireSignIn]);

  const handleLineNumberClick = useCallback((lineNumber: number) => {
    if (!canNavigateToPreview) return;
    onRequestPreviewLineFocus?.(lineNumber);
    trackMornDraftClick('morndraft_editor_line_navigate_preview', {
      target: { type: 'button', text: String(lineNumber) },
      context: { component: 'editor_line_numbers' },
      metadata: { line: lineNumber },
    });
  }, [canNavigateToPreview, onRequestPreviewLineFocus]);

  const handleEditorLineFocus = useCallback((lineNumber: number) => {
    const target = getLineSelectionRange(valueRef.current, lineNumber);
    focusEditorRange(target);
    window.setTimeout(() => setFocusedLine(null), 1400);
  }, [focusEditorRange]);

  useEffect(() => {
    if (!hasVisibleDiagnostics) setDiagnosticModeOpen(false);
  }, [hasVisibleDiagnostics, setDiagnosticModeOpen]);

  useEffect(() => {
    if (pendingFixReview) textareaRef.current?.focus();
  }, [pendingFixReview]);

  useLayoutEffect(() => {
    if (lastFixApplyVersionRef.current === fixApplyVersion) return;
    lastFixApplyVersionRef.current = fixApplyVersion;
    const textarea = textareaRef.current;
    if (!textarea) return;
    const targetScrollTop = editorScrollTopRef.current;
    window.requestAnimationFrame(() => {
      textarea.scrollTop = targetScrollTop;
      if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = targetScrollTop;
      setScrollTop(targetScrollTop);
    });
  }, [fixApplyVersion]);

  useEffect(() => {
    const canFocusLine =
      isCapabilityEnabled(enabledCapabilities, MORNDRAFT_CAPABILITIES.ERROR_LINE_NAVIGATION) ||
      isCapabilityEnabled(enabledCapabilities, MORNDRAFT_CAPABILITIES.ARTIFACT_MAP) ||
      isCapabilityEnabled(enabledCapabilities, MORNDRAFT_CAPABILITIES.TEXT_SEARCH);
    if (!lineFocusRequest || !canFocusLine || !textareaRef.current) return undefined;
    if (handledLineFocusRequestIdRef.current === lineFocusRequest.requestId) return undefined;
    handledLineFocusRequestIdRef.current = lineFocusRequest.requestId;

    // Prefer an exact text match (from a final-side selection) over a bare line
    // jump so the cursor lands on the precise characters the user pointed at.
    const target = lineFocusRequest.selectionRange
      ? (getExplicitSelectionRange(valueRef.current, lineFocusRequest.selectionRange) ?? getLineSelectionRange(valueRef.current, lineFocusRequest.line))
      : lineFocusRequest.selectionText
      ? (getSelectionTextRange(
          valueRef.current,
          lineFocusRequest.selectionText,
          lineFocusRequest.selectionOccurrenceIndex,
          lineFocusRequest.selectionScopeLineRange,
        ) ?? getLineSelectionRange(valueRef.current, lineFocusRequest.line))
      : getLineSelectionRange(valueRef.current, lineFocusRequest.line);
    const shouldHighlight = lineFocusRequest.highlight !== false;
    focusEditorRange(target, { highlight: shouldHighlight });
    if (!shouldHighlight) return undefined;
    const timer = window.setTimeout(() => setFocusedLine(null), 1400);
    return () => window.clearTimeout(timer);
  }, [enabledCapabilities, focusEditorRange, lineFocusRequest]);

  const activeToast = importNotice ?? (upgradeNotice ? { tone: upgradeNotice.tone ?? 'error' as const, text: upgradeNotice.text } : null);

  return (
    <div
      className="aad-editor-shell relative flex h-full min-h-0 flex-col overflow-hidden border-b md:border-b-0 md:border-r"
      style={editorLineNumberStyle}
    >
      {activeToast && (
        <div className={`aad-editor-floating-toast aad-editor-import-toast aad-editor-import-toast-${activeToast.tone}`} role="status">
          {activeToast.text}
        </div>
      )}
      <EditorToolbar
        brandSlot={brandSlot}
        value={value} copied={copied}
        metricsLabel={metricsLabel}
        compactCharacters={compactCharacters} compactTokens={compactTokens}
        diagnostics={diagnostics} fixes={fixes}
        isDiagnosticModeOpen={isDiagnosticModeOpen}
        isDraftSidebarCollapsed={isDraftSidebarCollapsed}
        collapseDraftSidebarLabel={collapseDraftSidebarLabel}
        expandDraftSidebarLabel={expandDraftSidebarLabel}
        onWorkspaceModeToggle={onWorkspaceModeToggle}
        workspaceModeSwitchLabel={workspaceModeSwitchLabel}
        onToggleDiagnosticMode={handleDiagnosticModeToggle}
        onToggleDraftSidebar={onToggleDraftSidebar}
        onClear={handleClear} onCopy={handleCopy}
        onDownload={handleDownloadSource}
        t={t}
      />
      {isDiagnosticModeOpen && !pendingFixReview && (
        <EditorDiagnosticPanel
          diagnostics={diagnostics} fixCount={fixes.length}
          locale={locale}
          onBeginFixReviewAll={() => handleBeginFixReview('all')} onClose={() => setDiagnosticModeOpen(false)}
          onRequestLineFocus={handleEditorLineFocus}
          t={t}
        />
      )}
      <EditorSourceArea
        lineNumberDigits={lineNumberDigits}
        diagnostics={diagnostics} fixes={fixes} scrollTop={scrollTop}
        showFixes={isDiagnosticModeOpen && !pendingFixReview}
        fixLabel={t.fix} pendingFixReview={pendingFixReview} lastAppliedFix={lastAppliedFix}
        onBeginFixReview={handleBeginFixReview}
        onConfirmFixReview={onConfirmFixReview}
        onCancelFixReview={onCancelFixReview}
        onUndoLastFix={onUndoLastFix}
        lineNumbersRef={lineNumbersRef} textareaRef={textareaRef} lineCount={lineCount}
        canNavigateToPreview={canNavigateToPreview}
        focusedLine={focusedLine}
        searchActiveMatchId={searchState?.activeMatch?.id ?? null}
        searchMatches={searchState?.matches ?? []}
        value={value} onChange={onChange} onUserEdit={onUserEdit}
        onImportDrop={handleImportDrop}
        loadingNotice={loadingNotice}
        onPasteImageFiles={(files, selection) => {
          pasteImageSelectionRef.current = selection;
          handleImportPasteImages(files);
        }}
        onScroll={handleEditorScroll}
        showBackToTop={showBackToTop}
        onBackToTop={handleBackToTop}
        onCursorLineChange={onSourceCursorLineChange}
        onLineNumberClick={handleLineNumberClick}
        t={t}
        placeholder={placeholder}
      />
    </div>
  );
};
export default Editor;
