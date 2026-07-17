import React, { useEffect, useMemo, useState } from 'react';
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
import { PublicEditableMarkdown } from './PublicEditableMarkdown';
import { PublicComplianceFooter } from './PublicComplianceFooter';
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
  editLabel: '最终内容编辑器',
  invalidJson: 'JSON5 暂时无法解析；你仍可以继续编辑。',
  mermaidError: 'Mermaid 暂时无法渲染。',
  htmlTitle: 'HTML 安全预览',
} : {
  editLabel: 'Final content editor',
  invalidJson: 'JSON5 cannot be parsed yet; you can keep editing.',
  mermaidError: 'Mermaid could not be rendered.',
  htmlTitle: 'Sandboxed HTML preview',
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
  structuredEditing: boolean;
  onSourcePatch(next: string): void;
  onSelectionChange?(selection: PublicTextSelection | null): void;
}> = ({ source, locale, theme, editable, structuredEditing, onSourcePatch, onSelectionChange }) => {
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
              editable={structuredEditing}
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
              {structuredEditing && (
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
            />
          </div>
        );
      }
      return (
        <PublicMixedPreview
          source={source}
          locale={locale}
          theme={theme}
          editable={editable}
          structuredEditing={false}
          onSourcePatch={onSourcePatch}
          onSelectionChange={onSelectionChange}
        />
      );
  }
};

export const PublicFinalPreview: React.FC<PublicFinalPreviewProps> = ({
  source,
  documentEpoch,
  locale,
  theme,
  editing = false,
  includeA4Pagination = true,
  showCode = true,
  onSourceChange,
  onSelectionChange,
  onAiGenerateRequest,
}) => {
  const labels = getLabels(locale);
  const document = useMemo(() => detectPublicDocument(source), [source]);
  const editableContent = document.kind === 'markdown' ? source : document.content;
  const editableContentOffset = getPublicDocumentContentOffset(source, document);

  const handleEdit = (next: string, meta: SourceChangeMeta) => {
    const nextSource = document.kind === 'markdown' ? next : serializePublicDocumentEdit(document, next);
    onSourceChange(nextSource, { ...meta, origin: meta.origin === 'insert' ? 'insert' : 'final' });
  };
  const handleDirectSourcePatch = (next: string) => onSourceChange(next, { origin: 'final' });

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

  return (
    <section
      className={`md-public-final aad-preview-shell has-icp-filing${includeA4Pagination ? ' is-a4-pagination' : ' is-continuous'}`}
      data-public-final="true"
      data-theme={theme}
      data-document-kind={document.kind}
      data-final-editing={editing ? 'true' : 'false'}
      data-show-code={showCode ? 'true' : 'false'}
    >
      {editing && document.kind !== 'markdown' ? (
        <PublicSourceEditor
          key={`final-editor-${documentEpoch}`}
          source={editableContent}
          locale={locale}
          origin="final"
          flatInsertEntries={[]}
          ariaLabel={labels.editLabel}
          onSourceChange={handleEdit}
          onSelectionChange={handleInnerSelection}
          onAiGenerateRequest={onAiGenerateRequest ? handleInnerGenerateRequest : undefined}
        />
      ) : (
        <div className="md-public-final-surface aad-document-surface" data-public-preview-root="true">
          {renderDetectedDocument(source, locale, theme, editing, handleDirectSourcePatch, onSelectionChange)}
        </div>
      )}
      <PublicComplianceFooter />
    </section>
  );
};
