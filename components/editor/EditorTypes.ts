import type React from 'react';
import type { TextSearchState } from '@morndraft/features-personal';
import type { EditorTranslations } from '../../i18n';
import type { DeliveryAccessState } from '../preview/deliveryAccess';
import type { ArtifactAppliedFix, ArtifactDiagnostic, ArtifactFix, ArtifactFixReview } from './diagnosticTypes';

export type EditorLineFocusRequest = {
  line: number;
  requestId: number;
  highlight?: boolean;
  // Absolute source offsets. Used when final can identify the exact source
  // field range, such as MornDraft flat edit paths.
  selectionRange?: { start: number; end: number };
  // Restricts selected-text matching to a known source block, such as an HTML
  // code fence, so repeated text outside the block cannot steal focus.
  selectionScopeLineRange?: { startLine: number; endLine: number };
  // Text selected in final (or diagnostic source), used to locate the exact
  // characters in source instead of just the block line.
  selectionText?: string;
  // 0-based occurrence index to disambiguate repeated selectionText in source.
  selectionOccurrenceIndex?: number;
};

export interface EditorProps {
  value: string;
  brandSlot?: React.ReactNode;
  onChange: (value: string) => void;
  onUserEdit?: (value: string) => void;
  onImportComplete?: (info: { content: string; suggestedTitle?: string }) => void | Promise<void>;
  deliveryAccess?: DeliveryAccessState;
  enabledCapabilities?: readonly string[];
  diagnostics?: readonly ArtifactDiagnostic[]; fixes?: readonly ArtifactFix[];
  pendingFixReview?: ArtifactFixReview | null; lastAppliedFix?: ArtifactAppliedFix | null;
  fixApplyVersion?: number;
  lineFocusRequest?: EditorLineFocusRequest | null;
  loadingNotice?: string | null;
  searchState?: TextSearchState | null;
  isDiagnosticModeOpen?: boolean;
  onDiagnosticModeOpenChange?: (isOpen: boolean) => void;
  isDraftSidebarCollapsed?: boolean;
  isAuthenticated?: boolean;
  onRequireSignIn?: () => void;
  onToggleDraftSidebar?: () => void;
  collapseDraftSidebarLabel?: string;
  expandDraftSidebarLabel?: string;
  showBackToTop?: boolean;
  onWorkspaceModeToggle?: () => void;
  workspaceModeSwitchLabel?: string;
  onSourceCursorLineChange?: (line: number) => void;
  onRequestPreviewLineFocus?: (line: number) => void;
  onBeginFixReview?: (fixId: string | 'all') => void;
  onConfirmFixReview?: () => void; onCancelFixReview?: () => void; onUndoLastFix?: () => void;
  locale?: 'zh' | 'en';
  t: EditorTranslations;
  placeholder?: string;
  upgradeNotice?: { tone?: 'success' | 'error'; text: string } | null;
}
