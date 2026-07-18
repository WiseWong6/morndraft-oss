import React from 'react';
import { Code2, FileCheck, PanelLeftClose, Sidebar } from 'lucide-react';
import type { EditorTranslations } from '../../i18n';
import { TextMetricsInline } from '../TextMetricsInline';
import { EditorActionButtons } from './EditorActionButtons';
import { EditorDiagnosticConsole } from './EditorDiagnosticConsole';
import type { ArtifactDiagnostic, ArtifactFix } from './diagnosticTypes';

export const EditorToolbar: React.FC<{
  value: string;
  brandSlot?: React.ReactNode;
  copied: boolean;
  metricsLabel: string;
  compactCharacters: string;
  compactTokens: string;
  diagnostics: readonly ArtifactDiagnostic[];
  fixes: readonly ArtifactFix[];
  isDiagnosticModeOpen: boolean;
  isDraftSidebarCollapsed?: boolean;
  collapseDraftSidebarLabel?: string;
  expandDraftSidebarLabel?: string;
  onWorkspaceModeToggle?: () => void;
  workspaceModeSwitchLabel?: string;
  onToggleDiagnosticMode: () => void;
  onToggleDraftSidebar?: () => void;
  onClear: () => void;
  onCopy: () => void;
  onDownload: () => void;
  t: EditorTranslations;
}> = ({
  value,
  brandSlot,
  copied,
  metricsLabel,
  compactCharacters,
  compactTokens,
  diagnostics,
  fixes,
  isDiagnosticModeOpen,
  isDraftSidebarCollapsed = false,
  collapseDraftSidebarLabel,
  expandDraftSidebarLabel,
  onWorkspaceModeToggle,
  workspaceModeSwitchLabel,
  onToggleDiagnosticMode,
  onToggleDraftSidebar,
  onClear,
  onCopy,
  onDownload,
  t,
}) => (
  <div
    className={`aad-toolbar aad-editor-toolbar flex h-12 shrink-0 items-center gap-2 border-b px-3 md:px-4 ${
      onWorkspaceModeToggle ? 'aad-workspace-toolbar-inner' : ''
    }`.trim()}
  >
    <div className="aad-editor-toolbar-main flex min-w-0 flex-1 items-center gap-2">
      {brandSlot}
      {onToggleDraftSidebar && (
        <button
          type="button"
          onClick={onToggleDraftSidebar}
          className="aad-icon-button aad-toolbar-icon-button aad-workspace-draft-toggle aad-editor-draft-sidebar-toggle"
          title={isDraftSidebarCollapsed ? expandDraftSidebarLabel : collapseDraftSidebarLabel}
          aria-label={isDraftSidebarCollapsed ? expandDraftSidebarLabel : collapseDraftSidebarLabel}
        >
          {isDraftSidebarCollapsed ? <Sidebar size={14} /> : <PanelLeftClose size={14} />}
        </button>
      )}
      <div className="aad-editor-title-metrics flex min-w-0 shrink items-center gap-2">
        {onWorkspaceModeToggle && (
          <button
            type="button"
            className="aad-workspace-mode-switch is-source"
            onClick={onWorkspaceModeToggle}
            title={workspaceModeSwitchLabel}
            aria-label={workspaceModeSwitchLabel}
          >
            <span className="aad-workspace-mode-segment is-active" aria-hidden="true">
              <Code2 size={14} />
            </span>
            <span className="aad-workspace-mode-segment" aria-hidden="true">
              <FileCheck size={14} />
            </span>
          </button>
        )}
        <h2 className="aad-toolbar-title shrink-0">{t.title}</h2>
        <TextMetricsInline
          compactCharacters={compactCharacters}
          compactTokens={compactTokens}
          metricsLabel={metricsLabel}
          charactersLabel={t.charactersShort}
          tokensLabel={t.tokens}
        />
      </div>
      <EditorDiagnosticConsole
        diagnostics={diagnostics}
        fixes={fixes}
        isOpen={isDiagnosticModeOpen}
        onToggle={onToggleDiagnosticMode}
        t={t}
      />
    </div>
    <EditorActionButtons
      value={value}
      copied={copied}
      onClear={onClear}
      onCopy={onCopy}
      onDownload={onDownload}
      t={t}
    />
  </div>
);
