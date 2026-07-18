import React from 'react';
import type { ArtifactPreviewTranslations } from '../../i18n';

const PreviewNavigationContext = React.createContext<{
  enabledCapabilities: readonly string[];
  onRequestEditorLineFocus?: (line: number) => void;
}>({
  enabledCapabilities: [],
});

export const PreviewNavigationProvider = PreviewNavigationContext.Provider;

export const ErrorLineMeta: React.FC<{
  line: number | null;
  t: ArtifactPreviewTranslations;
}> = ({ line, t }) => {
  const { onRequestEditorLineFocus } = React.useContext(PreviewNavigationContext);
  if (!line) return null;

  const label = t.sourceErrorLine(line);
  if (!onRequestEditorLineFocus) {
    return <span>{label}</span>;
  }

  return (
    <button
      type="button"
      className="aad-error-line-button"
      title={t.jumpToSourceErrorLine(line)}
      aria-label={t.jumpToSourceErrorLine(line)}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onRequestEditorLineFocus(line);
      }}
    >
      {label}
    </button>
  );
};
