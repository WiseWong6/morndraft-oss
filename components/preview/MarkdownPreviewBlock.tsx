import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { normalizeCodeFenceLanguage } from '@morndraft/core';
import { preprocessResourceLinks } from '../../utils/content-detection.js';
import type { ArtifactPreviewTranslations } from '../../i18n';
import {
  CollapsibleArtifactBlock,
} from './CollapsibleArtifactBlock';
import {
  MORNDRAFT_MARKDOWN_SANITIZE_SCHEMA,
  morndraftMarkdownUrlTransform,
} from './markdownSanitizeSchema';

const PrismCodeHighlighter = React.lazy(async () => {
  const module = await import('./PrismCodeHighlighter');
  return { default: module.PrismCodeHighlighter };
});

const getCodeLineCount = (code: string) => (code ? code.split(/\r?\n/).length : 0);

export const MarkdownPreviewBlock: React.FC<{
  code: string;
  t: ArtifactPreviewTranslations;
}> = ({ code, t }) => {
  const processedMarkdown = useMemo(() => preprocessResourceLinks(code), [code]);

  return (
    <CollapsibleArtifactBlock
      label="Markdown"
      meta={t.codeLines(getCodeLineCount(code))}
      className="aad-markdown-preview-block"
      copyRole="markdown-preview-block"
      resetKey={`markdown:${code}`}
      expandLabel={t.expandBlock}
      collapseLabel={t.collapseBlock}
    >
      <div className="aad-nested-markdown">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          urlTransform={morndraftMarkdownUrlTransform}
          rehypePlugins={[
            rehypeRaw,
            [rehypeSanitize, MORNDRAFT_MARKDOWN_SANITIZE_SCHEMA],
          ]}
          components={{
            p: (props: any) => {
              const { node, ...rest } = props;
              void node;
              return <div className="aad-md-paragraph" {...rest} />;
            },
            div: (props: any) => {
              const { node, ...rest } = props;
              void node;
              return <div {...rest} />;
            },
            code({ className, children, ...props }: any) {
              const match = /language-([a-zA-Z0-9_-]+)/.exec(className || '');
              const language = match ? normalizeCodeFenceLanguage(match[1]) : '';
              const content = String(children).replace(/\n$/, '');

              return match ? (
                <React.Suspense
                  fallback={(
                    <pre className="aad-code-block">
                      <code>{content}</code>
                    </pre>
                  )}
                >
                  <PrismCodeHighlighter code={content} language={language} codeProps={props} />
                </React.Suspense>
              ) : (
                <code className="aad-inline-code" {...props}>
                  {children}
                </code>
              );
            },
            img: (props: any) => {
              const { node, ...rest } = props;
              void node;
              return (
                <figure className="aad-markdown-image-frame">
                  <img
                    loading="lazy"
                    decoding="async"
                    {...rest}
                    className="aad-auto-image-link"
                  />
                </figure>
              );
            },
          }}
        >
          {processedMarkdown}
        </ReactMarkdown>
      </div>
    </CollapsibleArtifactBlock>
  );
};
