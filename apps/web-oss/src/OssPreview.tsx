import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { preprocessResourceLinks } from '@morndraft/core/oss-public';
import { MermaidDiagram } from './MermaidDiagram';
import { detectOssDocument, getEmbeddedFenceKind } from './ossDocument';

type PreviewProps = {
  source: string;
  theme: 'light' | 'dark';
  locale: 'zh' | 'en';
};

const HtmlSandbox: React.FC<{ html: string; title: string }> = ({ html, title }) => (
  <iframe
    className="oss-html-frame"
    data-oss-html-sandbox="untrusted"
    referrerPolicy="no-referrer"
    sandbox="allow-scripts"
    srcDoc={html}
    title={title}
  />
);

const JsonPreview: React.FC<{ source: string; locale: PreviewProps['locale'] }> = ({ source, locale }) => {
  let output = source;
  let error = '';
  try {
    output = JSON.stringify(JSON.parse(source), null, 2);
  } catch {
    error = locale === 'zh' ? 'JSON 格式不完整，按源码显示。' : 'JSON is incomplete; showing source.';
  }
  return (
    <div className="oss-json-preview">
      {error && <p className="oss-inline-error" role="status">{error}</p>}
      <pre><code>{output}</code></pre>
    </div>
  );
};

export const OssPreview: React.FC<PreviewProps> = ({ source, theme, locale }) => {
  const document = useMemo(() => detectOssDocument(source), [source]);
  const htmlTitle = locale === 'zh' ? '隔离的 HTML 预览' : 'Isolated HTML preview';

  if (document.kind === 'html') return <HtmlSandbox html={document.content} title={htmlTitle} />;
  if (document.kind === 'json') return <JsonPreview source={document.content} locale={locale} />;
  if (document.kind === 'mermaid') return <MermaidDiagram source={document.content} theme={theme} />;

  return (
    <article className="oss-markdown">
      <ReactMarkdown
        components={{
          a: ({ children, ...props }) => <a {...props} rel="noreferrer noopener" target="_blank">{children}</a>,
          code: ({ className, children, ...props }) => {
            const content = String(children).replace(/\n$/, '');
            const kind = getEmbeddedFenceKind(className);
            if (kind === 'mermaid') return <MermaidDiagram source={content} theme={theme} />;
            if (kind === 'html') return <HtmlSandbox html={content} title={htmlTitle} />;
            if (kind === 'json') return <JsonPreview source={content} locale={locale} />;
            return <code {...props} className={className}>{children}</code>;
          },
        }}
      >
        {preprocessResourceLinks(document.content)}
      </ReactMarkdown>
    </article>
  );
};
