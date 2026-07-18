import React from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import type { ArtifactPreviewTranslations } from '../../i18n';
import type { PreviewRenderDeliveryAccess } from './deliveryAccess';
import {
  MORNDRAFT_MARKDOWN_SANITIZE_SCHEMA,
  morndraftMarkdownUrlTransform,
} from './markdownSanitizeSchema';
import type { ArtifactDiagnostic } from './MarkdownCodeBlockRenderer';
import { MarkdownReadonlyRenderer } from './MarkdownReadonlyRenderer';
import {
  HtmlPreviewBlock,
  MermaidPreviewBlock,
  PreviewI18nContext,
} from './PreviewRenderBlocks';

const EMPTY_ARTIFACT_DIAGNOSTICS: readonly ArtifactDiagnostic[] = [];
const getEmptyArtifactIdForNode = () => '';
const noopJsonFormatted = () => undefined;
const noopMermaidSvgReady = () => undefined;
const passthroughArtifactTarget = (_node: unknown, element: React.ReactElement) => element;

export const PreviewAiMarkdownResultBody: React.FC<{
  processedMarkdown: string;
  renderDeliveryAccess?: PreviewRenderDeliveryAccess;
  t?: ArtifactPreviewTranslations;
}> = ({ processedMarkdown, renderDeliveryAccess, t }) => {
  if (t) {
    return (
      <PreviewI18nContext.Provider value={t}>
        <MarkdownReadonlyRenderer
          code={processedMarkdown}
          contentType="mixed"
          diagnostics={EMPTY_ARTIFACT_DIAGNOSTICS}
          forceClosedCodeFence
          fullSource={processedMarkdown}
          getArtifactIdForNode={getEmptyArtifactIdForNode}
          HtmlPreviewComponent={HtmlPreviewBlock}
          lineMap={null}
          MermaidPreviewComponent={MermaidPreviewBlock}
          onJsonFormatted={noopJsonFormatted}
          onMermaidSvgReady={noopMermaidSvgReady}
          renderDeliveryAccess={renderDeliveryAccess}
          t={t}
          withArtifactTarget={passthroughArtifactTarget}
        />
      </PreviewI18nContext.Provider>
    );
  }

  return (
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
          return <div className="aad-preview-ai-markdown-paragraph" {...rest} />;
        },
        a: (props: any) => {
          const { node, ...rest } = props;
          void node;
          return <a {...rest} rel="noreferrer noopener" target="_blank" />;
        },
      }}
    >
      {processedMarkdown}
    </ReactMarkdown>
  );
};
