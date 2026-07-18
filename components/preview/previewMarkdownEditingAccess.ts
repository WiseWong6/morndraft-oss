import { extractStandaloneHtmlPreviewFence } from '@morndraft/core';
import type { PreviewEditingSourceKind } from './standaloneHtmlFenceEditing';

type PreviewEditingContentType = 'markdown' | 'json' | 'html' | 'mermaid' | 'mixed';

export const canUsePreviewMarkdownEditing = ({
  code,
  contentType,
  hasPatch,
  latestSource,
  processedCode,
  sourceKind = 'document',
}: {
  code: string;
  contentType: PreviewEditingContentType;
  hasPatch: boolean;
  latestSource: string;
  processedCode: string;
  sourceKind?: PreviewEditingSourceKind;
}) => {
  const isStandaloneHtmlFence = sourceKind === 'standalone-html-fence' &&
    contentType === 'html' &&
    Boolean(extractStandaloneHtmlPreviewFence(code));
  const isStandaloneHtmlDocument = sourceKind === 'standalone-html-document' &&
    contentType === 'html' &&
    Boolean(extractStandaloneHtmlPreviewFence(code));
  const codeMatches = processedCode === code ||
    (contentType === 'json' && processedCode === `\`\`\`json\n${code}\n\`\`\``);
  return Boolean(hasPatch) &&
    (
      isStandaloneHtmlFence ||
      isStandaloneHtmlDocument ||
      (
        (contentType === 'markdown' || contentType === 'mixed' || contentType === 'json') &&
        codeMatches
      )
    ) &&
    latestSource === code;
};
