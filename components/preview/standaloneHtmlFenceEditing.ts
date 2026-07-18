import { extractStandaloneHtmlPreviewFence } from '@morndraft/core';
import { isFullHtmlDocument } from './htmlPreviewFrameDocument';

export type PreviewEditingSourceKind =
  | 'document'
  | 'standalone-html-document'
  | 'standalone-html-fence';

export type PreviewEditingSourceChannels = {
  editableSource: string;
  latestEditableSource: string;
  renderSource: string;
  sourceKind: PreviewEditingSourceKind;
};

const getStandaloneHtmlFenceMarker = (html: string) => {
  let longestStandaloneTildeRun = 0;
  for (const line of html.split(/\r?\n/)) {
    const match = line.trim().match(/^~+$/);
    if (match) longestStandaloneTildeRun = Math.max(longestStandaloneTildeRun, match[0].length);
  }
  return '~'.repeat(Math.max(3, longestStandaloneTildeRun + 1));
};

export const wrapStandaloneHtmlDocumentForEditing = (source: string) => {
  const html = source.trim();
  const marker = getStandaloneHtmlFenceMarker(html);
  return `${marker}html-preview\n${html}\n${marker}`;
};

const restoreOuterWhitespace = (source: string, nextContent: string) => {
  const leadingWhitespace = source.match(/^\s*/)?.[0] ?? '';
  const trailingWhitespace = source.match(/\s*$/)?.[0] ?? '';
  return `${leadingWhitespace}${nextContent.trim()}${trailingWhitespace}`;
};

/**
 * A standalone HTML fence has two simultaneous representations:
 * - its inner document is rendered/exported as raw HTML;
 * - the original fenced source remains the editable document contract.
 *
 * Keeping this split explicit prevents the render-only normalization from
 * removing the Lexical artifact boundary or the caller's surrounding space.
 */
export const resolvePreviewEditingSourceChannels = ({
  code,
  latestSource,
}: {
  code: string;
  latestSource: string;
}): PreviewEditingSourceChannels => {
  const standaloneHtmlFence = extractStandaloneHtmlPreviewFence(code);
  if (!standaloneHtmlFence) {
    if (isFullHtmlDocument(code)) {
      return {
        editableSource: wrapStandaloneHtmlDocumentForEditing(code),
        latestEditableSource: isFullHtmlDocument(latestSource)
          ? wrapStandaloneHtmlDocumentForEditing(latestSource)
          : latestSource,
        renderSource: code,
        sourceKind: 'standalone-html-document',
      };
    }
    return {
      editableSource: code,
      latestEditableSource: latestSource,
      renderSource: code,
      sourceKind: 'document',
    };
  }

  return {
    editableSource: code,
    latestEditableSource: latestSource,
    renderSource: standaloneHtmlFence.html,
    sourceKind: 'standalone-html-fence',
  };
};

export const resolvePreviewEditingResetSource = (
  channels: PreviewEditingSourceChannels,
  previewCode: string,
) => channels.sourceKind === 'document' ? previewCode : channels.editableSource;

export const serializePreviewEditingSourcePatch = ({
  nextSource,
  originalSource,
  sourceKind,
}: {
  nextSource: string;
  originalSource: string;
  sourceKind: PreviewEditingSourceKind;
}) => {
  if (sourceKind !== 'standalone-html-document' || !nextSource.trim()) return nextSource;
  const standaloneHtmlFence = extractStandaloneHtmlPreviewFence(nextSource);
  return standaloneHtmlFence
    ? restoreOuterWhitespace(originalSource, standaloneHtmlFence.html)
    : nextSource;
};

export const resolveHtmlFenceOuterWhitespaceSource = (source: string) => (
  extractStandaloneHtmlPreviewFence(source) ? source : null
);

export const preserveHtmlFenceDocumentOuterWhitespace = (
  currentSource: string,
  nextSource: string,
  fallbackWhitespaceSource: string | null = null,
) => {
  if (!nextSource.trim()) return nextSource;
  const whitespaceSource = resolveHtmlFenceOuterWhitespaceSource(currentSource) ??
    (fallbackWhitespaceSource
      ? resolveHtmlFenceOuterWhitespaceSource(fallbackWhitespaceSource)
      : null);
  if (!whitespaceSource) return nextSource;
  const leadingWhitespace = whitespaceSource.match(/^\s*/)?.[0] ?? '';
  const trailingWhitespace = whitespaceSource.match(/\s*$/)?.[0] ?? '';
  return `${leadingWhitespace}${nextSource.trim()}${trailingWhitespace}`;
};
