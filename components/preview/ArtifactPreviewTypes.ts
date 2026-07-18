import type React from 'react';
import type {
  ArtifactMapShellProps,
  TextSearchControlProps,
  TextSearchState,
} from '@morndraft/features-personal';
import type { ArtifactPreviewTranslations } from '../../i18n';
import type { ArtifactDiagnostic } from './MarkdownCodeBlockRenderer';
import type { ArtifactAppliedFix, ArtifactFix, ArtifactFixReview } from '../editor/diagnosticTypes';
import type { DeliveryAccessState } from './deliveryAccess';
import type { PreviewMarkdownPatchMeta, PreviewSourcePatchEcho } from './previewMarkdownPatchMeta';
import type { PreviewStandaloneHtmlTextMetrics } from './previewTextMetricTypes';
import type { SourcePositionRange } from './sourcePosition';
import type { MornDraftComponentScope } from '../../utils/releaseConfigTypes';
import type { FinalSyntaxAiRepairRequestHandler } from './finalSyntaxAiRepairTypes';

export type ContentType = 'markdown' | 'json' | 'html' | 'mermaid' | 'mixed';

export type PreviewMarkdownAutoFocusTarget = 'rootEnd' | 'topEditable';
export type PreviewNavigationScrollBehavior = 'smooth' | 'instant';
export type PreviewSourceSelectionRange = { start: number; end: number };
export type PreviewSelectionScopeLineRange = { startLine: number; endLine: number };
export type PreviewFinalCursorSourceLineMeta = {
  selectionOccurrenceIndex?: number;
  selectionScopeLineRange?: PreviewSelectionScopeLineRange | null;
  sourceRange?: SourcePositionRange | null;
  sourceSelectionRange?: PreviewSourceSelectionRange | null;
};

export type PreviewPersistentDisplayOptions = {
  includeA4Pagination: boolean;
};

export type PreviewIcpFiling = {
  number: string;
  url: string;
  publicSecurity?: {
    number: string;
    iconSrc: string;
  };
  isMuted?: boolean;
};

export interface ArtifactPreviewProps {
  code: string;
  brandSlot?: React.ReactNode;
  moreMenu?: React.ReactNode;
  syntaxMenu?: React.ReactNode;
  latestSource?: string;
  activeDraftId?: string | null;
  onEnsureShareDraft?: (
    content: string,
    suggestedTitle?: string,
  ) => Promise<{ ok: true; draftId: string } | { ok: false; reason?: string }>;
  onSaveShareDraft?: (content: string) => Promise<{ ok: true; draftId: string } | { ok: false; reason?: string }>;
  sourcePatchEcho?: PreviewSourcePatchEcho;
  stateResetKey?: string;
  previewDisplayOptions?: PreviewPersistentDisplayOptions;
  previewDisplayStateKey?: string;
  standaloneHtmlTextMetricsFallback?: PreviewStandaloneHtmlTextMetrics | null;
  onStandaloneHtmlTextMetricsReady?: (metrics: PreviewStandaloneHtmlTextMetrics) => void;
  previewScrollResetKey?: string;
  previewMarkdownAutoFocusKey?: number;
  previewMarkdownAutoFocusTarget?: PreviewMarkdownAutoFocusTarget;
  previewDiagnosticsSourceKey?: string;
  onPreviewDisplayOptionsChange?: (options: PreviewPersistentDisplayOptions) => void;
  onError: (error: string | null) => void;
  onPreviewSourcePatch?: (nextSource: string, meta?: PreviewMarkdownPatchMeta) => void;
  onBeginFixReview?: (fixId: string) => void;
  onRequestAiFix?: FinalSyntaxAiRepairRequestHandler;
  isFinalAiFixBusy?: boolean;
  finalAiFixError?: string | null;
  pendingFixReview?: ArtifactFixReview | null;
  lastAppliedFix?: ArtifactAppliedFix | null;
  onConfirmFixReview?: () => void;
  onCancelFixReview?: () => void;
  onUndoLastFix?: () => void;
  enabledCapabilities?: readonly string[];
  previewNavigationRequest?: {
    artifactId?: string;
    sourceLine?: number;
    sourceLineText?: string;
    // Text the user actually selected in source (preferred over sourceLineText
    // for matching the corresponding visible text in final). Falls back to the
    // whole source line when there is no active selection.
    selectionText?: string;
    // 0-based occurrence index to disambiguate repeated text in final.
    selectionOccurrenceIndex?: number;
    // True when the source line sits inside a rendered block (mermaid / html /
    // morndraftFlat / documentSpec) whose output is non-textual.
    isRenderedBlock?: boolean;
    scrollBehavior?: PreviewNavigationScrollBehavior;
    requestId: number;
  } | null;
  onPreviewNavigationConsumed?: (requestId: number) => void;
  onRequestEditorLineFocus?: (line: number) => void;
  // Reports the source line the user is focused on in final. When the user has
  // an active text selection in final, `selectedText` carries that text so the
  // source side can locate the exact characters rather than just the block line.
  onFinalCursorSourceLineChange?: (
    line: number,
    selectedText?: string | null,
    meta?: PreviewFinalCursorSourceLineMeta,
  ) => void;
  textSearchNavigationTarget?: 'source' | 'preview';
  onPreviewNavigateToArtifact?: (artifactId: string) => void;
  onTextSearchStateChange?: (state: TextSearchState) => void;
  ArtifactMapShellComponent?: React.ComponentType<ArtifactMapShellProps>;
  TextSearchComponent?: React.ComponentType<TextSearchControlProps>;
  isCollapsed?: boolean;
  isMobile?: boolean;
  htmlPreviewDeliveryWidth?: number;
  mobileModeSwitchLabel?: string;
  mornDraftComponentScope?: MornDraftComponentScope;
  onMobileModeSwitch?: () => void;
  isAuthenticated?: boolean;
  onRequireSignIn?: () => void;
  onToggleSidebar?: () => void;
  collapseSidebarLabel?: string;
  expandSidebarLabel?: string;
  onWorkspaceModeToggle?: () => void;
  workspaceModeSwitchLabel?: string;
  showBackToTop?: boolean;
  showHostedLinkAction?: boolean;
  showPreviewDeliveryActions?: boolean;
  showPreviewFormatToolbar?: boolean;
  reserveArtifactMapRailSlot?: boolean;
  showUpgradePrompts?: boolean;
  disableAiAssistUi?: boolean;
  enableOssAiProvider?: boolean;
  icpFiling?: PreviewIcpFiling | null;
  deliveryAccess?: DeliveryAccessState;
  diagnostics?: readonly ArtifactDiagnostic[];
  fixes?: readonly ArtifactFix[];
  isDiagnosticModeOpen?: boolean;
  onCloseDiagnosticMode?: () => void;
  onToggleDiagnosticMode?: () => void;
  onPreviewDiagnosticsChange?: (diagnostics: ArtifactDiagnostic[], sourceKey: string) => void;
  t: ArtifactPreviewTranslations;
}
