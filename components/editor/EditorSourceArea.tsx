import React from 'react';
import { Loader2 } from 'lucide-react';
import type { EditorTranslations } from '../../i18n';
import ScrollToTopButton from '../ScrollToTopButton';
import { EditorAppliedFixToast } from './EditorAppliedFixToast';
import { EditorDiagnosticLayer } from './EditorDiagnosticLayer';
import { EditorPendingFixOverlay } from './EditorPendingFixOverlay';
import { EditorSearchHighlightLayer } from './EditorSearchHighlightLayer';
import type { ArtifactAppliedFix, ArtifactDiagnostic, ArtifactFix, ArtifactFixReview } from './diagnosticTypes';
import { snapshotEditorImportDropData, snapshotEditorImportFiles, type EditorImportDropData } from './editorImport';
import { getSourceLineSelectionRange, shouldHandleSourceLineDoubleClick } from './editorLineSelection';
import type { TextSearchMatch } from '@morndraft/features-personal';

const getLineNumberClassName = (
  diagnosticSeverityByLine: ReadonlyMap<number, ArtifactDiagnostic['severity']>,
  lineNumber: number,
  isNavigable: boolean,
  isFocused: boolean,
) => {
  const diagnosticSeverity = diagnosticSeverityByLine.get(lineNumber) ?? null;
  return [
    'aad-editor-line-number',
    isNavigable ? 'is-navigable' : '',
    isFocused ? 'is-focused' : '',
    diagnosticSeverity ? `is-diagnostic is-${diagnosticSeverity}` : '',
  ].filter(Boolean).join(' ');
};

const FALLBACK_EDITOR_PADDING_TOP_PX = 16;
const FALLBACK_EDITOR_PADDING_BOTTOM_PX = 16;
const FALLBACK_EDITOR_LINE_HEIGHT_PX = 20.8;
const LINE_NUMBER_BUFFER = 50;
const FALLBACK_VISIBLE_LINE_COUNT = 90;
const BACK_TO_TOP_LINE_THRESHOLD = 15;

const getLineNumberTop = (lineNumber: number, paddingTop: number, lineHeight: number) => (
  paddingTop + (lineNumber - 1) * lineHeight
);

const getVisibleLineNumbers = (
  lineCount: number,
  scrollTop: number,
  viewportHeight: number,
  paddingTop: number,
  lineHeight: number,
) => {
  const safeLineCount = Math.max(1, lineCount);
  const firstVisibleLine = Math.max(
    1,
    Math.floor(Math.max(0, scrollTop - paddingTop) / lineHeight) + 1,
  );
  const boundedFirstVisibleLine = Math.min(safeLineCount, firstVisibleLine);
  const visibleLineCount = viewportHeight > 0
    ? Math.ceil(viewportHeight / lineHeight)
    : FALLBACK_VISIBLE_LINE_COUNT;
  const start = Math.max(1, boundedFirstVisibleLine - LINE_NUMBER_BUFFER);
  const end = Math.min(safeLineCount, boundedFirstVisibleLine + visibleLineCount + LINE_NUMBER_BUFFER);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
};

const readTextareaLineMetrics = (textarea: HTMLTextAreaElement) => {
  const style = window.getComputedStyle(textarea);
  const fontSize = Number.parseFloat(style.fontSize) || 13;
  const lineHeight = Number.parseFloat(style.lineHeight) || fontSize * 1.6;
  return {
    height: textarea.clientHeight,
    paddingTop: Number.parseFloat(style.paddingTop) || FALLBACK_EDITOR_PADDING_TOP_PX,
    paddingBottom: Number.parseFloat(style.paddingBottom) || FALLBACK_EDITOR_PADDING_BOTTOM_PX,
    lineHeight,
  };
};

export const EditorSourceArea: React.FC<{
  lineNumberDigits: number;
  diagnostics: readonly ArtifactDiagnostic[];
  fixes: readonly ArtifactFix[];
  scrollTop: number;
  showFixes: boolean;
  fixLabel: string;
  pendingFixReview?: ArtifactFixReview | null;
  lastAppliedFix?: ArtifactAppliedFix | null;
  onBeginFixReview?: (fixId: string) => void;
  onConfirmFixReview?: () => void;
  onCancelFixReview?: () => void;
  onUndoLastFix?: () => void;
  lineNumbersRef: React.RefObject<HTMLDivElement | null>;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  lineCount: number;
  loadingNotice?: string | null;
  canNavigateToPreview: boolean;
  focusedLine: number | null;
  searchActiveMatchId?: string | null;
  searchMatches?: readonly TextSearchMatch[];
  value: string;
  onChange: (value: string) => void;
  onUserEdit?: (value: string) => void;
  onImportDrop: (dropData: EditorImportDropData) => void;
  onPasteImageFiles: (files: readonly File[], selection: { start: number; end: number }) => void;
  onScroll: (event: React.UIEvent<HTMLTextAreaElement>) => void;
  showBackToTop?: boolean;
  onBackToTop?: () => void;
  onCursorLineChange?: (line: number) => void;
  onLineNumberClick: (lineNumber: number) => void;
  t: EditorTranslations;
  placeholder?: string;
}> = ({
  lineNumberDigits,
  diagnostics,
  fixes,
  scrollTop,
  showFixes,
  fixLabel,
  pendingFixReview,
  lastAppliedFix,
  onBeginFixReview,
  onConfirmFixReview,
  onCancelFixReview,
  onUndoLastFix,
  lineNumbersRef,
  textareaRef,
  lineCount,
  loadingNotice = null,
  canNavigateToPreview,
  focusedLine,
  searchActiveMatchId = null,
  searchMatches = [],
  value,
  onChange,
  onUserEdit,
  onImportDrop,
  onPasteImageFiles,
  onScroll,
  showBackToTop = false,
  onBackToTop,
  onCursorLineChange,
  onLineNumberClick,
  t,
  placeholder,
}) => {
  const [activeFixLine, setActiveFixLine] = React.useState<number | null>(null);
  const [isDragActive, setIsDragActive] = React.useState(false);
  const [editorLineMetrics, setEditorLineMetrics] = React.useState({
    height: 0,
    paddingTop: FALLBACK_EDITOR_PADDING_TOP_PX,
    paddingBottom: FALLBACK_EDITOR_PADDING_BOTTOM_PX,
    lineHeight: FALLBACK_EDITOR_LINE_HEIGHT_PX,
  });
  const mouseLineUpdateAtRef = React.useRef(0);
  const lastPointerTypeRef = React.useRef<string | null>(null);
  const dragDepthRef = React.useRef(0);
  const editorPlaceholder = placeholder ?? t.placeholder;
  const clampLine = React.useCallback((line: number) => Math.min(Math.max(1, line), Math.max(1, lineCount)), [lineCount]);
  const diagnosticSeverityByLine = React.useMemo(() => {
    const byLine = new Map<number, ArtifactDiagnostic['severity']>();
    for (const diagnostic of diagnostics) {
      if (diagnostic.severity === 'info' || !diagnostic.line) continue;
      const current = byLine.get(diagnostic.line);
      if (!current || current !== 'error') byLine.set(diagnostic.line, diagnostic.severity);
    }
    return byLine;
  }, [diagnostics]);
  const visibleLineNumbers = React.useMemo(
    () => getVisibleLineNumbers(
      lineCount,
      scrollTop,
      editorLineMetrics.height,
      editorLineMetrics.paddingTop,
      editorLineMetrics.lineHeight,
    ),
    [editorLineMetrics, lineCount, scrollTop],
  );
  const lineNumbersContentHeight = (
    editorLineMetrics.paddingTop +
    editorLineMetrics.paddingBottom +
    Math.max(1, lineCount) * editorLineMetrics.lineHeight
  );
  const showBackToTopButton = Boolean(
    showBackToTop &&
    onBackToTop &&
    scrollTop >= BACK_TO_TOP_LINE_THRESHOLD * editorLineMetrics.lineHeight,
  );
  const reportCursorLine = React.useCallback((line: number) => {
    const nextLine = clampLine(line);
    setActiveFixLine(nextLine);
    onCursorLineChange?.(nextLine);
  }, [clampLine, onCursorLineChange]);
  const updateActiveLineFromSelection = React.useCallback(() => window.requestAnimationFrame(() => {
    if (Date.now() - mouseLineUpdateAtRef.current < 180) return;
    const selectionStart = textareaRef.current?.selectionStart;
    if (typeof selectionStart === 'number') reportCursorLine(value.slice(0, Math.max(0, selectionStart)).split('\n').length);
  }), [reportCursorLine, textareaRef, value]);
  const updateActiveLineFromMouse = React.useCallback((event: React.MouseEvent<HTMLTextAreaElement>) => {
    const textarea = event.currentTarget;
    const style = window.getComputedStyle(textarea);
    const paddingTop = Number.parseFloat(style.paddingTop) || 16;
    const fontSize = Number.parseFloat(style.fontSize) || 13;
    const lineHeight = Number.parseFloat(style.lineHeight) || fontSize * 1.6;
    mouseLineUpdateAtRef.current = Date.now();
    reportCursorLine(Math.floor((event.clientY - textarea.getBoundingClientRect().top + textarea.scrollTop - paddingTop) / lineHeight) + 1);
  }, [reportCursorLine]);
  const handleSourcePointerDown = React.useCallback((event: React.PointerEvent<HTMLTextAreaElement>) => {
    lastPointerTypeRef.current = event.pointerType;
  }, []);
  const handleSourceDoubleClick = React.useCallback((event: React.MouseEvent<HTMLTextAreaElement>) => {
    const pointerType = lastPointerTypeRef.current;
    lastPointerTypeRef.current = null;
    if (!shouldHandleSourceLineDoubleClick({
      pointerType,
      button: event.button,
      detail: event.detail,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
    })) {
      return;
    }
    const textarea = event.currentTarget;
    const range = getSourceLineSelectionRange(textarea.value, textarea.selectionStart);
    event.preventDefault();
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(range.start, range.end, 'forward');
  }, []);
  React.useEffect(() => setActiveFixLine(null), [value]);
  const handleDragEnter = React.useCallback((event: React.DragEvent<HTMLTextAreaElement>) => {
    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDragActive(true);
  }, []);
  const handleDragLeave = React.useCallback((event: React.DragEvent<HTMLTextAreaElement>) => {
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragActive(false);
  }, []);
  const handleDragOver = React.useCallback((event: React.DragEvent<HTMLTextAreaElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);
  const handleDrop = React.useCallback((event: React.DragEvent<HTMLTextAreaElement>) => {
    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDragActive(false);
    const files = snapshotEditorImportFiles(event.dataTransfer.files);
    onImportDrop(snapshotEditorImportDropData({
      files: files[0] ? [files[0]] : [],
      getData: event.dataTransfer.getData.bind(event.dataTransfer),
    }));
  }, [onImportDrop]);
  const handlePaste = React.useCallback((event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.items)
      .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
      .map(item => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    const imageFile = files[0];
    if (!imageFile) return;
    event.preventDefault();
    onPasteImageFiles([imageFile], {
      start: event.currentTarget.selectionStart,
      end: event.currentTarget.selectionEnd,
    });
  }, [onPasteImageFiles]);
  React.useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return undefined;
    const updateLineMetrics = () => setEditorLineMetrics(readTextareaLineMetrics(textarea));
    updateLineMetrics();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateLineMetrics);
      return () => window.removeEventListener('resize', updateLineMetrics);
    }
    const observer = new ResizeObserver(updateLineMetrics);
    observer.observe(textarea);
    return () => observer.disconnect();
  }, [textareaRef]);

  return (
    <div
      className="relative min-h-0 flex-1 overflow-hidden"
      style={{ '--aad-editor-line-number-digits': lineNumberDigits } as React.CSSProperties}
    >
      <EditorDiagnosticLayer
        diagnostics={diagnostics}
        fixes={fixes}
        scrollTop={scrollTop}
        lineMetrics={editorLineMetrics}
        showFixes={showFixes}
        activeFixLine={pendingFixReview ? null : activeFixLine}
        fixLabel={fixLabel}
        onBeginFixReview={onBeginFixReview}
      />
      {focusedLine && (
        <div className="aad-editor-focused-line-layer" aria-hidden="true">
          <div className="aad-editor-focused-line-layer-inner" style={{ transform: `translateY(-${scrollTop}px)` }}>
            <div
              className="aad-editor-focused-line aad-source-focused-line-highlight"
              style={{
                top: `${getLineNumberTop(focusedLine, editorLineMetrics.paddingTop, editorLineMetrics.lineHeight)}px`,
                height: `${editorLineMetrics.lineHeight}px`,
              }}
            />
          </div>
        </div>
      )}
      <EditorSearchHighlightLayer
        activeMatchId={searchActiveMatchId}
        matches={searchMatches}
        scrollTop={scrollTop}
        value={value}
      />
      {pendingFixReview && <EditorPendingFixOverlay review={pendingFixReview} scrollTop={scrollTop} inlineHint={t.pendingFixInlineHint} />}
      <EditorAppliedFixToast
        lastAppliedFix={lastAppliedFix}
        pendingFixReview={pendingFixReview}
        onConfirmFixReview={onConfirmFixReview}
        onCancelFixReview={onCancelFixReview}
        onUndoLastFix={onUndoLastFix}
        t={t}
      />
      {isDragActive && (
        <div className="aad-editor-import-overlay" aria-hidden="true">
          <span>{t.importDropHint}</span>
        </div>
      )}
      {loadingNotice && (
        <div className="aad-editor-loading-overlay" role="status">
          <Loader2 size={18} className="animate-spin" aria-hidden="true" />
          <span>{loadingNotice}</span>
        </div>
      )}
      <div className="aad-editor-line-number-rail" aria-hidden={!canNavigateToPreview}>
        <div ref={lineNumbersRef} className={`aad-editor-line-numbers is-virtual ${canNavigateToPreview ? 'has-navigation' : ''}`}>
          <div className="aad-editor-line-numbers-content" style={{ height: `${lineNumbersContentHeight}px` }}>
            {visibleLineNumbers.map((lineNumber) => {
              const style = {
                top: `${getLineNumberTop(lineNumber, editorLineMetrics.paddingTop, editorLineMetrics.lineHeight)}px`,
                height: `${editorLineMetrics.lineHeight}px`,
              };
              return canNavigateToPreview ? (
                <button
                  type="button"
                  key={lineNumber}
                  className={getLineNumberClassName(diagnosticSeverityByLine, lineNumber, true, focusedLine === lineNumber)}
                  style={style}
                  title={t.jumpToPreviewArtifact(lineNumber)}
                  aria-label={t.jumpToPreviewArtifact(lineNumber)}
                  onClick={() => onLineNumberClick(lineNumber)}
                >
                  {lineNumber}
                </button>
              ) : (
                <div
                  key={lineNumber}
                  className={getLineNumberClassName(diagnosticSeverityByLine, lineNumber, false, focusedLine === lineNumber)}
                  style={style}
                >
                  {lineNumber}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <textarea
        ref={textareaRef}
        className={`aad-editor-input has-line-numbers absolute inset-0 h-full w-full resize-none overflow-auto p-4 ${pendingFixReview ? 'is-pending-fix' : ''}`}
        wrap="off"
        style={{ whiteSpace: 'pre' }}
        value={value}
        onChange={(event) => {
          const nextValue = event.target.value;
          onChange(nextValue);
          onUserEdit?.(nextValue);
        }}
        readOnly={Boolean(loadingNotice)}
        onPointerDown={handleSourcePointerDown}
        onMouseDown={updateActiveLineFromMouse}
        onClick={updateActiveLineFromMouse}
        onDoubleClick={handleSourceDoubleClick}
        onFocus={updateActiveLineFromSelection}
        onKeyUp={updateActiveLineFromSelection}
        onSelect={updateActiveLineFromSelection}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onPaste={handlePaste}
        onScroll={onScroll}
        spellCheck={false}
        placeholder={editorPlaceholder}
      />
      <ScrollToTopButton
        className="aad-editor-back-to-top"
        label={t.backToTop}
        onClick={() => onBackToTop?.()}
        visible={showBackToTopButton}
      />
    </div>
  );
};
