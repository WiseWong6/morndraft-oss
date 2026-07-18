import React, { useMemo } from 'react';
import {
  CODE_FENCE_LANGUAGE_KINDS,
  getCodeFenceLanguageKind,
} from '@morndraft/core';
import type { ArtifactPreviewTranslations } from '../../i18n';
import { preprocessResourceLinks } from '../../utils/content-detection.js';
import type { PreviewRenderDeliveryAccess } from './deliveryAccess';
import { useStreamingAutoScroll } from './useStreamingAutoScroll';

const PreviewAiMarkdownResultBody = React.lazy(async () => {
  const module = await import('./PreviewAiMarkdownResultBody');
  return { default: module.PreviewAiMarkdownResultBody };
});

const parseFenceLine = (line: string) => {
  const match = line.match(/^(\s*)(`{3,}|~{3,})([^\n]*)$/u);
  if (!match) return null;
  const info = (match[3] ?? '').trim();
  return {
    indent: match[1] ?? '',
    marker: match[2] ?? '',
    info,
    language: info.split(/\s+/u)[0]?.toLowerCase() ?? '',
  };
};

const STREAMING_ARTIFACT_FENCE_KINDS: ReadonlySet<string> = new Set([
  CODE_FENCE_LANGUAGE_KINDS.DOCUMENT_SPEC,
  CODE_FENCE_LANGUAGE_KINDS.HTML_PREVIEW,
  CODE_FENCE_LANGUAGE_KINDS.MERMAID,
]);

const isClosingFenceLine = (line: string, marker: string) => {
  const trimmed = line.trim();
  if (!trimmed || trimmed[0] !== marker[0]) return false;
  const match = trimmed.match(/^(`{3,}|~{3,})\s*$/u);
  return Boolean(match && match[1].length >= marker.length);
};

const isStreamingArtifactFenceLanguage = (language: string) =>
  STREAMING_ARTIFACT_FENCE_KINDS.has(getCodeFenceLanguageKind(language));

export const protectStreamingArtifactFencesForPreview = (markdown: string) => {
  const lines = markdown.split('\n');
  let openFence: {
    indent: string;
    marker: string;
    protected: boolean;
  } | null = null;
  let changed = false;
  const nextLines = [...lines];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (openFence) {
      if (isClosingFenceLine(line, openFence.marker)) openFence = null;
      continue;
    }
    const fence = parseFenceLine(line);
    if (!fence) continue;
    const shouldProtectFence = isStreamingArtifactFenceLanguage(fence.language);
    if (shouldProtectFence) {
      nextLines[index] = `${fence.indent}${fence.marker}text`;
      changed = true;
    }
    openFence = {
      indent: fence.indent,
      marker: fence.marker,
      protected: shouldProtectFence,
    };
  }

  if (!changed) return markdown;
  const nextMarkdown = nextLines.join('\n');
  if (!openFence?.protected) return nextMarkdown;
  return `${nextMarkdown}${nextMarkdown.endsWith('\n') ? '' : '\n'}${openFence.indent}${openFence.marker}`;
};

export const protectStreamingHtmlFenceForPreview = protectStreamingArtifactFencesForPreview;

export type PreviewAiMarkdownArtifactRenderMode = 'render' | 'source-only';

export const PreviewAiMarkdownResult: React.FC<{
  artifactRenderMode?: PreviewAiMarkdownArtifactRenderMode;
  className?: string;
  markdown: string;
  renderDeliveryAccess?: PreviewRenderDeliveryAccess;
  streaming?: boolean;
  t?: ArtifactPreviewTranslations;
}> = ({ artifactRenderMode = 'render', className, markdown, renderDeliveryAccess, streaming = false, t }) => {
  const shouldRenderSourceOnly = artifactRenderMode === 'source-only' || streaming;
  const displayMarkdown = useMemo(
    () => (shouldRenderSourceOnly ? protectStreamingArtifactFencesForPreview(markdown) : markdown),
    [markdown, shouldRenderSourceOnly],
  );
  const processedMarkdown = useMemo(() => preprocessResourceLinks(displayMarkdown), [displayMarkdown]);
  const resultRef = useStreamingAutoScroll<HTMLDivElement>(streaming);
  const rootClassName = [
    'aad-preview-ai-selection-result-text',
    'aad-preview-ai-markdown-result',
    t ? 'aad-preview-ai-source-result' : null,
    className,
  ].filter(Boolean).join(' ');

  if (t) {
    return (
      <div ref={resultRef} className={rootClassName}>
        <React.Suspense fallback={<div className="aad-preview-ai-markdown-paragraph">{processedMarkdown}</div>}>
          <PreviewAiMarkdownResultBody
            processedMarkdown={processedMarkdown}
            renderDeliveryAccess={renderDeliveryAccess}
            t={t}
          />
        </React.Suspense>
      </div>
    );
  }

  return (
    <div ref={resultRef} className={rootClassName}>
      <React.Suspense fallback={<div className="aad-preview-ai-markdown-paragraph">{processedMarkdown}</div>}>
        <PreviewAiMarkdownResultBody processedMarkdown={processedMarkdown} />
      </React.Suspense>
    </div>
  );
};
