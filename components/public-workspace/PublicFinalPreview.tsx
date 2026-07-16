import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  applyPublicFormatCommand,
  getPublicFormatSelectionAvailability,
  getPublicSourcePhysicalLineBounds,
  insertPublicMarkdownParagraph,
  resolvePublicBlankLineInsertionTarget,
  shouldHandlePublicPlainMouseGesture,
} from '@morndraft/core/oss-public';
import { PublicFormatToolbar, type PublicFormatCommand } from './PublicFormatToolbar';
import {
  detectPublicDocument,
  formatPublicJson5,
  getPublicDocumentContentOffset,
  normalizePublicFenceLanguage,
  replacePublicFenceSegmentContent,
  serializePublicDocumentEdit,
  splitPublicDocumentSegments,
} from './publicDocument';
import {
  isPublicMornDraftFlatHtml,
  PublicFlatFinalEditor,
  PublicHtmlFenceFinalEditor,
} from './PublicFlatFinalEditor';
import { PublicSourceEditor } from './PublicSourceEditor';
import {
  PublicEditableMarkdown,
  type PublicMarkdownImagePasteRequest,
} from './PublicEditableMarkdown';
import { resolvePublicMarkdownDomSelection } from './publicMarkdownDomSelection';
import {
  insertPublicClipboardImageMarkdown,
  resolvePublicClipboardImageMarkdown,
} from './publicClipboardImage';
import {
  assertPublicMermaidSourceBudget,
  createLatestOnlyPublicMermaidRenderer,
} from './publicMermaidQueue';
import type {
  PublicFinalRendererProps,
  PublicTextSelection,
  PublicWorkspaceLocale,
  PublicWorkspaceTheme,
  SourceChangeMeta,
} from './types';

type PublicFinalPreviewProps = PublicFinalRendererProps;

const getLabels = (locale: PublicWorkspaceLocale) => locale === 'zh' ? {
  edit: '编辑最终内容',
  preview: '预览最终内容',
  editLabel: '最终内容编辑器',
  invalidJson: 'JSON5 暂时无法解析；你仍可以继续编辑。',
  mermaidError: 'Mermaid 暂时无法渲染。',
  htmlTitle: 'HTML 安全预览',
  pasteImageFailed: '无法粘贴这张图片。',
  insertLinePlaceholder: '输入新段落',
} : {
  edit: 'Edit final content',
  preview: 'Preview final content',
  editLabel: 'Final content editor',
  invalidJson: 'JSON5 cannot be parsed yet; you can keep editing.',
  mermaidError: 'Mermaid could not be rendered.',
  htmlTitle: 'Sandboxed HTML preview',
  pasteImageFailed: 'Unable to paste this image.',
  insertLinePlaceholder: 'Type a new paragraph',
};

const PublicHtmlFrame = React.memo<{ html: string; title: string }>(({ html, title }) => (
  <iframe
    className="md-public-html-frame"
    sandbox="allow-scripts"
    srcDoc={html}
    title={title}
  />
));
PublicHtmlFrame.displayName = 'PublicHtmlFrame';

const PublicJsonPreview: React.FC<{ source: string; invalidLabel: string }> = ({ source, invalidLabel }) => {
  try {
    return <pre className="md-public-json-preview"><code>{formatPublicJson5(source)}</code></pre>;
  } catch {
    return (
      <div className="md-public-json-invalid">
        <p role="status">{invalidLabel}</p>
        <pre><code>{source}</code></pre>
      </div>
    );
  }
};

const PublicFenceSourceEditor: React.FC<{
  content: string;
  label: string;
  onChange(next: string): void;
}> = ({ content, label, onChange }) => {
  const [draft, setDraft] = useState(content);
  useEffect(() => setDraft(content), [content]);
  return (
    <label className="md-public-fence-source-editor" data-morndraft-delivery-exclude="true">
      <span>{label}</span>
      <textarea
        aria-label={label}
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={() => { if (draft !== content) onChange(draft); }}
      />
    </label>
  );
};

const PublicHtmlFenceBlock: React.FC<{
  content: string;
  editable: boolean;
  locale: PublicWorkspaceLocale;
  title: string;
  onChange(next: string): void;
}> = ({ content, editable, locale, title, onChange }) => {
  const isFlat = useMemo(() => isPublicMornDraftFlatHtml(content), [content]);
  return (
    <div className="md-public-html-fence-block" data-public-flat={isFlat ? 'true' : undefined}>
      <PublicHtmlFrame html={content} title={title} />
      {editable && (isFlat
        ? <PublicFlatFinalEditor html={content} locale={locale} onHtmlChange={onChange} />
        : <PublicHtmlFenceFinalEditor html={content} locale={locale} onHtmlChange={onChange} />)}
    </div>
  );
};

let mermaidRenderSequence = 0;

const PublicMermaidPreview: React.FC<{
  source: string;
  errorLabel: string;
  theme: PublicWorkspaceTheme;
}> = ({ source, errorLabel, theme }) => {
  const [srcDoc, setSrcDoc] = useState('');
  const [error, setError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setSrcDoc('');
    setError(false);
    setIsLoaded(false);
    try {
      assertPublicMermaidSourceBudget(source);
    } catch {
      setError(true);
      return undefined;
    }
    const renderer = createLatestOnlyPublicMermaidRenderer({
      render: async (input: { source: string; theme: PublicWorkspaceTheme }) => {
        const [{ default: mermaid }, security] = await Promise.all([
          import('mermaid'),
          import('./publicMermaidSecurity'),
        ]);
        mermaid.initialize(security.getPublicMermaidConfig(input.theme));
        const rendered = await mermaid.render(`md-public-mermaid-${mermaidRenderSequence += 1}`, input.source);
        return security.createPublicMermaidSandboxDocument(
          security.extractPublicMermaidSandboxSvg(rendered.svg),
          input.theme,
        );
      },
      onResult: setSrcDoc,
      onError: () => setError(true),
    });
    renderer.schedule({ source, theme });
    return renderer.dispose;
  }, [source, theme]);

  if (error) return <p className="md-public-inline-error" data-public-render-state="error" role="status">{errorLabel}</p>;
  if (!srcDoc) return <div className="md-public-preview-loading" data-public-render-state="pending" aria-hidden="true" />;
  return (
    <iframe
      className="md-public-mermaid md-public-mermaid-frame"
      data-mermaid-security="strict-isolated"
      data-public-render-state={isLoaded ? 'ready' : 'pending'}
      referrerPolicy="no-referrer"
      sandbox=""
      srcDoc={srcDoc}
      title="Mermaid diagram"
      onLoad={() => setIsLoaded(true)}
    />
  );
};

const PublicMixedPreview: React.FC<{
  source: string;
  locale: PublicWorkspaceLocale;
  theme: PublicWorkspaceTheme;
  editable: boolean;
  onSourcePatch(next: string): void;
  onSelectionChange?(selection: PublicTextSelection | null): void;
  onImagePaste?(request: PublicMarkdownImagePasteRequest): void;
}> = ({ source, locale, theme, editable, onSourcePatch, onSelectionChange, onImagePaste }) => {
  const labels = getLabels(locale);
  const segments = useMemo(() => splitPublicDocumentSegments(source), [source]);
  return (
    <div className="md-public-markdown-preview">
      {segments.map((segment, index) => {
        if (segment.kind === 'markdown') {
          return (
            <PublicEditableMarkdown
              key={`md-${index}`}
              content={segment.content}
              segmentStart={segment.start}
              source={source}
              editable={editable}
              onSourcePatch={onSourcePatch}
              onSelectionChange={onSelectionChange}
              onImagePaste={onImagePaste}
            />
          );
        }
        const language = normalizePublicFenceLanguage(segment.language);
        const updateFence = (nextContent: string) => {
          const next = replacePublicFenceSegmentContent(source, segment, nextContent);
          if (next !== null && next !== source) onSourcePatch(next);
        };
        if (language === 'html' || language === 'html-preview') {
          return (
            <PublicHtmlFenceBlock
              key={`html-${index}`}
              content={segment.content}
              editable={editable}
              locale={locale}
              title={labels.htmlTitle}
              onChange={updateFence}
            />
          );
        }
        if (language === 'json' || language === 'json5') {
          return (
            <div key={`json-${index}`} className="md-public-json-fence-block">
              <PublicJsonPreview source={segment.content} invalidLabel={labels.invalidJson} />
              {editable && (
                <PublicFenceSourceEditor
                  content={segment.content}
                  label={locale === 'zh' ? 'Final JSON5 编辑器' : 'Final JSON5 editor'}
                  onChange={updateFence}
                />
              )}
            </div>
          );
        }
        if (language === 'mermaid') {
          return <PublicMermaidPreview key={`mermaid-${index}`} source={segment.content} errorLabel={labels.mermaidError} theme={theme} />;
        }
        return (
          <PublicEditableMarkdown
            key={`code-${index}`}
            content={source.slice(segment.start, segment.end)}
            segmentStart={segment.start}
            source={source}
            editable={editable}
            onSourcePatch={onSourcePatch}
            onSelectionChange={onSelectionChange}
            onImagePaste={onImagePaste}
          />
        );
      })}
    </div>
  );
};

const renderDetectedDocument = (
  source: string,
  locale: PublicWorkspaceLocale,
  theme: PublicWorkspaceTheme,
  editable: boolean,
  onSourcePatch: (next: string) => void,
  onSelectionChange?: (selection: PublicTextSelection | null) => void,
  onImagePaste?: (request: PublicMarkdownImagePasteRequest) => void,
) => {
  const labels = getLabels(locale);
  const document = detectPublicDocument(source);
  switch (document.kind) {
    case 'html':
      return <PublicHtmlFrame html={document.content} title={labels.htmlTitle} />;
    case 'json':
      return <PublicJsonPreview source={document.content} invalidLabel={labels.invalidJson} />;
    case 'mermaid':
      return <PublicMermaidPreview source={document.content} errorLabel={labels.mermaidError} theme={theme} />;
    case 'markdown':
    default:
      if (document.fence) {
        return (
          <div className="md-public-markdown-preview">
            <PublicEditableMarkdown
              content={document.content}
              segmentStart={getPublicDocumentContentOffset(source, document)}
              source={source}
              editable={editable}
              onSourcePatch={onSourcePatch}
              onSelectionChange={onSelectionChange}
              onImagePaste={onImagePaste}
            />
          </div>
        );
      }
      return <PublicMixedPreview source={source} locale={locale} theme={theme} editable={editable} onSourcePatch={onSourcePatch} onSelectionChange={onSelectionChange} onImagePaste={onImagePaste} />;
  }
};

type PublicPendingLineInsert = {
  source: string;
  sourceOffset: number;
  top: number;
};

const PUBLIC_FINAL_PROTECTED_TARGETS = [
  'button', 'input', 'select', 'textarea', 'a', 'iframe', 'table', 'pre', 'code',
  '[data-public-final-reversible="false"]',
].join(',');

const readPublicSourceOffset = (element: HTMLElement, attribute: string) => {
  const raw = element.getAttribute(attribute);
  if (raw === null || !/^-?\d+$/u.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
};

const getPublicFinalLogicalTextNodes = (block: HTMLElement) => {
  const nodes: Text[] = [];
  const walker = block.ownerDocument.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    const text = current as Text;
    const owner = text.parentElement?.closest<HTMLElement>('[data-public-final-block="true"]');
    if (owner === block && text.data.length > 0) nodes.push(text);
    current = walker.nextNode();
  }
  return nodes;
};

const PublicBlankLineInput: React.FC<{
  locale: PublicWorkspaceLocale;
  top: number;
  onCancel(): void;
  onCommit(value: string): void;
}> = ({ locale, top, onCancel, onCommit }) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const valueRef = useRef('');
  const committedRef = useRef(false);
  useEffect(() => inputRef.current?.focus({ preventScroll: true }), []);
  const commit = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    if (valueRef.current.trim()) onCommit(valueRef.current);
    else onCancel();
  };
  return (
    <input
      ref={inputRef}
      className="md-public-final-line-input"
      data-morndraft-delivery-exclude="true"
      style={{ top }}
      placeholder={getLabels(locale).insertLinePlaceholder}
      onBlur={commit}
      onChange={(event) => { valueRef.current = event.currentTarget.value; }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          committedRef.current = true;
          onCancel();
        } else if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
          event.preventDefault();
          commit();
        }
      }}
    />
  );
};

export const PublicFinalPreview: React.FC<PublicFinalPreviewProps> = ({
  source,
  documentEpoch,
  locale,
  theme,
  onSourceChange,
  selection,
  onSelectionChange,
  onAiGenerateRequest,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [pasteError, setPasteError] = useState('');
  const [pendingLineInsert, setPendingLineInsert] = useState<PublicPendingLineInsert | null>(null);
  const latestSourceRef = useRef(source);
  const pasteOperationRef = useRef(0);
  const lastPointerTypeRef = useRef('');
  const labels = getLabels(locale);
  const document = useMemo(() => detectPublicDocument(source), [source]);
  const canEdit = document.kind !== 'mermaid';
  const editableContent = document.kind === 'markdown' ? source : document.content;
  const editableContentOffset = getPublicDocumentContentOffset(source, document);

  useLayoutEffect(() => {
    if (latestSourceRef.current === source) return;
    latestSourceRef.current = source;
    pasteOperationRef.current += 1;
  }, [source]);
  useEffect(() => {
    setIsEditing(false);
    setPasteError('');
    setPendingLineInsert(null);
    pasteOperationRef.current += 1;
  }, [documentEpoch]);
  useEffect(() => {
    setPendingLineInsert(current => current?.source === source ? current : null);
  }, [source]);

  const handleEdit = (next: string, meta: SourceChangeMeta) => {
    const nextSource = document.kind === 'markdown' ? next : serializePublicDocumentEdit(document, next);
    onSourceChange(nextSource, { ...meta, origin: meta.origin === 'insert' ? 'insert' : 'final' });
  };
  const handleDirectSourcePatch = (next: string) => onSourceChange(next, { origin: 'final' });

  const handleImagePaste = (request: PublicMarkdownImagePasteRequest) => {
    if (request.source !== source) return;
    const requestSource = source;
    const operation = pasteOperationRef.current + 1;
    pasteOperationRef.current = operation;
    setPasteError('');
    void resolvePublicClipboardImageMarkdown(request.file).then((markdown) => {
      if (
        !markdown
        || pasteOperationRef.current !== operation
        || latestSourceRef.current !== requestSource
        || !request.isSelectionCurrent()
      ) return;
      const result = insertPublicClipboardImageMarkdown(requestSource, request.range, markdown);
      if (!result.ok) return;
      onSourceChange(result.source, { origin: 'paste-image' });
    }).catch(() => {
      if (pasteOperationRef.current !== operation || latestSourceRef.current !== requestSource) return;
      setPasteError(labels.pasteImageFailed);
    });
  };

  const handleFinalDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const pointerType = lastPointerTypeRef.current;
    lastPointerTypeRef.current = '';
    if (!shouldHandlePublicPlainMouseGesture({
      altKey: event.altKey,
      button: event.button,
      ctrlKey: event.ctrlKey,
      detail: event.detail,
      metaKey: event.metaKey,
      pointerType,
      shiftKey: event.shiftKey,
    })) return;
    const target = event.target instanceof Element ? event.target : null;
    const block = target?.closest<HTMLElement>('[data-public-final-block="true"]');
    if (
      !block
      || !event.currentTarget.contains(block)
      || block.getAttribute('data-public-final-reversible') !== 'true'
      || block.matches('td, th, code')
      || Boolean(target?.closest(PUBLIC_FINAL_PROTECTED_TARGETS))
    ) return;
    const textNodes = getPublicFinalLogicalTextNodes(block);
    const first = textNodes[0];
    const last = textNodes.at(-1);
    if (!first || !last) return;
    const range = block.ownerDocument.createRange();
    range.setStart(first, 0);
    range.setEnd(last, last.data.length);
    const browserSelection = block.ownerDocument.defaultView?.getSelection();
    if (!browserSelection) return;
    event.preventDefault();
    browserSelection.removeAllRanges();
    browserSelection.addRange(range);
    const resolved = resolvePublicMarkdownDomSelection(event.currentTarget, browserSelection, source);
    onSelectionChange?.(resolved);
  };

  const handleFinalPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    lastPointerTypeRef.current = event.pointerType;
    if (!isEditing || !shouldHandlePublicPlainMouseGesture({
      altKey: event.altKey,
      button: event.button,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      pointerType: event.pointerType,
      shiftKey: event.shiftKey,
    })) return;
    const target = event.target instanceof Element ? event.target : null;
    if (
      !target
      || target.closest('[data-public-final-block="true"]')
      || target.closest(PUBLIC_FINAL_PROTECTED_TARGETS)
      || (!target.closest('.md-public-markdown-preview') && target !== event.currentTarget)
    ) return;
    const root = event.currentTarget;
    const blocks = Array.from(root.querySelectorAll<HTMLElement>('[data-public-final-block="true"][data-public-final-reversible="true"]')).flatMap((block) => {
      if (block.matches('td, th, code')) return [];
      const sourceStart = readPublicSourceOffset(block, 'data-public-source-start');
      const sourceEnd = readPublicSourceOffset(block, 'data-public-source-end');
      if (sourceStart === null || sourceEnd === null) return [];
      const physicalLine = getPublicSourcePhysicalLineBounds(source, sourceStart, sourceEnd);
      const { bottom, top } = block.getBoundingClientRect();
      return [{ bottom, sourceEnd: physicalLine.end, sourceStart: physicalLine.start, top }];
    });
    const insertion = resolvePublicBlankLineInsertionTarget(event.clientY, blocks);
    if (!insertion) return;
    event.preventDefault();
    const rootTop = root.getBoundingClientRect().top;
    setPendingLineInsert({
      source,
      sourceOffset: insertion.sourceOffset,
      top: Math.max(4, event.clientY - rootTop),
    });
  };

  const handleInnerSelection = (selection: PublicTextSelection | null) => {
    onSelectionChange?.(selection ? {
      ...selection,
      start: editableContentOffset + selection.start,
      end: editableContentOffset + selection.end,
      source,
    } : null);
  };

  const handleInnerGenerateRequest = (range: { start: number; end: number }) => {
    onAiGenerateRequest?.({
      start: editableContentOffset + range.start,
      end: editableContentOffset + range.end,
    });
  };

  const formatAvailability = getPublicFormatSelectionAvailability(source, selection);
  const handleFormatCommand = (command: PublicFormatCommand) => {
    const result = applyPublicFormatCommand(source, selection, command);
    if (!result.ok || result.source === source) return;
    onSourceChange(result.source, { origin: 'format' });
  };

  return (
    <section
      className="md-public-final"
      data-public-final="true"
      data-theme={theme}
      data-document-kind={document.kind}
    >
      {canEdit && (
        <div className="md-public-final-toolbar">
          {isEditing && (
            <PublicFormatToolbar
              canApplyBlockFormat={formatAvailability.canApplyBlockFormat}
              canFormat={formatAvailability.canFormat}
              locale={locale}
              onCommand={handleFormatCommand}
            />
          )}
          <button type="button" aria-pressed={isEditing} onClick={() => setIsEditing((value) => !value)}>
            {isEditing ? labels.preview : labels.edit}
          </button>
        </div>
      )}
      {isEditing && document.kind !== 'markdown' ? (
        <PublicSourceEditor
          key={`final-editor-${documentEpoch}`}
          source={editableContent}
          locale={locale}
          origin="final"
          allowImagePaste={false}
          flatInsertEntries={[]}
          ariaLabel={labels.editLabel}
          onSourceChange={handleEdit}
          onSelectionChange={handleInnerSelection}
          onAiGenerateRequest={onAiGenerateRequest ? handleInnerGenerateRequest : undefined}
        />
      ) : (
        <div className="md-public-final-surface" data-public-preview-root="true">
          <div
            className="md-public-final-document"
            data-public-final-document="true"
            onDoubleClick={handleFinalDoubleClick}
            onPointerDown={handleFinalPointerDown}
          >
            {renderDetectedDocument(source, locale, theme, isEditing, handleDirectSourcePatch, onSelectionChange, handleImagePaste)}
            {pendingLineInsert && (
              <PublicBlankLineInput
                locale={locale}
                top={pendingLineInsert.top}
                onCancel={() => setPendingLineInsert(null)}
                onCommit={(value) => {
                  const pending = pendingLineInsert;
                  setPendingLineInsert(null);
                  if (!pending || pending.source !== source) return;
                  const next = insertPublicMarkdownParagraph(source, pending.sourceOffset, value);
                  if (next !== source) onSourceChange(next, { origin: 'insert' });
                }}
              />
            )}
          </div>
        </div>
      )}
      {pasteError && <p className="md-public-inline-error" role="alert">{pasteError}</p>}
    </section>
  );
};
