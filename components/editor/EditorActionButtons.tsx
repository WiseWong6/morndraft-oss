import React from 'react';
import { Check, Copy, Download, Eraser } from 'lucide-react';
import type { EditorTranslations } from '../../i18n';

export const EditorActionButtons: React.FC<{
  value: string;
  copied: boolean;
  onClear: () => void;
  onCopy: () => void;
  onDownload: () => void;
  t: EditorTranslations;
}> = ({ value, copied, onClear, onCopy, onDownload, t }) => {
  return (
    <div className="aad-editor-action-buttons">
      <button
        onClick={onClear}
        disabled={!value}
        className="aad-action-button aad-editor-action-button aad-editor-clear-button disabled:opacity-30"
        title={t.clear}
        aria-label={t.clear}
      >
        <Eraser size={14} />
        <span className="aad-editor-action-label hidden md:inline">{t.clear}</span>
      </button>
      <button
        onClick={onCopy}
        disabled={!value || copied}
        className={`aad-action-button aad-editor-action-button aad-editor-copy-button ${copied ? 'is-success' : ''}`}
        title={copied ? t.copied : t.copySource}
        aria-label={copied ? t.copied : t.copySource}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
        <span className="aad-editor-action-label hidden md:inline">{copied ? t.copied : t.copySource}</span>
      </button>
      <button
        onClick={onDownload}
        disabled={!value}
        className="aad-action-button aad-editor-action-button aad-editor-download-button disabled:opacity-30"
        title={t.downloadSource}
        aria-label={t.downloadSource}
      >
        <Download size={14} />
        <span className="aad-editor-action-label hidden md:inline">{t.downloadSource}</span>
      </button>
    </div>
  );
};
