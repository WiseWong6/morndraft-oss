import type { TextSearchLabels } from '@morndraft/features-personal';
import type { ArtifactPreviewTranslations } from '../../i18n';

export const getPreviewCopyLabel = (contentType: string, t: ArtifactPreviewTranslations) => {
  switch (contentType) {
    case 'json':
      return t.copyJson;
    case 'mermaid':
      return t.copyRichText;
    default:
      return t.copyRichText;
  }
};

export const getPreviewTextSearchLabels = (t: ArtifactPreviewTranslations): TextSearchLabels => ({
  placeholder: t.searchPlaceholder,
  previous: t.searchPrevious,
  next: t.searchNext,
  clear: t.searchClear,
  noMatches: t.searchNoMatches,
  matchStatus: t.searchMatchStatus,
});
