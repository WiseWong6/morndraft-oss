import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { ArtifactPreviewTranslations } from '../../i18n';
import {
  CollapsibleArtifactBlock,
  preservePreviewScrollAnchorForElement,
} from './CollapsibleArtifactBlock';
import { ErrorLineMeta } from './ErrorLineMeta';
import { PREVIEW_CODE_LINE_HEIGHT } from './syntaxHighlighting';
import type { ArtifactDiagnostic } from './MarkdownCodeBlockRenderer';

type DiagnosticWithFix = {
  fix?: { id: string } | null;
  fixId?: string;
} | null | undefined;

export type ArtifactErrorAiRepairContextValue = {
  isAiFixBusy?: boolean;
  onRequestAiFix: (diagnostic: ArtifactDiagnostic) => void;
  repairMode: 'ai';
};

export const ArtifactErrorAiRepairContext = React.createContext<ArtifactErrorAiRepairContextValue | null>(null);

const FALLBACK_SOURCE_TEXTAREA_FONT_SIZE = 13;
const FALLBACK_SOURCE_TEXTAREA_METRICS = {
  lineHeight: FALLBACK_SOURCE_TEXTAREA_FONT_SIZE * PREVIEW_CODE_LINE_HEIGHT,
  paddingLeft: 9.6,
  paddingTop: 11.2,
};

const resizeSourceTextarea = (textarea: HTMLTextAreaElement | null) => {
  if (!textarea) return;
  textarea.style.height = 'auto';
  textarea.style.height = `${Math.max(72, textarea.scrollHeight)}px`;
};

const readSourceTextareaMetrics = (textarea: HTMLTextAreaElement | null) => {
  if (!textarea) return null;
  const style = window.getComputedStyle(textarea);
  const fontSize = Number.parseFloat(style.fontSize) || FALLBACK_SOURCE_TEXTAREA_FONT_SIZE;
  const lineHeight = Number.parseFloat(style.lineHeight) || fontSize * PREVIEW_CODE_LINE_HEIGHT;
  return {
    lineHeight,
    paddingLeft: Number.parseFloat(style.paddingLeft) || FALLBACK_SOURCE_TEXTAREA_METRICS.paddingLeft,
    paddingTop: Number.parseFloat(style.paddingTop) || FALLBACK_SOURCE_TEXTAREA_METRICS.paddingTop,
  };
};

const coerceMessageText = (value: unknown) => {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  return String(value);
};

const mergeMessageAndHint = (message: unknown, hint: unknown) => {
  const trimmedMessage = coerceMessageText(message).trim();
  const trimmedHint = coerceMessageText(hint).trim();
  if (!trimmedHint) return trimmedMessage;
  if (!trimmedMessage) return trimmedHint;
  if (trimmedMessage.includes(trimmedHint)) return trimmedMessage;
  const normalizedMessage = /[。.!?！？]$/.test(trimmedMessage) ? trimmedMessage : `${trimmedMessage}。`;
  return `${normalizedMessage}\n${trimmedHint}`;
};

const getSourceLineCount = (source: string) => Math.max(1, source.split(/\r?\n/).length);

const getRelativeSourceErrorLine = (
  line: number | null,
  sourceStartLine: number | null | undefined,
  sourceCode: string,
) => {
  if (!line || !sourceStartLine) return null;
  const relativeLine = line - sourceStartLine + 1;
  if (relativeLine < 1 || relativeLine > getSourceLineCount(sourceCode)) return null;
  return relativeLine;
};

export const ArtifactErrorBlock: React.FC<{
  label: React.ReactNode;
  line: number | null;
  message?: string | null;
  t: ArtifactPreviewTranslations;
  className?: string;
  bodyClassName?: string;
  copyRole: string;
  resetKey: string;
  dataAttributes?: Record<string, string>;
  actions?: React.ReactNode;
  diagnostic?: ArtifactDiagnostic | DiagnosticWithFix;
  isAiFixBusy?: boolean;
  onBeginFixReview?: (fixId: string) => void;
  onRequestAiFix?: (diagnostic: ArtifactDiagnostic) => void;
  repairMode?: 'ai' | 'deterministic';
  canEditSource?: boolean;
  sourceCode?: string;
  sourceLanguage?: string;
  sourceStartLine?: number | null;
  onSourceCodeChange?: (newCode: string) => void;
}> = ({
  label,
  line,
  message,
  t,
  className = '',
  bodyClassName = '',
  copyRole,
  resetKey,
  dataAttributes,
  actions,
  canEditSource = false,
  sourceCode = '',
  sourceLanguage = 'code',
  sourceStartLine = null,
  onSourceCodeChange,
}) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [draft, setDraft] = useState(sourceCode);
  const [sourceTextareaMetrics, setSourceTextareaMetrics] = useState<typeof FALLBACK_SOURCE_TEXTAREA_METRICS | null>(null);
  const canEdit = Boolean(canEditSource && onSourceCodeChange);
  const hasSourceCode = sourceCode.length > 0;
  const shouldShowSource = canEdit || hasSourceCode;
  const hint = canEdit ? t.artifactErrorEditableHint : t.artifactErrorReadOnlyHint;
  const combinedMessage = mergeMessageAndHint(message, hint);
  const relativeErrorLine = canEdit ? getRelativeSourceErrorLine(line, sourceStartLine, draft) : null;
  const highlightStyle = relativeErrorLine && sourceTextareaMetrics
    ? {
        top: `${sourceTextareaMetrics.paddingTop + (relativeErrorLine - 1) * sourceTextareaMetrics.lineHeight}px`,
        left: 0,
        right: 0,
        height: `${sourceTextareaMetrics.lineHeight}px`,
      }
    : null;

  useEffect(() => {
    setDraft(sourceCode);
  }, [sourceCode]);

  useEffect(() => {
    const textarea = textareaRef.current;
    resizeSourceTextarea(textarea);
    setSourceTextareaMetrics(readSourceTextareaMetrics(textarea));
  }, [draft, canEdit]);

  const preserveSourceEditScrollAnchor = useCallback(() => {
    const anchor = rootRef.current ?? textareaRef.current;
    if (anchor) preservePreviewScrollAnchorForElement(anchor);
  }, []);

  const handleTextareaBeforeInput = useCallback((event: React.FormEvent<HTMLTextAreaElement>) => {
    const nativeEvent = event.nativeEvent as InputEvent;
    if (nativeEvent.inputType === 'historyUndo' || nativeEvent.inputType === 'historyRedo') {
      preserveSourceEditScrollAnchor();
    }
  }, [preserveSourceEditScrollAnchor]);

  const handleTextareaKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const key = event.key.toLowerCase();
    const isPrimaryShortcut = (event.metaKey || event.ctrlKey) && !event.altKey;
    if (isPrimaryShortcut && (key === 'z' || key === 'y')) {
      preserveSourceEditScrollAnchor();
    }
  }, [preserveSourceEditScrollAnchor]);

  const handleTextareaChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = event.currentTarget.value;
    setDraft(next);
    resizeSourceTextarea(event.currentTarget);
    setSourceTextareaMetrics(readSourceTextareaMetrics(event.currentTarget));
    preserveSourceEditScrollAnchor();
    onSourceCodeChange?.(next);
  }, [onSourceCodeChange, preserveSourceEditScrollAnchor]);

  return (
    <CollapsibleArtifactBlock
      blockRef={rootRef}
      label={label}
      meta={<ErrorLineMeta line={line} t={t} />}
      className={`aad-artifact-error-block ${className}`.trim()}
      bodyClassName={`aad-error-body ${bodyClassName}`.trim()}
      copyRole={copyRole}
      resetKey={resetKey}
      dataAttributes={dataAttributes}
      expandLabel={t.expandBlock}
      collapseLabel={t.collapseBlock}
      actions={actions}
    >
      <div className="aad-artifact-error-body">
        {canEdit ? (
          <label className="aad-artifact-error-source">
            <div className="aad-artifact-error-source-editor">
              <textarea
                ref={textareaRef}
                className="aad-artifact-error-source-textarea"
                aria-label={t.artifactErrorSourceLabel(sourceLanguage)}
                value={draft}
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="off"
                autoCorrect="off"
                onBeforeInput={handleTextareaBeforeInput}
                onKeyDown={handleTextareaKeyDown}
                onChange={handleTextareaChange}
              />
              {highlightStyle && (
                <div
                  className="aad-artifact-error-source-highlight aad-source-focused-line-highlight"
                  style={highlightStyle}
                  aria-hidden="true"
                />
              )}
            </div>
          </label>
        ) : shouldShowSource ? (
          <div className="aad-artifact-error-source">
            <pre className="aad-code-block aad-artifact-error-source-code">
              <code>{draft}</code>
            </pre>
          </div>
        ) : null}
        <pre className="aad-json-error-message">
          {combinedMessage}
        </pre>
      </div>
    </CollapsibleArtifactBlock>
  );
};
