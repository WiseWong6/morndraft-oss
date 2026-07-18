import type {
  PreviewFormatToolbarControls,
  PreviewMarkdownBlockFormat,
  PreviewMarkdownTextFormat,
} from './PreviewFormatToolbarTypes';
import type { PreviewFinalCursorSourceLineMeta } from './ArtifactPreviewTypes';
import type { PreviewMarkdownPatchMeta, PreviewSourcePatchEcho } from './previewMarkdownPatchMeta';
import type { SourceLineMap } from './sourcePosition';
import type { DeliveryNotice } from './deliveryAccess';
import type { DeliveryRequestContext } from './deliveryActionTypes';
import type { ArtifactDiagnostic } from './MarkdownCodeBlockRenderer';
import type { PublicAiSourceKind } from '@morndraft/features-personal/ai';

export type {
  PreviewMarkdownBlockFormat,
  PreviewMarkdownTextFormat,
} from './PreviewFormatToolbarTypes';

export type PreviewMarkdownLexicalFormatSnapshot = {
  activeTextFormats: Record<PreviewMarkdownTextFormat, boolean>;
  blockFormat: PreviewMarkdownBlockFormat;
  canApplyBlockFormat: boolean;
  canFormat: boolean;
  islandId: string;
  selectedColor: string;
  selectedFontFamily: string;
  selectedFontSize: string;
  selectedLetterSpacing: string;
  selectedLineHeight: string;
};

export type PreviewMarkdownLexicalFormatController = {
  applyBlockFormat: (format: PreviewMarkdownBlockFormat) => void;
  applyStyle: (style: {
    color?: string;
    fontFamily?: string;
    fontSize?: string;
    letterSpacing?: string;
    lineHeight?: string;
  }) => void;
  toggleFormat: (format: PreviewMarkdownTextFormat) => void;
};

export type PreviewAiSelectionRect = {
  height: number;
  left: number;
  top: number;
  width: number;
};

export type PreviewAiSelectionContentKind = 'image' | 'table' | 'text';
export type PreviewAiSelectionScope = 'partial' | 'whole';

export type PreviewAiSelectionImageContext = {
  alt?: string;
  markdown?: string;
  title?: string;
  url: string;
};

export type PreviewAiSelectionSourcePositionRange = {
  endColumn: number;
  endLine: number;
  startColumn: number;
  startLine: number;
};

export type PreviewAiSelectionPatchTargetKind = 'artifact-source';

export type PreviewAiSelectionCandidatePatchTarget = {
  kind?: PreviewAiSelectionPatchTargetKind;
  selectedText: string;
  sourceRange: PreviewAiSelectionSourcePositionRange;
};

export type PreviewAiSelectionCandidate = {
  capturedAt: number;
  contentKind?: PreviewAiSelectionContentKind;
  image?: PreviewAiSelectionImageContext;
  islandId: string;
  patchTarget?: PreviewAiSelectionCandidatePatchTarget;
  patchable?: boolean;
  repairDiagnostic?: ArtifactDiagnostic;
  rect: PreviewAiSelectionRect;
  selectionRects?: PreviewAiSelectionRect[];
  selectionScope?: PreviewAiSelectionScope;
  selectionOccurrenceIndex?: number;
  selectedText: string;
  sourceLine: number;
  sourceLineRange?: {
    endLine: number;
    startLine: number;
  };
  /** Authoritative source coordinates, independent from patch eligibility. */
  sourceRange?: PreviewAiSelectionSourcePositionRange;
};

export type PreviewAiSelectionRange = {
  end: number;
  endLine: number;
  start: number;
  startLine: number;
};

export type PreviewAiSelectionPatchTarget = {
  kind?: PreviewAiSelectionPatchTargetKind;
  selectedText: string;
  sourceRange: PreviewAiSelectionRange;
};

export type PreviewAiSelection = {
  capturedAt: number;
  contentKind?: PreviewAiSelectionContentKind;
  contextLineRange?: {
    endLine: number;
    startLine: number;
  };
  contextRange?: PreviewAiSelectionRange;
  image?: PreviewAiSelectionImageContext;
  islandId: string;
  patchTarget?: PreviewAiSelectionPatchTarget;
  repairDiagnostic?: ArtifactDiagnostic;
  rect: PreviewAiSelectionRect;
  selectionRects?: PreviewAiSelectionRect[];
  selectionScope?: PreviewAiSelectionScope;
  selectedText: string;
  /** Immutable full source used to build and validate this AI request. */
  sourceSnapshot: string;
  sourceKind: PublicAiSourceKind;
  sourceRange?: PreviewAiSelectionRange;
  /** Short debug fingerprint only; never use as a stale/security guard. */
  sourceVersion: string;
  visibleText: string;
};

export type PreviewAiReplacementResult =
  | { ok: true; nextSource: string }
  | { ok: false; reason: 'selection-stale' | 'selection-mismatch' | 'empty-replacement' | 'no-change' };

export type PreviewAiReplacementApplier = (input: {
  replacement: string;
  selectedText: string;
  sourceRange?: PreviewAiSelectionRange;
}) => boolean;

export type PreviewAiFocusRestorer = () => void;

export type PreviewAiAppliedReplacement = {
  afterSource: string;
  appliedAt: number;
  beforeSource: string;
  replacement: string;
  selection: PreviewAiSelection;
};

export type PreviewMarkdownEditState = {
  activeIslandId: string | null;
  deliveryRequestContext?: DeliveryRequestContext;
  enabled: boolean;
  lineMap?: SourceLineMap;
  onActiveIslandChange: (islandId: string | null) => void;
  onCommitIslandEdit: (islandId: string) => void;
  onInsertImageFile?: (file: File) => Promise<string | null>;
  onLexicalFormatChange: (
    snapshot: PreviewMarkdownLexicalFormatSnapshot | null,
    controller?: PreviewMarkdownLexicalFormatController,
  ) => void;
  onFinalCursorSourceLineChange?: (
    line: number,
    selectedText?: string | null,
    meta?: PreviewFinalCursorSourceLineMeta,
  ) => void;
  onAiInstructionNotice?: (notice: DeliveryNotice | null) => void;
  onLexicalAiSelectionChange: (selection: PreviewAiSelectionCandidate | null) => void;
  onBeforePatch?: () => void;
  onPatch: (nextSource: string, meta?: PreviewMarkdownPatchMeta) => void;
  registerAiReplacementApplier: (
    islandId: string,
    applier: PreviewAiReplacementApplier,
  ) => () => void;
  registerAiFocusRestorer: (
    islandId: string,
    restorer: PreviewAiFocusRestorer,
  ) => () => void;
  onRequestEditorLineFocus?: (line: number) => void;
  source: string;
  sourcePatchEcho?: PreviewSourcePatchEcho;
  stateResetKey?: string;
};

export type PreviewMarkdownEditingController = {
  appliedAiReplacement: PreviewAiAppliedReplacement | null;
  aiSelection: PreviewAiSelection | null;
  applyAiReplacement: (selection: PreviewAiSelection, replacement: string) => PreviewAiReplacementResult;
  canEdit: boolean;
  clearAiSelection: () => void;
  editState?: PreviewMarkdownEditState;
  enabled: boolean;
  restoreAiReplacement: (
    selection: PreviewAiSelection,
    previousSource: string,
    expectedSource: string,
    replacement: string,
  ) => PreviewAiReplacementResult;
  restoreAiSelectionFocus: (selection: PreviewAiSelection | null | undefined) => void;
  styleSignature: string;
  toolbar: PreviewFormatToolbarControls;
};
