import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { TablePlugin } from '@lexical/react/LexicalTablePlugin';
import {
  BOLD_ITALIC_STAR,
  BOLD_STAR,
  HEADING,
  ITALIC_STAR,
  ORDERED_LIST,
  QUOTE,
  STRIKETHROUGH,
  UNORDERED_LIST,
  type Transformer,
} from '@lexical/markdown';
import { Check, ChevronDown, ChevronRight, Loader2, MessageCirclePlus, Send, Sparkles, X } from 'lucide-react';
import {
  DecoratorNode,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type ParagraphNode,
  type SerializedLexicalNode,
  type Spread,
} from 'lexical';
import {
  $addUpdateTag,
  $applyNodeReplacement,
  $createLineBreakNode,
  $createParagraphNode,
  $createTextNode,
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $insertNodes,
  $isElementNode,
  $isLineBreakNode,
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_LOW,
  COPY_COMMAND,
  CUT_COMMAND,
  HISTORY_PUSH_TAG,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  KEY_SPACE_COMMAND,
  KEY_TAB_COMMAND,
  PASTE_COMMAND,
  REDO_COMMAND,
  SELECTION_CHANGE_COMMAND,
  SELECT_ALL_COMMAND,
  SKIP_DOM_SELECTION_TAG,
  SKIP_SCROLL_INTO_VIEW_TAG,
  UNDO_COMMAND,
  type TextFormatType,
} from 'lexical';
import { $getSelectionStyleValueForProperty, $patchStyleText, $setBlocksType } from '@lexical/selection';
import {
  $createListItemNode,
  $createListNode,
  $isListItemNode,
  $isListNode,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  ListItemNode,
  ListNode,
  REMOVE_LIST_COMMAND,
} from '@lexical/list';
import {
  $createHeadingNode,
  $createQuoteNode,
  $isHeadingNode,
  $isQuoteNode,
  HeadingNode,
  QuoteNode,
} from '@lexical/rich-text';
import {
  $createTableCellNode,
  $createTableNode,
  $createTableRowNode,
  $deleteTableColumnAtSelection,
  $insertTableColumnAtSelection,
  $isTableSelection,
  $isTableCellNode,
  $isTableNode,
  $isTableRowNode,
  TableCellHeaderStates,
  TableCellNode,
  TableNode,
  TableRowNode,
} from '@lexical/table';
import {
  AI_ARTIFACT_INSTRUCTION_MAX_TEXT,
  CODE_FENCE_LANGUAGE_KINDS,
  AI_INSTRUCTION_MIN_TEXT,
  classifyJsonFenceContent,
  getCodeFenceLanguageKind,
  isMornDraftHtmlSource,
  normalizeCodeFenceLanguage,
  patchSourceRange,
  parseMarkdownRichInline,
  parseMarkdownRichPipeTable,
  parsePreviewMarkdownDocument,
  sanitizeMarkdownInlineStyle,
  serializeMarkdownRichInline,
  serializeMarkdownInlineStyle,
  serializeMarkdownIsland,
} from '@morndraft/core';
import type { ArtifactPreviewTranslations } from '../../i18n';
import { requestOssAiText } from '../../utils/ossAiConfig';
import { getPublicAiSourceKindForContentType } from '../public-workspace/publicAiContext';
import { AiImeSafeTextArea } from './AiImeSafeTextArea';
import {
  isHtmlPreviewInteractionTarget,
  isMornDraftPreviewCommandTarget,
} from './htmlPreviewInteractionTarget';
import { useLatestCallback } from './useLatestCallback';
import {
  CollapsibleArtifactBlock,
  PreviewArtifactTargetProvider,
} from './CollapsibleArtifactBlock';
import { BlockHeaderCopyAction, type BlockCopyContentKind } from './BlockHeaderCopyAction';
import {
  getMornDraftFlatLayoutDecision,
  type PreviewRenderDeliveryAccess,
} from './deliveryAccess';
import type { HtmlPreviewRenderMode } from './HtmlPreviewFrame';
import type { HtmlPreviewSelectionChange } from '../../utils/htmlPreviewBridge';
import type { ArtifactDiagnostic, ContentType } from './MarkdownCodeBlockRenderer';
import {
  createSegmentLineMap,
  MarkdownReadonlyRenderer,
} from './MarkdownReadonlyRenderer';
import { JsonPreviewBlock, renderJsonLine } from './JsonPreviewBlock';
import { JsonTreeView } from './JsonTreeView';
import {
  FINAL_INSERT_MENU_CHILD_ICON,
  getFinalInsertCommandCategories,
  getFinalInsertCommands,
  type FinalInsertCommand,
  type FinalInsertTableGrid,
} from './finalInsertMenuRegistry';
import {
  filterFinalInsertCommands,
  getAccessAwareFinalInsertCommands,
  getFirstActionableFinalInsertEntryIndex,
  hasFinalInsertSubmenu,
  hasFinalInsertTableGrid,
  isFinalInsertActionable,
  isFinalInsertExecutable,
  normalizeFinalInsertQuery,
} from './lexical/finalInsertMenuState';
import {
  resolveFinalLineClickInsertionTarget,
  shouldHandleFinalLineClickPointer,
  type FinalLineClickInsertionTarget,
} from './lexical/finalLineClickInsertion';
import { FinalLogicalLineSelectionPlugin } from './lexical/FinalLogicalLineSelectionPlugin';
import type { MornDraftComponentScope } from '../../utils/releaseConfigTypes';
import {
  canPreviewFinalInsertMornDraftCommand,
  FinalInsertMornDraftPreview,
} from './FinalInsertMornDraftPreview';
import type {
  PreviewAiFocusRestorer,
  PreviewAiReplacementApplier,
  PreviewAiSelectionCandidatePatchTarget,
  PreviewAiSelectionCandidate,
  PreviewAiSelectionContentKind,
  PreviewAiSelectionImageContext,
  PreviewAiSelectionRect,
  PreviewAiSelectionScope,
  PreviewMarkdownBlockFormat,
  PreviewMarkdownEditState,
  PreviewMarkdownLexicalFormatSnapshot,
  PreviewMarkdownTextFormat,
} from './previewMarkdownEditingTypes';
import type { PreviewFinalCursorSourceLineMeta, PreviewMarkdownAutoFocusTarget } from './ArtifactPreviewTypes';
import type { HtmlPreviewEditCommitMeta } from './useHtmlPreviewEditMode';
import {
  isActiveBlockPreviewMarkdownPatchEcho,
  isSkippableLocalPreviewPatchEcho,
  type PreviewMarkdownPatchMeta,
} from './previewMarkdownPatchMeta';
import {
  replaceArtifactSourceOverrides,
  resolveArtifactSourceOverride,
  writeArtifactSourceOverride,
  type ArtifactSourceOverrideMap, type ArtifactSourceOverridePatch,
} from './previewArtifactSourceOverrides';
import {
  mapSourcePositionRange,
  sourcePositionAttributes,
  type SourceLineMap,
  type SourcePositionRange,
} from './sourcePosition';
import { isPreviewProgrammaticTextSelectionActive } from './previewDiagnosticLineNavigation';
import { PREVIEW_CODE_FONT_SIZE, PREVIEW_CODE_LINE_HEIGHT } from './syntaxHighlighting';
import {
  copyPreviewImageReference,
  parsePreviewMarkdownImageReference,
  resolvePreviewImageClipboardReference,
  type PreviewImageReference,
} from './previewImageClipboard';
import {
  readPreviewAiSelectionStream,
  type PreviewAiClarificationQuestion,
  type PreviewAiInstructionSessionSnapshot,
} from './PreviewAiSelectionToolbar';
import { PreviewAiMarkdownResult } from './PreviewAiMarkdownResult';
import {
  useMarkdownLexicalPatchQueue,
  type MarkdownLexicalPatchKind,
} from './useMarkdownLexicalPatchQueue';
import { useStreamingAutoScroll } from './useStreamingAutoScroll';
import {
  ISLAND_AI_INSERT_UPDATE_TAG,
  ISLAND_CODE_BLOCK_STRUCTURE_UPDATE_TAG,
  ISLAND_CODE_BLOCK_UPDATE_TAG,
  ISLAND_CODE_FENCE_SHORTCUT_UPDATE_TAG,
  ISLAND_FORMAT_UPDATE_TAG,
  ISLAND_IMAGE_INSERT_UPDATE_TAG,
  ISLAND_MARKDOWN_SOURCE_PASTE_UPDATE_TAG,
  ISLAND_SLASH_AI_DRAFT_UPDATE_TAG,
  ISLAND_TABLE_SHORTCUT_UPDATE_TAG,
  PREVIEW_MARKDOWN_DOCUMENT_ID,
  PREVIEW_RESET_UPDATE_TAG,
  debugPreviewLexical,
} from './lexical/islandUpdateTags';
import {
  PREVIEW_INTERACTIVE_ELEMENT_SELECTOR,
  isPlainFenceConfirmSpaceEvent,
  isPlainPreviewDeleteKeyEvent,
  isPreviewBlankDocumentPointerTarget,
  isPreviewFinalDeleteKeyboardTarget,
  isPreviewInteractiveKeyboardTarget,
  isPreviewRedoShortcut,
  isPreviewSelectAllShortcut,
  isPreviewUndoShortcut,
} from './lexical/keyboardPredicates';
import {
  AI_INSTRUCTION_SESSION_RUNNING_STATUSES,
  FINAL_SLASH_AI_COMMAND_MAX_LENGTH,
  FINAL_SLASH_AI_COMMAND_TEXT,
  FINAL_SLASH_COMMAND_MAX_LENGTH,
  buildOssAiInstruction,
  createFinalSlashAiDraftId,
  createPreviewAiInstructionSourceVersion,
  getAiInstructionApiErrorMessage,
  getAiInstructionRuntimeErrorMessage,
  getSourceLineForOffset,
  readFinalSlashAiInstruction,
  resolveSlashInstructionSourceRange,
  splitAiInstructionDisplayChunk,
  type AiInstructionApiResponse,
  type AiInstructionDisplayChannel,
  type FinalSlashAiFollowUpPayload,
} from './lexical/aiInstructionProtocol';
import { getPrivateRuntimeGateway } from '../../utils/privateRuntimeGateways';
const loadPrivateAiInstructionGateway = () => getPrivateRuntimeGateway('aiInstruction')?.();

type RichInlineSegment = {
  code?: boolean;
  highlight?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  strong?: boolean;
  subscript?: boolean;
  superscript?: boolean;
  underline?: boolean;
  style?: {
    color?: string;
    fontFamily?: string;
    fontSize?: string;
    letterSpacing?: string;
    lineHeight?: string;
  };
  text: string;
};
type MarkdownIslandBlock = Record<string, any>;
type PreviewMarkdownDocumentBlock =
  | {
      blocks: readonly MarkdownIslandBlock[];
      source: string;
      sourceRange: SourcePositionRange | null;
      type: 'markdown-island';
    }
  | {
      artifactId?: string;
      artifactKind: string;
      source: string;
      sourceRange: SourcePositionRange | null;
      type: 'artifact';
    }
  | {
      artifactId?: string;
      language: string;
      source: string;
      sourceFormat?: 'fenced' | 'raw';
      sourceRange: SourcePositionRange | null;
      type: 'code-block';
    };

type PreviewArtifactPayload = {
  artifactId?: string;
  artifactKind: string;
  source: string;
  sourceRange: SourcePositionRange | null;
};

type TableAlignmentRegistry = Map<string, string[]>;

type PreviewSourceAnchorPayload = {
  artifactId?: string;
  sourceRange: SourcePositionRange | null;
};

type SerializedPreviewArtifactNode = Spread<
  PreviewArtifactPayload & {
    type: 'preview-artifact';
    version: 1;
  },
  SerializedLexicalNode
>;

type SerializedPreviewSourceAnchorNode = Spread<
  PreviewSourceAnchorPayload & {
    type: 'preview-source-anchor';
    version: 1;
  },
  SerializedLexicalNode
>;

type SerializedFinalSlashAiInlineDraftNode = Spread<
  {
    type: 'final-slash-ai-inline-draft';
    version: 1;
  },
  SerializedLexicalNode
>;

type PreviewArtifactRenderContextValue = {
  aiCandidateRenderDeliveryAccess?: PreviewRenderDeliveryAccess;
  contentType: ContentType;
  diagnostics: readonly ArtifactDiagnostic[];
  getArtifactIdForNode: (node: any) => string;
  getArtifactIdForSourceLine: (line: number) => string;
  HtmlPreviewComponent: React.ComponentType<{
    code: string;
    copyContentKind?: BlockCopyContentKind;
    copySource?: string;
    deliveryWidth?: number;
    frameKey?: string;
    label?: string;
    meta?: string;
    hideDefaultMeta?: boolean;
    initialHeight?: number;
    lockInitialHeight?: boolean;
    deferMountUntilVisible?: boolean;
    onPreviewReady?: () => void;
    renderMode?: HtmlPreviewRenderMode;
    canEdit?: boolean;
    isEditing?: boolean;
    onEditStart?: () => void;
    onEditCommit?: (newCode: string, meta?: HtmlPreviewEditCommitMeta) => void;
    onEditCancel?: () => void;
    onEditDraft?: (newCode: string) => void;
    editCommitStrategy?: 'cached-first' | 'iframe-snapshot-first';
    onBlockActivate?: () => void;
    onSelectionChange?: (selection: HtmlPreviewSelectionChange) => void;
  }>;
  isSourceLineHidden?: (line: number) => boolean;
  MermaidPreviewComponent: React.ComponentType<{
    blockId?: string;
    code: string;
    coreDiagnostic?: ArtifactDiagnostic | null;
    lineOffset?: number;
    onRenderDiagnosticChange?: (
      diagnostic: { line: number | null; messageZh: string; messageEn?: string } | null,
    ) => void;
    onSvgReady?: (svg: string) => void;
    canEdit?: boolean;
    onCodeChange?: (newCode: string) => void;
    isAiFixBusy?: boolean;
    onBeginFixReview?: (fixId: string) => void;
    onRequestAiFix?: (diagnostic: ArtifactDiagnostic) => void;
    repairMode?: 'ai' | 'deterministic';
  }>;
  fullSource?: string;
  fullSourceRef?: React.RefObject<string | undefined>;
  onJsonFormatted: (formatted: string) => void;
  isAiFixBusy?: boolean;
  onBeginFixReview?: (fixId: string) => void;
  onRequestAiFix?: (diagnostic: ArtifactDiagnostic) => void;
  repairMode?: 'ai' | 'deterministic';
  onMermaidDiagnosticChange?: (
    id: string,
    diagnostic: {
      code: string;
      line?: number | null;
      messageZh: string;
      messageEn?: string;
    } | null,
  ) => void;
  onMermaidSvgReady: (svg: string) => void;
  onBeforePatch?: () => void;
  onLocalArtifactSourcePatch?: (
    nextSource: string,
    artifact: ArtifactSourceOverridePatch,
  ) => void;
  onSourcePatch?: (nextSource: string, meta?: PreviewMarkdownPatchMeta) => void;
  onRequestEditorLineFocus?: (line: number) => void;
  onFinalCursorSourceLineChange?: (
    line: number,
    selectedText?: string | null,
    meta?: PreviewFinalCursorSourceLineMeta,
  ) => void;
  onLexicalAiSelectionChange?: (selection: PreviewAiSelectionCandidate | null) => void;
  onSelectCodeBlock: (nodeKey: string | null) => void;
  onSelectCodeLikeArtifact: (nodeKey: string | null) => void;
  onSelectImageArtifact: (nodeKey: string | null) => void;
  mornDraftComponentScope?: MornDraftComponentScope;
  previewSourcePatchEnabled?: boolean;
  selectedCodeBlockNodeKey: string | null;
  selectedCodeLikeArtifactNodeKey: string | null;
  renderDeliveryAccess?: PreviewRenderDeliveryAccess;
  selectedImageNodeKey: string | null;
  sourceLineMap?: SourceLineMap;
  t: ArtifactPreviewTranslations;
  withArtifactTarget: (node: any, element: React.ReactElement) => React.ReactElement;
};

const FINAL_INSERT_AI_ACTIVE_INDEX = -1;
const FINAL_SLASH_AI_ENABLED = true;

type FinalSlashCommandCandidate = {
  blockKey: string;
  instruction: string;
  isAiCommand: boolean;
  query: string;
  slashText: string;
};

type FinalSlashAiComposerDraft = {
  blockKey: string;
  draftId: string;
  inlineNodeKey: string;
  insertRange: {
    end: number;
    start: number;
  };
  instruction: string;
  replaceRange: {
    end: number;
    start: number;
  };
  sessionId?: string;
  source: string;
  sourceLineRange: {
    endLine: number;
    startLine: number;
  };
  sourceVersion: string;
  slashText: string;
};

type FinalSlashAiInstructionResult = {
  instruction: string;
  markdown: string;
};

type FinalSlashAiClarificationState = {
  answer: string;
  error: string | null;
  questions: PreviewAiClarificationQuestion[];
  streamingText?: string;
};

type FinalSlashAiInlineDraftPayload = {
  busy: boolean;
  clarification: FinalSlashAiClarificationState | null;
  displayMarkdown: string;
  error: string | null;
  followUpError: string | null;
  followUpInstruction: string;
  followUpOpen: boolean;
  id: string;
  instructionInput: string;
  instructionInputOpen: boolean;
  onApply: () => void;
  onCancel: () => void;
  onClarificationAnswerChange: (value: string) => void;
  onFollowUpInstructionChange: (value: string) => void;
  onInstructionInputChange: (value: string) => void;
  onSubmitClarification: (answer: string) => void;
  onSubmitFollowUp: (instruction: string) => void;
  onSubmitInstruction: (instruction: string) => void;
  onToggleFollowUp: () => void;
  onToggleThinking: () => void;
  ready: boolean;
  renderArtifactsReady: boolean;
  renderDeliveryAccess?: PreviewRenderDeliveryAccess;
  streaming: boolean;
  streamDisplayPhase: AiStreamDisplayPhase;
  t: ArtifactPreviewTranslations;
  progress: string;
  thoughtSummary: string;
  thinking: string;
  thinkingOpen: boolean;
};

type AiStreamDisplayPhase = 'thinking' | 'generating' | 'complete';

type AiInstructionDisplayQueueItem = {
  channel: AiInstructionDisplayChannel;
  requestId: number;
  text: string;
};

type AiInstructionDisplayQueueWaiter = {
  channels: Set<AiInstructionDisplayChannel> | null;
  requestId: number;
  resolve: () => void;
};

const TOOLBAR_FONT_FAMILY_SANS =
  '"MornDraft Sans SC", "Noto Sans SC", "Source Han Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';
const TOOLBAR_FONT_FAMILY_SERIF =
  '"MornDraft Serif SC", "Noto Serif SC", "Source Han Serif SC", "Songti SC", "SimSun", serif';
const PREVIEW_MARKDOWN_SHORTCUT_TRANSFORMERS: Transformer[] = [
  HEADING,
  QUOTE,
  UNORDERED_LIST,
  ORDERED_LIST,
  BOLD_ITALIC_STAR,
  BOLD_STAR,
  ITALIC_STAR,
  STRIKETHROUGH,
];
const PREVIEW_MARKDOWN_CODE_FENCE_HEADER_PATTERN = /^ {0,3}```([A-Za-z0-9_-]+)?$/;
const PREVIEW_MARKDOWN_CODE_FENCE_OPEN_PATTERN = /^ {0,3}```[ \t]*([A-Za-z0-9_-]+)?[ \t]*$/;
const PREVIEW_MARKDOWN_CODE_FENCE_CLOSE_PATTERN = /^ {0,3}```[ \t]*$/;
const PREVIEW_MARKDOWN_EDITABLE_CODE_FENCE_KINDS = new Set<string>([
  CODE_FENCE_LANGUAGE_KINDS.CODE,
  CODE_FENCE_LANGUAGE_KINDS.JSON,
  CODE_FENCE_LANGUAGE_KINDS.MARKDOWN,
]);

const PreviewArtifactRenderContext = React.createContext<PreviewArtifactRenderContextValue | null>(null);

const arePreviewSourceLineMapsEqual = (previous?: SourceLineMap, next?: SourceLineMap) => {
  if (previous === next) return true;
  if (!previous || !next || previous.length !== next.length) return false;
  for (let index = 0; index < previous.length; index += 1) {
    if (previous[index] !== next[index]) return false;
  }
  return true;
};

class PreviewSourceAnchorNode extends DecoratorNode<React.ReactNode> {
  __artifactId: string;
  __sourceRange: SourcePositionRange | null;

  static getType() {
    return 'preview-source-anchor';
  }

  static clone(node: PreviewSourceAnchorNode) {
    return new PreviewSourceAnchorNode({
      artifactId: node.__artifactId,
      sourceRange: node.__sourceRange,
    }, node.__key);
  }

  static importJSON(serializedNode: SerializedPreviewSourceAnchorNode) {
    return $createPreviewSourceAnchorNode({
      artifactId: serializedNode.artifactId,
      sourceRange: serializedNode.sourceRange,
    });
  }

  constructor(payload: PreviewSourceAnchorPayload, key?: NodeKey) {
    super(key);
    this.__artifactId = payload.artifactId ?? '';
    this.__sourceRange = payload.sourceRange;
  }

  createDOM() {
    const element = document.createElement('span');
    element.className = 'aad-preview-source-anchor';
    element.contentEditable = 'false';
    element.setAttribute('aria-hidden', 'true');
    if (this.__artifactId) {
      element.setAttribute('data-artifact-id', this.__artifactId);
    }
    const attributes = sourcePositionAttributes(this.__sourceRange);
    Object.entries(attributes).forEach(([key, value]) => {
      element.setAttribute(key, value);
    });
    return element;
  }

  updateDOM() {
    return false;
  }

  exportJSON(): SerializedPreviewSourceAnchorNode {
    return {
      artifactId: this.__artifactId,
      sourceRange: this.__sourceRange,
      type: 'preview-source-anchor',
      version: 1,
    };
  }

  isInline() {
    return false;
  }

  getSourceRange() {
    return this.__sourceRange;
  }

  decorate() {
    return null;
  }
}

const $createPreviewSourceAnchorNode = (payload: PreviewSourceAnchorPayload) =>
  $applyNodeReplacement(new PreviewSourceAnchorNode(payload));

const $isPreviewSourceAnchorNode = (node: unknown): node is PreviewSourceAnchorNode =>
  node instanceof PreviewSourceAnchorNode;

class PreviewArtifactNode extends DecoratorNode<React.ReactNode> {
  __artifactId: string;
  __artifactKind: string;
  __source: string;
  __sourceRange: SourcePositionRange | null;

  static getType() {
    return 'preview-artifact';
  }

  static clone(node: PreviewArtifactNode) {
    return new PreviewArtifactNode({
      artifactId: node.__artifactId,
      artifactKind: node.__artifactKind,
      source: node.__source,
      sourceRange: node.__sourceRange,
    }, node.__key);
  }

  static importJSON(serializedNode: SerializedPreviewArtifactNode) {
    return $createPreviewArtifactNode({
      artifactId: serializedNode.artifactId,
      artifactKind: serializedNode.artifactKind,
      source: serializedNode.source,
      sourceRange: serializedNode.sourceRange,
    });
  }

  constructor(payload: PreviewArtifactPayload, key?: NodeKey) {
    super(key);
    this.__artifactId = payload.artifactId ?? '';
    this.__artifactKind = payload.artifactKind;
    this.__source = payload.source;
    this.__sourceRange = payload.sourceRange;
  }

  createDOM() {
    const element = document.createElement('div');
    element.className = 'aad-preview-artifact-decorator';
    element.contentEditable = 'false';
    return element;
  }

  updateDOM() {
    return false;
  }

  exportJSON(): SerializedPreviewArtifactNode {
    return {
      artifactId: this.__artifactId,
      artifactKind: this.__artifactKind,
      source: this.__source,
      sourceRange: this.__sourceRange,
      type: 'preview-artifact',
      version: 1,
    };
  }

  isInline() {
    return false;
  }

  getSource() {
    return this.__source;
  }

  getArtifactKind() {
    return this.__artifactKind;
  }

  getArtifactId() {
    return this.__artifactId;
  }

  getSourceRange() {
    return this.__sourceRange;
  }

  setPayload(payload: PreviewArtifactPayload) {
    const self = this.getWritable();
    self.__artifactId = payload.artifactId ?? '';
    self.__artifactKind = payload.artifactKind;
    self.__source = payload.source;
    self.__sourceRange = payload.sourceRange;
  }

  decorate() {
    return (
      <PreviewArtifactDecorator
        artifactId={this.__artifactId}
        artifactKind={this.__artifactKind}
        nodeKey={this.__key}
        source={this.__source}
        sourceRange={this.__sourceRange}
      />
    );
  }
}

const $createPreviewArtifactNode = (payload: PreviewArtifactPayload) =>
  $applyNodeReplacement(new PreviewArtifactNode(payload));

const $isPreviewArtifactNode = (node: unknown): node is PreviewArtifactNode =>
  node instanceof PreviewArtifactNode;

const AI_INLINE_AUTO_SCROLL_BOTTOM_THRESHOLD_PX = 120;
const AI_INLINE_AUTO_SCROLL_MARGIN_PX = 16;
const AI_INLINE_DISPLAY_FLUSH_INTERVAL_MS = 24;
const AI_INLINE_RESULT_FLUSH_INTERVAL_MS = 80;
const getNearestScrollableAncestor = (element: HTMLElement | null) => {
  let current = element?.parentElement ?? null;
  while (current) {
    const style = window.getComputedStyle(current);
    const overflowY = style.overflowY;
    if (
      (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') &&
      current.scrollHeight > current.clientHeight + 1
    ) {
      return current;
    }
    current = current.parentElement;
  }
  return document.scrollingElement instanceof HTMLElement ? document.scrollingElement : null;
};

const isScrollableAncestorNearBottom = (element: HTMLElement | null) => {
  if (!element) return true;
  return element.scrollHeight - element.scrollTop - element.clientHeight <= AI_INLINE_AUTO_SCROLL_BOTTOM_THRESHOLD_PX;
};

const FinalSlashAiInlineDraftView: React.FC<{
  payload: FinalSlashAiInlineDraftPayload;
}> = ({ payload }) => {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const autoScrollToBottomRef = React.useRef(true);
  const isClarificationState = Boolean(payload.clarification);
  const showInstructionInput = payload.instructionInputOpen;
  const showProgressPanel = !isClarificationState && Boolean(payload.busy || payload.thoughtSummary || payload.thinking);
  const thinkingContentRef = useStreamingAutoScroll<HTMLDivElement>(
    payload.busy && payload.streamDisplayPhase === 'thinking' && payload.thinkingOpen && showProgressPanel,
  );
  const isThinkingPhase = payload.streamDisplayPhase === 'thinking';
  const progressTitle = payload.busy && isThinkingPhase
    ? payload.t.previewAiSlashThoughtLabel
    : payload.t.previewAiSlashThinkingReady;
  const thinkingContent = payload.thinking ||
    (payload.busy && isThinkingPhase ? payload.t.previewAiSlashThinkingWaiting : '');
  const clarificationStreamingText = payload.clarification?.streamingText?.trim() ?? '';
  React.useEffect(() => {
    const scrollContainer = getNearestScrollableAncestor(rootRef.current);
    if (!scrollContainer) return undefined;
    const handleScroll = () => {
      autoScrollToBottomRef.current = isScrollableAncestorNearBottom(scrollContainer);
    };
    handleScroll();
    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, []);
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root || !autoScrollToBottomRef.current) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const scrollContainer = getNearestScrollableAncestor(root);
      if (!scrollContainer || !autoScrollToBottomRef.current) return;
      const rootRect = root.getBoundingClientRect();
      const containerRect = scrollContainer.getBoundingClientRect();
      const targetScrollTop = scrollContainer.scrollTop + rootRect.bottom - containerRect.bottom + AI_INLINE_AUTO_SCROLL_MARGIN_PX;
      if (targetScrollTop > scrollContainer.scrollTop) {
        scrollContainer.scrollTop = Math.min(
          targetScrollTop,
          scrollContainer.scrollHeight - scrollContainer.clientHeight,
        );
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    payload.busy,
    payload.thoughtSummary,
    payload.thinking,
    payload.instructionInput,
    payload.displayMarkdown,
    payload.clarification?.streamingText,
    payload.clarification?.questions.length,
  ]);
  return (
    <div
      ref={rootRef}
      className="aad-final-slash-ai-inline-draft"
      data-final-slash-ai-inline-draft="true"
      data-instruction-input-open={showInstructionInput ? 'true' : undefined}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {showInstructionInput ? (
        <form
          className="aad-preview-ai-follow-up aad-final-slash-ai-input"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <AiImeSafeTextArea
            autoFocus
            className="aad-preview-ai-selection-instruction-input aad-final-slash-ai-instruction-input"
            value={payload.instructionInput}
            disabled={payload.busy}
            placeholder={payload.t.previewAiSlashInstructionPlaceholder}
            ariaLabel={payload.t.previewAiSlashComposerLabel}
            onValueChange={payload.onInstructionInputChange}
            onSubmit={payload.onSubmitInstruction}
            onCancel={payload.onCancel}
            submitClassName="aad-preview-ai-selection-result-button is-primary"
            submitContent={(
              <>
                <Sparkles size={15} aria-hidden="true" />
                <span>{payload.t.previewAiSlashGenerateNow}</span>
              </>
            )}
            cancelClassName="aad-preview-ai-selection-result-button"
            cancelContent={(
              <>
                <X size={15} aria-hidden="true" />
                <span>{payload.t.previewAiSlashCancel}</span>
              </>
            )}
          />
          {payload.error ? (
            <div className="aad-preview-ai-follow-up-error" role="alert">{payload.error}</div>
          ) : null}
        </form>
      ) : null}
      {showProgressPanel ? (
        <div
          className="aad-final-slash-ai-progress"
          role={payload.busy ? 'status' : undefined}
          aria-live={payload.busy ? 'polite' : undefined}
        >
          <div className="aad-final-slash-ai-thinking-summary">
            <button
              type="button"
              className="aad-final-slash-ai-thinking-title-button"
              aria-expanded={payload.thinkingOpen}
              onClick={payload.onToggleThinking}
            >
              <span className="aad-final-slash-ai-thinking-title">
                <span className="aad-final-slash-ai-thinking-label">{progressTitle}</span>
              </span>
              <span className="aad-final-slash-ai-thinking-toggle" aria-hidden="true">
                {payload.thinkingOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
            </button>
          </div>
          {payload.thinkingOpen ? (
            <div ref={thinkingContentRef} className="aad-final-slash-ai-thinking-content">
              {payload.thoughtSummary ? (
                <div className="aad-final-slash-ai-thinking-section">
                  <div className="aad-final-slash-ai-thinking-section-title">{payload.t.previewAiSlashThoughtSummaryLabel}</div>
                  <div>{payload.thoughtSummary}</div>
                </div>
              ) : null}
              {thinkingContent ? (
                <div className="aad-final-slash-ai-thinking-section">
                  <div className="aad-final-slash-ai-thinking-status">
                    {payload.busy && isThinkingPhase ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : null}
                    <span>{thinkingContent}</span>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          {payload.busy ? (
            <div className="aad-final-slash-ai-progress-actions">
              <button
                type="button"
                className="aad-final-slash-ai-stop-button"
                onClick={(event) => {
                  event.stopPropagation();
                  payload.onCancel();
                }}
              >
                <X size={14} aria-hidden="true" />
                <span>{payload.t.previewAiSlashStop}</span>
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {payload.displayMarkdown ? (
        <div className="aad-final-slash-ai-inline-result">
          <PreviewAiMarkdownResult
            artifactRenderMode={payload.renderArtifactsReady ? 'render' : 'source-only'}
            markdown={payload.displayMarkdown}
            renderDeliveryAccess={payload.renderDeliveryAccess}
            streaming={payload.streaming}
            t={payload.t}
          />
        </div>
      ) : null}
      {payload.clarification ? (
        <form
          className="aad-preview-ai-follow-up aad-preview-ai-clarification"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <div className="aad-preview-ai-follow-up-hint">{payload.t.previewAiSlashClarificationTitle}</div>
          {clarificationStreamingText ? (
            <div className="aad-preview-ai-clarification-stream" aria-live="polite">
              {payload.clarification.streamingText}
            </div>
          ) : null}
          {!clarificationStreamingText && payload.clarification.questions.length > 0 ? (
            <ul className="aad-preview-ai-clarification-list">
              {payload.clarification.questions.map(question => (
                <li key={question.id} className="aad-preview-ai-clarification-question">
                  {question.question}
                </li>
              ))}
            </ul>
          ) : null}
          {payload.clarification.questions.length > 0 ? (
            <>
              <AiImeSafeTextArea
                value={payload.clarification.answer}
                disabled={payload.busy}
                placeholder={payload.clarification.questions[0]?.placeholder || payload.t.previewAiSlashClarificationPlaceholder}
                ariaLabel={payload.t.previewAiSlashClarificationTitle}
                onValueChange={payload.onClarificationAnswerChange}
                onSubmit={payload.onSubmitClarification}
                onCancel={payload.onCancel}
                submitClassName="aad-preview-ai-selection-result-button aad-preview-ai-clarification-submit"
                submitContent={(
                  <>
                    <Send size={15} aria-hidden="true" />
                    <span>{payload.t.previewAiSlashClarificationContinue}</span>
                  </>
                )}
                cancelClassName="aad-preview-ai-selection-result-button"
                cancelContent={(
                  <>
                    <X size={15} aria-hidden="true" />
                    <span>{payload.t.previewAiSlashCancel}</span>
                  </>
                )}
              />
            </>
          ) : null}
        </form>
      ) : null}
      {payload.ready ? (
        <div className="aad-final-slash-ai-inline-actions">
          <button
            type="button"
            className="aad-preview-ai-selection-result-button"
            disabled={payload.busy}
            onClick={payload.onApply}
          >
            <Check size={15} aria-hidden="true" />
            <span>{payload.t.previewAiSlashApply}</span>
          </button>
          <button
            type="button"
            className="aad-preview-ai-selection-result-button"
            disabled={payload.busy}
            onClick={payload.onToggleFollowUp}
          >
            <MessageCirclePlus size={15} aria-hidden="true" />
            <span>{payload.t.previewAiContinueFollowUp}</span>
          </button>
          <button
            type="button"
            className="aad-preview-ai-selection-result-button"
            disabled={payload.busy}
            onClick={payload.onCancel}
          >
            <X size={15} aria-hidden="true" />
            <span>{payload.t.previewAiSlashCancel}</span>
          </button>
        </div>
      ) : null}
      {payload.ready && payload.followUpOpen ? (
        <form
          className="aad-preview-ai-follow-up"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <div className="aad-preview-ai-follow-up-hint">{payload.t.previewAiCandidateNotApplied}</div>
          <AiImeSafeTextArea
            value={payload.followUpInstruction}
            disabled={payload.busy}
            placeholder={payload.t.previewAiFollowUpPlaceholder}
            ariaLabel={payload.t.previewAiContinueFollowUp}
            onValueChange={payload.onFollowUpInstructionChange}
            onSubmit={payload.onSubmitFollowUp}
            submitClassName="aad-preview-ai-selection-result-button is-primary"
            submitContent={(
              <>
                <Send size={15} aria-hidden="true" />
                <span>{payload.t.previewAiFollowUpSend}</span>
              </>
            )}
          />
        </form>
      ) : null}
    </div>
  );
};

class FinalSlashAiInlineDraftNode extends DecoratorNode<React.ReactNode> {
  __payload: FinalSlashAiInlineDraftPayload | null;

  static getType() {
    return 'final-slash-ai-inline-draft';
  }

  static clone(node: FinalSlashAiInlineDraftNode) {
    return new FinalSlashAiInlineDraftNode(node.__payload, node.__key);
  }

  static importJSON() {
    return $createFinalSlashAiInlineDraftNode(null);
  }

  constructor(payload: FinalSlashAiInlineDraftPayload | null, key?: NodeKey) {
    super(key);
    this.__payload = payload;
  }

  createDOM() {
    const element = document.createElement('div');
    element.className = 'aad-final-slash-ai-inline-draft-shell';
    element.contentEditable = 'false';
    return element;
  }

  updateDOM() {
    return false;
  }

  exportJSON(): SerializedFinalSlashAiInlineDraftNode {
    return {
      type: 'final-slash-ai-inline-draft',
      version: 1,
    };
  }

  isInline() {
    return false;
  }

  setPayload(payload: FinalSlashAiInlineDraftPayload | null) {
    const self = this.getWritable();
    self.__payload = payload;
  }

  decorate() {
    return this.__payload ? <FinalSlashAiInlineDraftView payload={this.__payload} /> : null;
  }
}

const $createFinalSlashAiInlineDraftNode = (payload: FinalSlashAiInlineDraftPayload | null) =>
  $applyNodeReplacement(new FinalSlashAiInlineDraftNode(payload));

const $isFinalSlashAiInlineDraftNode = (node: unknown): node is FinalSlashAiInlineDraftNode =>
  node instanceof FinalSlashAiInlineDraftNode;

const isCodeLikePreviewArtifactKind = (artifactKind: string) => {
  const normalizedArtifactKind = artifactKind.trim().toLowerCase();
  const languageKind = getCodeFenceLanguageKind(artifactKind);
  return (
    normalizedArtifactKind === 'html' ||
    normalizedArtifactKind === 'html-preview' ||
    languageKind === CODE_FENCE_LANGUAGE_KINDS.HTML_PREVIEW ||
    languageKind === CODE_FENCE_LANGUAGE_KINDS.MERMAID
  );
};

const getElementPreviewAiRect = (element: Element | null | undefined): PreviewAiSelectionRect | null => {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (
    !Number.isFinite(rect.top) ||
    !Number.isFinite(rect.left) ||
    !Number.isFinite(rect.width) ||
    !Number.isFinite(rect.height) ||
    rect.width <= 0 ||
    rect.height <= 0
  ) {
    return null;
  }
  return {
    height: rect.height,
    left: rect.left,
    top: rect.top,
    width: rect.width,
  };
};

const IMAGE_AI_REFERENCE_MAX_LENGTH = 1600;

const clipPreviewAiReferenceText = (value: string, limit = IMAGE_AI_REFERENCE_MAX_LENGTH) => (
  value.length > limit ? `${value.slice(0, limit - 1)}...` : value
);

const toPreviewAiSelectionImageContext = (reference: PreviewImageReference): PreviewAiSelectionImageContext => ({
  alt: reference.alt,
  markdown: reference.markdown,
  title: reference.title,
  url: reference.url,
});

const createPreviewImageAiSelectedText = (reference: PreviewImageReference) => {
  const lines = [
    '图片引用',
    reference.markdown ? `markdown: ${reference.markdown}` : '',
    reference.alt ? `alt: ${reference.alt}` : '',
    reference.title ? `title: ${reference.title}` : '',
    `url: ${reference.url}`,
    '',
    '可用于总结图片内容；图片本身不支持 AI 修改。',
  ].filter(Boolean);
  return clipPreviewAiReferenceText(lines.join('\n'));
};

const getSourceRangeBlockingDiagnostic = (
  diagnostics: readonly ArtifactDiagnostic[],
  sourceRange: SourcePositionRange | null | undefined,
) => {
  if (!sourceRange) return null;
  return diagnostics.find((diagnostic) => (
    diagnostic.severity === 'error' &&
    diagnostic.line &&
    diagnostic.line >= sourceRange.startLine &&
    diagnostic.line <= sourceRange.endLine
  )) ?? null;
};

const PreviewArtifactDecorator: React.FC<PreviewArtifactPayload & { nodeKey: string }> = ({
  artifactId,
  artifactKind,
  nodeKey,
  source,
  sourceRange,
}) => {
  const renderContext = React.useContext(PreviewArtifactRenderContext);
  const artifactRootRef = React.useRef<HTMLDivElement | null>(null);
  const suppressCodeLikeArtifactAiRef = React.useRef(false);
  const isImageArtifact = artifactKind === 'image';
  const isSelectedImage = isImageArtifact && renderContext?.selectedImageNodeKey === nodeKey;
  const isCodeLikeArtifact = !isImageArtifact && isCodeLikePreviewArtifactKind(artifactKind);
  const isHtmlPreviewArtifact = !isImageArtifact && getCodeFenceLanguageKind(artifactKind) === CODE_FENCE_LANGUAGE_KINDS.HTML_PREVIEW;
  const isSelectedCodeLikeArtifact = isCodeLikeArtifact &&
    renderContext?.selectedCodeLikeArtifactNodeKey === nodeKey;
  const nextLineMap = React.useMemo(
    () => createSegmentLineMap({ source, sourceRange }, renderContext?.sourceLineMap),
    [renderContext?.sourceLineMap, source, sourceRange],
  );
  const lineMapRef = React.useRef(nextLineMap);
  if (!arePreviewSourceLineMapsEqual(lineMapRef.current, nextLineMap)) {
    lineMapRef.current = nextLineMap;
  }
  const lineMap = lineMapRef.current;
  const getArtifactIdForSourceLine = renderContext?.getArtifactIdForSourceLine;
  const getArtifactIdForSourceLineRef = React.useRef(getArtifactIdForSourceLine);
  getArtifactIdForSourceLineRef.current = getArtifactIdForSourceLine;
  const getSegmentArtifactIdForNode = React.useCallback((node: any) => {
    const getArtifactId = getArtifactIdForSourceLineRef.current;
    if (!getArtifactId) return '';
    const nodeLine = Number(node?.position?.start?.line);
    if (!Number.isFinite(nodeLine)) return '';
    const sourceLine = lineMapRef.current?.[nodeLine - 1] ?? nodeLine;
    return getArtifactId(sourceLine);
  }, []);
  const isSourceLineHiddenRef = React.useRef(renderContext?.isSourceLineHidden);
  isSourceLineHiddenRef.current = renderContext?.isSourceLineHidden;
  const isSegmentSourceLineHidden = React.useCallback((line: number) => (
    isSourceLineHiddenRef.current?.(line) ?? false
  ), []);
  const reportArtifactSourceLine = React.useCallback((selectedTextOverride?: string | null) => {
    const mappedRange = mapSourcePositionRange(sourceRange ?? null, renderContext?.sourceLineMap);
    const line = mappedRange?.startLine;
    if (!line) return;
    // If the user has an active text selection in final, report it so the source
    // side can locate the exact characters rather than just the block line.
    const selectedText = selectedTextOverride ?? window.getSelection()?.toString().trim() ?? null;
    renderContext?.onFinalCursorSourceLineChange?.(line, selectedText || undefined, {
      sourceRange: mappedRange,
    });
    if (selectedText && !isImageArtifact) {
      const patchTarget = isCodeLikeArtifact
        ? createPreviewAiCandidatePatchTarget(renderContext?.fullSourceRef?.current, mappedRange)
        : undefined;
      renderContext?.onLexicalAiSelectionChange?.(createReadonlyAiSelectionCandidate({
        islandId: `artifact:${nodeKey}`,
        patchTarget,
        selectedText: isCodeLikeArtifact ? patchTarget?.selectedText ?? selectedText : selectedText,
        sourceRange: mappedRange,
      }));
    }
  }, [isCodeLikeArtifact, isImageArtifact, nodeKey, renderContext, sourceRange]);
  const publishCodeLikeArtifactAiCandidate = React.useCallback((selectedTextOverride?: string | null) => {
    if (!isCodeLikeArtifact) return;
    const mappedRange = mapSourcePositionRange(sourceRange ?? null, renderContext?.sourceLineMap);
    const patchTarget = createPreviewAiCandidatePatchTarget(renderContext?.fullSourceRef?.current, mappedRange);
    const selectedText = patchTarget?.selectedText?.trim() || selectedTextOverride?.trim() || source.trim();
    const repairDiagnostic = getSourceRangeBlockingDiagnostic(renderContext?.diagnostics ?? [], mappedRange);
    const candidate = createReadonlyAiSelectionCandidate({
      islandId: `artifact:${nodeKey}`,
      patchTarget,
      repairDiagnostic,
      rect: getElementPreviewAiRect(artifactRootRef.current),
      selectionScope: 'whole',
      selectedText,
      sourceRange: mappedRange,
    });
    if (!candidate) return;
    window.setTimeout(() => {
      renderContext?.onLexicalAiSelectionChange?.(candidate);
    }, 0);
  }, [isCodeLikeArtifact, nodeKey, renderContext, source, sourceRange]);
  const publishImageArtifactAiCandidate = React.useCallback(() => {
    if (!isImageArtifact) return;
    const imageReference = parsePreviewMarkdownImageReference(source);
    if (!imageReference) return;
    const mappedRange = mapSourcePositionRange(sourceRange ?? null, renderContext?.sourceLineMap);
    const candidate = createReadonlyAiSelectionCandidate({
      contentKind: 'image',
      image: toPreviewAiSelectionImageContext(imageReference),
      islandId: `artifact:${nodeKey}`,
      patchable: false,
      rect: getElementPreviewAiRect(artifactRootRef.current),
      selectedText: createPreviewImageAiSelectedText(imageReference),
      sourceRange: mappedRange,
    });
    if (!candidate) return;
    window.setTimeout(() => {
      renderContext?.onLexicalAiSelectionChange?.(candidate);
    }, 0);
  }, [isImageArtifact, nodeKey, renderContext, source, sourceRange]);
  const reportArtifactSourceLineIfNoSelection = React.useCallback(() => {
    if (window.getSelection()?.toString().trim()) return;
    reportArtifactSourceLine(null);
  }, [reportArtifactSourceLine]);
  const selectCodeLikeArtifact = React.useCallback(() => {
    if (!isCodeLikeArtifact) return;
    reportArtifactSourceLine(null);
    renderContext?.onSelectImageArtifact(null);
    renderContext?.onSelectCodeLikeArtifact(nodeKey);
  }, [isCodeLikeArtifact, nodeKey, renderContext, reportArtifactSourceLine]);
  const handleHtmlArtifactActivate = useLatestCallback(selectCodeLikeArtifact);
  const handleArtifactPointerDownCapture = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (isMornDraftPreviewCommandTarget(event.target)) {
      suppressCodeLikeArtifactAiRef.current = true;
      return;
    }
    const isHtmlPreviewTarget = isHtmlPreviewInteractionTarget(event.target);
    suppressCodeLikeArtifactAiRef.current = isHtmlPreviewTarget;
    if (isCodeLikeArtifact) {
      selectCodeLikeArtifact();
      if (!isHtmlPreviewTarget && !window.getSelection()?.toString().trim()) {
        publishCodeLikeArtifactAiCandidate();
      }
    }
    if (isImageArtifact) return;
    if (event.target instanceof Element && event.target.closest('iframe')) {
      reportArtifactSourceLine(null);
    }
  }, [
    isCodeLikeArtifact,
    isImageArtifact,
    publishCodeLikeArtifactAiCandidate,
    reportArtifactSourceLine,
    selectCodeLikeArtifact,
  ]);
  const handleArtifactPointerUpCapture = React.useCallback(() => {
    window.requestAnimationFrame(() => {
      const selectedText = window.getSelection()?.toString().trim() || null;
      if (selectedText) reportArtifactSourceLine(selectedText);
    });
  }, [reportArtifactSourceLine]);
  const handleArtifactClickCapture = React.useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (isMornDraftPreviewCommandTarget(event.target)) return;
    const suppressCodeLikeArtifactAi = suppressCodeLikeArtifactAiRef.current;
    if (isCodeLikeArtifact) {
      selectCodeLikeArtifact();
    }
    if (window.getSelection()?.toString().trim()) {
      reportArtifactSourceLineIfNoSelection();
      return;
    }
    reportArtifactSourceLineIfNoSelection();
    if (!suppressCodeLikeArtifactAi) publishCodeLikeArtifactAiCandidate();
    window.setTimeout(() => {
      suppressCodeLikeArtifactAiRef.current = false;
    }, 0);
  }, [
    isCodeLikeArtifact,
    publishCodeLikeArtifactAiCandidate,
    reportArtifactSourceLineIfNoSelection,
    selectCodeLikeArtifact,
  ]);
  const handleArtifactFocusCapture = React.useCallback((event: React.FocusEvent<HTMLDivElement>) => {
    if (isMornDraftPreviewCommandTarget(event.target)) return;
    const suppressCodeLikeArtifactAi = suppressCodeLikeArtifactAiRef.current;
    if (isCodeLikeArtifact) {
      selectCodeLikeArtifact();
    }
    if (window.getSelection()?.toString().trim()) {
      reportArtifactSourceLineIfNoSelection();
      return;
    }
    reportArtifactSourceLineIfNoSelection();
    if (!suppressCodeLikeArtifactAi) publishCodeLikeArtifactAiCandidate();
  }, [
    isCodeLikeArtifact,
    publishCodeLikeArtifactAiCandidate,
    reportArtifactSourceLineIfNoSelection,
    selectCodeLikeArtifact,
  ]);
  React.useEffect(() => {
    if (!isSelectedCodeLikeArtifact) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      const rootElement = artifactRootRef.current;
      if (rootElement && event.target instanceof Node && rootElement.contains(event.target)) return;
      renderContext?.onSelectCodeLikeArtifact(null);
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [isSelectedCodeLikeArtifact, renderContext]);
  const handleJsonFormatted = useLatestCallback(renderContext?.onJsonFormatted);
  const handleMermaidDiagnosticChange = useLatestCallback(renderContext?.onMermaidDiagnosticChange);
  const handleMermaidSvgReady = useLatestCallback(renderContext?.onMermaidSvgReady);
  const onSourcePatchRef = React.useRef(renderContext?.onSourcePatch);
  onSourcePatchRef.current = renderContext?.onSourcePatch;
  const onBeforePatchRef = React.useRef(renderContext?.onBeforePatch);
  onBeforePatchRef.current = renderContext?.onBeforePatch;
  const handleSourcePatch = React.useCallback((nextSource: string, meta?: PreviewMarkdownPatchMeta) => {
    onBeforePatchRef.current?.();
    onSourcePatchRef.current?.(nextSource, meta);
  }, []);
  const handleBeginFixReview = useLatestCallback(renderContext?.onBeginFixReview);
  const handleRequestAiFix = useLatestCallback(renderContext?.onRequestAiFix);
  const handleLocalArtifactSourcePatch = useLatestCallback((
    nextSource: string,
    artifact: ArtifactSourceOverridePatch,
  ) => {
    renderContext?.onLocalArtifactSourcePatch?.(nextSource, {
      ...artifact,
      nodeKey,
    });
  });
  const handleFinalCursorSourceLineChange = useLatestCallback(renderContext?.onFinalCursorSourceLineChange);
  const handlePreviewAiSelectionChange = useLatestCallback(renderContext?.onLexicalAiSelectionChange);
  const renderDeliveryAccessRef = React.useRef(renderContext?.renderDeliveryAccess);
  if (!arePreviewRenderDeliveryAccessEqual(renderDeliveryAccessRef.current, renderContext?.renderDeliveryAccess)) {
    renderDeliveryAccessRef.current = renderContext?.renderDeliveryAccess;
  }
  const withSegmentArtifactTarget = React.useCallback((_node: any, element: React.ReactElement) => element, []);
  if (!renderContext) return null;
  const selectImageArtifact = (event: React.MouseEvent<HTMLDivElement> | React.KeyboardEvent<HTMLDivElement>) => {
    if (!isImageArtifact) return;
    reportArtifactSourceLine();
    event.preventDefault();
    event.stopPropagation();
    renderContext.onSelectImageArtifact(nodeKey);
    renderContext.onSelectCodeLikeArtifact(null);
    publishImageArtifactAiCandidate();
    const contentRoot = event.currentTarget
      .closest('.aad-markdown-lexical-island')
      ?.querySelector<HTMLElement>('.aad-markdown-lexical-island-content');
    contentRoot?.focus({ preventScroll: true });
  };
  const handleArtifactKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (isImageArtifact) {
      selectImageArtifact(event);
      return;
    }
    if (!isCodeLikeArtifact) return;
    event.preventDefault();
    event.stopPropagation();
    selectCodeLikeArtifact();
  };
  const artifactStateClassName = [
    isImageArtifact ? 'aad-preview-image-artifact' : '',
    isCodeLikeArtifact ? 'aad-preview-code-like-artifact' : '',
    isHtmlPreviewArtifact ? 'aad-preview-html-artifact' : '',
    isSelectedImage || isSelectedCodeLikeArtifact ? 'is-selected' : '',
  ].filter(Boolean).join(' ') || undefined;

  return (
    <PreviewArtifactTargetProvider artifactId={artifactId}>
      <div
        ref={artifactRootRef}
        className={['aad-preview-artifact-decorator-content', artifactStateClassName].filter(Boolean).join(' ')}
        contentEditable={false}
        onKeyDown={isImageArtifact || isCodeLikeArtifact ? handleArtifactKeyDown : undefined}
        onMouseDown={isImageArtifact ? selectImageArtifact : undefined}
        onPointerDownCapture={handleArtifactPointerDownCapture}
        onPointerUpCapture={handleArtifactPointerUpCapture}
        onClickCapture={handleArtifactClickCapture}
        onFocusCapture={handleArtifactFocusCapture}
        role={isImageArtifact ? 'button' : undefined}
        tabIndex={isImageArtifact || isCodeLikeArtifact ? 0 : undefined}
        aria-label={isImageArtifact ? renderContext.t.previewImageSelected : undefined}
        aria-selected={isImageArtifact ? isSelectedImage : undefined}
        suppressContentEditableWarning
        {...sourcePositionAttributes(sourceRange, renderContext.sourceLineMap)}
        {...(artifactId ? { 'data-artifact-id': artifactId } : {})}
      >
        <MarkdownReadonlyRenderer
          codeBlockIdentityPrefix={nodeKey}
          code={source}
          contentType={renderContext.contentType}
          diagnostics={renderContext.diagnostics}
          forceClosedCodeFence
          fullSource={renderContext.fullSource}
          fullSourceRef={renderContext.fullSourceRef}
          getArtifactIdForNode={getSegmentArtifactIdForNode}
          HtmlPreviewComponent={renderContext.HtmlPreviewComponent}
          isSourceLineHidden={isSegmentSourceLineHidden}
          lineMap={lineMap}
          MermaidPreviewComponent={renderContext.MermaidPreviewComponent}
          isAiFixBusy={renderContext.isAiFixBusy}
          onJsonFormatted={handleJsonFormatted}
          onBeginFixReview={handleBeginFixReview}
          onRequestAiFix={handleRequestAiFix}
          repairMode={renderContext.repairMode}
          onMermaidDiagnosticChange={handleMermaidDiagnosticChange}
          onMermaidSvgReady={handleMermaidSvgReady}
          onLocalArtifactSourcePatch={handleLocalArtifactSourcePatch}
          onHtmlArtifactActivate={handleHtmlArtifactActivate}
          onSourcePatch={handleSourcePatch}
          onFinalCursorSourceLineChange={handleFinalCursorSourceLineChange}
          onPreviewAiSelectionChange={handlePreviewAiSelectionChange}
          previewSourcePatchEnabled={renderContext.previewSourcePatchEnabled}
          renderDeliveryAccess={renderDeliveryAccessRef.current}
          t={renderContext.t}
          withArtifactTarget={withSegmentArtifactTarget}
        />
      </div>
    </PreviewArtifactTargetProvider>
  );
};

// ── Editable Code Block (DecoratorNode + CollapsibleArtifactBlock UI) ────

type SerializedCodeBlockDecoratorNode = Spread<
  {
    artifactId?: string;
    code: string;
    language: string;
    sourceFormat?: 'fenced' | 'raw';
    sourceRange?: SourcePositionRange | null;
    type: 'code-block-decorator';
    version: 1;
  },
  SerializedLexicalNode
>;

class CodeBlockDecoratorNode extends DecoratorNode<React.ReactNode> {
  __language: string;
  __code: string;
  __artifactId: string;
  __sourceFormat: 'fenced' | 'raw';
  __sourceRange: SourcePositionRange | null;

  static getType(): string { return 'code-block-decorator'; }
  static clone(node: CodeBlockDecoratorNode): CodeBlockDecoratorNode {
    return new CodeBlockDecoratorNode(
      node.__language,
      node.__code,
      node.__artifactId,
      node.__sourceFormat,
      node.__sourceRange,
      node.__key,
    );
  }

  constructor(
    language: string,
    code: string,
    artifactId = '',
    sourceFormat: 'fenced' | 'raw' = 'fenced',
    sourceRange: SourcePositionRange | null = null,
    key?: NodeKey,
  ) {
    super(key);
    this.__language = language;
    this.__code = code;
    this.__artifactId = artifactId;
    this.__sourceFormat = sourceFormat === 'raw' ? 'raw' : 'fenced';
    this.__sourceRange = sourceRange;
  }

  createDOM(): HTMLElement {
    const el = document.createElement('div');
    el.setAttribute('data-lexical-code-block', 'true');
    if (this.__artifactId) el.setAttribute('data-artifact-id', this.__artifactId);
    Object.entries(sourcePositionAttributes(this.__sourceRange)).forEach(([key, value]) => {
      el.setAttribute(key, value);
    });
    return el;
  }

  updateDOM(): false { return false; }

  getSourceRange() {
    return this.__sourceRange;
  }

  exportJSON(): SerializedCodeBlockDecoratorNode {
    return {
      artifactId: this.__artifactId || undefined,
      code: this.__code,
      language: this.__language,
      sourceFormat: this.__sourceFormat,
      sourceRange: this.__sourceRange,
      type: 'code-block-decorator',
      version: 1,
    };
  }

  static importJSON(json: SerializedCodeBlockDecoratorNode): CodeBlockDecoratorNode {
    return new CodeBlockDecoratorNode(
      json.language,
      json.code,
      json.artifactId ?? '',
      json.sourceFormat === 'raw' ? 'raw' : 'fenced',
      json.sourceRange ?? null,
    );
  }

  decorate(): React.ReactNode {
    return (
      <EditableCodeBlockDecorator
        artifactId={this.__artifactId}
        code={this.__code}
        language={this.__language}
        nodeKey={this.__key}
        sourceRange={this.__sourceRange}
      />
    );
  }

  setCode(code: string) {
    const self = this.getWritable();
    self.__code = code;
  }

  setPayload(payload: {
    artifactId?: string;
    code: string;
    language: string;
    sourceFormat?: 'fenced' | 'raw';
    sourceRange: SourcePositionRange | null;
  }) {
    const self = this.getWritable();
    self.__artifactId = payload.artifactId ?? '';
    self.__language = payload.language;
    self.__code = payload.code;
    self.__sourceFormat = payload.sourceFormat === 'raw' ? 'raw' : 'fenced';
    self.__sourceRange = payload.sourceRange;
  }

  setLanguageAndCode(language: string, code: string) {
    const self = this.getWritable();
    self.__language = language;
    self.__code = code;
  }
}

function $createCodeBlockDecoratorNode(
  language: string,
  code: string,
  artifactId = '',
  sourceFormat: 'fenced' | 'raw' = 'fenced',
  sourceRange: SourcePositionRange | null = null,
): CodeBlockDecoratorNode {
  return $applyNodeReplacement(new CodeBlockDecoratorNode(language, code, artifactId, sourceFormat, sourceRange));
}

function $isCodeBlockDecoratorNode(node: LexicalNode | null | undefined): node is CodeBlockDecoratorNode {
  return node instanceof CodeBlockDecoratorNode;
}

const JSON_FORMATTABLE_LANGUAGES = new Set(['json', 'json5']);

const getCodeBlockBehaviorLanguage = (language: string) => {
  const normalizedLanguage = normalizeCodeFenceLanguage(language);
  return normalizedLanguage || String(language ?? '').trim().toLowerCase();
};

type JsonFormatResult =
  | { formatted: string; error: null; value: unknown }
  | { formatted: string; error: 'parse-error'; value?: undefined };

type JsonFenceClassificationForEditor =
  | { kind: 'single'; formatted: string; value: unknown }
  | { kind: 'invalid' };

const getJsonParseMode = (language: string) => (
  getCodeBlockBehaviorLanguage(language) === 'json5' ? 'json5' : 'json'
);

const formatJsonCode = (code: string, parseMode: 'json' | 'json5' = 'json'): JsonFormatResult => {
  const classification = classifyJsonFenceContent(code, { parseMode }) as JsonFenceClassificationForEditor;
  if (classification.kind === 'single') {
    return { formatted: classification.formatted, error: null, value: classification.value };
  }
  return { formatted: code, error: 'parse-error' };
};

const getCodeBlockSourceRangeDiagnostic = (
  diagnostics: readonly ArtifactDiagnostic[],
  sourceRange: SourcePositionRange | null | undefined,
  codePrefix: string,
) => {
  const blockingDiagnostics = diagnostics.filter((diagnostic) => (
    diagnostic.severity !== 'info' &&
    diagnostic.code.startsWith(codePrefix) &&
    diagnostic.line
  ));
  if (!sourceRange) return blockingDiagnostics.length === 1 ? (blockingDiagnostics[0] ?? null) : null;
  return blockingDiagnostics.find((diagnostic) => (
    diagnostic.line &&
    diagnostic.line >= sourceRange.startLine &&
    diagnostic.line <= sourceRange.endLine
  )) ?? (blockingDiagnostics.length === 1 ? (blockingDiagnostics[0] ?? null) : null);
};

const readSourceRangeAttributes = (element: Element | null | undefined): SourcePositionRange | null => {
  if (!element) return null;
  const startLine = Number(element.getAttribute('data-source-start-line'));
  const startColumn = Number(element.getAttribute('data-source-start-column'));
  const endLine = Number(element.getAttribute('data-source-end-line'));
  const endColumn = Number(element.getAttribute('data-source-end-column'));
  if (![startLine, startColumn, endLine, endColumn].every((value) => Number.isFinite(value) && value > 0)) {
    return null;
  }
  return { startLine, startColumn, endLine, endColumn };
};

const getShortcutCodeBlockInitialCode = (language: string, code: string) => {
  return code;
};

const getJsonPasteCode = (code: string, language = 'json') => {
  const formattedJson = formatJsonCode(code, getJsonParseMode(language));
  return formattedJson.error ? code : formattedJson.formatted;
};

const isJsonPasteCandidate = (language: string, code: string) => {
  const behaviorLanguage = getCodeBlockBehaviorLanguage(language);
  if (JSON_FORMATTABLE_LANGUAGES.has(behaviorLanguage)) return true;
  const trimmed = code.trim();
  return (!String(language ?? '').trim() || behaviorLanguage === 'code') && /^(?:\{|\[)/.test(trimmed);
};

const HTML_PASTE_TAG_PATTERN =
  /^\s*(?:<!doctype\s+html\b|<html\b|<(?:article|body|button|canvas|div|footer|form|h[1-6]|head|header|iframe|img|li|link|main|meta|nav|ol|p|script|section|span|style|svg|table|template|ul|video)\b)/i;

const isLikelyHtmlPaste = (code: string) => HTML_PASTE_TAG_PATTERN.test(code);

const MERMAID_PASTE_START_PATTERN =
  /^(?:architecture-beta|block-beta|c4component|c4container|c4context|c4dynamic|classdiagram|erdiagram|flowchart|gantt|gitgraph|graph|journey|kanban|mindmap|packet-beta|pie|quadrantchart|radar-beta|requirementdiagram|sankey-beta|sequencediagram|statediagram|statediagram-v2|timeline|treemap-beta|xychart-beta)\b/i;

const isLikelyMermaidPaste = (code: string) => {
  const firstLine = code
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith('%%'));
  return Boolean(firstLine && MERMAID_PASTE_START_PATTERN.test(firstLine));
};

type CodeBlockPasteAction =
  | {
      code: string;
      language: string;
      type: 'code';
    }
  | {
      artifactKind: string;
      code: string;
      language: string;
      type: 'artifact';
    };

const getCodeBlockPasteAction = (language: string, code: string): CodeBlockPasteAction | null => {
  const trimmed = code.trim();
  if (!trimmed) return null;
  const languageKind = getCodeFenceLanguageKind(language);
  const rawLanguage = String(language ?? '').trim().toLowerCase();
  if (languageKind === CODE_FENCE_LANGUAGE_KINDS.HTML_PREVIEW) {
    return {
      artifactKind: 'html-preview',
      code,
      language: rawLanguage === 'html-preview' ? 'html-preview' : 'html',
      type: 'artifact',
    };
  }
  if (languageKind === CODE_FENCE_LANGUAGE_KINDS.MERMAID) {
    return { artifactKind: 'mermaid', code, language: 'mermaid', type: 'artifact' };
  }
  if (isLikelyHtmlPaste(code)) {
    return { artifactKind: 'html-preview', code, language: 'html', type: 'artifact' };
  }
  if (isLikelyMermaidPaste(code)) {
    return { artifactKind: 'mermaid', code, language: 'mermaid', type: 'artifact' };
  }
  if (isJsonPasteCandidate(language, code)) {
    const behaviorLanguage = getCodeBlockBehaviorLanguage(language);
    const nextLanguage = JSON_FORMATTABLE_LANGUAGES.has(behaviorLanguage)
      ? rawLanguage
      : 'json';
    return { code: getJsonPasteCode(code, behaviorLanguage), language: nextLanguage || 'json', type: 'code' };
  }
  return null;
};

const resizeCodeTextarea = (textarea: HTMLTextAreaElement) => {
  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight}px`;
};

const resizeCodeTextareaAcrossFrames = (textarea: HTMLTextAreaElement) => {
  resizeCodeTextarea(textarea);
  window.requestAnimationFrame(() => {
    resizeCodeTextarea(textarea);
    window.requestAnimationFrame(() => resizeCodeTextarea(textarea));
  });
  window.setTimeout(() => resizeCodeTextarea(textarea), 80);
};

const resizeCodeTextareasAcrossFrames = (rootElement: HTMLElement | null) => {
  if (!rootElement) return;
  const resizeAll = () => {
    rootElement.querySelectorAll<HTMLTextAreaElement>('textarea.aad-code-edit-textarea')
      .forEach(resizeCodeTextarea);
  };
  resizeAll();
  window.requestAnimationFrame(() => {
    resizeAll();
    window.requestAnimationFrame(resizeAll);
  });
  window.setTimeout(resizeAll, 80);
};

const getTextareaValueAfterPaste = (textarea: HTMLTextAreaElement, pastedText: string) => {
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? start;
  return `${textarea.value.slice(0, start)}${pastedText}${textarea.value.slice(end)}`;
};

const getTextareaLineStartOffsets = (value: string) => {
  const offsets = [0];
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '\n') offsets.push(index + 1);
  }
  return offsets;
};

type TextareaVerticalCaretMoveResult = 'boundary' | 'ignored' | 'moved';

const moveTextareaCaretVertically = (textarea: HTMLTextAreaElement, direction: 'down' | 'up'): TextareaVerticalCaretMoveResult => {
  if (textarea.selectionStart !== textarea.selectionEnd) return 'ignored';
  const value = textarea.value;
  const lineStartOffsets = getTextareaLineStartOffsets(value);
  const currentOffset = textarea.selectionStart;
  let currentLineIndex = -1;
  for (let index = 0; index < lineStartOffsets.length; index += 1) {
    if (lineStartOffsets[index] <= currentOffset) currentLineIndex = index;
    else break;
  }
  if (currentLineIndex < 0) return 'ignored';
  const currentLineStart = lineStartOffsets[currentLineIndex];
  const currentLineEnd = currentLineIndex + 1 < lineStartOffsets.length
    ? lineStartOffsets[currentLineIndex + 1] - 1
    : value.length;
  const targetLineIndex = direction === 'down' ? currentLineIndex + 1 : currentLineIndex - 1;
  if (targetLineIndex < 0 || targetLineIndex >= lineStartOffsets.length) {
    const edgeOffset = direction === 'down' ? currentLineEnd : currentLineStart;
    if (currentOffset === edgeOffset) return 'boundary';
    textarea.setSelectionRange(edgeOffset, edgeOffset);
    return 'moved';
  }
  const currentColumn = currentOffset - lineStartOffsets[currentLineIndex];
  const targetLineStart = lineStartOffsets[targetLineIndex];
  const targetLineEnd = targetLineIndex + 1 < lineStartOffsets.length
    ? lineStartOffsets[targetLineIndex + 1] - 1
    : value.length;
  const nextOffset = Math.min(targetLineStart + currentColumn, targetLineEnd);
  textarea.setSelectionRange(nextOffset, nextOffset);
  return 'moved';
};

const EditableCodeBlockDecorator: React.FC<{
  artifactId?: string;
  nodeKey: string;
  language: string;
  code: string;
  sourceRange?: SourcePositionRange | null;
}> = ({
  artifactId,
  nodeKey,
  language,
  code: initialCode,
  sourceRange,
}) => {
  const [editor] = useLexicalComposerContext();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const codeBlockRootRef = useRef<HTMLDivElement | null>(null);
  const isComposingRef = useRef(false);
  const allowFocusedTextareaSyncRef = useRef(false);
  const focusedTextareaSyncTimerRef = useRef<number | null>(null);
  const pendingTextareaFocusEdgeRef = useRef<'end' | 'start' | null>(null);
  const [isComposing, setIsComposing] = React.useState(false);
  const [isEditingCode, setIsEditingCode] = useState(false);
  const [hasCodeBlockSelection, setHasCodeBlockSelection] = useState(false);
  const [outerSourceRange, setOuterSourceRange] = useState<SourcePositionRange | null>(null);
  const [jsonSourceDisplayRangeOverride, setJsonSourceDisplayRangeOverride] = useState<SourcePositionRange | null>(null);
  const renderContext = React.useContext(PreviewArtifactRenderContext);
  const t = renderContext?.t;
  React.useLayoutEffect(() => {
    const outerElement = codeBlockRootRef.current?.parentElement?.matches('[data-lexical-code-block="true"]')
      ? codeBlockRootRef.current.parentElement
      : codeBlockRootRef.current?.closest('[data-lexical-code-block="true"]');
    const nextRange = readSourceRangeAttributes(outerElement);
    setOuterSourceRange((currentRange) => (
      sourceRangesEqual(currentRange, nextRange) ? currentRange : nextRange
    ));
  }, [sourceRange]);
  const effectiveSourceRange = outerSourceRange ?? sourceRange;
  const effectiveSourceRangeKey = getSourceRangeKey(effectiveSourceRange);
  useEffect(() => {
    setJsonSourceDisplayRangeOverride(null);
  }, [effectiveSourceRangeKey]);
  const jsonSourceDisplayRange = jsonSourceDisplayRangeOverride ?? effectiveSourceRange;
  const jsonSourceDisplayCode = getSourceRangeText(
    renderContext?.fullSourceRef?.current,
    jsonSourceDisplayRange,
  );
  const codeBlockSourceAttributes = React.useMemo(
    () => sourcePositionAttributes(effectiveSourceRange),
    [effectiveSourceRange],
  );
  const isSelectedCodeBlock = renderContext?.selectedCodeBlockNodeKey === nodeKey;
  const selectCodeBlock = React.useCallback(() => {
    renderContext?.onSelectImageArtifact(null);
    renderContext?.onSelectCodeLikeArtifact(null);
    renderContext?.onSelectCodeBlock(nodeKey);
  }, [nodeKey, renderContext]);
  const reportCodeBlockSourceLine = React.useCallback((selectedTextOverride?: string | null) => {
    const line = effectiveSourceRange?.startLine;
    if (!line) return;
    const selectedText = selectedTextOverride ?? window.getSelection()?.toString().trim() ?? null;
    renderContext?.onFinalCursorSourceLineChange?.(line, selectedText || undefined, {
      sourceRange: effectiveSourceRange,
    });
    if (selectedText) {
      const patchTarget = createPreviewAiCandidatePatchTarget(
        renderContext?.fullSourceRef?.current,
        effectiveSourceRange,
      );
      renderContext?.onLexicalAiSelectionChange?.(createReadonlyAiSelectionCandidate({
        islandId: `code:${nodeKey}`,
        patchTarget,
        selectedText: patchTarget?.selectedText ?? selectedText,
        sourceRange: effectiveSourceRange,
      }));
    }
  }, [effectiveSourceRange, nodeKey, renderContext]);
  const publishCodeBlockAiCandidate = React.useCallback((selectedTextOverride?: string | null) => {
    const patchTarget = createPreviewAiCandidatePatchTarget(
      renderContext?.fullSourceRef?.current,
      effectiveSourceRange,
    );
    const selectedText = patchTarget?.selectedText?.trim() ||
      selectedTextOverride?.trim() ||
      textareaRef.current?.value.trim() ||
      initialCode.trim();
    const repairDiagnostic = getSourceRangeBlockingDiagnostic(
      renderContext?.diagnostics ?? [],
      effectiveSourceRange,
    );
    const candidate = createReadonlyAiSelectionCandidate({
      islandId: `code:${nodeKey}`,
      patchTarget,
      repairDiagnostic,
      rect: getElementPreviewAiRect(codeBlockRootRef.current),
      selectionScope: 'whole',
      selectedText,
      sourceRange: effectiveSourceRange,
    });
    if (!candidate) return;
    window.setTimeout(() => {
      renderContext?.onLexicalAiSelectionChange?.(candidate);
    }, 0);
  }, [effectiveSourceRange, initialCode, nodeKey, renderContext]);
  const reportCodeBlockSourceLineIfNoSelection = React.useCallback(() => {
    if (window.getSelection()?.toString().trim()) return;
    setHasCodeBlockSelection(true);
    reportCodeBlockSourceLine(null);
    publishCodeBlockAiCandidate();
  }, [publishCodeBlockAiCandidate, reportCodeBlockSourceLine]);
  const handleCodeBlockPointerDownCapture = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    setHasCodeBlockSelection(true);
    selectCodeBlock();
    if (event.target instanceof Element && event.target.closest('iframe')) {
      reportCodeBlockSourceLine(null);
    }
  }, [reportCodeBlockSourceLine, selectCodeBlock]);
  const handleCodeBlockPointerUpCapture = React.useCallback(() => {
    window.requestAnimationFrame(() => {
      const selectedText = window.getSelection()?.toString().trim() || null;
      if (selectedText) reportCodeBlockSourceLine(selectedText);
    });
  }, [reportCodeBlockSourceLine]);
  const reportCodeBlockTextareaSelection = React.useCallback((textarea: HTMLTextAreaElement) => {
    const start = Math.min(textarea.selectionStart, textarea.selectionEnd);
    const end = Math.max(textarea.selectionStart, textarea.selectionEnd);
    const selectedText = textarea.value.slice(start, end).trim();
    if (!selectedText) {
      return;
    }
    const rect = textarea.getBoundingClientRect();
    setHasCodeBlockSelection(true);
    reportCodeBlockSourceLine(selectedText);
    const patchTarget = createPreviewAiCandidatePatchTarget(
      renderContext?.fullSourceRef?.current,
      effectiveSourceRange,
    );
	    renderContext?.onLexicalAiSelectionChange?.(createReadonlyAiSelectionCandidate({
	      islandId: `code:${nodeKey}`,
	      patchTarget,
      rect: {
        height: rect.height,
        left: rect.left,
        top: rect.top,
        width: rect.width,
	      },
	      selectedText: patchTarget?.selectedText ?? selectedText,
	      sourceRange: effectiveSourceRange,
	    }));
  }, [effectiveSourceRange, nodeKey, renderContext, reportCodeBlockSourceLine]);
  const handleCodeBlockTextareaSelect = React.useCallback((event: React.SyntheticEvent<HTMLTextAreaElement>) => {
    reportCodeBlockTextareaSelection(event.currentTarget);
  }, [reportCodeBlockTextareaSelection]);
  const handleCodeBlockTextareaSelectionCommit = React.useCallback((event: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const textarea = event.currentTarget;
    window.requestAnimationFrame(() => reportCodeBlockTextareaSelection(textarea));
  }, [reportCodeBlockTextareaSelection]);
  useEffect(() => {
    if (!hasCodeBlockSelection) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      const rootElement = codeBlockRootRef.current;
      if (rootElement && event.target instanceof Node && rootElement.contains(event.target)) return;
      setHasCodeBlockSelection(false);
      renderContext?.onSelectCodeBlock(null);
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [hasCodeBlockSelection, renderContext]);
  const isHiddenBySourceRange = effectiveSourceRange
    ? renderContext?.isSourceLineHidden?.(effectiveSourceRange.startLine)
    : undefined;
  const behaviorLanguage = getCodeBlockBehaviorLanguage(language);
  const isJson = JSON_FORMATTABLE_LANGUAGES.has(behaviorLanguage);
  const jsonDiagnostic = useMemo(
    () => isJson
      ? getCodeBlockSourceRangeDiagnostic(renderContext?.diagnostics ?? [], effectiveSourceRange, 'json.')
      : null,
    [effectiveSourceRange, isJson, renderContext?.diagnostics],
  );

  const jsonFormatted = useMemo(
    () => isJson ? formatJsonCode(initialCode, getJsonParseMode(behaviorLanguage)) : null,
    [behaviorLanguage, isJson, initialCode],
  );
  const displayCode = initialCode;
  const copyText = (jsonFormatted && !jsonFormatted.error) ? jsonFormatted.formatted : initialCode;
  const highlightedJsonLines = useMemo(
    () => isJson ? displayCode.split('\n').map(renderJsonLine) : null,
    [displayCode, isJson],
  );
  const shouldShowJsonTree = Boolean(
    isJson && jsonFormatted?.error === null && t && !isEditingCode,
  );

  useEffect(() => {
    if (isJson && jsonFormatted && !jsonFormatted.error) {
      renderContext?.onJsonFormatted?.(jsonFormatted.formatted);
    }
  }, [isJson, jsonFormatted, renderContext]);

  const commitCodeValue = useCallback((next: string) => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if (!$isCodeBlockDecoratorNode(node) || node.__code === next) return;
      node.setCode(next);
      $addUpdateTag(ISLAND_CODE_BLOCK_UPDATE_TAG);
    });
  }, [editor, nodeKey]);

  const commitJsonSourceDisplayValue = useCallback((nextSource: string) => {
    const nextCode = stripFenceWrapper(nextSource);
    commitCodeValue(nextCode);
    const fullSource = renderContext?.fullSourceRef?.current;
    if (!fullSource || !jsonSourceDisplayRange || !renderContext?.onSourcePatch) return;
    const result = patchSourceRange(fullSource, jsonSourceDisplayRange, nextSource);
    if (!result.ok) return;
    const nextRange = getReplacementSourceRange(jsonSourceDisplayRange, nextSource);
    setJsonSourceDisplayRangeOverride(nextRange);
    renderContext.onBeforePatch?.();
    renderContext.onSourcePatch(result.source, {
      blockId: `code-block:${language || 'json'}:${jsonSourceDisplayRange.startLine}:${jsonSourceDisplayRange.endLine}`,
      commitPhase: 'final',
      kind: 'code',
      origin: 'preview-markdown-edit',
      renderScope: 'active-block',
      skipActiveBlockRefresh: true,
      transactionId: Date.now(),
    });
  }, [commitCodeValue, jsonSourceDisplayRange, language, renderContext]);

  const commitTextareaValue = useCallback((textarea: HTMLTextAreaElement) => {
    const next = textarea.value;
    resizeCodeTextarea(textarea);
    commitCodeValue(next);
  }, [commitCodeValue]);

  const handleChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (isComposingRef.current) {
      resizeCodeTextarea(event.currentTarget);
      return;
    }
    commitTextareaValue(event.currentTarget);
  }, [commitTextareaValue]);

  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;
    setIsComposing(true);
  }, []);

  const handleCompositionEnd = useCallback((event: React.CompositionEvent<HTMLTextAreaElement>) => {
    isComposingRef.current = false;
    setIsComposing(false);
    commitTextareaValue(event.currentTarget);
  }, [commitTextareaValue]);

  const handlePaste = useCallback((event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (isComposingRef.current) return;
    const pastedText = event.clipboardData.getData('text/plain');
    if (!pastedText) return;
    const textarea = event.currentTarget;
    const nextCode = getTextareaValueAfterPaste(textarea, pastedText);
    const pasteAction = getCodeBlockPasteAction(language, nextCode);
    if (!pasteAction) return;
    event.preventDefault();
    event.stopPropagation();
    if (pasteAction.type === 'code') {
      textarea.value = pasteAction.code;
      textarea.setSelectionRange(pasteAction.code.length, pasteAction.code.length);
      resizeCodeTextareaAcrossFrames(textarea);
      editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if (!$isCodeBlockDecoratorNode(node)) return;
        node.setLanguageAndCode(pasteAction.language, pasteAction.code);
        $addUpdateTag(ISLAND_CODE_BLOCK_UPDATE_TAG);
        $addUpdateTag(HISTORY_PUSH_TAG);
      });
      return;
    }
    let textBlockTarget: EditableTextBlockFocusTarget | null = null;
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if (!$isCodeBlockDecoratorNode(node)) return;
      textBlockTarget = replaceCodeBlockWithPreviewArtifact(
        node,
        pasteAction.artifactKind,
        pasteAction.language,
        pasteAction.code,
        'next',
      );
      $addUpdateTag(HISTORY_PUSH_TAG);
    });
    if (textBlockTarget) focusEditorTextBlock(editor, textBlockTarget);
  }, [editor, language, nodeKey]);

  const clearFocusedTextareaSync = useCallback(() => {
    allowFocusedTextareaSyncRef.current = false;
    if (focusedTextareaSyncTimerRef.current !== null) {
      window.clearTimeout(focusedTextareaSyncTimerRef.current);
      focusedTextareaSyncTimerRef.current = null;
    }
  }, []);

  const requestFocusedTextareaSync = useCallback(() => {
    allowFocusedTextareaSyncRef.current = true;
    if (focusedTextareaSyncTimerRef.current !== null) {
      window.clearTimeout(focusedTextareaSyncTimerRef.current);
    }
    focusedTextareaSyncTimerRef.current = window.setTimeout(clearFocusedTextareaSync, 250);
  }, [clearFocusedTextareaSync]);

  const moveFromCodeBlock = useCallback((direction: 'next' | 'previous') => {
    let didMove = false;
    let codeTextareaTarget: CodeBlockTextareaFocusTarget | null = null;
    let textBlockTarget: EditableTextBlockFocusTarget | null = null;
    const textareaValue = textareaRef.current?.value;
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if (!$isCodeBlockDecoratorNode(node)) return;
      const exitResult = commitCodeBlockExitValue(node, textareaValue ?? node.__code);
      if (exitResult.codeChanged) {
        $addUpdateTag(HISTORY_PUSH_TAG);
      }
      const latestNode = $getNodeByKey(nodeKey);
      if (!$isCodeBlockDecoratorNode(latestNode)) return;
      const adjacentCodeBlock = getCodeBlockAcrossEmptyParagraph(latestNode, direction);
      if (adjacentCodeBlock) {
        codeTextareaTarget = {
          edge: direction === 'next' ? 'start' : 'end',
          nodeKey: adjacentCodeBlock.getKey(),
        };
        didMove = true;
        return;
      }
      textBlockTarget = direction === 'next'
        ? ensureNextEditableTextBlockAfterCodeBlock(latestNode, true)
        : ensurePreviousEditableTextBlockBeforeCodeBlock(latestNode, true);
      didMove = textBlockTarget !== null;
    });
    if (codeTextareaTarget) focusCodeBlockTextarea(editor, codeTextareaTarget);
    else if (textBlockTarget) focusEditorTextBlock(editor, textBlockTarget);
    return didMove;
  }, [editor, nodeKey]);

  const handleBlur = useCallback((event: React.FocusEvent<HTMLTextAreaElement>) => {
    const nextTarget = event.relatedTarget;
    const codeBlockElement = editor.getElementByKey(nodeKey);
    if (nextTarget instanceof Node && codeBlockElement?.contains(nextTarget)) return;
    const textareaValue = event.currentTarget.value;
    resizeCodeTextarea(event.currentTarget);
    if (textareaValue !== initialCode) {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if (!$isCodeBlockDecoratorNode(node)) return;
        const exitResult = commitCodeBlockExitValue(node, textareaValue);
        if (exitResult.codeChanged) {
          $addUpdateTag(HISTORY_PUSH_TAG);
        }
      });
    }
    setHasCodeBlockSelection(false);
    if (!isComposingRef.current) setIsEditingCode(false);
  }, [editor, initialCode, nodeKey]);

  const deleteEmptyCodeBlock = useCallback((direction: 'next' | 'previous') => {
    const textareaValue = textareaRef.current?.value ?? '';
    if (textareaValue.trim().length > 0) return false;
    let didDelete = false;
    let textBlockTarget: EditableTextBlockFocusTarget | null = null;
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if (!$isCodeBlockDecoratorNode(node)) return;
      textBlockTarget = direction === 'previous'
        ? ensurePreviousEditableTextBlockBeforeCodeBlock(node, true)
        : ensureNextEditableTextBlockAfterCodeBlock(node, true);
      node.remove();
      ensureDocumentEditableLandingParagraph();
      didDelete = true;
      $addUpdateTag(HISTORY_PUSH_TAG);
      $addUpdateTag(ISLAND_CODE_BLOCK_STRUCTURE_UPDATE_TAG);
    });
    if (!didDelete) return false;
    setHasCodeBlockSelection(false);
    renderContext?.onSelectCodeBlock(null);
    if (textBlockTarget) focusEditorTextBlock(editor, textBlockTarget);
    return true;
  }, [editor, nodeKey, renderContext]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const nativeEvent = event.nativeEvent as KeyboardEvent;
    if (isComposingRef.current || nativeEvent.isComposing) return;
    if (isPreviewSelectAllShortcut(event)) {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.select();
      const textarea = event.currentTarget;
      window.requestAnimationFrame(() => reportCodeBlockTextareaSelection(textarea));
      return;
    }
    if (isPreviewUndoShortcut(event) || isPreviewRedoShortcut(event)) {
      event.preventDefault();
      event.stopPropagation();
      requestFocusedTextareaSync();
      editor.dispatchCommand(isPreviewUndoShortcut(event) ? UNDO_COMMAND : REDO_COMMAND, undefined);
      return;
    }
    const isPlainDeleteKey =
      (event.key === 'Backspace' || event.key === 'Delete') &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey;
    if (isPlainDeleteKey && event.currentTarget.value.trim().length === 0) {
      const didDelete = deleteEmptyCodeBlock(event.key === 'Backspace' ? 'previous' : 'next');
      if (didDelete) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }
    const isPlainVerticalArrow = !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
    if (isPlainVerticalArrow && event.key === 'ArrowDown') {
      const moveResult = moveTextareaCaretVertically(event.currentTarget, 'down');
      if (moveResult === 'ignored') return;
      event.preventDefault();
      event.stopPropagation();
      if (moveResult === 'boundary') {
        moveFromCodeBlock('next');
      }
      return;
    }
    if (isPlainVerticalArrow && event.key === 'ArrowUp') {
      const moveResult = moveTextareaCaretVertically(event.currentTarget, 'up');
      if (moveResult === 'ignored') return;
      event.preventDefault();
      event.stopPropagation();
      if (moveResult === 'boundary') {
        moveFromCodeBlock('previous');
      }
    }
  }, [deleteEmptyCodeBlock, editor, moveFromCodeBlock, reportCodeBlockTextareaSelection, requestFocusedTextareaSync]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const isTextareaFocused = typeof document !== 'undefined' && document.activeElement === textarea;
    const shouldSyncFocusedTextarea = allowFocusedTextareaSyncRef.current && isTextareaFocused;
    if ((!isTextareaFocused || shouldSyncFocusedTextarea) && !isComposingRef.current && textarea.value !== displayCode) {
      const selectionStart = textarea.selectionStart;
      const selectionEnd = textarea.selectionEnd;
      textarea.value = displayCode;
      if (shouldSyncFocusedTextarea) {
        const nextSelectionStart = Math.min(selectionStart, displayCode.length);
        const nextSelectionEnd = Math.min(selectionEnd, displayCode.length);
        textarea.setSelectionRange(nextSelectionStart, nextSelectionEnd);
      }
    }
    if (shouldSyncFocusedTextarea) {
      clearFocusedTextareaSync();
    }
    resizeCodeTextareaAcrossFrames(textarea);
  }, [clearFocusedTextareaSync, displayCode]);

  const beginCodeEditing = useCallback((edge: 'end' | 'start' = 'end') => {
    pendingTextareaFocusEdgeRef.current = edge;
    setIsEditingCode(true);
  }, []);

  const handleJsonTreeEditRequest = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const edgeAttribute = event.currentTarget.getAttribute('data-code-edit-edge');
    event.currentTarget.removeAttribute('data-code-edit-edge');
    beginCodeEditing(edgeAttribute === 'start' ? 'start' : 'end');
  }, [beginCodeEditing]);

  const handleJsonTreeEditKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    beginCodeEditing(event.key === 'Enter' ? 'end' : 'start');
  }, [beginCodeEditing]);

  useEffect(() => {
    if (!isEditingCode) return;
    const textarea = textareaRef.current;
    if (!textarea) return;
    const edge = pendingTextareaFocusEdgeRef.current ?? 'end';
    pendingTextareaFocusEdgeRef.current = null;
    textarea.focus({ preventScroll: true });
    const offset = edge === 'start' ? 0 : textarea.value.length;
    textarea.setSelectionRange(offset, offset);
    resizeCodeTextareaAcrossFrames(textarea);
  }, [isEditingCode]);

  useEffect(
    () => () => {
      if (focusedTextareaSyncTimerRef.current !== null) {
        window.clearTimeout(focusedTextareaSyncTimerRef.current);
      }
    },
    [],
  );

  return (
    <PreviewArtifactTargetProvider artifactId={artifactId}>
      <div
        ref={codeBlockRootRef}
        contentEditable={false}
        suppressContentEditableWarning
        hidden={isHiddenBySourceRange}
        onPointerDownCapture={handleCodeBlockPointerDownCapture}
        onPointerUpCapture={handleCodeBlockPointerUpCapture}
        onClickCapture={reportCodeBlockSourceLineIfNoSelection}
        {...codeBlockSourceAttributes}
        {...(artifactId ? { 'data-artifact-id': artifactId } : {})}
      >
        {isJson && jsonFormatted?.error && t ? (
          <JsonPreviewBlock
            code={initialCode}
            canEditSource
            diagnostic={jsonDiagnostic}
            fullSource={renderContext.fullSourceRef.current}
            lineOffset={effectiveSourceRange?.startLine ? effectiveSourceRange.startLine : 0}
            onSourceCodeChange={commitCodeValue}
            onSourceDisplayCodeChange={jsonSourceDisplayCode ? commitJsonSourceDisplayValue : undefined}
            sourceDisplayCode={jsonSourceDisplayCode}
            sourceDisplayStartLine={jsonSourceDisplayCode ? jsonSourceDisplayRange?.startLine ?? null : null}
            sourceRange={effectiveSourceRange}
            sourceStartLine={effectiveSourceRange?.startLine ? effectiveSourceRange.startLine + 1 : null}
            sourceLanguage={language || 'json'}
            t={t}
          />
        ) : (
          <CollapsibleArtifactBlock
            label={language || 'code'}
            className={[
              isJson ? 'aad-json-block' : 'aad-code-frame',
              hasCodeBlockSelection || isSelectedCodeBlock ? 'is-selected' : '',
            ].filter(Boolean).join(' ')}
            copyRole={isJson ? 'json-block' : 'code-block'}
            resetKey={`code-editable:${nodeKey}:${language}`}
            expandLabel={t?.expandBlock ?? 'Expand'}
            collapseLabel={t?.collapseBlock ?? 'Collapse'}
            dataAttributes={{ 'data-copy-text': copyText }}
            actions={t ? <BlockHeaderCopyAction contentKind={isJson ? 'json' : 'code'} text={copyText} t={t} /> : undefined}
          >
            <div className={`aad-editable-code-layer ${isJson ? 'has-json-highlight' : ''}`.trim()}>
              {shouldShowJsonTree && t && jsonFormatted?.error === null ? (
                <div
                  className="aad-editable-json-tree"
                  data-code-edit-trigger="true"
                  role="button"
                  tabIndex={0}
                  aria-label="编辑 JSON"
                  title="编辑 JSON"
                  onClick={handleJsonTreeEditRequest}
                  onKeyDown={handleJsonTreeEditKeyDown}
                >
                  <pre className="aad-json-viewer">
                    <code><JsonTreeView key={displayCode} value={jsonFormatted.value} t={t} /></code>
                  </pre>
                </div>
              ) : (
                <>
                  {highlightedJsonLines ? (
                    <pre className="aad-code-block aad-code-highlight-overlay" aria-hidden="true">
                      <code>{highlightedJsonLines}</code>
                    </pre>
                  ) : null}
                  <textarea
                    ref={textareaRef}
                    className={`aad-code-block aad-code-edit-textarea ${isJson ? 'has-json-highlight' : ''} ${isComposing ? 'is-composing' : ''}`.trim()}
                    defaultValue={displayCode}
                    onChange={handleChange}
                    onCompositionStart={handleCompositionStart}
                    onCompositionEnd={handleCompositionEnd}
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                    onKeyUp={handleCodeBlockTextareaSelectionCommit}
                    onPaste={handlePaste}
                    onPointerUp={handleCodeBlockTextareaSelectionCommit}
                    onSelect={handleCodeBlockTextareaSelect}
                    spellCheck={false}
                    autoCapitalize="off"
                    autoComplete="off"
                    autoCorrect="off"
                    style={{
                      width: '100%',
                      minHeight: '3rem',
                      resize: 'none',
                      border: 'none',
                      background: 'transparent',
                      color: 'inherit',
                      fontFamily: 'var(--aad-font-mono)',
                      fontSize: PREVIEW_CODE_FONT_SIZE,
                      lineHeight: PREVIEW_CODE_LINE_HEIGHT,
                      overflowWrap: 'normal',
                      padding: '0',
                      outline: 'none',
                      tabSize: 2,
                      textAlign: 'left',
                      textIndent: 0,
                      whiteSpace: 'pre',
                      wordBreak: 'normal',
                    }}
                  />
                </>
              )}
            </div>
          </CollapsibleArtifactBlock>
        )}
      </div>
    </PreviewArtifactTargetProvider>
  );
};

const toLexicalStyleText = (style?: RichInlineSegment['style']) =>
  serializeMarkdownInlineStyle(sanitizeMarkdownInlineStyle(style));

const parseLexicalStyleText = (styleText: string): RichInlineSegment['style'] => {
  const style: RichInlineSegment['style'] = {};
  String(styleText ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((declaration) => {
      const separatorIndex = declaration.indexOf(':');
      if (separatorIndex <= 0) return;
      const key = declaration.slice(0, separatorIndex).trim().toLowerCase();
      const value = declaration.slice(separatorIndex + 1).trim();
      if (key === 'color') style.color = value;
      if (key === 'font-family') style.fontFamily = value;
      if (key === 'font-size') style.fontSize = value;
      if (key === 'letter-spacing') style.letterSpacing = value;
      if (key === 'line-height') style.lineHeight = value;
    });
  return sanitizeMarkdownInlineStyle(style);
};

const appendRichLineSegments = (
  element: ReturnType<typeof $createParagraphNode>,
  segments: readonly RichInlineSegment[],
) => {
  segments.forEach((segment) => {
    const textNode = $createTextNode(segment.text);
    if (segment.strong) textNode.toggleFormat('bold');
    if (segment.italic) textNode.toggleFormat('italic');
    if (segment.underline) textNode.toggleFormat('underline');
    if (segment.strikethrough) textNode.toggleFormat('strikethrough');
    if (segment.code) textNode.toggleFormat('code');
    if (segment.highlight) textNode.toggleFormat('highlight');
    if (segment.subscript) textNode.toggleFormat('subscript');
    if (segment.superscript) textNode.toggleFormat('superscript');
    const styleText = toLexicalStyleText(segment.style);
    if (styleText) textNode.setStyle(styleText);
    element.append(textNode);
  });
};

const appendRichLines = (
  element: ReturnType<typeof $createParagraphNode>,
  lines: readonly RichInlineSegment[][] = [[]],
) => {
  lines.forEach((segments, index) => {
    if (index > 0) element.append($createLineBreakNode());
    appendRichLineSegments(element, segments);
  });
};

const appendTableCellSegments = (
  paragraph: ReturnType<typeof $createParagraphNode>,
  segments: readonly RichInlineSegment[],
) => {
  appendRichLineSegments(paragraph, segments);
};

const normalizeMarkdownTableAlignments = (
  alignments: readonly string[] | undefined,
  columnCount: number,
) => Array.from({ length: columnCount }, (_, index) => alignments?.[index] ?? 'none');

const createMarkdownTableNode = (
  block: MarkdownIslandBlock,
  tableAlignments?: TableAlignmentRegistry,
) => {
  const tableNode = $createTableNode();
  (block.rows ?? []).forEach((row: any, rowIndex: number) => {
    const rowNode = $createTableRowNode();
    Array.from(
      { length: block.columnCount ?? 0 },
      (_, columnIndex) => row.cells?.[columnIndex] ?? [],
    ).forEach((cellSegments) => {
      const cellNode = $createTableCellNode(
        rowIndex === 0 ? TableCellHeaderStates.COLUMN : TableCellHeaderStates.NO_STATUS,
      );
      const paragraph = $createParagraphNode();
      appendTableCellSegments(paragraph, cellSegments as RichInlineSegment[]);
      cellNode.append(paragraph);
      rowNode.append(cellNode);
    });
    tableNode.append(rowNode);
  });
  const columnCount = Math.max(0, Number(block.columnCount) || 0);
  if (tableAlignments && columnCount > 0) {
    tableAlignments.set(
      tableNode.getKey(),
      normalizeMarkdownTableAlignments(block.alignments, columnCount),
    );
  }
  return tableNode;
};

const appendSourceAnchorToElement = (
  parent: { append: (...nodes: LexicalNode[]) => unknown },
  block: MarkdownIslandBlock,
) => {
  if (!block?.sourceRange) return;
  parent.append($createPreviewSourceAnchorNode({
    artifactId: block.artifactId,
    sourceRange: block.sourceRange,
  }));
};

const appendSourceAnchorToRoot = (block: MarkdownIslandBlock) => {
  appendSourceAnchorToElement($getRoot(), block);
};

const findNextMarkdownContentLineIndex = (lines: readonly string[], startIndex: number) => {
  let index = Math.max(0, startIndex);
  while (index < lines.length && !lines[index]?.trim()) index += 1;
  return index < lines.length ? index : -1;
};

const getMarkdownBlockLinePredicate = (block: MarkdownIslandBlock) => {
  if (block.type === 'quote') return (line: string) => /^\s*>/.test(line);
  if (block.type === 'table') return (line: string) => {
    const trimmed = line.trim();
    return Boolean(trimmed) && trimmed.includes('|');
  };
  if (block.type === 'list') return (line: string) => {
    if (!line.trim()) return false;
    return /^ {0,3}(?:[-+*]\s+|\d+[.)]\s+)/.test(line) || /^\s{2,}\S/.test(line);
  };
  return (line: string) => Boolean(line.trim());
};

const createMarkdownIslandSourceRange = (
  islandSourceRange: SourcePositionRange,
  lines: readonly string[],
  startIndex: number,
  endIndex: number,
): SourcePositionRange => ({
  startLine: islandSourceRange.startLine + startIndex,
  startColumn: startIndex === 0 ? islandSourceRange.startColumn : 1,
  endLine: islandSourceRange.startLine + endIndex,
  endColumn: lines[endIndex] ? lines[endIndex].length + 1 : 1,
});

const inferMarkdownIslandBlockSourceRanges = (
  blocks: readonly MarkdownIslandBlock[],
  islandSource: string | undefined,
  islandSourceRange: SourcePositionRange | null | undefined,
) => {
  if (!islandSourceRange || !islandSource) return blocks;
  const lines = islandSource.split('\n');
  let cursor = 0;
  return blocks.map((block) => {
    if (block?.sourceRange) {
      cursor = Math.max(cursor, block.sourceRange.endLine - islandSourceRange.startLine + 1);
      return block;
    }
    const startIndex = findNextMarkdownContentLineIndex(lines, cursor);
    if (startIndex < 0) return block;
    const belongsToBlock = getMarkdownBlockLinePredicate(block);
    let endIndex = startIndex;
    while (endIndex + 1 < lines.length && belongsToBlock(lines[endIndex + 1] ?? '')) {
      endIndex += 1;
    }
    cursor = endIndex + 1;
    return {
      ...block,
      sourceRange: createMarkdownIslandSourceRange(islandSourceRange, lines, startIndex, endIndex),
    };
  });
};

const normalizeMarkdownListItem = (item: any): {
  children: MarkdownIslandBlock[];
  segments: RichInlineSegment[];
} => {
  if (Array.isArray(item)) return { children: [], segments: item };
  return {
    children: Array.isArray(item?.children) ? item.children : [],
    segments: Array.isArray(item?.segments) ? item.segments : [],
  };
};

const createMarkdownListNode = (block: MarkdownIslandBlock) => {
  const list = $createListNode(block.ordered ? 'number' : 'bullet');
  (block.items ?? []).forEach((rawItem: any) => {
    const item = normalizeMarkdownListItem(rawItem);
    const listItem = $createListItemNode();
    appendRichLines(listItem as any, [item.segments]);
    item.children
      .filter((child) => child?.type === 'list')
      .forEach((child) => {
        listItem.append(createMarkdownListNode(child));
      });
    list.append(listItem);
  });
  return list;
};

const createMarkdownBlockNode = (
  block: MarkdownIslandBlock,
  tableAlignments?: TableAlignmentRegistry,
): LexicalNode => {
  if (block.type === 'heading') {
    const heading = $createHeadingNode(`h${Math.max(1, Math.min(6, block.depth || 1))}` as any);
    appendRichLines(heading as any, [block.segments ?? []]);
    return heading;
  }
  if (block.type === 'quote') {
    const quote = $createQuoteNode();
    appendRichLines(quote as any, block.lines ?? [[]]);
    return quote;
  }
  if (block.type === 'list') {
    return createMarkdownListNode(block);
  }
  if (block.type === 'table') {
    return createMarkdownTableNode(block, tableAlignments);
  }
  const paragraph = $createParagraphNode();
  appendRichLines(paragraph, block.lines ?? [[]]);
  return paragraph;
};

const appendMarkdownBlocksToRoot = (
  blocks: readonly MarkdownIslandBlock[],
  tableAlignments?: TableAlignmentRegistry,
) => {
  const root = $getRoot();
  blocks.forEach((block) => {
    appendSourceAnchorToRoot(block);
    root.append(createMarkdownBlockNode(block, tableAlignments));
  });
};

const ensureDocumentEditableLandingParagraph = () => {
  const root = $getRoot();
  const lastChild = root.getLastChild();
  if (!lastChild || !isPreviewEditableTextBlockNode(lastChild)) {
    root.append($createParagraphNode());
  }
};

const stripFenceWrapper = (source: string): string => {
  const lines = source.split('\n');
  const openingFence = lines[0]?.match(/^ {0,3}(`{3,}|~{3,})/)?.[1] ?? '';
  if (openingFence) lines.shift();
  if (openingFence && lines.length > 0) {
    const fenceChar = openingFence[0] === '~' ? '~' : '`';
    const closePattern = new RegExp(`^ {0,3}\\${fenceChar}{${openingFence.length},}\\s*$`);
    if (closePattern.test(lines[lines.length - 1])) lines.pop();
  }
  return lines.join('\n');
};

const getCodeBlockSourceFormat = (block: Pick<Extract<PreviewMarkdownDocumentBlock, { type: 'code-block' }>, 'source' | 'sourceFormat'>) =>
  block.sourceFormat === 'raw' && !isMornDraftHtmlSource(block.source) ? 'raw' : 'fenced';

const getCodeBlockEditorCode = (
  block: Pick<Extract<PreviewMarkdownDocumentBlock, { type: 'code-block' }>, 'source' | 'sourceFormat'>,
) => (getCodeBlockSourceFormat(block) === 'raw' ? block.source : stripFenceWrapper(block.source));

const getSourceOffsetForLineColumn = (
  source: string,
  line: number,
  column: number,
) => {
  const lines = source.split('\n');
  const targetLine = Math.min(Math.max(1, Math.trunc(line)), Math.max(1, lines.length));
  let offset = 0;
  for (let index = 0; index < targetLine - 1; index += 1) {
    offset += lines[index].length + 1;
  }
  return offset + Math.max(0, Math.trunc(column) - 1);
};

const getSourceRangeText = (
  source: string | undefined,
  range: SourcePositionRange | null | undefined,
) => {
  if (!source || !range) return null;
  const start = getSourceOffsetForLineColumn(source, range.startLine, range.startColumn);
  const end = getSourceOffsetForLineColumn(source, range.endLine, range.endColumn);
  if (end <= start) return null;
  return source.slice(start, end);
};

const createPreviewAiCandidatePatchTarget = (
  source: string | undefined,
  range: SourcePositionRange | null | undefined,
): PreviewAiSelectionCandidatePatchTarget | undefined => {
  if (!source || !range) return undefined;
  const selectedText = getSourceRangeText(source, range);
  if (!selectedText?.trim()) return undefined;
  return {
    selectedText,
    sourceRange: {
      startLine: range.startLine,
      startColumn: range.startColumn,
      endLine: range.endLine,
      endColumn: range.endColumn,
    },
  };
};

const createFullSourcePositionRange = (source: string): SourcePositionRange => {
  const lines = source.split('\n');
  const lastLine = lines[lines.length - 1] ?? '';
  return {
    startLine: 1,
    startColumn: 1,
    endLine: Math.max(1, lines.length),
    endColumn: lastLine.length + 1,
  };
};

const createPreviewAiFullDocumentPatchTarget = (
  source: string | undefined,
): PreviewAiSelectionCandidatePatchTarget | undefined => (
  source?.trim()
    ? createPreviewAiCandidatePatchTarget(source, createFullSourcePositionRange(source))
    : undefined
);

const getReplacementSourceRange = (
  range: SourcePositionRange,
  replacement: string,
): SourcePositionRange => {
  const lines = replacement.split('\n');
  const lastLine = lines[lines.length - 1] ?? '';
  return {
    startLine: range.startLine,
    startColumn: range.startColumn,
    endLine: range.startLine + lines.length - 1,
    endColumn: lines.length === 1 ? range.startColumn + replacement.length : lastLine.length + 1,
  };
};

const normalizePreviewArtifactKindForEditor = (artifactKind: string | null | undefined) => {
  const languageKind = getCodeFenceLanguageKind(artifactKind ?? '');
  if (languageKind === CODE_FENCE_LANGUAGE_KINDS.HTML_PREVIEW) return 'html-preview';
  if (languageKind === CODE_FENCE_LANGUAGE_KINDS.MERMAID) return 'mermaid';
  return artifactKind ?? '';
};

const loadDocumentIntoEditor = (
  blocks: readonly PreviewMarkdownDocumentBlock[],
  tableAlignments?: TableAlignmentRegistry,
) => {
  tableAlignments?.clear();
  const root = $getRoot();
  root.clear();
  blocks.forEach((block) => {
    if (block.type === 'artifact') {
      root.append($createPreviewArtifactNode({
        artifactId: block.artifactId,
        artifactKind: normalizePreviewArtifactKindForEditor(block.artifactKind),
        source: block.source,
        sourceRange: block.sourceRange,
      }));
      return;
    }
    if (block.type === 'code-block') {
      const codeContent = getCodeBlockEditorCode(block);
      root.append($createCodeBlockDecoratorNode(
        block.language || '',
        codeContent,
        block.artifactId,
        getCodeBlockSourceFormat(block),
        block.sourceRange,
      ));
      return;
    }
    appendMarkdownBlocksToRoot(
      inferMarkdownIslandBlockSourceRanges(block.blocks, block.source, block.sourceRange),
      tableAlignments,
    );
  });
  ensureDocumentEditableLandingParagraph();
};

const getSourceRangeKey = (range: SourcePositionRange | null | undefined) => (
  // Editing inside an iframe-backed artifact (e.g. morndraft-flat) shifts the
  // fence's endColumn/endLine, so a full four-tuple key never matches between
  // the block (new range) written by applyArtifactSourceOverrides and the node
  // (stale range) read by serializeEditorDocument. startLine uniquely
  // identifies an artifact and stays stable across in-place edits, matching
  // the key strategy already used by getActiveArtifactUpdateKey.
  range?.startLine ? String(range.startLine) : ''
);

const isIframeBackedPreviewArtifactKind = (artifactKind: string) => {
  const languageKind = getCodeFenceLanguageKind(artifactKind);
  return (
    languageKind === CODE_FENCE_LANGUAGE_KINDS.DOCUMENT_SPEC ||
    languageKind === CODE_FENCE_LANGUAGE_KINDS.HTML_PREVIEW
  );
};

const getActiveArtifactUpdateKey = (
  artifactKind: string,
  sourceRange: SourcePositionRange | null | undefined,
) => {
  if (!sourceRange?.startLine) return '';
  return `${artifactKind || 'code'}:${sourceRange.startLine}`;
};

const sourceRangesEqual = (
  left: SourcePositionRange | null | undefined,
  right: SourcePositionRange | null | undefined,
) => (
  left === right ||
  Boolean(
    left &&
      right &&
      left.startLine === right.startLine &&
      left.startColumn === right.startColumn &&
      left.endLine === right.endLine &&
      left.endColumn === right.endColumn,
  )
);

const sourceRangeContainsBlockingDiagnostic = (
  diagnostics: readonly ArtifactDiagnostic[],
  sourceRange: SourcePositionRange | null | undefined,
) => {
  if (!sourceRange) return false;
  return diagnostics.some((diagnostic) => (
    diagnostic.severity !== 'info' &&
    diagnostic.line &&
    diagnostic.line >= sourceRange.startLine &&
    diagnostic.line <= sourceRange.endLine
  ));
};

const mapDocumentBlockSourceRange = (
  sourceRange: SourcePositionRange | null | undefined,
  sourceLineMap: SourceLineMap,
  diagnostics: readonly ArtifactDiagnostic[],
) => {
  const mappedRange = mapSourcePositionRange(sourceRange ?? null, sourceLineMap);
  if (
    sourceRange &&
    mappedRange &&
    !sourceRangesEqual(sourceRange, mappedRange) &&
    sourceRangeContainsBlockingDiagnostic(diagnostics, sourceRange) &&
    !sourceRangeContainsBlockingDiagnostic(diagnostics, mappedRange)
  ) {
    return sourceRange;
  }
  return mappedRange;
};

const areStringArraysEqual = (left: readonly string[] | undefined, right: readonly string[] | undefined) => {
  if (left === right) return true;
  if (!left || !right || left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
};

const arePreviewRenderDeliveryAccessEqual = (
  left: PreviewRenderDeliveryAccess | undefined,
  right: PreviewRenderDeliveryAccess | undefined,
) => (
  left === right ||
  Boolean(
    left &&
      right &&
      left.accessMode === right.accessMode &&
      left.isDevMode === right.isDevMode &&
      left.isLoading === right.isLoading &&
      left.loginState === right.loginState &&
      left.entitlement?.account_plan === right.entitlement?.account_plan &&
      areStringArraysEqual(left.entitlement?.surfaces, right.entitlement?.surfaces) &&
      areStringArraysEqual(left.entitlement?.entitlements, right.entitlement?.entitlements),
  )
);

const createActiveArtifactUpdateMap = (blocks: readonly PreviewMarkdownDocumentBlock[]) => {
  const updates = new Map<string, PreviewArtifactPayload>();
  blocks.forEach((block) => {
    if (block.type !== 'artifact') return;
    const artifactKind = normalizePreviewArtifactKindForEditor(block.artifactKind);
    const key = getActiveArtifactUpdateKey(artifactKind, block.sourceRange);
    if (!key) return;
    updates.set(key, {
      artifactId: block.artifactId,
      artifactKind,
      source: block.source,
      sourceRange: block.sourceRange,
    });
  });
  return updates;
};

const shouldUpdatePreviewArtifactPayload = (
  artifactKind: string,
  currentSource: string,
  currentSourceRange: SourcePositionRange | null | undefined,
  nextPayload: PreviewArtifactPayload,
) => {
  if (currentSource !== nextPayload.source) return true;
  if (sourceRangesEqual(currentSourceRange, nextPayload.sourceRange)) return false;
  if (currentSourceRange && isIframeBackedPreviewArtifactKind(artifactKind)) return false;
  return true;
};

type CodeBlockSourcePayload = {
  artifactId?: string;
  code: string;
  language: string;
  sourceFormat: 'fenced' | 'raw';
  sourceRange: SourcePositionRange | null;
};

const createActiveCodeBlockSourcePayloads = (blocks: readonly PreviewMarkdownDocumentBlock[]) =>
  blocks.flatMap((block): CodeBlockSourcePayload[] => (
    block.type === 'code-block'
      ? [{
          artifactId: block.artifactId,
          code: getCodeBlockEditorCode(block),
          language: block.language || '',
          sourceFormat: getCodeBlockSourceFormat(block),
          sourceRange: block.sourceRange,
        }]
      : []
  ));

const shouldUpdateCodeBlockSourcePayload = (
  codeBlock: CodeBlockDecoratorNode,
  nextPayload: CodeBlockSourcePayload,
) => {
  if (
    codeBlock.__language !== nextPayload.language ||
    codeBlock.__code !== nextPayload.code ||
    codeBlock.__sourceFormat !== nextPayload.sourceFormat
  ) {
    return true;
  }
  // Updating a preceding fence shifts every later source range. Marking an
  // unchanged iframe-backed DecoratorNode writable for that range-only shift
  // remounts its iframe, so one MornDraft +/- operation appears to rerender the
  // whole document. Keep its payload stable; later edits relocate the current
  // fence against fullSourceRef by content before applying a patch.
  if (codeBlock.__sourceRange && isIframeBackedPreviewArtifactKind(codeBlock.__language)) {
    return false;
  }
  return (
    codeBlock.__artifactId !== (nextPayload.artifactId ?? '') ||
    !sourceRangesEqual(codeBlock.__sourceRange, nextPayload.sourceRange)
  );
};

const findCodeBlockSourcePayloadIndex = (
  payloads: readonly CodeBlockSourcePayload[],
  codeBlock: CodeBlockDecoratorNode,
) => {
  const sourceRangeKey = getSourceRangeKey(codeBlock.__sourceRange);
  if (sourceRangeKey) {
    const rangeIndex = payloads.findIndex((payload) => getSourceRangeKey(payload.sourceRange) === sourceRangeKey);
    if (rangeIndex >= 0) return rangeIndex;
  }
  const exactIndex = payloads.findIndex((payload) => (
    payload.code === codeBlock.__code &&
    payload.language === codeBlock.__language
  ));
  if (exactIndex >= 0) return exactIndex;
  return payloads.findIndex((payload) => payload.code === codeBlock.__code);
};
const applyActiveCodeBlockSourceUpdates = (blocks: readonly PreviewMarkdownDocumentBlock[]) => {
  const payloads = createActiveCodeBlockSourcePayloads(blocks);
  if (payloads.length === 0) return false;
  let changed = false;
  let matchedBlockCount = 0;
  let updatedBlockCount = 0;
  $getRoot().getChildren().forEach((child) => {
    if (!$isCodeBlockDecoratorNode(child) || payloads.length === 0) return;
    const payloadIndex = findCodeBlockSourcePayloadIndex(payloads, child);
    if (payloadIndex < 0) return;
    const [nextPayload] = payloads.splice(payloadIndex, 1);
    matchedBlockCount += 1;
    if (!nextPayload || !shouldUpdateCodeBlockSourcePayload(child, nextPayload)) return;
    child.setPayload(nextPayload);
    updatedBlockCount += 1;
    changed = true;
  });
  debugPreviewLexical('active-code-block-source-update', { blockCount: blocks.length, matchedBlockCount, updatedBlockCount });
  return changed;
};
const applyActiveArtifactSourceUpdates = (blocks: readonly PreviewMarkdownDocumentBlock[]) => {
  const updates = createActiveArtifactUpdateMap(blocks);
  if (updates.size === 0) return false;
  let changed = false;
  const directlyMatchedNodeKeys = new Set<string>();
  $getRoot().getChildren().forEach((child) => {
    if (!$isPreviewArtifactNode(child)) return;
    const key = getActiveArtifactUpdateKey(child.getArtifactKind(), child.getSourceRange());
    const nextPayload = key ? updates.get(key) : null;
    if (!nextPayload) return;
    directlyMatchedNodeKeys.add(child.getKey());
    updates.delete(key);
    if (!shouldUpdatePreviewArtifactPayload(
      child.getArtifactKind(),
      child.getSource(),
      child.getSourceRange(),
      nextPayload,
    )) {
      return;
    }
    child.setPayload(nextPayload);
    changed = true;
  });
  // Fallback: match remaining artifacts by document order and content so
  // slash inserts can refresh both new null ranges and shifted old ranges.
  if (updates.size > 0) {
    $getRoot().getChildren().forEach((child) => {
      if (!$isPreviewArtifactNode(child)) return;
      if (directlyMatchedNodeKeys.has(child.getKey())) return;
      const source = child.getSource();
      if (!source) return;
      for (const [blockKey, payload] of updates) {
        if (payload.artifactKind === child.getArtifactKind() && payload.source === source) {
          updates.delete(blockKey);
          if (shouldUpdatePreviewArtifactPayload(
            child.getArtifactKind(),
            source,
            child.getSourceRange(),
            payload,
          )) {
            child.setPayload(payload);
            changed = true;
          }
          break;
        }
      }
    });
  }
  return changed;
};

const normalizeAiSelectionOccurrenceText = (text: string) =>
  text.replace(/\s+/gu, ' ').trim().toLocaleLowerCase();

const MARKDOWN_PIPE_TABLE_SEPARATOR_PATTERN =
  /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/;
const MARKDOWN_PIPE_TABLE_ROW_PATTERN = /^\s*\|?.+\|.+\|?\s*$/;

const isMarkdownPipeTableText = (value: string) => {
  const lines = value.trim().split(/\r\n|\r|\n/u).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return false;
  const separatorIndex = lines.findIndex((line) => MARKDOWN_PIPE_TABLE_SEPARATOR_PATTERN.test(line));
  if (separatorIndex <= 0) return false;
  const headerLine = lines[separatorIndex - 1] ?? '';
  return MARKDOWN_PIPE_TABLE_ROW_PATTERN.test(headerLine);
};

const isMarkdownPipeTableAiReplacement = (
  replacement: PreviewMarkdownPatchMeta['aiReplacement'],
) => Boolean(
  replacement &&
  (
    isMarkdownPipeTableText(replacement.selectedText) ||
    isMarkdownPipeTableText(replacement.replacement)
  ),
);

const isAiTextNodeReplacementSourceRangeCurrent = (
  source: string,
  replacement: PreviewMarkdownPatchMeta['aiReplacement'],
) => {
  const sourceRange = replacement?.sourceRange;
  if (!replacement || !sourceRange) return false;
  if (
    !Number.isFinite(sourceRange.start) ||
    !Number.isFinite(sourceRange.end) ||
    sourceRange.start < 0 ||
    sourceRange.end <= sourceRange.start ||
    sourceRange.end > source.length
  ) {
    return false;
  }
  return normalizeAiSelectionOccurrenceText(source.slice(sourceRange.start, sourceRange.end)) ===
    normalizeAiSelectionOccurrenceText(replacement.selectedText);
};

const applyAiTextNodeReplacement = (
  replacement: PreviewMarkdownPatchMeta['aiReplacement'],
  source: string,
) => {
  if (!replacement) return false;
  const selectedText = replacement.selectedText.trim();
  const nextText = replacement.replacement.trim();
  if (!selectedText || !nextText) return false;
  if (isMarkdownPipeTableAiReplacement(replacement)) return false;
  if (!isAiTextNodeReplacementSourceRangeCurrent(source, replacement)) return false;
  const matches: Array<{
    index: number;
    node: {
      getTextContent: () => string;
      setTextContent: (text: string) => void;
    };
  }> = [];
  const visit = (node: LexicalNode) => {
    if ($isTextNode(node)) {
      const text = node.getTextContent();
      let searchFrom = 0;
      while (searchFrom < text.length) {
        const index = text.indexOf(selectedText, searchFrom);
        if (index < 0) break;
        matches.push({ node, index });
        searchFrom = index + selectedText.length;
      }
      return;
    }
    if (!$isElementNode(node)) return;
    node.getChildren().forEach(visit);
  };
  $getRoot().getChildren().forEach((child) => {
    if ($isPreviewArtifactNode(child) || child instanceof CodeBlockDecoratorNode) return;
    visit(child);
  });
  if (matches.length !== 1) return false;
  const match = matches[0];
  if (!match) return false;
  const text = match.node.getTextContent();
  match.node.setTextContent(`${text.slice(0, match.index)}${nextText}${text.slice(match.index + selectedText.length)}`);
  return true;
};

const collectMarkdownBlockContentUpdateList = (blocks: readonly PreviewMarkdownDocumentBlock[]) => {
  const updates: MarkdownIslandBlock[] = [];
  blocks.forEach((block) => {
    if (block.type !== 'markdown-island') return;
    inferMarkdownIslandBlockSourceRanges(block.blocks, block.source, block.sourceRange).forEach((markdownBlock) => {
      if (getSourceRangeKey(markdownBlock.sourceRange)) updates.push(markdownBlock);
    });
  });
  return updates;
};

const collectMarkdownBlockContentUpdates = (blocks: readonly PreviewMarkdownDocumentBlock[]) => {
  const updates = new Map<string, MarkdownIslandBlock>();
  collectMarkdownBlockContentUpdateList(blocks).forEach((markdownBlock) => {
    const sourceRangeKey = getSourceRangeKey(markdownBlock.sourceRange);
    if (sourceRangeKey) updates.set(sourceRangeKey, markdownBlock);
  });
  return updates;
};

const shouldRebuildMarkdownTextBlocksWithAnchors = (
  markdownBlocks: readonly MarkdownIslandBlock[],
) => {
  if (markdownBlocks.length === 0) return false;
  const expectedSourceRangeKeys = new Set(
    markdownBlocks.map((block) => getSourceRangeKey(block.sourceRange)).filter(Boolean),
  );
  let pendingAnchor: PreviewSourceAnchorNode | null = null;
  let matchedEditableBlockCount = 0;
  let needsRebuild = false;
  $getRoot().getChildren().forEach((child) => {
    if ($isPreviewSourceAnchorNode(child)) {
      pendingAnchor = child;
      return;
    }
    if (!isPreviewMarkdownBlockContentNode(child)) {
      pendingAnchor = null;
      return;
    }
    if (isEmptyPreviewParagraphNode(child)) {
      pendingAnchor = null;
      return;
    }
    matchedEditableBlockCount += 1;
    const sourceRangeKey = pendingAnchor ? getSourceRangeKey(pendingAnchor.getSourceRange()) : '';
    if (!sourceRangeKey || !expectedSourceRangeKeys.has(sourceRangeKey)) {
      needsRebuild = true;
    }
    pendingAnchor = null;
  });
  return needsRebuild || matchedEditableBlockCount !== markdownBlocks.length;
};

const rebuildMarkdownTextBlocksWithAnchors = (
  markdownBlocks: readonly MarkdownIslandBlock[],
  tableAlignmentsRef: React.MutableRefObject<TableAlignmentRegistry>,
) => {
  if (markdownBlocks.length === 0) return false;
  let markdownBlockIndex = 0;
  let changed = false;
  let pendingAnchor: PreviewSourceAnchorNode | null = null;
  $getRoot().getChildren().forEach((child) => {
    if ($isPreviewSourceAnchorNode(child)) {
      pendingAnchor = child;
      return;
    }
    if (!isPreviewMarkdownBlockContentNode(child)) {
      pendingAnchor = null;
      return;
    }
    if (isEmptyPreviewParagraphNode(child) && markdownBlockIndex >= markdownBlocks.length) {
      pendingAnchor = null;
      return;
    }
    const nextBlock = markdownBlocks[markdownBlockIndex];
    if (!nextBlock) {
      pendingAnchor = null;
      return;
    }
    const nextAnchor = $createPreviewSourceAnchorNode({
      artifactId: nextBlock.artifactId,
      sourceRange: nextBlock.sourceRange ?? null,
    });
    const nextNode = createMarkdownBlockNode(nextBlock, tableAlignmentsRef.current);
    if (pendingAnchor) {
      pendingAnchor.replace(nextAnchor);
    } else {
      child.insertBefore(nextAnchor);
    }
    child.replace(nextNode);
    markdownBlockIndex += 1;
    pendingAnchor = null;
    changed = true;
  });
  return changed;
};

const ensureMarkdownTextBlockSourceAnchors = (
  blocks: readonly PreviewMarkdownDocumentBlock[],
) => {
  const markdownBlocks = collectMarkdownBlockContentUpdateList(blocks);
  if (markdownBlocks.length === 0) return false;
  let markdownBlockIndex = 0;
  let pendingAnchor: PreviewSourceAnchorNode | null = null;
  let changed = false;
  $getRoot().getChildren().forEach((child) => {
    if ($isPreviewSourceAnchorNode(child)) {
      pendingAnchor = child;
      return;
    }
    if (!isPreviewMarkdownBlockContentNode(child)) {
      pendingAnchor = null;
      return;
    }
    if (isEmptyPreviewParagraphNode(child)) {
      pendingAnchor = null;
      return;
    }
    const nextBlock = markdownBlocks[markdownBlockIndex];
    markdownBlockIndex += 1;
    if (!nextBlock?.sourceRange) {
      pendingAnchor = null;
      return;
    }
    const nextAnchorPayload = {
      artifactId: nextBlock.artifactId,
      sourceRange: nextBlock.sourceRange,
    };
    if (!pendingAnchor) {
      child.insertBefore($createPreviewSourceAnchorNode(nextAnchorPayload));
      changed = true;
      return;
    }
    if (!sourceRangesEqual(pendingAnchor.getSourceRange(), nextBlock.sourceRange)) {
      pendingAnchor.replace($createPreviewSourceAnchorNode(nextAnchorPayload));
      changed = true;
    }
    pendingAnchor = null;
  });
  return changed;
};

const applyActiveMarkdownBlockContentUpdates = (
  blocks: readonly PreviewMarkdownDocumentBlock[],
  tableAlignmentsRef: React.MutableRefObject<TableAlignmentRegistry>,
) => {
  const markdownBlocks = collectMarkdownBlockContentUpdateList(blocks);
  if (shouldRebuildMarkdownTextBlocksWithAnchors(markdownBlocks)) {
    return rebuildMarkdownTextBlocksWithAnchors(markdownBlocks, tableAlignmentsRef);
  }
  const updates = collectMarkdownBlockContentUpdates(blocks);
  if (updates.size === 0) return false;
  let changed = false;
  let pendingAnchor: PreviewSourceAnchorNode | null = null;
  $getRoot().getChildren().forEach((child) => {
    if ($isPreviewSourceAnchorNode(child)) {
      pendingAnchor = child;
      return;
    }
    if (!pendingAnchor || !isPreviewMarkdownBlockContentNode(child)) {
      pendingAnchor = null;
      return;
    }
    const sourceRangeKey = getSourceRangeKey(pendingAnchor.getSourceRange());
    const nextBlock = sourceRangeKey ? updates.get(sourceRangeKey) : null;
    if (!nextBlock) {
      pendingAnchor = null;
      return;
    }
    const nextSourceRange = nextBlock.sourceRange ?? null;
    if (!sourceRangesEqual(pendingAnchor.getSourceRange(), nextSourceRange)) {
      pendingAnchor.replace($createPreviewSourceAnchorNode({
        artifactId: nextBlock.artifactId,
        sourceRange: nextSourceRange,
      }));
      changed = true;
    }
    child.replace(createMarkdownBlockNode(nextBlock, tableAlignmentsRef.current));
    updates.delete(sourceRangeKey);
    changed = true;
    pendingAnchor = null;
  });
  return changed;
};

const applyActiveDocumentBlockSourceUpdates = (
  blocks: readonly PreviewMarkdownDocumentBlock[],
  options?: {
    aiReplacement?: PreviewMarkdownPatchMeta['aiReplacement'];
    refreshMarkdownTextBlocks?: boolean;
    source?: string;
    tableAlignmentsRef?: React.MutableRefObject<TableAlignmentRegistry>;
  },
) => {
  let markdownChanged = false;
  markdownChanged = ensureMarkdownTextBlockSourceAnchors(blocks);
  if (options?.refreshMarkdownTextBlocks) {
    const aiReplacementChanged = applyAiTextNodeReplacement(options.aiReplacement, options.source ?? '');
    markdownChanged = aiReplacementChanged || markdownChanged;
    if (!aiReplacementChanged && options.tableAlignmentsRef) {
      markdownChanged = applyActiveMarkdownBlockContentUpdates(blocks, options.tableAlignmentsRef) || markdownChanged;
    }
  }
  const artifactChanged = applyActiveArtifactSourceUpdates(blocks);
  const codeBlockChanged = applyActiveCodeBlockSourceUpdates(blocks);
  return markdownChanged || artifactChanged || codeBlockChanged;
};

const editorHasArtifactWithoutSourceRange = () => (
  $getRoot().getChildren().some((child) => (
    $isPreviewArtifactNode(child) &&
    !child.getSourceRange()
  ))
);

const collectRichSegmentsFromNode = (node: any): RichInlineSegment[] => {
  if ($isTextNode(node)) {
    const text = node.getTextContent();
    if (!text) return [];
    return [{
      code: node.hasFormat('code') || undefined,
      highlight: node.hasFormat('highlight') || undefined,
      italic: node.hasFormat('italic'),
      strikethrough: node.hasFormat('strikethrough') || undefined,
      strong: node.hasFormat('bold'),
      subscript: node.hasFormat('subscript') || undefined,
      superscript: node.hasFormat('superscript') || undefined,
      underline: node.hasFormat('underline') || undefined,
      style: parseLexicalStyleText(node.getStyle()),
      text,
    }];
  }
  if (!$isElementNode(node)) return [];
  return node.getChildren().flatMap((child) => collectRichSegmentsFromNode(child));
};

const collectRichLinesFromElement = (node: any): RichInlineSegment[][] => {
  const lines: RichInlineSegment[][] = [[]];
  if (!$isElementNode(node)) return lines;
  node.getChildren().forEach((child) => {
    if ($isLineBreakNode(child)) {
      lines.push([]);
      return;
    }
    lines[lines.length - 1].push(...collectRichSegmentsFromNode(child));
  });
  return lines;
};

const collectDirectRichSegmentsFromNode = (node: any): RichInlineSegment[] => {
  if ($isListNode(node)) return [];
  if ($isTextNode(node)) return collectRichSegmentsFromNode(node);
  if (!$isElementNode(node)) return [];
  return node.getChildren().flatMap((child) => collectDirectRichSegmentsFromNode(child));
};

const collectDirectRichLinesFromElement = (node: any): RichInlineSegment[][] => {
  const lines: RichInlineSegment[][] = [[]];
  if (!$isElementNode(node)) return lines;
  node.getChildren().forEach((child) => {
    if ($isListNode(child)) return;
    if ($isLineBreakNode(child)) {
      lines.push([]);
      return;
    }
    lines[lines.length - 1].push(...collectDirectRichSegmentsFromNode(child));
  });
  return lines;
};

const serializeEditorTable = (
  tableNode: TableNode,
  tableAlignments?: TableAlignmentRegistry,
  tableKeys?: Set<string>,
): MarkdownIslandBlock => {
  const rows = tableNode
    .getChildren()
    .filter($isTableRowNode)
    .map((rowNode, rowIndex) => ({
      cells: rowNode
        .getChildren()
        .filter($isTableCellNode)
        .map((cellNode) => collectRichSegmentsFromNode(cellNode)),
      header: rowIndex === 0,
    }));
  const columnCount = Math.max(0, ...rows.map((row) => row.cells.length));
  const tableKey = tableNode.getKey();
  tableKeys?.add(tableKey);
  const alignments = normalizeMarkdownTableAlignments(
    tableAlignments?.get(tableKey),
    columnCount,
  );
  tableAlignments?.set(tableKey, alignments);
  return {
    type: 'table',
    alignments,
    columnCount,
    rows,
  };
};

const serializeEditorList = (listNode: ListNode): MarkdownIslandBlock => ({
  type: 'list',
  ordered: listNode.getListType() === 'number',
  items: listNode
    .getChildren()
    .filter($isListItemNode)
    .map((item) => {
      const children = item
        .getChildren()
        .filter($isListNode)
        .map(serializeEditorList);
      return {
        ...(children.length > 0 ? { children } : {}),
        segments: collectDirectRichLinesFromElement(item).flat(),
      };
    }),
});

const serializeEditorMarkdownBlock = (
  child: any,
  tableAlignments?: TableAlignmentRegistry,
  tableKeys?: Set<string>,
): MarkdownIslandBlock | null => {
  if ($isHeadingNode(child)) {
    const tag = child.getTag();
    return {
      type: 'heading',
      depth: Number(tag.replace('h', '')) || 1,
      segments: collectRichLinesFromElement(child)[0] ?? [],
    };
  }
  if ($isQuoteNode(child)) {
    return {
      type: 'quote',
      lines: collectRichLinesFromElement(child),
    };
  }
  if ($isListNode(child)) {
    return serializeEditorList(child);
  }
  if ($isTableNode(child)) {
    return serializeEditorTable(child, tableAlignments, tableKeys);
  }
  if ($isParagraphNode(child)) {
    return {
      type: 'paragraph',
      lines: collectRichLinesFromElement(child),
    };
  }
  if ($isElementNode(child)) {
    return {
      type: 'paragraph',
      lines: collectRichLinesFromElement(child),
    };
  }
  return null;
};

const serializeEditorDocument = (
  sourceOverrides?: ArtifactSourceOverrideMap,
  tableAlignments?: TableAlignmentRegistry,
) => {
  const chunks: string[] = [];
  let markdownBlocks: MarkdownIslandBlock[] = [];
  const tableKeys = tableAlignments ? new Set<string>() : undefined;
  const flushMarkdown = () => {
    const markdown = serializeMarkdownIsland(markdownBlocks);
    if (markdown) chunks.push(markdown);
    markdownBlocks = [];
  };

  $getRoot().getChildren().forEach((child) => {
    if ($isPreviewSourceAnchorNode(child)) return;
    if ($isFinalSlashAiInlineDraftNode(child)) return;
    if ($isPreviewArtifactNode(child)) {
      flushMarkdown();
      const source = resolveArtifactSourceOverride(sourceOverrides, child.getKey(), child.getSourceRange(), child.getSource());
      if (source) chunks.push(source);
      return;
    }
    if ($isCodeBlockDecoratorNode(child)) {
      flushMarkdown();
      const language = child.__language || '';
      const textContent = child.__code;
      chunks.push(child.__sourceFormat === 'raw' && !isMornDraftHtmlSource(textContent) ? textContent : `\`\`\`${language}\n${textContent}\n\`\`\``);
      return;
    }
    const markdownBlock = serializeEditorMarkdownBlock(child, tableAlignments, tableKeys);
    if (markdownBlock) markdownBlocks.push(markdownBlock);
  });
  flushMarkdown();
  if (tableAlignments && tableKeys) {
    Array.from(tableAlignments.keys()).forEach((tableKey) => {
      if (!tableKeys.has(tableKey)) tableAlignments.delete(tableKey);
    });
  }
  return chunks.filter((chunk) => chunk.trim().length > 0).join('\n\n');
};

const PREVIEW_TEXT_FORMAT_TO_LEXICAL = {
  bold: 'bold',
  highlight: 'highlight',
  inlineCode: 'code',
  italic: 'italic',
  strikethrough: 'strikethrough',
  subscript: 'subscript',
  superscript: 'superscript',
  underline: 'underline',
} satisfies Record<PreviewMarkdownTextFormat, TextFormatType>;

const createDefaultActiveTextFormats = (): Record<PreviewMarkdownTextFormat, boolean> => ({
  bold: false,
  highlight: false,
  inlineCode: false,
  italic: false,
  strikethrough: false,
  subscript: false,
  superscript: false,
  underline: false,
});

const getActiveTextFormats = (selection: ReturnType<typeof $getSelection>) => {
  const activeFormats = createDefaultActiveTextFormats();
  if (!$isRangeSelection(selection)) return activeFormats;
  (Object.entries(PREVIEW_TEXT_FORMAT_TO_LEXICAL) as Array<[PreviewMarkdownTextFormat, TextFormatType]>)
    .forEach(([format, lexicalFormat]) => {
      activeFormats[format] = selection.hasFormat(lexicalFormat);
    });
  return activeFormats;
};

const findAncestor = (node: any, predicate: (node: any) => boolean) => {
  let current = node;
  while (current) {
    if (predicate(current)) return current;
    current = typeof current.getParent === 'function' ? current.getParent() : null;
  }
  return null;
};

const isPreviewEditableTextBlockNode = (node: LexicalNode | null | undefined) =>
  $isParagraphNode(node) ||
  $isHeadingNode(node) ||
  $isQuoteNode(node) ||
  $isListNode(node);

const isPreviewMarkdownBlockContentNode = (node: LexicalNode | null | undefined) =>
  isPreviewEditableTextBlockNode(node) ||
  $isTableNode(node);

const isEmptyPreviewParagraphNode = (node: LexicalNode | null | undefined) =>
  $isParagraphNode(node) && node.getTextContent().trim().length === 0;

const getCodeBlockAcrossEmptyParagraph = (
  node: LexicalNode,
  direction: 'next' | 'previous',
) => {
  const adjacentNode = direction === 'next' ? node.getNextSibling() : node.getPreviousSibling();
  if ($isCodeBlockDecoratorNode(adjacentNode)) return adjacentNode;
  if (!isEmptyPreviewParagraphNode(adjacentNode)) return null;
  const beyondEmptyParagraph = direction === 'next'
    ? adjacentNode.getNextSibling()
    : adjacentNode.getPreviousSibling();
  return $isCodeBlockDecoratorNode(beyondEmptyParagraph) ? beyondEmptyParagraph : null;
};

const selectEditableTextBlockEdge = (
  node: LexicalNode | null | undefined,
  edge: 'start' | 'end',
) => {
  if (!isPreviewEditableTextBlockNode(node) || !$isElementNode(node)) return false;
  if (edge === 'start') node.selectStart();
  else node.selectEnd();
  return true;
};

const selectDocumentLandingParagraph = () => {
  const lastChild = $getRoot().getLastChild();
  if (selectEditableTextBlockEdge(lastChild, 'start')) return true;
  ensureDocumentEditableLandingParagraph();
  return selectEditableTextBlockEdge($getRoot().getLastChild(), 'start');
};

const selectDocumentTopLanding = () => {
  const children = $getRoot().getChildren();
  const firstEditableChild = children.find((child) => isPreviewEditableTextBlockNode(child));
  if (selectEditableTextBlockEdge(firstEditableChild, 'start')) return true;
  let lastEditableChild: LexicalNode | null = null;
  for (let index = children.length - 1; index >= 0; index -= 1) {
    const child = children[index];
    if (isPreviewEditableTextBlockNode(child)) {
      lastEditableChild = child;
      break;
    }
  }
  return selectEditableTextBlockEdge(lastEditableChild, 'start');
};

type EditableTextBlockFocusTarget = {
  edge: 'end' | 'start';
  nodeKey: string;
};

const selectEditableTextBlockFocusTarget = (target: EditableTextBlockFocusTarget) =>
  selectEditableTextBlockEdge($getNodeByKey(target.nodeKey), target.edge);

const ensureNextEditableTextBlockAfterCodeBlock = (
  codeBlockNode: CodeBlockDecoratorNode,
  createIfMissing: boolean,
): EditableTextBlockFocusTarget | null => {
  const nextSibling = codeBlockNode.getNextSibling();
  if (isPreviewEditableTextBlockNode(nextSibling)) return { edge: 'start', nodeKey: nextSibling.getKey() };
  if (!createIfMissing) return null;
  const trailingParagraph = $createParagraphNode();
  codeBlockNode.insertAfter(trailingParagraph);
  return { edge: 'start', nodeKey: trailingParagraph.getKey() };
};

const selectNextEditableTextBlockAfterCodeBlock = (
  codeBlockNode: CodeBlockDecoratorNode,
  createIfMissing: boolean,
) => {
  const target = ensureNextEditableTextBlockAfterCodeBlock(codeBlockNode, createIfMissing);
  return target ? selectEditableTextBlockFocusTarget(target) : false;
};

const ensurePreviousEditableTextBlockBeforeCodeBlock = (
  codeBlockNode: CodeBlockDecoratorNode,
  createIfMissing: boolean,
): EditableTextBlockFocusTarget | null => {
  const previousSibling = codeBlockNode.getPreviousSibling();
  if (isPreviewEditableTextBlockNode(previousSibling)) return { edge: 'end', nodeKey: previousSibling.getKey() };
  if (!createIfMissing) return null;
  const leadingParagraph = $createParagraphNode();
  codeBlockNode.insertBefore(leadingParagraph);
  return { edge: 'end', nodeKey: leadingParagraph.getKey() };
};

type CodeBlockTextareaFocusTarget = {
  edge: 'end' | 'start';
  nodeKey: string;
};

type TextBlockCodeNavigationTarget =
  | {
      block: LexicalNode;
      edge: 'end' | 'start';
      type: 'select-text-edge';
    }
  | {
      target: CodeBlockTextareaFocusTarget;
      type: 'focus-code';
    };

const getRootLevelEditableTextBlock = (node: LexicalNode | null | undefined) => {
  const root = $getRoot();
  let current = node;
  while (current && current.getParent() !== root) {
    current = current.getParent();
  }
  return isPreviewEditableTextBlockNode(current) ? current : null;
};

const selectTopEditableTextBlock = () => {
  const target = $getRoot().getChildren().find(isPreviewEditableTextBlockNode);
  return selectEditableTextBlockEdge(target, 'start');
};

const selectRootEndEditableTextBlock = () => {
  const target = [...$getRoot().getChildren()].reverse().find(isPreviewEditableTextBlockNode);
  return selectEditableTextBlockEdge(target, 'end');
};

const getFinalSlashCommandCandidate = (finalSlashAiEnabled = FINAL_SLASH_AI_ENABLED): FinalSlashCommandCandidate | null => {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return null;
  const block = getRootLevelEditableTextBlock(selection.anchor.getNode());
  if (!$isParagraphNode(block)) return null;
  const text = block.getTextContent();
  if (!text.startsWith('/')) return null;
  const aiInstruction = finalSlashAiEnabled ? readFinalSlashAiInstruction(text) : null;
  const isAiCommand = aiInstruction !== null;
  if (text.length > (isAiCommand ? FINAL_SLASH_AI_COMMAND_MAX_LENGTH : FINAL_SLASH_COMMAND_MAX_LENGTH)) return null;
  const instruction = isAiCommand ? aiInstruction : text.slice(1).trim();
  return {
    blockKey: block.getKey(),
    instruction,
    isAiCommand,
    query: isAiCommand ? '' : instruction.toLocaleLowerCase(),
    slashText: text,
  };
};

const beginFinalAiInstructionComposerDraft = (
  editor: LexicalEditor,
  expectedSlashText: string,
  tableAlignments: TableAlignmentRegistry,
) => {
  const draftId = createFinalSlashAiDraftId();
  let draft: FinalSlashAiComposerDraft | null = null;
  editor.update(() => {
    const selection = $getSelection();
    const selectedBlock = $isRangeSelection(selection)
      ? getRootLevelEditableTextBlock(selection.anchor.getNode())
      : null;
    if (!$isParagraphNode(selectedBlock) || selectedBlock.getTextContent() !== expectedSlashText) return;
    const parsedInstruction = readFinalSlashAiInstruction(expectedSlashText);
    const instruction = parsedInstruction ?? '';
    const sourceSlashText = expectedSlashText.trim() === '/' || parsedInstruction !== null
      ? FINAL_SLASH_AI_COMMAND_TEXT.trim()
      : expectedSlashText;
    const marker = `\uE000morndraft-ai-insert-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}\uE001`;
    $addUpdateTag(HISTORY_PUSH_TAG);
    $addUpdateTag(ISLAND_SLASH_AI_DRAFT_UPDATE_TAG);
    $addUpdateTag(SKIP_DOM_SELECTION_TAG);
    $addUpdateTag(SKIP_SCROLL_INTO_VIEW_TAG);
    selectedBlock.clear();
    selectedBlock.append($createTextNode(sourceSlashText), $createTextNode(marker));
    const sourceWithMarker = serializeEditorDocument(undefined, tableAlignments);
    const markerOffset = sourceWithMarker.indexOf(marker);
    selectedBlock.clear();
    selectedBlock.append($createTextNode(sourceSlashText));
    selectedBlock.selectEnd();
    const source = serializeEditorDocument(undefined, tableAlignments);
    const markerEndOffset = markerOffset >= 0 ? Math.min(markerOffset, source.length) : -1;
    const markerStartOffset = markerEndOffset >= sourceSlashText.length ? markerEndOffset - sourceSlashText.length : -1;
    const resolvedRange = markerStartOffset >= 0
      ? {
          start: markerStartOffset,
          end: markerEndOffset,
          startLine: getSourceLineForOffset(source, markerStartOffset),
          endLine: getSourceLineForOffset(source, markerEndOffset),
        }
      : resolveSlashInstructionSourceRange({
          allowSlashOnly: true,
          instruction,
          slashText: sourceSlashText,
          source,
        });
    if (!resolvedRange) return;
    const inlineDraftNode = $createFinalSlashAiInlineDraftNode(null);
    selectedBlock.insertAfter(inlineDraftNode);
    draft = {
      blockKey: selectedBlock.getKey(),
      draftId,
      inlineNodeKey: inlineDraftNode.getKey(),
      insertRange: {
        start: resolvedRange.start,
        end: resolvedRange.start,
      },
      instruction,
      replaceRange: {
        start: resolvedRange.start,
        end: resolvedRange.end,
      },
      source,
      sourceLineRange: {
        startLine: resolvedRange.startLine,
        endLine: resolvedRange.endLine,
      },
      sourceVersion: createPreviewAiInstructionSourceVersion(source),
      slashText: sourceSlashText,
    };
  });
  return draft;
};

const countSourceOccurrencesBefore = (source: string, needle: string, endOffset: number) => {
  if (!needle) return 0;
  let count = 0;
  let index = source.indexOf(needle);
  while (index >= 0 && index < endOffset) {
    count += 1;
    index = source.indexOf(needle, index + needle.length);
  }
  return count;
};

const restoreFinalAiInstructionComposerDraft = (
  editor: LexicalEditor,
  session: PreviewAiInstructionSessionSnapshot,
  source: string,
) => {
  if (session.sourceVersion !== createPreviewAiInstructionSourceVersion(source)) return null;
  if (source.slice(session.replaceRange.start, session.replaceRange.end) !== session.slashText) return null;
  const occurrenceIndex = Math.max(0, countSourceOccurrencesBefore(source, session.slashText, session.replaceRange.start));
  let draft: FinalSlashAiComposerDraft | null = null;
  editor.update(() => {
    const root = $getRoot();
    const matchingParagraphs = root.getChildren()
      .filter((node): node is ParagraphNode => (
        $isParagraphNode(node) &&
        node.getTextContent() === session.slashText
      ));
    const selectedBlock = matchingParagraphs[Math.min(occurrenceIndex, matchingParagraphs.length - 1)] ?? null;
    if (!selectedBlock) return;
    let inlineNode = selectedBlock.getNextSibling();
    if (!$isFinalSlashAiInlineDraftNode(inlineNode)) {
      inlineNode = $createFinalSlashAiInlineDraftNode(null);
      selectedBlock.insertAfter(inlineNode);
    }
    draft = {
      blockKey: selectedBlock.getKey(),
      draftId: session.sessionId,
      inlineNodeKey: inlineNode.getKey(),
      insertRange: session.insertRange,
      instruction: session.instruction,
      replaceRange: session.replaceRange,
      sessionId: session.sessionId,
      source,
      sourceLineRange: session.sourceLineRange,
      sourceVersion: session.sourceVersion,
      slashText: session.slashText,
    };
  });
  return draft;
};

const removeFinalSlashAiInlineDraftNode = (
  editor: LexicalEditor,
  composer: FinalSlashAiComposerDraft | null,
  options: { restoreCaret?: boolean } = {},
) => {
  if (!composer) return;
  editor.update(() => {
    const inlineNode = $getNodeByKey(composer.inlineNodeKey);
    if ($isFinalSlashAiInlineDraftNode(inlineNode)) {
      $addUpdateTag(ISLAND_SLASH_AI_DRAFT_UPDATE_TAG);
      inlineNode.remove();
    }
    if (!options.restoreCaret) return;
    const commandNode = $getNodeByKey(composer.blockKey);
    if ($isParagraphNode(commandNode) && commandNode.getTextContent() === composer.slashText) {
      $addUpdateTag(SKIP_SCROLL_INTO_VIEW_TAG);
      commandNode.selectEnd();
    }
  });
  if (options.restoreCaret) {
    window.requestAnimationFrame(() => {
      editor.getRootElement()?.focus({ preventScroll: true });
    });
  }
};

const spliceAiInstructionMarkdown = (
  source: string,
  range: { end: number; start: number },
  markdown: string,
) => {
  const replacement = markdown.trim();
  if (!replacement) return '';
  const before = source.slice(0, range.start).replace(/[ \t]+$/u, '');
  const after = source.slice(range.end).replace(/^[ \t]+/u, '');
  const prefix = before.length === 0
    ? ''
    : before.endsWith('\n\n')
      ? before
      : before.endsWith('\n')
        ? `${before}\n`
        : `${before}\n\n`;
  const suffix = after.length === 0
    ? ''
    : after.startsWith('\n\n')
      ? after
      : after.startsWith('\n')
        ? `\n${after}`
        : `\n\n${after}`;
  return `${prefix}${replacement}${suffix}`;
};

const insertFinalArtifactCommand = (
  editor: LexicalEditor,
  source: string,
  artifactKind: string,
) => {
  let insertedArtifactNodeKey: string | null = null;
  debugPreviewLexical('slash-insert-start', {
    artifactKind,
    sourceLength: source.length,
  });
  editor.update(() => {
    $addUpdateTag(HISTORY_PUSH_TAG);
    $addUpdateTag(SKIP_DOM_SELECTION_TAG);
    $addUpdateTag(SKIP_SCROLL_INTO_VIEW_TAG);
    const root = $getRoot();
    const selection = $getSelection();
    const selectedBlock = $isRangeSelection(selection)
      ? getRootLevelEditableTextBlock(selection.anchor.getNode())
      : null;
    const shouldReplaceSlashParagraph = $isParagraphNode(selectedBlock) &&
      selectedBlock.getTextContent().startsWith('/');
    const artifactNode = $createPreviewArtifactNode({
      artifactKind,
      source,
      sourceRange: null,
    });
    insertedArtifactNodeKey = artifactNode.getKey();
    const trailingParagraph = $createParagraphNode();
    if (shouldReplaceSlashParagraph) {
      selectedBlock.replace(artifactNode);
    } else if (selectedBlock) {
      selectedBlock.insertAfter(artifactNode);
    } else {
      root.append(artifactNode);
    }
    artifactNode.insertAfter(trailingParagraph);
    trailingParagraph.selectStart();
  });
  debugPreviewLexical('slash-insert-committed', {
    artifactKind,
    nodeKey: insertedArtifactNodeKey,
    sourceLength: source.length,
  });
  window.requestAnimationFrame(() => {
    editor.getRootElement()?.focus({ preventScroll: true });
    centerPreviewNodeHeaderInScroll(editor, insertedArtifactNodeKey);
  });
};

const insertFinalAiInstructionMarkdown = ({
  editor,
  markdown,
  range,
  source,
  tableAlignments,
}: {
  editor: LexicalEditor;
  markdown: string;
  range: { end: number; start: number };
  source: string;
  tableAlignments: TableAlignmentRegistry;
}) => {
  const nextSource = spliceAiInstructionMarkdown(source, range, markdown);
  if (!nextSource.trim()) return false;
  const parsed = parsePreviewMarkdownDocument(nextSource);
  if (!parsed.ok) return false;
  const blocks = parsed.blocks as readonly PreviewMarkdownDocumentBlock[];
  editor.update(() => {
    $addUpdateTag(HISTORY_PUSH_TAG);
    $addUpdateTag(ISLAND_AI_INSERT_UPDATE_TAG);
    $addUpdateTag(SKIP_SCROLL_INTO_VIEW_TAG);
    loadDocumentIntoEditor(blocks, tableAlignments);
    selectDocumentLandingParagraph();
  });
  window.requestAnimationFrame(() => {
    editor.getRootElement()?.focus({ preventScroll: true });
  });
  return true;
};

type FinalInsertTableGridSelection = {
  columns: number;
  rows: number;
};

const clampFinalInsertTableGridDimension = (value: number, max: number) =>
  Math.min(Math.max(Math.round(value) || 1, 1), Math.max(1, max));

const clampFinalInsertTableGridSelection = (
  selection: FinalInsertTableGridSelection,
  grid: FinalInsertTableGrid,
): FinalInsertTableGridSelection => ({
  columns: clampFinalInsertTableGridDimension(selection.columns, grid.maxColumns),
  rows: clampFinalInsertTableGridDimension(selection.rows, grid.maxRows),
});

const getDefaultFinalInsertTableGridSelection = (
  grid: FinalInsertTableGrid,
): FinalInsertTableGridSelection => clampFinalInsertTableGridSelection({
  columns: grid.defaultColumns,
  rows: grid.defaultRows,
}, grid);

const createFinalInsertMarkdownTableBlock = (
  selection: FinalInsertTableGridSelection,
): MarkdownIslandBlock => ({
  type: 'table',
  alignments: Array.from({ length: selection.columns }, () => 'none'),
  columnCount: selection.columns,
  rows: Array.from({ length: selection.rows }, (_, rowIndex) => ({
    cells: Array.from({ length: selection.columns }, () => []),
    header: rowIndex === 0,
  })),
});

const insertFinalTableGridCommand = (
  editor: LexicalEditor,
  grid: FinalInsertTableGrid,
  selection: FinalInsertTableGridSelection,
) => {
  const tableSelection = clampFinalInsertTableGridSelection(selection, grid);
  let insertedTableNodeKey: string | null = null;
  debugPreviewLexical('slash-table-insert-start', tableSelection);
  editor.update(() => {
    $addUpdateTag(HISTORY_PUSH_TAG);
    $addUpdateTag(ISLAND_TABLE_SHORTCUT_UPDATE_TAG);
    $addUpdateTag(SKIP_SCROLL_INTO_VIEW_TAG);
    const root = $getRoot();
    const selected = $getSelection();
    const selectedBlock = $isRangeSelection(selected)
      ? getRootLevelEditableTextBlock(selected.anchor.getNode())
      : null;
    const shouldReplaceSlashParagraph = $isParagraphNode(selectedBlock) &&
      selectedBlock.getTextContent().startsWith('/');
    const tableNode = createMarkdownTableNode(createFinalInsertMarkdownTableBlock(tableSelection));
    insertedTableNodeKey = tableNode.getKey();
    const trailingParagraph = $createParagraphNode();
    if (shouldReplaceSlashParagraph) {
      selectedBlock.replace(tableNode);
    } else if (selectedBlock) {
      selectedBlock.insertAfter(tableNode);
    } else {
      root.append(tableNode);
    }
    tableNode.insertAfter(trailingParagraph);
    const firstRow = tableNode.getFirstChild();
    if ($isTableRowNode(firstRow)) {
      selectFirstTableRowCellStart(firstRow);
    }
  });
  debugPreviewLexical('slash-table-insert-committed', {
    ...tableSelection,
    nodeKey: insertedTableNodeKey,
  });
  window.requestAnimationFrame(() => {
    editor.getRootElement()?.focus({ preventScroll: true });
    const tableElement = insertedTableNodeKey ? editor.getElementByKey(insertedTableNodeKey) : null;
    tableElement?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
};

const getFinalInsertLayoutDecision = (
  deliveryAccess: PreviewRenderDeliveryAccess | undefined,
  t: ArtifactPreviewTranslations,
  layout: string | null | undefined,
  variant: string | null | undefined,
) => getMornDraftFlatLayoutDecision(deliveryAccess, t, layout, variant);

const FINAL_INSERT_SLASH_MENU_GAP_PX = 6;
const FINAL_INSERT_SLASH_MENU_MARGIN_PX = 12;
const FINAL_INSERT_SLASH_MENU_MAX_HEIGHT_PX = 520;
const FINAL_INSERT_SLASH_MENU_MIN_HEIGHT_PX = 96;
const FINAL_INSERT_SLASH_MENU_PREFERRED_MIN_HEIGHT_PX = 260;

type FinalInsertMenuPlacement = 'above' | 'below';
type FinalInsertMenuLayout = {
  maxHeight: number;
  placement: FinalInsertMenuPlacement;
  top: number;
};
type FinalInsertMenuNavigationMode = 'keyboard' | 'pointer';

const getPreviewScrollContainerForElement = (element: HTMLElement) => {
  const explicitContainer = element.closest<HTMLElement>('.aad-preview-scroll');
  if (explicitContainer) return explicitContainer;

  let current = element.parentElement;
  while (current) {
    const style = window.getComputedStyle(current);
    if (
      current.scrollHeight > current.clientHeight &&
      (style.overflowY === 'auto' || style.overflowY === 'scroll')
    ) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
};

const DEFAULT_FINAL_INSERT_MENU_LAYOUT: FinalInsertMenuLayout = {
  maxHeight: FINAL_INSERT_SLASH_MENU_MAX_HEIGHT_PX,
  placement: 'below',
  top: 0,
};

const getFinalInsertMenuTargetRect = (
  rootElement: HTMLElement,
  targetElement: HTMLElement | null,
) => {
  const selection = rootElement.ownerDocument.getSelection();
  if (selection?.rangeCount) {
    const range = selection.getRangeAt(0);
    if (range.collapsed && rootElement.contains(range.startContainer)) {
      const rangeRect = range.getBoundingClientRect();
      if (rangeRect.top !== 0 || rangeRect.bottom !== 0 || rangeRect.height !== 0) return rangeRect;
    }
  }
  return targetElement?.getBoundingClientRect() ?? rootElement.getBoundingClientRect();
};

const getFinalInsertMenuLayout = (editor: LexicalEditor, blockKey: string | null): FinalInsertMenuLayout => {
  const rootElement = editor.getRootElement();
  if (!rootElement) return DEFAULT_FINAL_INSERT_MENU_LAYOUT;
  const targetElement = blockKey ? editor.getElementByKey(blockKey) : null;
  const menuContainer = rootElement.closest<HTMLElement>('.aad-markdown-lexical-island') ?? rootElement;
  const scrollContainer = getPreviewScrollContainerForElement(rootElement);
  const containerRect = menuContainer.getBoundingClientRect();
  const targetRect = getFinalInsertMenuTargetRect(rootElement, targetElement);
  const scrollRect = scrollContainer?.getBoundingClientRect() ?? {
    bottom: window.innerHeight,
    top: 0,
  };
  const availableBelow = scrollRect.bottom - targetRect.bottom - FINAL_INSERT_SLASH_MENU_GAP_PX - FINAL_INSERT_SLASH_MENU_MARGIN_PX;
  const availableAbove = targetRect.top - scrollRect.top - FINAL_INSERT_SLASH_MENU_GAP_PX - FINAL_INSERT_SLASH_MENU_MARGIN_PX;
  const placement: FinalInsertMenuPlacement =
    availableBelow < FINAL_INSERT_SLASH_MENU_PREFERRED_MIN_HEIGHT_PX && availableAbove > availableBelow
      ? 'above'
      : 'below';
  const availableHeight = placement === 'above' ? availableAbove : availableBelow;
  return {
    maxHeight: Math.max(
      FINAL_INSERT_SLASH_MENU_MIN_HEIGHT_PX,
      Math.min(FINAL_INSERT_SLASH_MENU_MAX_HEIGHT_PX, Math.floor(availableHeight)),
    ),
    placement,
    top: placement === 'above'
      ? targetRect.top - containerRect.top - FINAL_INSERT_SLASH_MENU_GAP_PX
      : targetRect.bottom - containerRect.top + FINAL_INSERT_SLASH_MENU_GAP_PX,
  };
};

const isCollapsedSelectionAtTextBlockEdge = (
  block: LexicalNode,
  edge: 'end' | 'start',
) => {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed() || !$isElementNode(block)) return false;
  const anchor = selection.anchor;
  const anchorNode = anchor.getNode();
  if (anchor.type === 'element' && anchorNode === block) {
    return edge === 'start' ? anchor.offset === 0 : anchor.offset === block.getChildrenSize();
  }
  const textNodes = block.getAllTextNodes();
  if (textNodes.length === 0) return false;
  const edgeTextNode = edge === 'start' ? textNodes[0] : textNodes[textNodes.length - 1];
  const edgeOffset = edge === 'start' ? 0 : edgeTextNode.getTextContentSize();
  return anchor.type === 'text' && anchorNode === edgeTextNode && anchor.offset === edgeOffset;
};

const getTextBlockCodeNavigationTarget = (direction: 'down' | 'up'): TextBlockCodeNavigationTarget | null => {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return null;
  const block = getRootLevelEditableTextBlock(selection.anchor.getNode());
  if (!block) return null;
  const textEdge = direction === 'down' ? 'end' : 'start';
  if (direction === 'down') {
    const nextCodeBlock = getCodeBlockAcrossEmptyParagraph(block, 'next');
    if (!nextCodeBlock) return null;
    if (!isCollapsedSelectionAtTextBlockEdge(block, textEdge)) {
      return { block, edge: textEdge, type: 'select-text-edge' };
    }
    return { target: { edge: 'start', nodeKey: nextCodeBlock.getKey() }, type: 'focus-code' };
  }
  const previousCodeBlock = getCodeBlockAcrossEmptyParagraph(block, 'previous');
  if (!previousCodeBlock) return null;
  if (!isCollapsedSelectionAtTextBlockEdge(block, textEdge)) {
    return { block, edge: textEdge, type: 'select-text-edge' };
  }
  return { target: { edge: 'end', nodeKey: previousCodeBlock.getKey() }, type: 'focus-code' };
};

const centerPreviewNodeHeaderInScroll = (
  editor: LexicalEditor,
  nodeKey: string | null | undefined,
  attempt = 0,
) => {
  if (!nodeKey || typeof window === 'undefined') return;
  const center = () => {
    const nodeElement = editor.getElementByKey(nodeKey);
    const headerElement =
      nodeElement?.querySelector<HTMLElement>('.aad-block-header') ?? nodeElement;
    if (!headerElement) {
      debugPreviewLexical('center-header-wait-dom', { attempt, nodeKey });
      if (attempt < 40) window.setTimeout(() => centerPreviewNodeHeaderInScroll(editor, nodeKey, attempt + 1), 16);
      return;
    }
    const scrollContainer = getPreviewScrollContainerForElement(headerElement);
    if (!scrollContainer) {
      debugPreviewLexical('center-header-missing-scroll-container', { attempt, nodeKey });
      return;
    }
    const headerRect = headerElement.getBoundingClientRect();
    const scrollRect = scrollContainer.getBoundingClientRect();
    const targetTop = headerRect.top - scrollRect.top;
    const maxScrollTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
    const nextTop = Math.min(
      maxScrollTop,
      Math.max(0, scrollContainer.scrollTop + targetTop + headerRect.height / 2 - scrollContainer.clientHeight / 2),
    );
    debugPreviewLexical('center-header-scroll', {
      attempt,
      clientHeight: scrollContainer.clientHeight,
      headerHeight: headerRect.height,
      maxScrollTop,
      nodeKey,
      previousScrollTop: scrollContainer.scrollTop,
      targetTop,
      nextTop,
    });
    scrollContainer.scrollTo({
      top: nextTop,
      left: scrollContainer.scrollLeft,
      behavior: 'smooth',
    });
  };
  window.requestAnimationFrame(center);
  if (attempt === 0) {
    window.setTimeout(center, 48);
    window.setTimeout(center, 120);
  }
};

const focusCodeBlockTextarea = (
  editor: LexicalEditor,
  target: CodeBlockTextareaFocusTarget,
  options: { centerHeader?: boolean } = {},
  attempt = 0,
) => {
  const runFocusAttempt = () => {
    const codeBlockElement = editor.getElementByKey(target.nodeKey);
    const textarea = codeBlockElement?.querySelector<HTMLTextAreaElement>('textarea.aad-code-edit-textarea');
    if (!textarea) {
      const editTrigger = codeBlockElement?.querySelector<HTMLElement>('[data-code-edit-trigger="true"]');
      if (editTrigger) {
        editTrigger.setAttribute('data-code-edit-edge', target.edge);
        editTrigger.click();
      }
      debugPreviewLexical('focus-code-wait-textarea', {
        attempt,
        centerHeader: Boolean(options.centerHeader),
        edge: target.edge,
        nodeKey: target.nodeKey,
      });
      if (attempt < 40) window.setTimeout(() => focusCodeBlockTextarea(editor, target, options, attempt + 1), 16);
      return;
    }
    const rootElement = editor.getRootElement();
    if (document.activeElement === rootElement) rootElement?.blur();
    textarea.focus({ preventScroll: true });
    const offset = target.edge === 'start' ? 0 : textarea.value.length;
    textarea.setSelectionRange(offset, offset);
    resizeCodeTextarea(textarea);
    debugPreviewLexical('focus-code-textarea', {
      attempt,
      centerHeader: Boolean(options.centerHeader),
      codeLength: textarea.value.length,
      edge: target.edge,
      nodeKey: target.nodeKey,
    });
    if (options.centerHeader) centerPreviewNodeHeaderInScroll(editor, target.nodeKey);
    if (document.activeElement !== textarea && attempt < 40) {
      window.setTimeout(() => focusCodeBlockTextarea(editor, target, options, attempt + 1), 16);
    }
  };
  window.requestAnimationFrame(runFocusAttempt);
  if (attempt === 0) {
    window.setTimeout(runFocusAttempt, 32);
    window.setTimeout(runFocusAttempt, 96);
  }
};

const focusEditorTextBlock = (editor: LexicalEditor, target: EditableTextBlockFocusTarget) => {
  window.requestAnimationFrame(() => {
    editor.getRootElement()?.focus({ preventScroll: true });
    editor.update(() => {
      selectEditableTextBlockFocusTarget(target);
    });
  });
};

const canCreatePreviewEditableCodeFence = (language: string) =>
  PREVIEW_MARKDOWN_EDITABLE_CODE_FENCE_KINDS.has(getCodeFenceLanguageKind(language));

const getPreviewMarkdownShortcutCodeFenceLanguage = (language: string) => {
  const normalizedLanguage = language.trim().toLowerCase();
  return canCreatePreviewEditableCodeFence(normalizedLanguage) ? normalizedLanguage : 'code';
};

const getPreviewMarkdownShortcutArtifactKind = (language: string) => {
  const languageKind = getCodeFenceLanguageKind(language);
  if (languageKind === CODE_FENCE_LANGUAGE_KINDS.HTML_PREVIEW) return 'html-preview';
  if (languageKind === CODE_FENCE_LANGUAGE_KINDS.MERMAID) return 'mermaid';
  return '';
};

function getOpenPreviewMarkdownCodeFenceLanguage(language: string) {
  const rawLanguage = String(language ?? '').trim();
  if (!rawLanguage) return '';
  const languageKind = getCodeFenceLanguageKind(rawLanguage);
  if (languageKind === CODE_FENCE_LANGUAGE_KINDS.DOCUMENT_SPEC) {
    return 'code';
  }
  return rawLanguage;
}

function createPreviewMarkdownFenceSource(language: string, code: string) {
  const fenceLanguage = String(language ?? '').trim() || 'code';
  return `\`\`\`${fenceLanguage}\n${code}\n\`\`\``;
}

function ensureEditableTextBlockBesideNode(
  node: LexicalNode,
  direction: 'next' | 'previous',
): EditableTextBlockFocusTarget {
  const sibling = direction === 'next' ? node.getNextSibling() : node.getPreviousSibling();
  if (isPreviewEditableTextBlockNode(sibling)) {
    return {
      edge: direction === 'next' ? 'start' : 'end',
      nodeKey: sibling.getKey(),
    };
  }
  const paragraph = $createParagraphNode();
  if (direction === 'next') node.insertAfter(paragraph);
  else node.insertBefore(paragraph);
  return {
    edge: direction === 'next' ? 'start' : 'end',
    nodeKey: paragraph.getKey(),
  };
}

function replaceCodeBlockWithPreviewArtifact(
  codeBlockNode: CodeBlockDecoratorNode,
  artifactKind: string,
  language: string,
  code: string,
  focusDirection: 'next' | 'previous' | null,
): EditableTextBlockFocusTarget | null {
  const artifactNode = $createPreviewArtifactNode({
    artifactKind,
    source: createPreviewMarkdownFenceSource(language, code),
    sourceRange: null,
  });
  codeBlockNode.replace(artifactNode);
  if (!focusDirection) {
    ensureEditableTextBlockBesideNode(artifactNode, 'next');
    return null;
  }
  return ensureEditableTextBlockBesideNode(artifactNode, focusDirection);
}

const commitCodeBlockExitValue = (
  codeBlockNode: CodeBlockDecoratorNode,
  code: string,
): {
  codeChanged: boolean;
} => {
  const codeChanged = codeBlockNode.__code !== code;
  if (codeChanged) {
    codeBlockNode.setCode(code);
    $addUpdateTag(ISLAND_CODE_BLOCK_UPDATE_TAG);
  }
  return { codeChanged };
};

const PREVIEW_MARKDOWN_SUPPORTED_INLINE_SHORTCUT_PATTERN =
  /(^|[^\\])(?:\*\*\*[^*\n]+?\*\*\*|\*\*[^*\n]+?\*\*|~~[^~\n]+?~~|\*(?!\*)[^*\n]+?\*)/;

const hasPreviewMarkdownInlineStyleValue = (style: RichInlineSegment['style']) => Boolean(
  style?.color ||
  style?.fontFamily ||
  style?.fontSize ||
  style?.letterSpacing ||
  style?.lineHeight,
);

const isSupportedPreviewMarkdownInlineShortcutSegment = (segment: RichInlineSegment) => (
  !segment.code &&
  !segment.highlight &&
  !segment.subscript &&
  !segment.superscript &&
  !segment.underline &&
  !hasPreviewMarkdownInlineStyleValue(segment.style)
);

const segmentHasSupportedPreviewMarkdownInlineShortcutFormat = (segment: RichInlineSegment) => Boolean(
  segment.strong ||
  segment.italic ||
  segment.strikethrough,
);

const getPreviewSupportedInlineShortcutSegments = (source: string) => {
  if (!PREVIEW_MARKDOWN_SUPPORTED_INLINE_SHORTCUT_PATTERN.test(source)) return null;
  const parsed = parseMarkdownRichInline(source);
  if (!parsed.ok) return null;
  const inline = parsed as { segments: RichInlineSegment[]; text: string };
  if (inline.text === source) return null;
  if (serializeMarkdownRichInline(inline.segments) !== source) return null;
  if (!inline.segments.every(isSupportedPreviewMarkdownInlineShortcutSegment)) return null;
  return inline.segments.some(segmentHasSupportedPreviewMarkdownInlineShortcutFormat)
    ? inline.segments
    : null;
};

const isPlainInlineShortcutParagraph = (node: LexicalNode) => {
  if (!$isParagraphNode(node)) return false;
  return node.getChildren().every((child) => $isTextNode(child) || $isLineBreakNode(child));
};

type PreviewMarkdownInlineShortcutCandidate = {
  nodeKey: string;
  selectEnd: boolean;
  segments: RichInlineSegment[];
};

const getClosedPreviewMarkdownInlineShortcutCandidates = (): PreviewMarkdownInlineShortcutCandidate[] => {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return [];
  const selectedParagraph = findAncestor(selection.anchor.getNode(), $isParagraphNode);
  const root = $getRoot();
  return root.getChildren().flatMap((node) => {
    if (!isPlainInlineShortcutParagraph(node)) return [];
    const segments = getPreviewSupportedInlineShortcutSegments(node.getTextContent());
    if (!segments) return [];
    return [{
      nodeKey: node.getKey(),
      selectEnd: node === selectedParagraph && isCollapsedSelectionAtTextBlockEdge(node, 'end'),
      segments,
    }];
  });
};

const transformClosedPreviewMarkdownInlineShortcuts = () => {
  const candidates = getClosedPreviewMarkdownInlineShortcutCandidates();
  if (candidates.length === 0) return false;
  candidates.forEach((candidate) => {
    const paragraph = $getNodeByKey(candidate.nodeKey);
    if (!$isParagraphNode(paragraph) || !isPlainInlineShortcutParagraph(paragraph)) return;
    paragraph.clear();
    appendRichLineSegments(paragraph, candidate.segments);
    if (candidate.selectEnd) paragraph.selectEnd();
  });
  return true;
};

const PREVIEW_MARKDOWN_PIPE_TABLE_ROW_PATTERN = /^\s*\|.*\|\s*$/;

const splitPreviewPipeTableCells = (line: string) => {
  const text = line.trim();
  if (!text.startsWith('|') || !text.endsWith('|')) return [];
  return text.slice(1, -1).split('|').map((cell) => cell.trim());
};

const isPlainPreviewPipeTableDelimiterLine = (line: string) => {
  const cells = splitPreviewPipeTableCells(line);
  return cells.length > 0 && cells.every((cell) => /^-{3,}$/.test(cell));
};

const parseBasicPreviewPipeTableShortcut = (source: string): MarkdownIslandBlock | null => {
  const lines = source.split('\n').filter((line, index, allLines) =>
    index < allLines.length - 1 || line.length > 0,
  );
  if (lines.length < 3) return null;
  if (!lines.every((line) => PREVIEW_MARKDOWN_PIPE_TABLE_ROW_PATTERN.test(line))) return null;
  if (!isPlainPreviewPipeTableDelimiterLine(lines[1])) return null;
  const parsed = parseMarkdownRichPipeTable(source, {
    startLine: 1,
    startColumn: 1,
    endLine: lines.length,
    endColumn: lines[lines.length - 1].length + 1,
  });
  if (!parsed.ok) return null;
  const table = parsed as {
    alignments: string[];
    columnCount: number;
    rows: MarkdownIslandBlock['rows'];
  };
  if (!table.alignments.every((alignment: string) => alignment === 'none')) return null;
  return {
    type: 'table',
    alignments: table.alignments,
    columnCount: table.columnCount,
    rows: table.rows,
  };
};

type PreviewMarkdownPipeTableShortcutCandidate = {
  nodes: LexicalNode[];
  table: MarkdownIslandBlock;
};

const getClosedPreviewMarkdownPipeTableCandidate = (): PreviewMarkdownPipeTableShortcutCandidate | null => {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return null;
  const currentParagraph = findAncestor(selection.anchor.getNode(), $isParagraphNode);
  if (!currentParagraph) return null;
  const root = $getRoot();
  if (currentParagraph.getParent() !== root) return null;

  const currentText = currentParagraph.getTextContent();
  if (currentText.includes('\n')) {
    const table = parseBasicPreviewPipeTableShortcut(currentText);
    return table ? { nodes: [currentParagraph], table } : null;
  }

  const rootChildren = root.getChildren();
  const currentIndex = rootChildren.indexOf(currentParagraph);
  if (currentIndex < 2) return null;
  let startIndex = currentIndex;
  while (
    startIndex > 0 &&
    $isParagraphNode(rootChildren[startIndex - 1]) &&
    PREVIEW_MARKDOWN_PIPE_TABLE_ROW_PATTERN.test(rootChildren[startIndex - 1].getTextContent())
  ) {
    startIndex -= 1;
  }
  const candidateNodes = rootChildren.slice(startIndex, currentIndex + 1);
  if (candidateNodes.length < 3 || !candidateNodes.every($isParagraphNode)) return null;
  const source = candidateNodes.map((node) => node.getTextContent()).join('\n');
  const table = parseBasicPreviewPipeTableShortcut(source);
  return table ? { nodes: candidateNodes, table } : null;
};

const selectLastEditableTableCellEnd = (tableNode: TableNode) => {
  const rows = tableNode.getChildren().filter($isTableRowNode);
  const lastBodyRow = rows[rows.length - 1];
  if (!lastBodyRow) return;
  const cells = lastBodyRow.getChildren().filter($isTableCellNode);
  const lastCell = cells[cells.length - 1];
  if (!lastCell) return;
  const lastChild = lastCell.getLastChild();
  if ($isElementNode(lastChild)) {
    lastChild.selectEnd();
    return;
  }
  lastCell.selectEnd();
};

const getSelectedTableCellNode = (): TableCellNode | null => {
  const selection = $getSelection();
  if ($isTableSelection(selection)) {
    const cell = findAncestor(selection.focus.getNode(), $isTableCellNode);
    return $isTableCellNode(cell) ? cell : null;
  }
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return null;
  const cell = findAncestor(selection.anchor.getNode(), $isTableCellNode);
  return $isTableCellNode(cell) ? cell : null;
};

const isSingleCellTableSelection = (selection: ReturnType<typeof $getSelection>) => {
  if (!$isTableSelection(selection)) return false;
  const anchorCell = findAncestor(selection.anchor.getNode(), $isTableCellNode);
  const focusCell = findAncestor(selection.focus.getNode(), $isTableCellNode);
  return $isTableCellNode(anchorCell) &&
    $isTableCellNode(focusCell) &&
    anchorCell.getKey() === focusCell.getKey();
};

const isMultiCellTableSelection = (selection: ReturnType<typeof $getSelection>) =>
  $isTableSelection(selection) && !isSingleCellTableSelection(selection);

const selectionIsCollapsedInsidePreviewTable = () => {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
  let current: LexicalNode | null = selection.anchor.getNode();
  while (current) {
    if ($isTableNode(current) || $isTableRowNode(current) || $isTableCellNode(current)) return true;
    current = current.getParent();
  }
  return false;
};

type TableCellKeyboardContext = {
  cellNode: TableCellNode;
  cells: TableCellNode[];
  columnIndex: number;
  rowIndex: number;
  rowNode: TableRowNode;
  rows: TableRowNode[];
  tableNode: TableNode;
};

type TableKeyboardResult = {
  handled: boolean;
  tableCellKey: string | null;
};

type ResolvedTableCellKey = {
  key: string | null;
  preferResolvedCell: boolean;
};

const createUnhandledTableKeyboardResult = (): TableKeyboardResult => ({
  handled: false,
  tableCellKey: null,
});

const getTableRowCells = (rowNode: TableRowNode) =>
  rowNode.getChildren().filter($isTableCellNode);

const selectTableCellStart = (cellNode: TableCellNode) => {
  const firstChild = cellNode.getFirstChild();
  if ($isElementNode(firstChild)) {
    firstChild.selectStart();
    return cellNode;
  }
  cellNode.selectStart();
  return cellNode;
};

const selectTableCellEnd = (cellNode: TableCellNode) => {
  const lastChild = cellNode.getLastChild();
  if ($isElementNode(lastChild)) {
    lastChild.selectEnd();
    return cellNode;
  }
  cellNode.selectEnd();
  return cellNode;
};

const selectTableRowCellStart = (rowNode: TableRowNode, preferredColumnIndex = 0) => {
  const cells = getTableRowCells(rowNode);
  const cell = cells[Math.min(Math.max(preferredColumnIndex, 0), cells.length - 1)] ?? null;
  return cell ? selectTableCellStart(cell) : null;
};

const selectTableRowCellEnd = (rowNode: TableRowNode, preferredColumnIndex = 0) => {
  const cells = getTableRowCells(rowNode);
  const cell = cells[Math.min(Math.max(preferredColumnIndex, 0), cells.length - 1)] ?? null;
  return cell ? selectTableCellEnd(cell) : null;
};

const selectFirstTableRowCellStart = (rowNode: TableRowNode) => selectTableRowCellStart(rowNode, 0);

const getSelectedTableCellContext = (
  fallbackCellKey: string | null = null,
  options: { preferResolvedCell?: boolean; requireCollapsed?: boolean } = {},
): TableCellKeyboardContext | null => {
  const selection = $getSelection();
  if (
    options.requireCollapsed &&
    !(
      ($isRangeSelection(selection) && selection.isCollapsed()) ||
      isSingleCellTableSelection(selection)
    )
  ) {
    return null;
  }
  const fallbackNode = fallbackCellKey ? $getNodeByKey(fallbackCellKey) : null;
  const fallbackCell = $isTableCellNode(fallbackNode) ? fallbackNode : null;
  const selectedCell = getSelectedTableCellNode();
  const cellNode = options.preferResolvedCell ? fallbackCell ?? selectedCell : selectedCell ?? fallbackCell;
  if (!cellNode) return null;
  const rowNode = findAncestor(cellNode, $isTableRowNode);
  if (!$isTableRowNode(rowNode)) return null;
  const tableNode = findAncestor(rowNode, $isTableNode);
  if (!$isTableNode(tableNode)) return null;
  const rows = tableNode.getChildren().filter($isTableRowNode);
  const rowIndex = rows.indexOf(rowNode);
  if (rowIndex < 0) return null;
  const cells = getTableRowCells(rowNode);
  const columnIndex = cells.indexOf(cellNode);
  if (columnIndex < 0) return null;
  return {
    cellNode,
    cells,
    columnIndex,
    rowIndex,
    rowNode,
    rows,
    tableNode,
  };
};

const isTableCellEmpty = (cellNode: TableCellNode | null | undefined) =>
  !cellNode || cellNode.getTextContent().trim().length === 0;

const isTableRowEmpty = (rowNode: TableRowNode) =>
  getTableRowCells(rowNode).every((cellNode) => isTableCellEmpty(cellNode));

const isTableColumnEmpty = (rows: readonly TableRowNode[], columnIndex: number) =>
  rows.every((rowNode) => isTableCellEmpty(getTableRowCells(rowNode)[columnIndex]));

const moveSelectionVerticallyInTable = (
  fallbackCellKey: string | null,
  direction: 'down' | 'up',
  options: { preferResolvedCell?: boolean } = {},
): TableKeyboardResult => {
  const context = getSelectedTableCellContext(fallbackCellKey, {
    preferResolvedCell: options.preferResolvedCell,
    requireCollapsed: true,
  });
  if (!context) return createUnhandledTableKeyboardResult();
  if (direction === 'down') {
    const nextRow = context.rows[context.rowIndex + 1] ?? null;
    if (nextRow) {
      const focusedCell = selectTableRowCellStart(nextRow, context.columnIndex);
      if (!focusedCell) return createUnhandledTableKeyboardResult();
      $addUpdateTag(SKIP_SCROLL_INTO_VIEW_TAG);
      return {
        handled: true,
        tableCellKey: focusedCell.getKey(),
      };
    }
    const target = ensureEditableTextBlockBesideNode(context.tableNode, 'next');
    selectEditableTextBlockFocusTarget(target);
    $addUpdateTag(SKIP_SCROLL_INTO_VIEW_TAG);
    return { handled: true, tableCellKey: null };
  }
  const previousRow = context.rows[context.rowIndex - 1] ?? null;
  if (previousRow) {
    const focusedCell = selectTableRowCellEnd(previousRow, context.columnIndex);
    if (!focusedCell) return createUnhandledTableKeyboardResult();
    $addUpdateTag(SKIP_SCROLL_INTO_VIEW_TAG);
    return {
      handled: true,
      tableCellKey: focusedCell.getKey(),
    };
  }
  const target = ensureEditableTextBlockBesideNode(context.tableNode, 'previous');
  selectEditableTextBlockFocusTarget(target);
  $addUpdateTag(SKIP_SCROLL_INTO_VIEW_TAG);
  return { handled: true, tableCellKey: null };
};

const handleTableBackspaceAtSelection = (
  fallbackCellKey: string | null,
  options: { preferResolvedCell?: boolean } = {},
): TableKeyboardResult => {
  const context = getSelectedTableCellContext(fallbackCellKey, {
    preferResolvedCell: options.preferResolvedCell,
    requireCollapsed: true,
  });
  if (!context || context.cellNode.getTextContent().trim().length > 0) {
    return createUnhandledTableKeyboardResult();
  }

  if (context.rowIndex > 0) {
    if (context.columnIndex > 0) {
      const focusedCell = selectTableRowCellEnd(context.rowNode, context.columnIndex - 1);
      return {
        handled: true,
        tableCellKey: focusedCell?.getKey() ?? null,
      };
    }
    if (!isTableRowEmpty(context.rowNode)) {
      return {
        handled: true,
        tableCellKey: context.cellNode.getKey(),
      };
    }
    const previousRow = context.rows[context.rowIndex - 1] ?? null;
    if (!previousRow) return createUnhandledTableKeyboardResult();
    context.rowNode.remove();
    $addUpdateTag(HISTORY_PUSH_TAG);
    $addUpdateTag(ISLAND_TABLE_SHORTCUT_UPDATE_TAG);
    const focusedCell = selectTableRowCellEnd(previousRow, getTableRowCells(previousRow).length - 1);
    return {
      handled: true,
      tableCellKey: focusedCell?.getKey() ?? null,
    };
  }

  if (!isTableColumnEmpty(context.rows, context.columnIndex)) {
    return {
      handled: true,
      tableCellKey: context.cellNode.getKey(),
    };
  }
  $addUpdateTag(HISTORY_PUSH_TAG);
  $addUpdateTag(ISLAND_TABLE_SHORTCUT_UPDATE_TAG);
  if (context.cells.length <= 1) {
    const target = ensureEditableTextBlockBesideNode(context.tableNode, 'next');
    context.tableNode.remove();
    selectEditableTextBlockFocusTarget(target);
    return { handled: true, tableCellKey: null };
  }
  selectTableCellStart(context.cellNode);
  $deleteTableColumnAtSelection();
  const headerRow = context.tableNode.getChildren().find($isTableRowNode) ?? null;
  const focusedCell = headerRow ? selectTableRowCellEnd(headerRow, context.columnIndex - 1) : null;
  return {
    handled: true,
    tableCellKey: focusedCell?.getKey() ?? null,
  };
};

const insertTableColumnAfterLastCellAtSelection = (
  fallbackCellKey: string | null,
  options: { preferResolvedCell?: boolean } = {},
): TableKeyboardResult => {
  const context = getSelectedTableCellContext(fallbackCellKey, {
    preferResolvedCell: options.preferResolvedCell,
    requireCollapsed: true,
  });
  if (!context) return createUnhandledTableKeyboardResult();
  const lastRowCells = getTableRowCells(context.rowNode);
  const lastCell = lastRowCells[lastRowCells.length - 1] ?? null;
  if (context.rowIndex !== context.rows.length - 1 || !lastCell || lastCell.getKey() !== context.cellNode.getKey()) {
    const nextCell = context.cells[context.columnIndex + 1] ?? null;
    if (nextCell) {
      selectTableCellStart(nextCell);
      $addUpdateTag(SKIP_SCROLL_INTO_VIEW_TAG);
      return {
        handled: true,
        tableCellKey: nextCell.getKey(),
      };
    }
    const nextRow = context.rows[context.rowIndex + 1] ?? null;
    const focusedCell = nextRow ? selectTableRowCellStart(nextRow, 0) : null;
    if (!focusedCell) return createUnhandledTableKeyboardResult();
    $addUpdateTag(SKIP_SCROLL_INTO_VIEW_TAG);
    return {
      handled: true,
      tableCellKey: focusedCell.getKey(),
    };
  }
  selectTableCellStart(context.cellNode);
  const insertedCell = $insertTableColumnAtSelection(true);
  if (!insertedCell) return createUnhandledTableKeyboardResult();
  getTableRowCells(context.rows[0]).forEach((cellNode) => {
    cellNode.setHeaderStyles(TableCellHeaderStates.COLUMN, TableCellHeaderStates.COLUMN);
  });
  $addUpdateTag(HISTORY_PUSH_TAG);
  $addUpdateTag(ISLAND_TABLE_SHORTCUT_UPDATE_TAG);
  const lastRow = context.rows[context.rows.length - 1] ?? null;
  const focusedCell = lastRow ? selectTableRowCellStart(lastRow, getTableRowCells(lastRow).length - 1) : null;
  return {
    handled: true,
    tableCellKey: focusedCell?.getKey() ?? insertedCell.getKey(),
  };
};

const insertEmptyTableRowAfterCell = (tableCell: TableCellNode): TableRowNode | null => {
  const rowNode = findAncestor(tableCell, $isTableRowNode);
  if (!$isTableRowNode(rowNode)) return null;
  const cellCount = rowNode.getChildren().filter($isTableCellNode).length;
  if (cellCount <= 0) return null;
  const nextRowNode = $createTableRowNode();
  for (let index = 0; index < cellCount; index += 1) {
    const nextCellNode = $createTableCellNode(TableCellHeaderStates.NO_STATUS);
    nextCellNode.append($createParagraphNode());
    nextRowNode.append(nextCellNode);
  }
  rowNode.insertAfter(nextRowNode);
  return nextRowNode;
};

const transformClosedPreviewMarkdownPipeTable = (tableAlignments?: TableAlignmentRegistry) => {
  const candidate = getClosedPreviewMarkdownPipeTableCandidate();
  if (!candidate) return false;
  const tableNode = createMarkdownTableNode(candidate.table, tableAlignments);
  candidate.nodes[0].replace(tableNode);
  candidate.nodes.slice(1).forEach((node) => node.remove());
  selectLastEditableTableCellEnd(tableNode);
  return true;
};

type ClosedPreviewMarkdownFenceCandidate =
  | {
      closingIndex: number;
      code: string;
      kind: 'artifact';
      artifactKind: string;
      openingIndex: number;
      source: string;
    }
  | {
      closingIndex: number;
      code: string;
      kind: 'code-block';
      language: string;
      openingIndex: number;
    };

type OpenPreviewMarkdownFenceCandidate = {
  code: string;
  language: string;
  nodeKey: string;
};

const createClosedPreviewMarkdownFenceCandidate = ({
  closingIndex,
  closingText,
  codeLines,
  openingIndex,
  openingText,
  rawLanguage,
}: {
  closingIndex: number;
  closingText: string;
  codeLines: string[];
  openingIndex: number;
  openingText: string;
  rawLanguage: string;
}): ClosedPreviewMarkdownFenceCandidate => {
  const artifactKind = getPreviewMarkdownShortcutArtifactKind(rawLanguage);
  const code = codeLines.join('\n');
  if (artifactKind) {
    return {
      artifactKind,
      closingIndex,
      code,
      kind: 'artifact',
      openingIndex,
      source: [openingText, ...codeLines, closingText].join('\n'),
    };
  }
  return {
    closingIndex,
    code,
    kind: 'code-block',
    language: getPreviewMarkdownShortcutCodeFenceLanguage(rawLanguage),
    openingIndex,
  };
};

const getOpenPreviewMarkdownFenceHeaderCandidate = (): OpenPreviewMarkdownFenceCandidate | null => {
  const selection = $getSelection();
  if ($isRangeSelection(selection) && selection.isCollapsed()) {
    const selectedParagraph = findAncestor(selection.anchor.getNode(), $isParagraphNode);
    if (!selectedParagraph || selectedParagraph.getParent() !== $getRoot()) return null;
    if (!isCollapsedSelectionAtTextBlockEdge(selectedParagraph, 'end')) return null;
    const openingText = selectedParagraph.getTextContent();
    if (openingText.includes('\n')) return null;
    const openingMatch = openingText.match(PREVIEW_MARKDOWN_CODE_FENCE_HEADER_PATTERN);
    if (!openingMatch) return null;
    return {
      code: '',
      language: getOpenPreviewMarkdownCodeFenceLanguage(openingMatch[1] ?? ''),
      nodeKey: selectedParagraph.getKey(),
    };
  }
  return null;
};

const getOpenPreviewMarkdownFenceHeaderDomCandidate = (): OpenPreviewMarkdownFenceCandidate | null => {
  if (typeof window === 'undefined') return null;
  const domSelection = window.getSelection();
  if (!domSelection || !domSelection.isCollapsed || domSelection.rangeCount === 0) return null;
  const selectionElement =
    domSelection.anchorNode instanceof Element
      ? domSelection.anchorNode
      : domSelection.anchorNode?.parentElement;
  const paragraphElement = selectionElement?.closest('p');
  if (!(paragraphElement instanceof HTMLElement)) return null;
  const islandRoot = paragraphElement.closest('.aad-markdown-lexical-island-content');
  if (!(islandRoot instanceof HTMLElement)) return null;
  const paragraphNode = $getNearestNodeFromDOMNode(paragraphElement);
  if (!$isParagraphNode(paragraphNode) || paragraphNode.getParent() !== $getRoot()) return null;
  const openingText = paragraphNode.getTextContent();
  if (openingText.includes('\n')) return null;
  const openingMatch = openingText.match(PREVIEW_MARKDOWN_CODE_FENCE_HEADER_PATTERN);
  if (!openingMatch) return null;
  return {
    code: '',
    language: getOpenPreviewMarkdownCodeFenceLanguage(openingMatch[1] ?? ''),
    nodeKey: paragraphNode.getKey(),
  };
};

const transformOpenPreviewMarkdownFence = (
  candidate = getOpenPreviewMarkdownFenceHeaderCandidate(),
): CodeBlockTextareaFocusTarget | null => {
  if (!candidate) return null;
  const paragraph = $getNodeByKey(candidate.nodeKey);
  if (!$isParagraphNode(paragraph)) return null;
  const replacementNode = $createCodeBlockDecoratorNode(
    candidate.language,
    getShortcutCodeBlockInitialCode(candidate.language, candidate.code),
  );
  paragraph.replace(replacementNode);
  const trailingParagraph = $createParagraphNode();
  replacementNode.insertAfter(trailingParagraph);
  trailingParagraph.selectStart();
  return {
    edge: candidate.code ? 'end' : 'start',
    nodeKey: replacementNode.getKey(),
  };
};

const getClosedPreviewMarkdownSingleParagraphFenceCandidate = (
  paragraph: LexicalNode,
  paragraphIndex: number,
): ClosedPreviewMarkdownFenceCandidate | null => {
  if (!$isParagraphNode(paragraph)) return null;
  const text = paragraph.getTextContent();
  if (!text.includes('\n')) return null;
  const lines = text.split('\n');
  if (lines.length < 3) return null;
  const openingText = lines[0] ?? '';
  const openingMatch = openingText.match(PREVIEW_MARKDOWN_CODE_FENCE_OPEN_PATTERN);
  if (!openingMatch) return null;
  let closingLineIndex = lines.length - 1;
  while (closingLineIndex > 0 && lines[closingLineIndex] === '') closingLineIndex -= 1;
  const closingText = lines[closingLineIndex] ?? '';
  if (!PREVIEW_MARKDOWN_CODE_FENCE_CLOSE_PATTERN.test(closingText)) return null;
  return createClosedPreviewMarkdownFenceCandidate({
    closingIndex: paragraphIndex,
    closingText,
    codeLines: lines.slice(1, closingLineIndex),
    openingIndex: paragraphIndex,
    openingText,
    rawLanguage: openingMatch?.[1] ?? '',
  });
};

const getClosedPreviewMarkdownFenceCandidate = () => {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return null;
  const closingParagraph = findAncestor(selection.anchor.getNode(), $isParagraphNode);
  if (!closingParagraph) return null;
  const root = $getRoot();
  if (closingParagraph.getParent() !== root) return null;
  const rootChildren = root.getChildren();
  const closingIndex = rootChildren.indexOf(closingParagraph);

  const singleParagraphCandidate = getClosedPreviewMarkdownSingleParagraphFenceCandidate(
    closingParagraph,
    closingIndex,
  );
  if (singleParagraphCandidate) return singleParagraphCandidate;

  if (!PREVIEW_MARKDOWN_CODE_FENCE_CLOSE_PATTERN.test(closingParagraph.getTextContent())) {
    return null;
  }

  if (closingIndex <= 0) return null;

  let openingIndex = -1;
  let openingMatch: RegExpMatchArray | null = null;
  for (let index = closingIndex - 1; index >= 0; index -= 1) {
    const candidate = rootChildren[index];
    if (!$isParagraphNode(candidate)) break;
    const match = candidate.getTextContent().match(PREVIEW_MARKDOWN_CODE_FENCE_OPEN_PATTERN);
    if (match) {
      openingIndex = index;
      openingMatch = match;
      break;
    }
  }

  if (openingIndex < 0) return null;

  const codeLines = rootChildren
    .slice(openingIndex + 1, closingIndex)
    .map((node) => ($isParagraphNode(node) ? node.getTextContent() : ''));
  const openingText = rootChildren[openingIndex]?.getTextContent() ?? '```';
  const closingText = closingParagraph.getTextContent();
  return createClosedPreviewMarkdownFenceCandidate({
    closingIndex,
    closingText,
    codeLines,
    openingIndex,
    openingText,
    rawLanguage: openingMatch?.[1] ?? '',
  });
};

type PreviewMarkdownFenceTransformResult = {
  kind: 'artifact' | 'code-block';
};

const transformClosedPreviewMarkdownFence = (): PreviewMarkdownFenceTransformResult | null => {
  const candidate = getClosedPreviewMarkdownFenceCandidate();
  if (!candidate) return null;
  const rootChildren = $getRoot().getChildren();
  const replacementNode = candidate.kind === 'artifact'
    ? $createPreviewArtifactNode({
        artifactKind: candidate.artifactKind,
        source: candidate.source,
        sourceRange: null,
      })
    : $createCodeBlockDecoratorNode(
        candidate.language,
        getShortcutCodeBlockInitialCode(candidate.language, candidate.code),
      );
  rootChildren[candidate.openingIndex].replace(replacementNode);
  for (let index = candidate.openingIndex + 1; index <= candidate.closingIndex; index += 1) {
    rootChildren[index].remove();
  }
  if ($isPreviewArtifactNode(replacementNode)) {
    const trailingParagraph = $createParagraphNode();
    replacementNode.insertAfter(trailingParagraph);
    trailingParagraph.selectStart();
  } else {
    selectNextEditableTextBlockAfterCodeBlock(replacementNode, true);
  }
  return { kind: candidate.kind };
};

const getFirstPreviewImageFile = (dataTransfer: DataTransfer | null | undefined) => {
  if (!dataTransfer) return null;
  const itemFile = Array.from(dataTransfer.items ?? [])
    .find((item) => item.kind === 'file' && item.type.startsWith('image/'))
    ?.getAsFile();
  if (itemFile) return itemFile;
  return Array.from(dataTransfer.files ?? []).find((file) => file.type.startsWith('image/')) ?? null;
};

const isPreviewImageInsertionDomTarget = (target: EventTarget | null, rootElement: HTMLElement) => {
  const element =
    target instanceof Element
      ? target
      : target instanceof Node
        ? target.parentElement
        : null;
  if (!element || !rootElement.contains(element)) return false;
  if (!element.closest('.aad-markdown-lexical-island-content')) return false;
  return !element.closest(
    'textarea,input,select,button,[role="button"],[contenteditable="false"],.aad-lexical-table-cell,td,th',
  );
};

type PreviewImageInsertionTarget = {
  anchorKey: string | null;
  replaceEmptyAnchor: boolean;
};

const getPreviewImageInsertionTarget = (): PreviewImageInsertionTarget => {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return { anchorKey: null, replaceEmptyAnchor: false };
  const anchorBlock = getRootLevelEditableTextBlock(selection.anchor.getNode());
  if (!anchorBlock) return { anchorKey: null, replaceEmptyAnchor: false };
  return {
    anchorKey: anchorBlock.getKey(),
    replaceEmptyAnchor: isEmptyPreviewParagraphNode(anchorBlock),
  };
};

const getSelectedPreviewImageArtifactNode = (nodeKey: string | null | undefined) => {
  if (!nodeKey) return null;
  const node = $getNodeByKey(nodeKey);
  return $isPreviewArtifactNode(node) && node.getArtifactKind() === 'image' ? node : null;
};

const getSelectedCodeBlockDecoratorNode = (nodeKey: string | null | undefined) => {
  if (!nodeKey) return null;
  const node = $getNodeByKey(nodeKey);
  return $isCodeBlockDecoratorNode(node) ? node : null;
};

const getSelectedCodeLikePreviewArtifactNode = (nodeKey: string | null | undefined) => {
  if (!nodeKey) return null;
  const node = $getNodeByKey(nodeKey);
  return $isPreviewArtifactNode(node) && isCodeLikePreviewArtifactKind(node.getArtifactKind()) ? node : null;
};

const getPreviewImageReferenceFromArtifactNode = (node: PreviewArtifactNode | null) => {
  if (!node) return null;
  return parsePreviewMarkdownImageReference(node.getSource());
};

const setPreviewImageArtifactSource = (
  node: PreviewArtifactNode,
  markdown: string,
) => {
  node.setPayload({
    artifactId: node.getArtifactId(),
    artifactKind: 'image',
    source: markdown,
    sourceRange: null,
  });
};

const insertPreviewMarkdownImageArtifact = (
  markdown: string,
  target: PreviewImageInsertionTarget,
) => {
  const source = markdown.trim();
  if (!source) return false;
  const root = $getRoot();
  const imageNode = $createPreviewArtifactNode({
    artifactKind: 'image',
    source,
    sourceRange: null,
  });
  const trailingParagraph = $createParagraphNode();
  const anchorNode = target.anchorKey ? $getNodeByKey(target.anchorKey) : null;
  if (anchorNode?.getParent() === root) {
    if (target.replaceEmptyAnchor && isEmptyPreviewParagraphNode(anchorNode)) {
      anchorNode.replace(imageNode);
    } else {
      anchorNode.insertAfter(imageNode);
    }
  } else {
    root.append(imageNode);
  }
  imageNode.insertAfter(trailingParagraph);
  trailingParagraph.selectStart();
  return true;
};

const selectionTouchesReadonlyOrTable = (selection: ReturnType<typeof $getSelection>) => {
  if (!$isRangeSelection(selection)) return true;
  return selection.getNodes().some((node) =>
    Boolean(findAncestor(node, (current) =>
      $isPreviewArtifactNode(current) ||
      $isTableNode(current) ||
      $isTableRowNode(current) ||
      $isTableCellNode(current),
    )),
  );
};

const PREVIEW_AI_DOM_SELECTION_EXCLUDED_SELECTOR = [
  'textarea',
  'input',
  'select',
  'button',
  '[role="button"]',
  '[contenteditable="false"]',
  '.aad-preview-artifact-decorator',
  '.aad-preview-artifact-decorator-content',
  '.aad-code-frame',
  '.aad-json-block',
  '.aad-code-edit-textarea',
].join(',');

const PREVIEW_AI_DOM_READONLY_TABLE_SELECTOR = [
  '.aad-lexical-table-editor',
  '.aad-lexical-table',
  '.aad-lexical-table-cell',
  'td',
  'th',
].join(',');

const selectionHasPreviewMarkdownInsertTarget = (selection: ReturnType<typeof $getSelection>) => {
  if (!$isRangeSelection(selection)) return false;
  return Boolean(
    getRootLevelEditableTextBlock(selection.anchor.getNode()) ||
      getRootLevelEditableTextBlock(selection.focus.getNode()),
  );
};

const PREVIEW_MARKDOWN_SOURCE_FENCE_PATTERN = /^ {0,3}(?:`{3,}|~{3,})[^\n\r]*$/m;
const PREVIEW_MARKDOWN_SOURCE_BLOCK_PATTERNS = [
  /^ {0,3}#{1,6}\s+\S/m,
  /^ {0,3}>\s+\S/m,
  /^ {0,3}(?:[-*+]\s+|\d+\.\s+)\S/m,
  /^ {0,3}!\[[^\]]*]\([^)]+\)\s*$/m,
  /^ {0,3}\|.*\|\s*$/m,
  /^ {0,3}\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/m,
];

const isLikelyPreviewMarkdownSourcePaste = (text: string) => {
  const normalized = String(text ?? '').replace(/\r\n?/g, '\n').trim();
  if (!normalized || !normalized.includes('\n')) return false;
  if (PREVIEW_MARKDOWN_SOURCE_FENCE_PATTERN.test(normalized)) return true;
  const blockMarkerCount = PREVIEW_MARKDOWN_SOURCE_BLOCK_PATTERNS.reduce(
    (count, pattern) => count + (pattern.test(normalized) ? 1 : 0),
    0,
  );
  return blockMarkerCount >= 2;
};

const isLikelyBareJsonPaste = (text: string) => {
  const trimmed = String(text ?? '').trim();
  if (/^!?\[[^\]]+]\([^)]+\)/.test(trimmed)) return false;
  return isJsonPasteCandidate('', trimmed);
};

type PreviewMarkdownSourcePasteResolution =
  | { kind: 'document'; source: string }
  | { kind: 'unclosed-fence'; language: string; source: string };

const getUnclosedFencePasteResolution = (text: string): PreviewMarkdownSourcePasteResolution | null => {
  const source = String(text ?? '').replace(/\r\n?/g, '\n').trimEnd();
  if (!source.includes('\n')) return null;
  const lines = source.split('\n');
  const openingMatch = lines[0]?.match(/^ {0,3}(`{3,}|~{3,})\s*([^\s`~]*)?.*$/);
  if (!openingMatch) return null;
  const marker = openingMatch[1];
  const markerChar = marker[0] === '~' ? '~' : '`';
  const closePattern = new RegExp(`^ {0,3}\\${markerChar}{${marker.length},}\\s*$`);
  if (lines.slice(1).some((line) => closePattern.test(line))) return null;
  return {
    kind: 'unclosed-fence',
    language: getOpenPreviewMarkdownCodeFenceLanguage(openingMatch[2] ?? ''),
    source,
  };
};

const getLanguageHeaderPasteResolution = (text: string): PreviewMarkdownSourcePasteResolution | null => {
  const source = String(text ?? '').replace(/\r\n?/g, '\n').trim();
  if (!source.includes('\n')) return null;
  const [firstLine = '', ...restLines] = source.split('\n');
  const language = normalizeCodeFenceLanguage(firstLine.trim());
  if (!JSON_FORMATTABLE_LANGUAGES.has(language)) return null;
  const code = restLines.join('\n').trim();
  if (!code) return null;
  const classification = classifyJsonFenceContent(code, { parseMode: getJsonParseMode(language) }) as JsonFenceClassificationForEditor;
  if (classification.kind === 'invalid' && !isJsonPasteCandidate('', code)) return null;
  return {
    kind: 'document',
    source: createPreviewMarkdownFenceSource(language, getJsonPasteCode(code, language)),
  };
};

const resolvePreviewMarkdownSourcePasteText = (text: string): PreviewMarkdownSourcePasteResolution | null => {
  const normalized = String(text ?? '').replace(/\r\n?/g, '\n');
  const trimmed = normalized.trim();
  if (!trimmed) return null;
  const unclosedFence = getUnclosedFencePasteResolution(normalized);
  if (unclosedFence) return unclosedFence;
  const languageHeaderPaste = getLanguageHeaderPasteResolution(normalized);
  if (languageHeaderPaste) return languageHeaderPaste;
  if (isLikelyPreviewMarkdownSourcePaste(normalized)) return { kind: 'document', source: normalized };
  if (isLikelyHtmlPaste(trimmed)) return { kind: 'document', source: createPreviewMarkdownFenceSource('html', trimmed) };
  if (isLikelyMermaidPaste(trimmed)) return { kind: 'document', source: createPreviewMarkdownFenceSource('mermaid', trimmed) };
  if (isLikelyBareJsonPaste(trimmed)) {
    return { kind: 'document', source: createPreviewMarkdownFenceSource('json', getJsonPasteCode(trimmed)) };
  }
  return null;
};

const resolvePreviewMarkdownFullReplacePasteText = (text: string): PreviewMarkdownSourcePasteResolution | null => {
  const sourcePaste = resolvePreviewMarkdownSourcePasteText(text);
  if (sourcePaste) return sourcePaste;
  const normalized = String(text ?? '').replace(/\r\n?/g, '\n');
  if (!normalized.trim()) return null;
  return { kind: 'document', source: normalized };
};

const hasClipboardFilePayload = (dataTransfer: DataTransfer | null | undefined) => {
  if (!dataTransfer) return false;
  if (Array.from(dataTransfer.items ?? []).some((item) => item.kind === 'file')) return true;
  return (dataTransfer.files?.length ?? 0) > 0;
};

const isPreviewMarkdownSourcePasteDomTarget = (target: EventTarget | null, rootElement: HTMLElement) => {
  const element =
    target instanceof Element
      ? target
      : target instanceof Node
        ? target.parentElement
        : null;
  if (!element || !rootElement.contains(element)) return false;
  if (!element.closest('.aad-markdown-lexical-island-content')) return false;
  return !element.closest(
    'textarea,input,select,button,[role="button"],[contenteditable="false"],.aad-lexical-table-cell,td,th',
  );
};

const createPreviewMarkdownSourcePasteNodes = (
  blocks: readonly PreviewMarkdownDocumentBlock[],
  tableAlignments?: TableAlignmentRegistry,
) => {
  const nodes: LexicalNode[] = [];
  blocks.forEach((block) => {
    if (block.type === 'artifact') {
      nodes.push($createPreviewArtifactNode({
        artifactId: block.artifactId,
        artifactKind: normalizePreviewArtifactKindForEditor(block.artifactKind),
        source: block.source,
        sourceRange: block.sourceRange,
      }));
      return;
    }
    if (block.type === 'code-block') {
      nodes.push($createCodeBlockDecoratorNode(
        block.language || '',
        getCodeBlockEditorCode(block),
        block.artifactId,
        getCodeBlockSourceFormat(block),
        block.sourceRange,
      ));
      return;
    }
    inferMarkdownIslandBlockSourceRanges(block.blocks, block.source, block.sourceRange).forEach((markdownBlock) => {
      appendSourceAnchorToElement({ append: (...nextNodes) => nodes.push(...nextNodes) }, markdownBlock);
      nodes.push(createMarkdownBlockNode(markdownBlock, tableAlignments));
    });
  });
  return nodes;
};

const selectDocumentLandingAfterInsertedNodes = (nodes: readonly LexicalNode[]) => {
  const lastNode = nodes[nodes.length - 1];
  if (!lastNode) {
    selectDocumentLandingParagraph();
    return;
  }
  if (selectEditableTextBlockEdge(lastNode, 'end')) return;
  const nextSibling = lastNode.getNextSibling();
  if (selectEditableTextBlockEdge(nextSibling, 'start')) return;
  const trailingParagraph = $createParagraphNode();
  lastNode.insertAfter(trailingParagraph);
  trailingParagraph.selectStart();
};

const resetPreviewMarkdownScrollToTop = (rootElement: HTMLElement | null) => {
  const scrollElement = rootElement?.closest<HTMLElement>('.aad-preview-scroll');
  if (!scrollElement) return;
  const reset = () => {
    scrollElement.scrollTop = 0;
  };
  reset();
  window.requestAnimationFrame(reset);
  window.setTimeout(reset, 120);
};

const appendPreviewMarkdownSourcePasteNodesAtEnd = (
  blocks: readonly PreviewMarkdownDocumentBlock[],
  tableAlignments?: TableAlignmentRegistry,
) => {
  const nodes = createPreviewMarkdownSourcePasteNodes(blocks, tableAlignments);
  if (nodes.length === 0) return false;
  const root = $getRoot();
  nodes.forEach((node) => root.append(node));
  selectDocumentLandingAfterInsertedNodes(nodes);
  return true;
};

const insertPreviewMarkdownUnclosedFencePaste = (
  paste: Extract<PreviewMarkdownSourcePasteResolution, { kind: 'unclosed-fence' }>,
  options: { replaceEntireDocument?: boolean } = {},
) => {
  const root = $getRoot();
  const artifactNode = $createPreviewArtifactNode({
    artifactKind: normalizePreviewArtifactKindForEditor(paste.language || 'code'),
    source: paste.source,
    sourceRange: null,
  });
  const trailingParagraph = $createParagraphNode();

  if (options.replaceEntireDocument || isPreviewMarkdownDocumentEmpty()) {
    root.clear();
    root.append(artifactNode);
    artifactNode.insertAfter(trailingParagraph);
    if (options.replaceEntireDocument) selectDocumentTopLanding();
    else trailingParagraph.selectStart();
    return true;
  }

  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    root.append(artifactNode);
    artifactNode.insertAfter(trailingParagraph);
    trailingParagraph.selectStart();
    return true;
  }
  if (selectionTouchesReadonlyOrTable(selection)) return false;
  if (!selectionHasPreviewMarkdownInsertTarget(selection)) {
    root.append(artifactNode);
    artifactNode.insertAfter(trailingParagraph);
    trailingParagraph.selectStart();
    return true;
  }

  $insertNodes([artifactNode]);
  artifactNode.insertAfter(trailingParagraph);
  trailingParagraph.selectStart();
  return true;
};

const getPreviewMarkdownDocumentChildren = () =>
  $getRoot().getChildren().filter((child) => (
    !$isPreviewSourceAnchorNode(child) &&
    !$isFinalSlashAiInlineDraftNode(child)
  ));

const isPreviewMarkdownDocumentEmpty = () => {
  const children = getPreviewMarkdownDocumentChildren();
  if (children.length === 0) return true;
  return children.every((child) => isEmptyPreviewParagraphNode(child));
};

const normalizeEmptyPreviewMarkdownDocument = () => {
  const root = $getRoot();
  const children = root.getChildren();
  if (children.length !== 1 || !isEmptyPreviewParagraphNode(children[0])) {
    root.clear();
    root.append($createParagraphNode());
  }
  return selectEditableTextBlockEdge(root.getFirstChild(), 'start');
};

const insertPreviewMarkdownSourcePasteBlocks = (
  blocks: readonly PreviewMarkdownDocumentBlock[],
  tableAlignments?: TableAlignmentRegistry,
  options: { replaceEntireDocument?: boolean } = {},
) => {
  if (options.replaceEntireDocument || isPreviewMarkdownDocumentEmpty()) {
    loadDocumentIntoEditor(blocks, tableAlignments);
    if (options.replaceEntireDocument) selectDocumentTopLanding();
    else selectDocumentLandingParagraph();
    return true;
  }
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return appendPreviewMarkdownSourcePasteNodesAtEnd(blocks, tableAlignments);
  }
  if (selectionTouchesReadonlyOrTable(selection)) return false;
  if (!selectionHasPreviewMarkdownInsertTarget(selection)) {
    return appendPreviewMarkdownSourcePasteNodesAtEnd(blocks, tableAlignments);
  }
  const nodes = createPreviewMarkdownSourcePasteNodes(blocks, tableAlignments);
  if (nodes.length === 0) return false;
  const previousMarkdown = serializeEditorDocument(undefined, tableAlignments);
  $insertNodes(nodes);
  selectDocumentLandingAfterInsertedNodes(nodes);
  const nextMarkdown = serializeEditorDocument(undefined, tableAlignments);
  if (nextMarkdown === previousMarkdown) {
    return appendPreviewMarkdownSourcePasteNodesAtEnd(blocks, tableAlignments);
  }
  return true;
};

const getNodeBlockFormat = (node: any): PreviewMarkdownBlockFormat => {
  const listNode = findAncestor(node, $isListNode);
  if (listNode) return listNode.getListType() === 'number' ? 'numberList' : 'bulletList';
  const headingNode = findAncestor(node, $isHeadingNode);
  if (headingNode) return headingNode.getTag() as PreviewMarkdownBlockFormat;
  if (findAncestor(node, $isQuoteNode)) return 'quote';
  return 'paragraph';
};

const getSelectionBlockFormatSnapshot = (
  selection: ReturnType<typeof $getSelection>,
): Pick<PreviewMarkdownLexicalFormatSnapshot, 'blockFormat' | 'canApplyBlockFormat'> => {
  if (!$isRangeSelection(selection)) {
    return { blockFormat: 'paragraph', canApplyBlockFormat: false };
  }
  if (selectionTouchesReadonlyOrTable(selection)) {
    return { blockFormat: getNodeBlockFormat(selection.anchor.getNode()), canApplyBlockFormat: false };
  }
  const nodes = selection.getNodes();
  const formats = new Set<PreviewMarkdownBlockFormat>(
    (nodes.length ? nodes : [selection.anchor.getNode()])
      .map((node) => getNodeBlockFormat(node)),
  );
  if (formats.size === 0) formats.add(getNodeBlockFormat(selection.anchor.getNode()));
  return {
    blockFormat: formats.size > 1 ? 'mixed' : [...formats][0],
    canApplyBlockFormat: true,
  };
};

const getSelectionElementInIsland = (node: Node | null, islandId: string) => {
  if (!node) return null;
  const element = node instanceof Element ? node : node.parentElement;
  const islandRoot = element?.closest('.aad-markdown-lexical-island-content');
  if (!(islandRoot instanceof HTMLElement) || islandRoot.dataset.previewEditIsland !== islandId) {
    return null;
  }
  return element instanceof HTMLElement ? element : islandRoot;
};

const getTopLevelIslandElement = (element: HTMLElement, islandRoot: HTMLElement) => {
  let current: HTMLElement | null = element;
  while (current?.parentElement && current.parentElement !== islandRoot) {
    current = current.parentElement;
  }
  return current?.parentElement === islandRoot ? current : null;
};

const findPreviousSourceAnchorElement = (element: HTMLElement, islandRoot: HTMLElement) => {
  let current: Element | null = getTopLevelIslandElement(element, islandRoot);
  while (current) {
    if (current instanceof HTMLElement && current.classList.contains('aad-preview-source-anchor')) {
      return current;
    }
    current = current.previousElementSibling;
  }
  return null;
};

const selectionElementTouchesPreviewAiExcludedDom = (element: HTMLElement, islandRoot: HTMLElement) => {
  if (!islandRoot.contains(element)) return true;
  return Boolean(element.closest(PREVIEW_AI_DOM_SELECTION_EXCLUDED_SELECTOR));
};

const selectionElementTouchesPreviewAiReadonlyTableDom = (element: HTMLElement, islandRoot: HTMLElement) => {
  if (!islandRoot.contains(element)) return false;
  return Boolean(element.closest(PREVIEW_AI_DOM_READONLY_TABLE_SELECTOR));
};

const domSelectionTouchesPreviewAiReadonlyTable = (islandId: string) => {
  const domSelection = window.getSelection();
  if (!domSelection || domSelection.isCollapsed || domSelection.rangeCount === 0) return false;
  const range = domSelection.getRangeAt(0);
  const startElement = getSelectionElementInIsland(range.startContainer, islandId);
  const endElement = getSelectionElementInIsland(range.endContainer, islandId);
  if (!startElement || !endElement) return false;
  const islandRoot = startElement.closest('.aad-markdown-lexical-island-content');
  if (
    !(islandRoot instanceof HTMLElement) ||
    islandRoot.dataset.previewEditIsland !== islandId ||
    endElement.closest('.aad-markdown-lexical-island-content') !== islandRoot
  ) {
    return false;
  }
  return (
    selectionElementTouchesPreviewAiReadonlyTableDom(startElement, islandRoot) ||
    selectionElementTouchesPreviewAiReadonlyTableDom(endElement, islandRoot)
  );
};

const getDomSelectionSourceRange = (islandId: string) => {
  const domSelection = window.getSelection();
  if (!domSelection || domSelection.isCollapsed || domSelection.rangeCount === 0) return null;
  const range = domSelection.getRangeAt(0);
  const startElement = getSelectionElementInIsland(range.startContainer, islandId);
  const endElement = getSelectionElementInIsland(range.endContainer, islandId);
  if (!startElement || !endElement) return null;
  const islandRoot = startElement.closest('.aad-markdown-lexical-island-content');
  if (
    !(islandRoot instanceof HTMLElement) ||
    islandRoot.dataset.previewEditIsland !== islandId ||
    endElement.closest('.aad-markdown-lexical-island-content') !== islandRoot
  ) {
    return null;
  }
  if (
    selectionElementTouchesPreviewAiExcludedDom(startElement, islandRoot) ||
    selectionElementTouchesPreviewAiExcludedDom(endElement, islandRoot)
  ) {
    return null;
  }
  const startSourceRange =
    readSourceRangeAttributes(startElement) ??
    readSourceRangeAttributes(findPreviousSourceAnchorElement(startElement, islandRoot));
  const endSourceRange =
    readSourceRangeAttributes(endElement) ??
    readSourceRangeAttributes(findPreviousSourceAnchorElement(endElement, islandRoot));
  return mergeSourcePositionRanges(startSourceRange, endSourceRange);
};

const countAiSelectionOccurrences = (haystack: string, needle: string) => {
  const normalizedHaystack = normalizeAiSelectionOccurrenceText(haystack);
  const normalizedNeedle = normalizeAiSelectionOccurrenceText(needle);
  if (!normalizedNeedle) return 0;
  let count = 0;
  let searchFrom = 0;
  while (searchFrom < normalizedHaystack.length) {
    const found = normalizedHaystack.indexOf(normalizedNeedle, searchFrom);
    if (found < 0) break;
    count += 1;
    searchFrom = found + normalizedNeedle.length;
  }
  return count;
};

const getDomSelectionOccurrenceIndex = (islandId: string, selectedText: string) => {
  const domSelection = window.getSelection();
  if (!domSelection || domSelection.isCollapsed || domSelection.rangeCount === 0) return 0;
  const range = domSelection.getRangeAt(0);
  const startElement = getSelectionElementInIsland(range.startContainer, islandId);
  const endElement = getSelectionElementInIsland(range.endContainer, islandId);
  if (!startElement || !endElement) return 0;
  const islandRoot = startElement.closest('.aad-markdown-lexical-island-content');
  if (
    !(islandRoot instanceof HTMLElement) ||
    islandRoot.dataset.previewEditIsland !== islandId ||
    endElement.closest('.aad-markdown-lexical-island-content') !== islandRoot
  ) {
    return 0;
  }
  if (
    selectionElementTouchesPreviewAiExcludedDom(startElement, islandRoot) ||
    selectionElementTouchesPreviewAiExcludedDom(endElement, islandRoot)
  ) {
    return 0;
  }
  const startLineElement = getTopLevelIslandElement(startElement, islandRoot);
  const endLineElement = getTopLevelIslandElement(endElement, islandRoot);
  if (!startLineElement || startLineElement !== endLineElement) return 0;
  try {
    const prefixRange = range.cloneRange();
    prefixRange.selectNodeContents(startLineElement);
    prefixRange.setEnd(range.startContainer, range.startOffset);
    return countAiSelectionOccurrences(prefixRange.toString(), selectedText);
  } catch {
    return 0;
  }
};

const getSelectionComputedStyleValue = (islandId: string, property: string) => {
  if (typeof window === 'undefined') return '';
  const domSelection = window.getSelection();
  if (!domSelection || domSelection.rangeCount === 0) return '';
  const target =
    getSelectionElementInIsland(domSelection.anchorNode, islandId) ??
    getSelectionElementInIsland(domSelection.focusNode, islandId);
  return target ? window.getComputedStyle(target).getPropertyValue(property).trim() : '';
};

const resolveToolbarFontFamily = (fontFamily: string) => {
  const safeFontFamily = sanitizeMarkdownInlineStyle({ fontFamily }).fontFamily;
  if (safeFontFamily) return safeFontFamily;
  const normalizedFontFamily = String(fontFamily ?? '')
    .replace(/["']/g, '')
    .toLowerCase();
  if (!normalizedFontFamily) return '';
  if (
    normalizedFontFamily.includes('morndraft serif sc') ||
    normalizedFontFamily.includes('source han serif') ||
    normalizedFontFamily.includes('noto serif') ||
    normalizedFontFamily.includes('songti') ||
    normalizedFontFamily.includes('stsong') ||
    normalizedFontFamily.includes('simsun')
  ) {
    return TOOLBAR_FONT_FAMILY_SERIF;
  }
  if (
    normalizedFontFamily.includes('morndraft sans sc') ||
    normalizedFontFamily.includes('source han sans') ||
    normalizedFontFamily.includes('noto sans') ||
    normalizedFontFamily.includes('pingfang sc') ||
    normalizedFontFamily.includes('microsoft yahei') ||
    normalizedFontFamily.includes('sans-serif')
  ) {
    return TOOLBAR_FONT_FAMILY_SANS;
  }
  return '';
};

const getRootLevelSelectionNode = (node: LexicalNode) => {
  const root = $getRoot();
  let current = node;
  let parent = current.getParent();
  while (parent && parent !== root) {
    current = parent;
    parent = current.getParent();
  }
  return current;
};

const normalizeFullDocumentSelectionText = (text: string) => text.replace(/\s+$/u, '');

const normalizeFullDocumentSelectionTextCompact = (text: string) =>
  normalizeFullDocumentSelectionText(text).replace(/\s+/gu, '');

const selectionCoversPreviewMarkdownDocument = (selection: ReturnType<typeof $getSelection>) => {
  if (!$isRangeSelection(selection)) return false;
  const children = getPreviewMarkdownDocumentChildren();
  if (children.length === 0) return true;
  const selectedNodes = selection.getNodes();
  if (selectedNodes.length === 0) return false;
  const selectedRootChildren = new Set<LexicalNode>();
  selectedNodes.forEach((node) => {
    const rootLevelNode = getRootLevelSelectionNode(node);
    if (!$isPreviewSourceAnchorNode(rootLevelNode)) selectedRootChildren.add(rootLevelNode);
  });
  if (!children.every((child) => selectedRootChildren.has(child))) return false;
  const fullText = normalizeFullDocumentSelectionText($getRoot().getTextContent());
  if (!fullText) return true;
  return normalizeFullDocumentSelectionText(selection.getTextContent()) === fullText;
};

const domSelectionCoversPreviewMarkdownDocument = (rootElement: HTMLElement) => {
  if (typeof window === 'undefined') return false;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return false;
  const selectedText = normalizeFullDocumentSelectionText(selection.toString());
  if (!selectedText) return false;
  const rootTextCandidates = [
    rootElement.innerText ?? '',
    rootElement.textContent ?? '',
  ]
    .map((text) => normalizeFullDocumentSelectionText(text))
    .filter(Boolean);
  if (rootTextCandidates.some((text) => selectedText === text)) return true;

  const compactSelectedText = normalizeFullDocumentSelectionTextCompact(selectedText);
  return Boolean(compactSelectedText && rootTextCandidates.some((text) => (
    normalizeFullDocumentSelectionTextCompact(text) === compactSelectedText
  )));
};

const getSourceRangeFromSelectionNode = (node: LexicalNode | null): SourcePositionRange | null => {
  if (!node) return null;
  if ($isPreviewSourceAnchorNode(node)) return node.getSourceRange();
  if ($isPreviewArtifactNode(node)) return node.getSourceRange();
  if (node instanceof CodeBlockDecoratorNode) return node.getSourceRange();
  const rootLevelNode = getRootLevelSelectionNode(node);
  if ($isPreviewSourceAnchorNode(rootLevelNode)) return rootLevelNode.getSourceRange();
  if ($isPreviewArtifactNode(rootLevelNode)) return rootLevelNode.getSourceRange();
  if (rootLevelNode instanceof CodeBlockDecoratorNode) return rootLevelNode.getSourceRange();
  const previousSibling = rootLevelNode.getPreviousSibling();
  return $isPreviewSourceAnchorNode(previousSibling) ? previousSibling.getSourceRange() : null;
};

const compareSourcePosition = (
  leftLine: number,
  leftColumn: number,
  rightLine: number,
  rightColumn: number,
) => leftLine - rightLine || leftColumn - rightColumn;

const mergeSourcePositionRanges = (
  first: SourcePositionRange | null,
  second: SourcePositionRange | null,
): SourcePositionRange | null => {
  if (!first) return second;
  if (!second) return first;
  const startsWithFirst = compareSourcePosition(
    first.startLine,
    first.startColumn,
    second.startLine,
    second.startColumn,
  ) <= 0;
  const endsWithFirst = compareSourcePosition(
    first.endLine,
    first.endColumn,
    second.endLine,
    second.endColumn,
  ) >= 0;
  const startRange = startsWithFirst ? first : second;
  const endRange = endsWithFirst ? first : second;
  return {
    startLine: startRange.startLine,
    startColumn: startRange.startColumn,
    endLine: endRange.endLine,
    endColumn: endRange.endColumn,
  };
};

const getLexicalSelectionSourceRange = () => {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;
  return mergeSourcePositionRanges(
    getSourceRangeFromSelectionNode(selection.anchor.getNode()),
    getSourceRangeFromSelectionNode(selection.focus.getNode()),
  );
};

const getLexicalSelectionSourceLine = () => getLexicalSelectionSourceRange()?.startLine ?? null;

const isUsableSelectionClientRect = (rect: DOMRect | ClientRect | null | undefined) =>
  Boolean(rect && rect.width > 0 && rect.height > 0);

const toPreviewAiSelectionRect = (rect: DOMRect | ClientRect): PreviewAiSelectionRect => ({
  height: rect.height,
  left: rect.left,
  top: rect.top,
  width: rect.width,
});

const getPreviewAiSelectionRectKey = (rect: PreviewAiSelectionRect) =>
  [rect.left, rect.top, rect.width, rect.height]
    .map((value) => Math.round(value * 2) / 2)
    .join(':');

const dedupePreviewAiSelectionRects = (rects: PreviewAiSelectionRect[]) => {
  const seenKeys = new Set<string>();
  return rects.filter((rect) => {
    const key = getPreviewAiSelectionRectKey(rect);
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });
};

const getSelectionHighlightRects = (range: Range) => {
  const clientRects = dedupePreviewAiSelectionRects(
    Array.from(range.getClientRects())
      .filter(isUsableSelectionClientRect)
      .map(toPreviewAiSelectionRect),
  );
  if (clientRects.length > 0) return clientRects;
  const boundingRect = range.getBoundingClientRect();
  return isUsableSelectionClientRect(boundingRect) ? [toPreviewAiSelectionRect(boundingRect)] : [];
};

const getSelectionToolbarAnchorRect = (range: Range) => {
  const clientRects = Array.from(range.getClientRects()).filter(isUsableSelectionClientRect);
  const boundingRect = range.getBoundingClientRect();
  if (clientRects.length === 0) {
    if (!isUsableSelectionClientRect(boundingRect)) return null;
    return toPreviewAiSelectionRect(boundingRect);
  }
  const bottomRect = clientRects.reduce((currentBottomRect, rect) => {
    if (rect.bottom > currentBottomRect.bottom + 0.5) return rect;
    if (Math.abs(rect.bottom - currentBottomRect.bottom) <= 0.5 && rect.left < currentBottomRect.left) return rect;
    return currentBottomRect;
  }, clientRects[0]);
  const horizontalRect = isUsableSelectionClientRect(boundingRect) ? boundingRect : bottomRect;
  return {
    height: bottomRect.height,
    left: horizontalRect.left,
    top: bottomRect.top,
    width: horizontalRect.width,
  };
};

const getSelectionGeometryFromRange = (range: Range) => {
  const rect = getSelectionToolbarAnchorRect(range);
  if (!rect) return null;
  const selectionRects = getSelectionHighlightRects(range);
  return {
    rect,
    selectionRects: selectionRects.length > 0 ? selectionRects : [rect],
  };
};

const getDomSelectionGeometry = (islandId: string) => {
  const domSelection = window.getSelection();
  if (!domSelection || domSelection.isCollapsed || domSelection.rangeCount === 0) return null;
  if (
    !getSelectionElementInIsland(domSelection.anchorNode, islandId) ||
    !getSelectionElementInIsland(domSelection.focusNode, islandId)
  ) {
    return null;
  }
  const range = domSelection.getRangeAt(0);
  return getSelectionGeometryFromRange(range);
};

const getCurrentSelectionGeometry = () => {
  const domSelection = window.getSelection();
  if (!domSelection || domSelection.isCollapsed || domSelection.rangeCount === 0) return null;
  const range = domSelection.getRangeAt(0);
  return getSelectionGeometryFromRange(range);
};

const createReadonlyAiSelectionCandidate = ({
  contentKind,
  image,
  islandId,
  patchTarget,
  patchable = Boolean(patchTarget),
  repairDiagnostic,
  rect: rectOverride,
  selectionRects: selectionRectsOverride,
  selectionScope,
  selectedText,
  sourceRange,
}: {
  contentKind?: PreviewAiSelectionContentKind;
  image?: PreviewAiSelectionImageContext;
  islandId: string;
  patchTarget?: PreviewAiSelectionCandidatePatchTarget;
  patchable?: boolean;
  repairDiagnostic?: ArtifactDiagnostic | null;
  rect?: PreviewAiSelectionRect | null;
  selectionRects?: PreviewAiSelectionRect[] | null;
  selectionScope?: PreviewAiSelectionScope;
  selectedText: string | null | undefined;
  sourceRange: SourcePositionRange | null | undefined;
}): PreviewAiSelectionCandidate | null => {
  const safeSelectedText = selectedText?.trim() ?? '';
  const selectionGeometry = rectOverride ? null : getCurrentSelectionGeometry();
  const rect = rectOverride ?? selectionGeometry?.rect;
  const selectionRects = selectionRectsOverride ?? selectionGeometry?.selectionRects;
  if (!safeSelectedText || !sourceRange?.startLine || !rect) return null;
  return {
    capturedAt: Date.now(),
    contentKind,
    image,
    islandId,
    patchTarget,
    patchable,
    ...(repairDiagnostic?.severity === 'error' ? { repairDiagnostic } : {}),
    rect,
    ...(selectionRects?.length ? { selectionRects } : {}),
    ...(selectionScope ? { selectionScope } : {}),
    selectedText: safeSelectedText,
    sourceLine: sourceRange.startLine,
    sourceLineRange: {
      startLine: sourceRange.startLine,
      endLine: sourceRange.endLine,
    },
    sourceRange,
  };
};

const getLexicalAiSelectionCandidate = (
  islandId: string,
  source?: string,
): PreviewAiSelectionCandidate | null => {
  if (isPreviewProgrammaticTextSelectionActive()) {
    debugPreviewLexical('ai-selection-candidate', { islandId, reason: 'programmatic-selection' });
    return null;
  }
  const selectedText = window.getSelection()?.toString().trim() || '';
  if (!selectedText) {
    debugPreviewLexical('ai-selection-candidate', {
      islandId,
      reason: 'selected-text-empty',
      selectedTextLength: selectedText.length,
    });
    return null;
  }
  const selectionGeometry = getDomSelectionGeometry(islandId);
  if (!selectionGeometry) {
    debugPreviewLexical('ai-selection-candidate', {
      islandId,
      reason: 'missing-selection-rect',
      selectedTextLength: selectedText.length,
    });
    return null;
  }
  const selection = $getSelection();
  const rootElement = getSelectionElementInIsland(window.getSelection()?.anchorNode ?? null, islandId)
    ?.closest('.aad-markdown-lexical-island-content');
  const isFullDocumentSelection = islandId === PREVIEW_MARKDOWN_DOCUMENT_ID && (
    (rootElement instanceof HTMLElement && domSelectionCoversPreviewMarkdownDocument(rootElement)) ||
    ($isRangeSelection(selection) && selectionCoversPreviewMarkdownDocument(selection))
  );
  const lexicalSourceRange = $isRangeSelection(selection) && !selection.isCollapsed()
    ? getLexicalSelectionSourceRange()
    : null;
  const isTableSelection = $isRangeSelection(selection) &&
    !selection.isCollapsed() &&
    selection.getNodes().some((node) =>
      Boolean(findAncestor(node, (current) =>
        $isTableNode(current) || $isTableRowNode(current) || $isTableCellNode(current),
      )),
    );
  const isReadonlyTableDomSelection = domSelectionTouchesPreviewAiReadonlyTable(islandId);
  const isReadonlyOrTableSelection = $isRangeSelection(selection) &&
    !selection.isCollapsed() &&
    (isReadonlyTableDomSelection || isTableSelection || selectionTouchesReadonlyOrTable(selection));
  const domSourceRange = getDomSelectionSourceRange(islandId);
  const sourceRange = lexicalSourceRange ?? domSourceRange;
  const fullDocumentPatchTarget = isFullDocumentSelection
    ? createPreviewAiFullDocumentPatchTarget(source)
    : undefined;
  const effectiveSourceRange = fullDocumentPatchTarget
    ? createFullSourcePositionRange(source ?? '')
    : sourceRange;
  if (!effectiveSourceRange?.startLine) {
    debugPreviewLexical('ai-selection-candidate', {
      domSourceRange,
      islandId,
      lexicalSourceRange,
      reason: 'missing-source-range',
      selectedTextLength: selectedText.length,
    });
    return null;
  }
  const selectionOccurrenceIndex = !fullDocumentPatchTarget && sourceRange?.startLine === sourceRange?.endLine
    ? getDomSelectionOccurrenceIndex(islandId, selectedText)
    : 0;
  debugPreviewLexical('ai-selection-candidate', {
    domSourceRange,
    islandId,
    lexicalSourceRange,
    reason: 'resolved',
    selectionOccurrenceIndex,
    selectedTextLength: selectedText.length,
    sourceRange: effectiveSourceRange,
  });
  return {
    capturedAt: Date.now(),
    contentKind: 'text',
    islandId,
    patchTarget: fullDocumentPatchTarget,
    rect: selectionGeometry.rect,
    ...(selectionGeometry.selectionRects.length > 0
      ? { selectionRects: selectionGeometry.selectionRects }
      : {}),
    ...(fullDocumentPatchTarget ? { selectionScope: 'whole' as const } : {}),
    selectedText,
    patchable: Boolean(fullDocumentPatchTarget) || !isReadonlyOrTableSelection,
    ...(selectionOccurrenceIndex > 0 ? { selectionOccurrenceIndex } : {}),
    sourceLine: effectiveSourceRange.startLine,
    sourceLineRange: {
      startLine: effectiveSourceRange.startLine,
      endLine: effectiveSourceRange.endLine,
    },
    sourceRange: effectiveSourceRange,
  };
};

const getLexicalFormatSnapshot = (islandId: string) => {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || selection.isCollapsed()) {
    return {
      activeTextFormats: createDefaultActiveTextFormats(),
      blockFormat: 'paragraph' as PreviewMarkdownBlockFormat,
      canApplyBlockFormat: false,
      canFormat: false,
      islandId,
      selectedColor: '',
      selectedFontFamily: '',
      selectedFontSize: '',
      selectedLetterSpacing: '',
      selectedLineHeight: '',
    };
  }
  const explicitFontFamily = $getSelectionStyleValueForProperty(selection, 'font-family', '');
  const selectedStyle = sanitizeMarkdownInlineStyle({
    color: $getSelectionStyleValueForProperty(selection, 'color', ''),
    fontFamily: explicitFontFamily,
    fontSize: $getSelectionStyleValueForProperty(selection, 'font-size', ''),
    letterSpacing: $getSelectionStyleValueForProperty(selection, 'letter-spacing', ''),
    lineHeight: $getSelectionStyleValueForProperty(selection, 'line-height', ''),
  });
  const selectedFontFamily =
    selectedStyle.fontFamily ||
    resolveToolbarFontFamily(getSelectionComputedStyleValue(islandId, 'font-family'));
  const blockSnapshot = getSelectionBlockFormatSnapshot(selection);
  return {
    activeTextFormats: getActiveTextFormats(selection),
    ...blockSnapshot,
    canFormat: true,
    islandId,
    selectedColor: selectedStyle.color || '',
    selectedFontFamily,
    selectedFontSize: selectedStyle.fontSize || '',
    selectedLetterSpacing: selectedStyle.letterSpacing || '',
    selectedLineHeight: selectedStyle.lineHeight || '',
  };
};

const createLexicalStylePatch = (style: {
  color?: string;
  fontFamily?: string;
  fontSize?: string;
  letterSpacing?: string;
}) => {
  const safeStyle = sanitizeMarkdownInlineStyle(style);
  const patch: Record<string, string | null> = {};
  if (Object.prototype.hasOwnProperty.call(style, 'color')) patch.color = safeStyle.color || null;
  if (Object.prototype.hasOwnProperty.call(style, 'fontFamily')) patch['font-family'] = safeStyle.fontFamily || null;
  if (Object.prototype.hasOwnProperty.call(style, 'fontSize')) patch['font-size'] = safeStyle.fontSize || null;
  if (Object.prototype.hasOwnProperty.call(style, 'letterSpacing')) {
    patch['letter-spacing'] = safeStyle.letterSpacing || null;
  }
  return patch;
};

const getLineHeightStyleTarget = (node: LexicalNode | null | undefined) => {
  if (!node) return null;
  return findAncestor(node, $isTableCellNode) ||
    findAncestor(node, $isListItemNode) ||
    findAncestor(node, $isHeadingNode) ||
    findAncestor(node, $isQuoteNode) ||
    findAncestor(node, $isParagraphNode);
};

const patchTextNodeStyleProperty = (
  node: LexicalNode,
  property: keyof NonNullable<RichInlineSegment['style']>,
  value: string | null,
) => {
  if (!$isTextNode(node)) return;
  const nextStyle = {
    ...parseLexicalStyleText(node.getStyle()),
  };
  if (value) {
    nextStyle[property] = value;
  } else {
    delete nextStyle[property];
  }
  node.setStyle(serializeMarkdownInlineStyle(nextStyle));
};

const applyLineHeightToSelectionBlocks = (
  selection: ReturnType<typeof $getSelection>,
  lineHeight: string | null,
) => {
  if (!$isRangeSelection(selection)) return;
  const targets = new Set<LexicalNode>();
  const nodes = selection.getNodes();
  (nodes.length ? nodes : [selection.anchor.getNode()]).forEach((node) => {
    const target = getLineHeightStyleTarget(node);
    if (target) targets.add(target);
  });
  targets.forEach((target) => {
    if (!$isElementNode(target)) return;
    target.getAllTextNodes().forEach((textNode) => {
      if (getLineHeightStyleTarget(textNode)?.getKey() !== target.getKey()) return;
      patchTextNodeStyleProperty(textNode, 'lineHeight', lineHeight);
    });
  });
};

const LexicalDocumentChangePlugin: React.FC<{
  documentId: string;
  onChange: (markdown: string, kind?: MarkdownLexicalPatchKind) => void;
  sourceOverridesRef: React.MutableRefObject<ArtifactSourceOverrideMap>;
  tableAlignmentsRef: React.MutableRefObject<TableAlignmentRegistry>;
}> = ({ documentId, onChange, sourceOverridesRef, tableAlignmentsRef }) => {
  const [editor] = useLexicalComposerContext();
  const onChangeRef = useRef(onChange);
  const isReadyForUserChangeRef = useRef(false);
  const hasUserChangeIntentRef = useRef(false);
  onChangeRef.current = onChange;
  useEffect(() => {
    isReadyForUserChangeRef.current = false;
    hasUserChangeIntentRef.current = false;
    let firstFrame = 0;
    let secondFrame = 0;
    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        isReadyForUserChangeRef.current = true;
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [documentId]);
  useEffect(() => {
    const markUserChangeIntent = (event: Event) => {
      const rootElement = editor.getRootElement();
      if (!rootElement || !(event.target instanceof Node) || !rootElement.contains(event.target)) return;
      hasUserChangeIntentRef.current = true;
    };
    document.addEventListener('beforeinput', markUserChangeIntent, true);
    document.addEventListener('compositionstart', markUserChangeIntent, true);
    document.addEventListener('drop', markUserChangeIntent, true);
    document.addEventListener('keydown', markUserChangeIntent, true);
    document.addEventListener('paste', markUserChangeIntent, true);
    return () => {
      document.removeEventListener('beforeinput', markUserChangeIntent, true);
      document.removeEventListener('compositionstart', markUserChangeIntent, true);
      document.removeEventListener('drop', markUserChangeIntent, true);
      document.removeEventListener('keydown', markUserChangeIntent, true);
      document.removeEventListener('paste', markUserChangeIntent, true);
    };
  }, [editor]);
  useEffect(
    () =>
      editor.registerUpdateListener(({ editorState, tags }) => {
        if (tags.has(PREVIEW_RESET_UPDATE_TAG)) return;
        if (tags.has(ISLAND_MARKDOWN_SOURCE_PASTE_UPDATE_TAG)) return;
        if (tags.has(ISLAND_SLASH_AI_DRAFT_UPDATE_TAG)) return;
        const hasPreviewEditTag = (
          tags.has(ISLAND_AI_INSERT_UPDATE_TAG) ||
          tags.has(ISLAND_CODE_BLOCK_UPDATE_TAG) ||
          tags.has(ISLAND_CODE_BLOCK_STRUCTURE_UPDATE_TAG) ||
          tags.has(ISLAND_CODE_FENCE_SHORTCUT_UPDATE_TAG) ||
          tags.has(ISLAND_FORMAT_UPDATE_TAG) ||
          tags.has(ISLAND_IMAGE_INSERT_UPDATE_TAG) ||
          tags.has(ISLAND_TABLE_SHORTCUT_UPDATE_TAG)
        );
        if (!hasPreviewEditTag && (!isReadyForUserChangeRef.current || !hasUserChangeIntentRef.current)) return;
        const kind: MarkdownLexicalPatchKind = tags.has(ISLAND_AI_INSERT_UPDATE_TAG)
            ? 'ai'
            : tags.has(ISLAND_FORMAT_UPDATE_TAG)
              ? 'style'
            : (tags.has(ISLAND_CODE_BLOCK_STRUCTURE_UPDATE_TAG) || tags.has(ISLAND_CODE_FENCE_SHORTCUT_UPDATE_TAG))
              ? 'structure'
              : tags.has(ISLAND_CODE_BLOCK_UPDATE_TAG)
              ? 'code'
              : tags.has(ISLAND_IMAGE_INSERT_UPDATE_TAG)
                ? 'image'
                : tags.has(ISLAND_TABLE_SHORTCUT_UPDATE_TAG)
                  ? 'table'
                  : 'text';
        debugPreviewLexical('document-change', {
          documentId,
          kind,
          tags: Array.from(tags),
        });
        editorState.read(() => {
          onChangeRef.current(
            serializeEditorDocument(sourceOverridesRef.current, tableAlignmentsRef.current),
            kind,
          );
        });
      }),
    [documentId, editor, sourceOverridesRef, tableAlignmentsRef],
  );
  return null;
};

const LexicalAiReplacementApplierPlugin: React.FC<{
  documentId: string;
  editState: PreviewMarkdownEditState;
  fullSourceRef: React.MutableRefObject<string | undefined>;
  lastMarkdownRef: React.MutableRefObject<string>;
  sourceOverridesRef: React.MutableRefObject<ArtifactSourceOverrideMap>;
  sourceRef: React.MutableRefObject<string>;
  tableAlignmentsRef: React.MutableRefObject<TableAlignmentRegistry>;
}> = ({
  documentId,
  editState,
  fullSourceRef,
  lastMarkdownRef,
  sourceOverridesRef,
  sourceRef,
  tableAlignmentsRef,
}) => {
  const [editor] = useLexicalComposerContext();
  const { registerAiFocusRestorer, registerAiReplacementApplier } = editState;
  const applyAiReplacementInEditor = useCallback<PreviewAiReplacementApplier>((input) => {
    let didApply = false;
    let nextMarkdown: string | null = null;
    editor.update(() => {
      $addUpdateTag(PREVIEW_RESET_UPDATE_TAG);
      $addUpdateTag(SKIP_DOM_SELECTION_TAG);
      $addUpdateTag(SKIP_SCROLL_INTO_VIEW_TAG);
      didApply = applyAiTextNodeReplacement(input, sourceRef.current);
      if (!didApply) return;
      nextMarkdown = serializeEditorDocument(sourceOverridesRef.current, tableAlignmentsRef.current);
    });
    if (!didApply || !nextMarkdown) return false;
    sourceRef.current = nextMarkdown;
    fullSourceRef.current = nextMarkdown;
    lastMarkdownRef.current = nextMarkdown;
    return true;
  }, [editor, fullSourceRef, lastMarkdownRef, sourceOverridesRef, sourceRef, tableAlignmentsRef]);

  const restoreAiSelectionFocusInEditor = useCallback<PreviewAiFocusRestorer>(() => {
    window.requestAnimationFrame(() => {
      const rootElement = editor.getRootElement();
      rootElement?.focus({ preventScroll: true });
      editor.update(() => {
        $addUpdateTag(SKIP_SCROLL_INTO_VIEW_TAG);
        selectRootEndEditableTextBlock();
      });
    });
  }, [editor]);

  useEffect(
    () => registerAiReplacementApplier(documentId, applyAiReplacementInEditor),
    [applyAiReplacementInEditor, documentId, registerAiReplacementApplier],
  );

  useEffect(
    () => registerAiFocusRestorer(documentId, restoreAiSelectionFocusInEditor),
    [documentId, registerAiFocusRestorer, restoreAiSelectionFocusInEditor],
  );

  return null;
};

const LexicalDocumentAutoFocusPlugin: React.FC<{
  autoFocusKey?: number;
  autoFocusTarget?: PreviewMarkdownAutoFocusTarget;
}> = ({ autoFocusKey = 0, autoFocusTarget = 'rootEnd' }) => {
  const [editor] = useLexicalComposerContext();
  const lastAutoFocusKeyRef = useRef(0);
  useEffect(() => {
    if (autoFocusKey <= 0 || lastAutoFocusKeyRef.current === autoFocusKey) return undefined;
    let cancelled = false;
    let frameId: number | null = null;
    const focusWhenReady = (attempt: number) => {
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        if (cancelled) return;
        const rootElement = editor.getRootElement();
        if (!rootElement && attempt < 6) {
          focusWhenReady(attempt + 1);
          return;
        }
        rootElement?.focus({ preventScroll: true });
        if (autoFocusTarget === 'topEditable') {
          editor.update(() => {
            $addUpdateTag(SKIP_SCROLL_INTO_VIEW_TAG);
            if (!selectTopEditableTextBlock()) {
              selectRootEndEditableTextBlock();
            }
          });
        } else {
          editor.focus(undefined, { defaultSelection: 'rootEnd' });
        }
        lastAutoFocusKeyRef.current = autoFocusKey;
      });
    };
    focusWhenReady(0);
    return () => {
      cancelled = true;
      if (frameId !== null) window.cancelAnimationFrame(frameId);
    };
  }, [autoFocusKey, autoFocusTarget, editor]);
  return null;
};

const LexicalBlankDocumentFocusPlugin: React.FC = () => {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    let currentSurfaceElement: HTMLElement | null = null;
    const handlePointerDown = (event: PointerEvent) => {
      const rootElement = editor.getRootElement();
      if (!rootElement || !currentSurfaceElement) return;
      if (!isPreviewBlankDocumentPointerTarget(event.target, currentSurfaceElement, rootElement)) return;
      let isBlankDocument = false;
      editor.getEditorState().read(() => {
        isBlankDocument = isPreviewMarkdownDocumentEmpty();
      });
      if (!isBlankDocument) return;
      event.preventDefault();
      rootElement.focus({ preventScroll: true });
      editor.update(() => {
        $addUpdateTag(SKIP_SCROLL_INTO_VIEW_TAG);
        if (!selectTopEditableTextBlock()) {
          selectRootEndEditableTextBlock();
        }
      });
    };
    const unregisterRootListener = editor.registerRootListener((rootElement, previousRootElement) => {
      const previousSurfaceElement = previousRootElement?.closest<HTMLElement>('.aad-document-surface');
      previousSurfaceElement?.removeEventListener('pointerdown', handlePointerDown, true);
      currentSurfaceElement = rootElement?.closest<HTMLElement>('.aad-document-surface') ?? null;
      currentSurfaceElement?.addEventListener('pointerdown', handlePointerDown, true);
    });
    return () => {
      currentSurfaceElement?.removeEventListener('pointerdown', handlePointerDown, true);
      unregisterRootListener();
    };
  }, [editor]);
  return null;
};

const isFinalLineClickInteractiveTarget = (target: EventTarget | null) => {
  const element = target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
  return Boolean(element?.closest([PREVIEW_INTERACTIVE_ELEMENT_SELECTOR, '.aad-final-insert-menu', '.aad-preview-ai-selection-toolbar', '[data-copy-role]'].join(',')));
};
const getFinalLineClickBlockBounds = (editor: LexicalEditor) => editor.getEditorState().read(() => $getRoot().getChildren().flatMap((node) => {
  if ($isPreviewSourceAnchorNode(node) || $isFinalSlashAiInlineDraftNode(node) || isEmptyPreviewParagraphNode(node)) return [];
  const element = editor.getElementByKey(node.getKey());
  if (!element) return [];
  const { bottom, top } = element.getBoundingClientRect();
  return [{ bottom, nodeKey: node.getKey(), top }];
}));
const insertFinalLineClickParagraph = (target: FinalLineClickInsertionTarget) => {
  const root = $getRoot(), anchorNode = $getNodeByKey(target.nodeKey);
  if (!anchorNode || anchorNode.getParent() !== root) return false;
  let insertionAnchor = anchorNode;
  let adjacentNode = target.placement === 'before' ? anchorNode.getPreviousSibling() : anchorNode.getNextSibling();
  if (target.placement === 'before' && $isPreviewSourceAnchorNode(adjacentNode)) { insertionAnchor = adjacentNode; adjacentNode = adjacentNode.getPreviousSibling(); }
  if (isEmptyPreviewParagraphNode(adjacentNode)) { adjacentNode.selectStart(); return false; }
  const paragraph = $createParagraphNode();
  if (target.placement === 'before') insertionAnchor.insertBefore(paragraph);
  else anchorNode.insertAfter(paragraph);
  paragraph.selectStart();
  return true;
};
const LexicalFinalLineClickPlugin: React.FC<{ requestForceDocumentRefresh: () => void }> = ({ requestForceDocumentRefresh }) => {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    let currentSurfaceElement: HTMLElement | null = null;
    const handlePointerDown = (event: PointerEvent) => {
      const rootElement = editor.getRootElement();
      if (!rootElement || !currentSurfaceElement || !(event.target instanceof Node) || !currentSurfaceElement.contains(event.target)) return;
      if (!shouldHandleFinalLineClickPointer({
        altKey: event.altKey, button: event.button, ctrlKey: event.ctrlKey,
        isInteractiveTarget: isFinalLineClickInteractiveTarget(event.target),
        metaKey: event.metaKey, pointerType: event.pointerType, shiftKey: event.shiftKey,
      })) return;
      const target = resolveFinalLineClickInsertionTarget(event.clientY, getFinalLineClickBlockBounds(editor));
      if (!target) return;
      event.preventDefault();
      rootElement.focus({ preventScroll: true });
      editor.update(() => {
        $addUpdateTag(HISTORY_PUSH_TAG);
        $addUpdateTag(SKIP_SCROLL_INTO_VIEW_TAG);
        if (insertFinalLineClickParagraph(target)) requestForceDocumentRefresh();
      });
    };
    const unregisterRootListener = editor.registerRootListener((rootElement, previousRootElement) => {
      previousRootElement?.closest<HTMLElement>('.aad-document-surface')?.removeEventListener('pointerdown', handlePointerDown, true);
      currentSurfaceElement = rootElement?.closest<HTMLElement>('.aad-document-surface') ?? null;
      currentSurfaceElement?.addEventListener('pointerdown', handlePointerDown, true);
    });
    return () => { currentSurfaceElement?.removeEventListener('pointerdown', handlePointerDown, true); unregisterRootListener(); };
  }, [editor, requestForceDocumentRefresh]);
  return null;
};

const LexicalBlankDocumentDeleteCaretPlugin: React.FC = () => {
  const [editor] = useLexicalComposerContext();
  const pendingDeleteKeyRef = useRef(false);

  useEffect(() => {
    let currentRootElement: HTMLElement | null = null;
    let frameId: number | null = null;

    const restoreBlankDocumentCaret = () => {
      pendingDeleteKeyRef.current = false;
      let isBlankDocument = false;
      editor.getEditorState().read(() => {
        isBlankDocument = isPreviewMarkdownDocumentEmpty();
      });
      if (!isBlankDocument) return;
      const rootElement = editor.getRootElement();
      rootElement?.focus({ preventScroll: true });
      editor.update(() => {
        if (!isPreviewMarkdownDocumentEmpty()) return;
        $addUpdateTag(SKIP_SCROLL_INTO_VIEW_TAG);
        normalizeEmptyPreviewMarkdownDocument();
      });
    };

    const scheduleBlankDocumentCaretRestore = () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        if (!pendingDeleteKeyRef.current) return;
        restoreBlankDocumentCaret();
      });
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const rootElement = editor.getRootElement();
      if (
        !rootElement ||
        !isPlainPreviewDeleteKeyEvent(event) ||
        editor.isComposing() ||
        !isPreviewFinalDeleteKeyboardTarget(event.target, rootElement)
      ) {
        return;
      }
      pendingDeleteKeyRef.current = true;
      scheduleBlankDocumentCaretRestore();
    };

    const unregisterUpdate = editor.registerUpdateListener(({ editorState, tags }) => {
      if (!pendingDeleteKeyRef.current) return;
      if (tags.has(PREVIEW_RESET_UPDATE_TAG)) {
        pendingDeleteKeyRef.current = false;
        return;
      }
      const isBlankDocument = editorState.read(() => isPreviewMarkdownDocumentEmpty());
      if (isBlankDocument) scheduleBlankDocumentCaretRestore();
    });

    const unregisterRootListener = editor.registerRootListener((rootElement, previousRootElement) => {
      previousRootElement?.removeEventListener('keydown', handleKeyDown, true);
      rootElement?.addEventListener('keydown', handleKeyDown, true);
      currentRootElement = rootElement;
    });

    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      currentRootElement?.removeEventListener('keydown', handleKeyDown, true);
      unregisterUpdate();
      unregisterRootListener();
    };
  }, [editor]);

  return null;
};

const LexicalFinalInsertCommandPlugin: React.FC<{
  editState: PreviewMarkdownEditState;
  tableAlignmentsRef: React.MutableRefObject<TableAlignmentRegistry>;
  t: ArtifactPreviewTranslations;
}> = ({ editState, tableAlignmentsRef, t }) => {
  const [editor] = useLexicalComposerContext();
  const renderContext = React.useContext(PreviewArtifactRenderContext);
  const aiCandidateRenderDeliveryAccess = renderContext?.aiCandidateRenderDeliveryAccess;
  const finalInsertRenderDeliveryAccess =
    aiCandidateRenderDeliveryAccess ?? renderContext?.renderDeliveryAccess;
  const mornDraftComponentScope = renderContext?.mornDraftComponentScope ?? 'showcase';
  const {
    deliveryRequestContext,
    onAiInstructionNotice,
  } = editState;
  const isFinalSlashAiEnabled = FINAL_SLASH_AI_ENABLED && !deliveryRequestContext?.disableAiAssistUi;
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeMenuLevel, setActiveMenuLevel] = useState<'primary' | 'secondary'>('primary');
  const aiInstructionAbortRef = useRef<AbortController | null>(null);
  const aiInstructionRequestIdRef = useRef(0);
  const aiInstructionThinkingUserToggledRef = useRef(false);
  const aiInstructionResultAutoCollapsedRef = useRef(false);
  const aiInstructionResultStartedRef = useRef(false);
  const aiInstructionThinkingAutoCollapseVersionRef = useRef(0);
  const aiInstructionRawThinkingRef = useRef('');
  const aiInstructionStreamDisplayPhaseRef = useRef<AiStreamDisplayPhase>('complete');
  const [aiInstructionComposer, setAiInstructionComposer] = useState<FinalSlashAiComposerDraft | null>(null);
  const aiInstructionComposerStateRef = useRef<FinalSlashAiComposerDraft | null>(null);
  const [aiInstructionBusy, setAiInstructionBusy] = useState(false);
  const aiInstructionBusyRef = useRef(false);
  const updateAiInstructionBusy = useCallback((busy: boolean) => {
    aiInstructionBusyRef.current = busy;
    setAiInstructionBusy(busy);
  }, []);
  const updateAiInstructionComposer = useCallback((
    nextOrUpdater: FinalSlashAiComposerDraft | null | ((current: FinalSlashAiComposerDraft | null) => FinalSlashAiComposerDraft | null),
  ) => {
    const nextComposer = typeof nextOrUpdater === 'function'
      ? nextOrUpdater(aiInstructionComposerStateRef.current)
      : nextOrUpdater;
    aiInstructionComposerStateRef.current = nextComposer;
    setAiInstructionComposer(nextComposer);
    return nextComposer;
  }, []);
  const [aiInstructionError, setAiInstructionError] = useState<string | null>(null);
  const [aiInstructionClarification, setAiInstructionClarification] = useState<FinalSlashAiClarificationState | null>(null);
  const [aiInstructionFollowUpError, setAiInstructionFollowUpError] = useState<string | null>(null);
  const [aiInstructionFollowUpOpen, setAiInstructionFollowUpOpen] = useState(false);
  const [aiInstructionFollowUpText, setAiInstructionFollowUpText] = useState('');
  const [aiInstructionInputText, setAiInstructionInputText] = useState('');
  const [aiInstructionResult, setAiInstructionResult] = useState<FinalSlashAiInstructionResult | null>(null);
  const [aiInstructionPartialResult, setAiInstructionPartialResult] = useState<FinalSlashAiInstructionResult | null>(null);
  const [aiInstructionThoughtSummary, setAiInstructionThoughtSummary] = useState('');
  const [aiInstructionThinking, setAiInstructionThinking] = useState('');
  const [aiInstructionProgress, setAiInstructionProgress] = useState('');
  const [aiInstructionThinkingOpen, setAiInstructionThinkingOpen] = useState(false);
  const [aiInstructionStreamDisplayPhase, setAiInstructionStreamDisplayPhaseState] =
    useState<AiStreamDisplayPhase>('complete');
  const aiInstructionDisplayQueueRef = useRef<AiInstructionDisplayQueueItem[]>([]);
  const aiInstructionDisplayQueueTimerRef = useRef<number | null>(null);
  const aiInstructionDisplayQueueWaitersRef = useRef<AiInstructionDisplayQueueWaiter[]>([]);
  const aiInstructionPartialResultTextRef = useRef('');
  const aiInstructionPartialResultTimerRef = useRef<number | null>(null);
  const [dismissedSlashText, setDismissedSlashText] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuLayout, setMenuLayout] = useState<FinalInsertMenuLayout>(DEFAULT_FINAL_INSERT_MENU_LAYOUT);
  const [menuNavigationMode, setMenuNavigationMode] = useState<FinalInsertMenuNavigationMode>('keyboard');
  const [openSubmenuId, setOpenSubmenuId] = useState<string | null>(null);
  const [queuedAiInstructionSlashText, setQueuedAiInstructionSlashText] = useState<string | null>(null);
  const [slashText, setSlashText] = useState('');
  const [query, setQuery] = useState('');
  const [secondaryActiveIndex, setSecondaryActiveIndex] = useState(0);
  const [tableGridSelection, setTableGridSelection] = useState<FinalInsertTableGridSelection>({ columns: 3, rows: 3 });
  const activeAiInstructionDraftIdRef = useRef(deliveryRequestContext?.draftId ?? null);
  const mountedAiInstructionDraftIdRef = useRef(deliveryRequestContext?.draftId ?? null);
  const activePrimaryMenuItemRef = useRef<HTMLButtonElement | null>(null);
  const activeSecondaryMenuItemRef = useRef<HTMLButtonElement | null>(null);
  const primaryMenuPanelRef = useRef<HTMLDivElement | null>(null);
  const submenuListRef = useRef<HTMLDivElement | null>(null);
  const finalInsertCommands = useMemo(
    () => getAccessAwareFinalInsertCommands(
      getFinalInsertCommands(mornDraftComponentScope),
      finalInsertRenderDeliveryAccess,
      t,
      getFinalInsertLayoutDecision,
    ),
    [finalInsertRenderDeliveryAccess, mornDraftComponentScope, t],
  );
  const finalInsertCommandCategories = useMemo(
    () => getFinalInsertCommandCategories(mornDraftComponentScope),
    [mornDraftComponentScope],
  );
  const visibleEntries = useMemo(
    () => filterFinalInsertCommands(query, finalInsertCommands),
    [finalInsertCommands, query],
  );
  const isSearchMode = normalizeFinalInsertQuery(query).length > 0;
  const showAiInstructionEntry = isFinalSlashAiEnabled && slashText.trim() === '/' && !isSearchMode;
  const commandActionableIndexes = useMemo(
    () => visibleEntries
      .map((entry, index) => (isFinalInsertActionable(entry.command) ? index : -1))
      .filter((index) => index >= 0),
    [visibleEntries],
  );
  const actionableIndexes = useMemo(
    () => showAiInstructionEntry
      ? [FINAL_INSERT_AI_ACTIVE_INDEX, ...commandActionableIndexes]
      : commandActionableIndexes,
    [commandActionableIndexes, showAiInstructionEntry],
  );
  const groupedEntries = useMemo(
    () => finalInsertCommandCategories
      .map((category) => ({
        category,
        entries: visibleEntries
          .map((entry, index) => ({ ...entry, index }))
          .filter((entry) => entry.command.category === category),
      }))
      .filter((group) => group.entries.length > 0),
    [finalInsertCommandCategories, visibleEntries],
  );
  const activeEntry = visibleEntries[activeIndex] ?? null;
  const isAiEntryActive = showAiInstructionEntry &&
    activeMenuLevel === 'primary' &&
    activeIndex === FINAL_INSERT_AI_ACTIVE_INDEX;
  const openSubmenuEntry = useMemo(() => (
    visibleEntries.find((entry) => entry.command.id === openSubmenuId && hasFinalInsertSubmenu(entry.command)) ?? null
  ), [openSubmenuId, visibleEntries]);
  const submenuCommands = useMemo(
    () => openSubmenuEntry?.command.children ?? [],
    [openSubmenuEntry],
  );
  const submenuNavigationIndexes = useMemo(
    () => submenuCommands
      .map((command, index) => (isFinalInsertActionable(command) ? index : -1))
      .filter((index) => index >= 0),
    [submenuCommands],
  );
  const activeTableGrid = openSubmenuEntry?.command.tableGrid ?? null;
  const selectedTableGridSelection = useMemo(
    () => activeTableGrid
      ? clampFinalInsertTableGridSelection(tableGridSelection, activeTableGrid)
      : tableGridSelection,
    [activeTableGrid, tableGridSelection],
  );
  const aiInstructionDisplayResult = aiInstructionResult ?? aiInstructionPartialResult;
  const activePrimaryCommand = activeEntry?.command ?? null;
  const activeSecondaryCommand = openSubmenuEntry && !activeTableGrid
    ? submenuCommands[secondaryActiveIndex] ?? null
    : null;
  const activePrimaryPreviewCommand = !isSearchMode && activePrimaryCommand?.category === 'MornDraft'
    ? activePrimaryCommand.children?.[secondaryActiveIndex] ?? activePrimaryCommand.children?.[0] ?? null
    : null;
  const activeMornDraftPreviewCommand = activeTableGrid
    ? null
    : canPreviewFinalInsertMornDraftCommand(activeSecondaryCommand)
      ? activeSecondaryCommand
      : isSearchMode && canPreviewFinalInsertMornDraftCommand(activePrimaryCommand)
        ? activePrimaryCommand
        : canPreviewFinalInsertMornDraftCommand(activePrimaryPreviewCommand)
          ? activePrimaryPreviewCommand
          : null;
  const primaryPanelMornDraftPreviewCommand =
    isSearchMode && !openSubmenuEntry ? activeMornDraftPreviewCommand : null;
  const submenuMornDraftPreviewCommand =
    openSubmenuEntry && !activeTableGrid ? activeMornDraftPreviewCommand : null;

  const hasQueuedAiInstructionDisplayText = useCallback((
    requestId: number,
    channels: Set<AiInstructionDisplayChannel> | null,
  ) => aiInstructionDisplayQueueRef.current.some(item => (
    item.requestId === requestId && (!channels || channels.has(item.channel))
  )), []);

  const resolveAiInstructionDisplayQueueWaiters = useCallback(() => {
    if (aiInstructionDisplayQueueWaitersRef.current.length === 0) return;
    const pending: AiInstructionDisplayQueueWaiter[] = [];
    aiInstructionDisplayQueueWaitersRef.current.forEach((waiter) => {
      if (hasQueuedAiInstructionDisplayText(waiter.requestId, waiter.channels)) {
        pending.push(waiter);
        return;
      }
      waiter.resolve();
    });
    aiInstructionDisplayQueueWaitersRef.current = pending;
  }, [hasQueuedAiInstructionDisplayText]);

  const flushAiInstructionDisplayQueueRef = useRef<() => void>(() => undefined);
  const scheduleAiInstructionDisplayQueueFlush = useCallback(() => {
    if (aiInstructionDisplayQueueTimerRef.current !== null) return;
    aiInstructionDisplayQueueTimerRef.current = window.setTimeout(() => {
      aiInstructionDisplayQueueTimerRef.current = null;
      flushAiInstructionDisplayQueueRef.current();
    }, AI_INLINE_DISPLAY_FLUSH_INTERVAL_MS);
  }, []);

  flushAiInstructionDisplayQueueRef.current = () => {
    while (aiInstructionDisplayQueueRef.current.length > 0) {
      const item = aiInstructionDisplayQueueRef.current[0];
      if (item.requestId !== aiInstructionRequestIdRef.current) {
        aiInstructionDisplayQueueRef.current.shift();
        continue;
      }
      const { chunk, rest } = splitAiInstructionDisplayChunk(item.text, item.channel);
      if (!chunk) {
        aiInstructionDisplayQueueRef.current.shift();
        continue;
      }
      if (rest) {
        aiInstructionDisplayQueueRef.current[0] = { ...item, text: rest };
      } else {
        aiInstructionDisplayQueueRef.current.shift();
      }
      if (item.channel === 'progress') {
        setAiInstructionProgress((current) => `${current}${chunk}`);
      } else if (item.channel === 'thinking') {
        setAiInstructionThinking((current) => `${current}${chunk}`);
      } else {
        setAiInstructionClarification((current) => ({
          answer: current?.answer ?? '',
          error: null,
          questions: current?.questions ?? [],
          streamingText: `${current?.streamingText ?? ''}${chunk}`,
        }));
      }
      break;
    }
    resolveAiInstructionDisplayQueueWaiters();
    if (aiInstructionDisplayQueueRef.current.length > 0) {
      scheduleAiInstructionDisplayQueueFlush();
    }
  };

  const enqueueAiInstructionDisplayText = useCallback((
    channel: AiInstructionDisplayChannel,
    text: string,
    requestId: number,
  ) => {
    if (!text) return;
    aiInstructionDisplayQueueRef.current.push({
      channel,
      requestId,
      text,
    });
    scheduleAiInstructionDisplayQueueFlush();
  }, [scheduleAiInstructionDisplayQueueFlush]);

  const clearAiInstructionDisplayQueue = useCallback((channels?: AiInstructionDisplayChannel[]) => {
    const channelSet = channels ? new Set(channels) : null;
    aiInstructionDisplayQueueRef.current = channelSet
      ? aiInstructionDisplayQueueRef.current.filter(item => !channelSet.has(item.channel))
      : [];
    if (aiInstructionDisplayQueueRef.current.length === 0 && aiInstructionDisplayQueueTimerRef.current !== null) {
      window.clearTimeout(aiInstructionDisplayQueueTimerRef.current);
      aiInstructionDisplayQueueTimerRef.current = null;
    }
    resolveAiInstructionDisplayQueueWaiters();
  }, [resolveAiInstructionDisplayQueueWaiters]);

  const setAiInstructionStreamDisplayPhase = useCallback((phase: AiStreamDisplayPhase) => {
    aiInstructionStreamDisplayPhaseRef.current = phase;
    setAiInstructionStreamDisplayPhaseState(phase);
  }, []);

  const resetAiInstructionStreamDisplay = useCallback((phase: AiStreamDisplayPhase = 'complete') => {
    aiInstructionRawThinkingRef.current = '';
    setAiInstructionStreamDisplayPhase(phase);
  }, [setAiInstructionStreamDisplayPhase]);

  const transitionAiInstructionToGenerating = useCallback((requestId: number) => {
    if (aiInstructionRequestIdRef.current !== requestId) return;
    if (aiInstructionStreamDisplayPhaseRef.current !== 'thinking') return;
    clearAiInstructionDisplayQueue(['thinking']);
    setAiInstructionThinking(aiInstructionRawThinkingRef.current);
    setAiInstructionStreamDisplayPhase('generating');
  }, [clearAiInstructionDisplayQueue, setAiInstructionStreamDisplayPhase]);

  const waitForAiInstructionDisplayQueueIdle = useCallback((
    requestId: number,
    channels?: AiInstructionDisplayChannel[],
  ) => {
    const channelSet = channels ? new Set(channels) : null;
    if (!hasQueuedAiInstructionDisplayText(requestId, channelSet)) return Promise.resolve();
    return new Promise<void>((resolve) => {
      aiInstructionDisplayQueueWaitersRef.current.push({
        channels: channelSet,
        requestId,
        resolve,
      });
    });
  }, [hasQueuedAiInstructionDisplayText]);

  const cancelAiInstructionPartialResultTimer = useCallback(() => {
    if (aiInstructionPartialResultTimerRef.current === null) return;
    window.clearTimeout(aiInstructionPartialResultTimerRef.current);
    aiInstructionPartialResultTimerRef.current = null;
  }, []);

  const flushAiInstructionPartialResult = useCallback((requestId: number, instruction: string) => {
    aiInstructionPartialResultTimerRef.current = null;
    if (aiInstructionRequestIdRef.current !== requestId) return;
    const markdown = aiInstructionPartialResultTextRef.current;
    setAiInstructionPartialResult(markdown ? { instruction, markdown } : null);
  }, []);

  const scheduleAiInstructionPartialResultFlush = useCallback((requestId: number, instruction: string) => {
    if (aiInstructionPartialResultTimerRef.current !== null) return;
    aiInstructionPartialResultTimerRef.current = window.setTimeout(() => {
      flushAiInstructionPartialResult(requestId, instruction);
    }, AI_INLINE_RESULT_FLUSH_INTERVAL_MS);
  }, [flushAiInstructionPartialResult]);

  const clearAiInstructionPartialResult = useCallback(() => {
    cancelAiInstructionPartialResultTimer();
    aiInstructionPartialResultTextRef.current = '';
    setAiInstructionPartialResult(null);
  }, [cancelAiInstructionPartialResultTimer]);

  const resetAiInstructionThinkingAutoCollapse = useCallback(() => {
    aiInstructionResultStartedRef.current = false;
    aiInstructionThinkingAutoCollapseVersionRef.current += 1;
  }, []);

  useEffect(() => () => {
    if (aiInstructionDisplayQueueTimerRef.current !== null) {
      window.clearTimeout(aiInstructionDisplayQueueTimerRef.current);
      aiInstructionDisplayQueueTimerRef.current = null;
    }
    if (aiInstructionPartialResultTimerRef.current !== null) {
      window.clearTimeout(aiInstructionPartialResultTimerRef.current);
      aiInstructionPartialResultTimerRef.current = null;
    }
    aiInstructionPartialResultTextRef.current = '';
    aiInstructionDisplayQueueRef.current = [];
    aiInstructionRawThinkingRef.current = '';
    aiInstructionStreamDisplayPhaseRef.current = 'complete';
    aiInstructionDisplayQueueWaitersRef.current.splice(0).forEach(waiter => waiter.resolve());
  }, []);

  useEffect(() => {
    aiInstructionComposerStateRef.current = aiInstructionComposer;
  }, [aiInstructionComposer]);

  useEffect(() => {
    const nextDraftId = deliveryRequestContext?.draftId ?? null;
    activeAiInstructionDraftIdRef.current = nextDraftId;
    if (mountedAiInstructionDraftIdRef.current === nextDraftId) return;
    mountedAiInstructionDraftIdRef.current = nextDraftId;
    const composer = aiInstructionComposerStateRef.current;
    aiInstructionRequestIdRef.current += 1;
    aiInstructionAbortRef.current?.abort();
    aiInstructionAbortRef.current = null;
    clearAiInstructionDisplayQueue();
    removeFinalSlashAiInlineDraftNode(editor, composer, { restoreCaret: false });
    updateAiInstructionComposer(null);
    updateAiInstructionBusy(false);
    setAiInstructionClarification(null);
    setAiInstructionError(null);
    setAiInstructionFollowUpError(null);
    setAiInstructionFollowUpOpen(false);
    setAiInstructionFollowUpText('');
    setAiInstructionInputText('');
    setAiInstructionResult(null);
    clearAiInstructionPartialResult();
    setAiInstructionThoughtSummary('');
    setAiInstructionThinking('');
    setAiInstructionProgress('');
    setAiInstructionThinkingOpen(false);
    resetAiInstructionStreamDisplay();
    aiInstructionThinkingUserToggledRef.current = false;
    aiInstructionResultAutoCollapsedRef.current = false;
    resetAiInstructionThinkingAutoCollapse();
    setDismissedSlashText('');
    setQueuedAiInstructionSlashText(null);
  }, [clearAiInstructionDisplayQueue, clearAiInstructionPartialResult, deliveryRequestContext?.draftId, editor, resetAiInstructionStreamDisplay, resetAiInstructionThinkingAutoCollapse, updateAiInstructionBusy, updateAiInstructionComposer]);

  const notifyAiInstruction = useCallback((notice: Parameters<NonNullable<typeof onAiInstructionNotice>>[0]) => {
    if ((deliveryRequestContext?.draftId ?? null) !== activeAiInstructionDraftIdRef.current) return;
    onAiInstructionNotice?.(notice);
  }, [deliveryRequestContext?.draftId, onAiInstructionNotice]);

  const showAiInstructionBusyNotice = useCallback(() => {
    notifyAiInstruction({ tone: 'info', text: t.previewAiSlashGenerating });
  }, [notifyAiInstruction, t.previewAiSlashGenerating]);

  const markKeyboardMenuNavigation = useCallback(() => {
    setMenuNavigationMode((current) => (current === 'keyboard' ? current : 'keyboard'));
  }, []);

  const markPointerMenuNavigation = useCallback(() => {
    setMenuNavigationMode((current) => (current === 'pointer' ? current : 'pointer'));
  }, []);

  useEffect(() => {
    if (!activeTableGrid) return;
    setTableGridSelection(getDefaultFinalInsertTableGridSelection(activeTableGrid));
  }, [activeTableGrid]);

  useEffect(() => {
    const firstActionableIndex = showAiInstructionEntry
      ? FINAL_INSERT_AI_ACTIVE_INDEX
      : getFirstActionableFinalInsertEntryIndex(visibleEntries);
    const nextActiveIndex = firstActionableIndex >= 0 || firstActionableIndex === FINAL_INSERT_AI_ACTIVE_INDEX
      ? firstActionableIndex
      : 0;
    setActiveIndex(nextActiveIndex);
    const nextActiveCommand = nextActiveIndex >= 0 ? visibleEntries[nextActiveIndex]?.command : null;
    setOpenSubmenuId(nextActiveCommand && hasFinalInsertSubmenu(nextActiveCommand)
      ? nextActiveCommand.id
      : null);
    setActiveMenuLevel('primary');
    setSecondaryActiveIndex(0);
    setMenuNavigationMode('keyboard');
  }, [showAiInstructionEntry, visibleEntries]);

  useEffect(() => {
    if (!isMenuOpen || menuNavigationMode !== 'keyboard') return;
    const scrollContainer = activeMenuLevel === 'secondary'
      ? submenuListRef.current
      : primaryMenuPanelRef.current;
    const activeMenuItem = activeMenuLevel === 'secondary'
      ? activeSecondaryMenuItemRef.current
      : activePrimaryMenuItemRef.current;
    if (!scrollContainer || !activeMenuItem || !scrollContainer.contains(activeMenuItem)) return;
    activeMenuItem.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [
    activeIndex,
    activeMenuLevel,
    isMenuOpen,
    menuNavigationMode,
    openSubmenuId,
    secondaryActiveIndex,
  ]);

  const closeMenu = useCallback((options: { dismissCurrentSlash?: boolean } = {}) => {
    setIsMenuOpen(false);
    setDismissedSlashText(options.dismissCurrentSlash && slashText ? slashText : '');
    setOpenSubmenuId(null);
    setSlashText('');
    setQuery('');
    setActiveMenuLevel('primary');
    setSecondaryActiveIndex(0);
    setMenuNavigationMode('keyboard');
  }, [slashText]);

  const updateAiInstructionSessionAction = useCallback((sessionId: string | undefined, action: 'apply' | 'cancel') => {
    if (!isFinalSlashAiEnabled || !sessionId || !deliveryRequestContext?.draftId || deliveryRequestContext.enableOssAiProvider) return;
    void loadPrivateAiInstructionGateway()?.then(({ updatePrivateAiInstructionSession }) => (
      updatePrivateAiInstructionSession({
        action,
        draftId: deliveryRequestContext.draftId!,
        isDevMode: deliveryRequestContext.isDevMode,
        scenarioId: deliveryRequestContext.scenarioId,
        sessionId,
      })
    )).catch(() => undefined);
  }, [
    deliveryRequestContext?.draftId,
    deliveryRequestContext?.enableOssAiProvider,
    deliveryRequestContext?.isDevMode,
    deliveryRequestContext?.scenarioId, isFinalSlashAiEnabled,
  ]);

  const dismissAiInstructionComposer = useCallback((options: { restoreCaret?: boolean } = {}) => {
    const composer = aiInstructionComposerStateRef.current;
    aiInstructionRequestIdRef.current += 1;
    updateAiInstructionSessionAction(composer?.sessionId, 'cancel');
    aiInstructionAbortRef.current?.abort();
    aiInstructionAbortRef.current = null;
    clearAiInstructionDisplayQueue();
    removeFinalSlashAiInlineDraftNode(editor, composer, { restoreCaret: options.restoreCaret });
    updateAiInstructionComposer(null);
    updateAiInstructionBusy(false);
    setAiInstructionClarification(null);
    setAiInstructionError(null);
    setAiInstructionFollowUpError(null);
    setAiInstructionFollowUpOpen(false);
    setAiInstructionFollowUpText('');
    setAiInstructionInputText('');
    setAiInstructionResult(null);
    clearAiInstructionPartialResult();
    setAiInstructionThoughtSummary('');
    setAiInstructionThinking('');
    setAiInstructionProgress('');
    setAiInstructionThinkingOpen(false);
    resetAiInstructionStreamDisplay();
    aiInstructionThinkingUserToggledRef.current = false;
    aiInstructionResultAutoCollapsedRef.current = false;
    resetAiInstructionThinkingAutoCollapse();
    setDismissedSlashText(composer?.slashText ?? '');
    setQueuedAiInstructionSlashText(null);
  }, [clearAiInstructionDisplayQueue, clearAiInstructionPartialResult, editor, resetAiInstructionStreamDisplay, resetAiInstructionThinkingAutoCollapse, updateAiInstructionBusy, updateAiInstructionComposer, updateAiInstructionSessionAction]);

  const showEmptyAiInstructionNotice = useCallback(() => {
    setAiInstructionError(t.previewAiSlashEmptyInstruction);
    notifyAiInstruction({ tone: 'error', text: t.previewAiSlashEmptyInstruction });
  }, [notifyAiInstruction, t.previewAiSlashEmptyInstruction]);

  const showAiInstructionTooLongNotice = useCallback(() => {
    setAiInstructionError(t.previewAiSlashInstructionTooLong);
    notifyAiInstruction({ tone: 'error', text: t.previewAiSlashInstructionTooLong });
  }, [notifyAiInstruction, t.previewAiSlashInstructionTooLong]);

  const beginAiInstructionDraft = useCallback((expectedSlashText = slashText || '/') => {
    if (!isFinalSlashAiEnabled) return null;
    if (aiInstructionBusyRef.current) {
      showAiInstructionBusyNotice();
      return null;
    }
    aiInstructionAbortRef.current?.abort();
    aiInstructionAbortRef.current = null;
    clearAiInstructionDisplayQueue();
    updateAiInstructionBusy(false);
    setAiInstructionClarification(null);
    setAiInstructionError(null);
    setAiInstructionFollowUpError(null);
    setAiInstructionFollowUpOpen(false);
    setAiInstructionFollowUpText('');
    setAiInstructionInputText('');
    setAiInstructionResult(null);
    clearAiInstructionPartialResult();
    setAiInstructionThoughtSummary('');
    setAiInstructionThinking('');
    setAiInstructionProgress('');
    setAiInstructionThinkingOpen(true);
    resetAiInstructionStreamDisplay('thinking');
    aiInstructionThinkingUserToggledRef.current = false;
    aiInstructionResultAutoCollapsedRef.current = false;
    resetAiInstructionThinkingAutoCollapse();
    setDismissedSlashText('');
    setIsMenuOpen(false);
    setOpenSubmenuId(null);
    setActiveMenuLevel('primary');
    setSecondaryActiveIndex(0);
    setSlashText('');
    setQuery('');
    const draft = beginFinalAiInstructionComposerDraft(editor, expectedSlashText, tableAlignmentsRef.current);
    if (!draft) return null;
    setAiInstructionInputText(draft.instruction);
    updateAiInstructionComposer(draft);
    return draft;
  }, [clearAiInstructionDisplayQueue, clearAiInstructionPartialResult, editor, isFinalSlashAiEnabled, resetAiInstructionStreamDisplay, resetAiInstructionThinkingAutoCollapse, showAiInstructionBusyNotice, slashText, tableAlignmentsRef, updateAiInstructionBusy, updateAiInstructionComposer]);

  useEffect(() => {
    if (!queuedAiInstructionSlashText) return;
    const nextSlashText = queuedAiInstructionSlashText;
    setQueuedAiInstructionSlashText(null);
    beginAiInstructionDraft(nextSlashText);
  }, [beginAiInstructionDraft, queuedAiInstructionSlashText]);

  const applyAiInstructionSessionSnapshot = useCallback((session: PreviewAiInstructionSessionSnapshot) => {
    if (!deliveryRequestContext?.draftId || session.draftId !== deliveryRequestContext.draftId) return false;
    const source = editState.source;
    const draft = restoreFinalAiInstructionComposerDraft(editor, session, source);
    if (!draft) return false;
    clearAiInstructionDisplayQueue();
    clearAiInstructionPartialResult();
    updateAiInstructionComposer(draft);
    updateAiInstructionBusy(AI_INSTRUCTION_SESSION_RUNNING_STATUSES.has(session.status));
    setAiInstructionClarification(session.status === 'clarification_required'
      ? {
          answer: session.clarificationAnswer ?? '',
          error: null,
          questions: session.clarificationQuestions ?? [],
        }
      : null);
    setAiInstructionError(
      session.status === 'failed' || session.status === 'interrupted'
        ? session.errorMessage ?? t.previewAiRequestFailed
        : null,
    );
    setAiInstructionFollowUpError(null);
    setAiInstructionFollowUpOpen(false);
    setAiInstructionFollowUpText('');
    setAiInstructionInputText(session.instruction);
    setAiInstructionThoughtSummary(session.thoughtSummary ?? '');
    setAiInstructionThinking('');
    setAiInstructionProgress(session.progressText ?? '');
    setAiInstructionThinkingOpen(AI_INSTRUCTION_SESSION_RUNNING_STATUSES.has(session.status));
    const candidate = session.candidateSource?.trim() ?? '';
    resetAiInstructionStreamDisplay(
      session.status === 'ready'
        ? 'complete'
        : candidate
          ? 'generating'
          : AI_INSTRUCTION_SESSION_RUNNING_STATUSES.has(session.status)
            ? 'thinking'
            : 'complete',
    );
    setAiInstructionResult(session.status === 'ready' && candidate
      ? { instruction: session.instruction, markdown: candidate }
      : null);
    if (session.status !== 'ready' && candidate) {
      aiInstructionPartialResultTextRef.current = candidate;
      setAiInstructionPartialResult({ instruction: session.instruction, markdown: candidate });
    }
    aiInstructionThinkingUserToggledRef.current = false;
    aiInstructionResultAutoCollapsedRef.current = false;
    resetAiInstructionThinkingAutoCollapse();
    return true;
  }, [
    deliveryRequestContext?.draftId,
    editState.source,
    editor,
    clearAiInstructionDisplayQueue,
    clearAiInstructionPartialResult,
    resetAiInstructionStreamDisplay,
    resetAiInstructionThinkingAutoCollapse,
    t.previewAiRequestFailed,
    updateAiInstructionBusy,
    updateAiInstructionComposer,
  ]);

  useEffect(() => {
    const draftId = deliveryRequestContext?.draftId;
    if (
      !isFinalSlashAiEnabled ||
      !draftId ||
      draftId.startsWith('pending-import:') ||
      deliveryRequestContext?.enableOssAiProvider
    ) return undefined;
    let disposed = false;
    let timer: number | null = null;
    const loadSessions = async () => {
      const gateway = await loadPrivateAiInstructionGateway();
      if (!gateway) return;
      const { loadPrivateAiInstructionSessions } = gateway;
      const response = await loadPrivateAiInstructionSessions({
        draftId,
        isDevMode: deliveryRequestContext?.isDevMode,
        scenarioId: deliveryRequestContext?.scenarioId,
      });
      if (!response.ok) return;
      const body = await response.json() as { sessions?: PreviewAiInstructionSessionSnapshot[] };
      if (disposed) return;
      const session = body.sessions?.find(item => item.status !== 'cancelled' && item.status !== 'applied') ?? null;
      if (!session) return;
      const restored = applyAiInstructionSessionSnapshot(session);
      if (!restored) return;
      if (AI_INSTRUCTION_SESSION_RUNNING_STATUSES.has(session.status)) {
        timer = window.setTimeout(loadSessions, 1500);
      }
    };
    void loadSessions();
    return () => {
      disposed = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [
    applyAiInstructionSessionSnapshot,
    deliveryRequestContext?.draftId,
    deliveryRequestContext?.enableOssAiProvider,
    deliveryRequestContext?.isDevMode,
    deliveryRequestContext?.scenarioId, isFinalSlashAiEnabled,
  ]);

  const runAiInstruction = useCallback(async (
    composerOverride?: FinalSlashAiComposerDraft | null,
    instructionOverride?: string,
    followUp?: FinalSlashAiFollowUpPayload,
    clarification?: {
      answer: string;
      questions: PreviewAiClarificationQuestion[];
    },
  ) => {
    const composer = composerOverride ?? aiInstructionComposerStateRef.current ?? aiInstructionComposer;
    const instruction = (instructionOverride ?? aiInstructionInputText ?? composer?.instruction ?? '').trim();
    if (!isFinalSlashAiEnabled) return;
    if (aiInstructionBusyRef.current || !composer) return;
    if (instruction.length < AI_INSTRUCTION_MIN_TEXT) {
      showEmptyAiInstructionNotice();
      return;
    }
    if (instruction.length > AI_ARTIFACT_INSTRUCTION_MAX_TEXT) {
      showAiInstructionTooLongNotice();
      return;
    }
    const requestComposer = composer.instruction === instruction ? composer : { ...composer, instruction };
    if (requestComposer !== composer) {
      updateAiInstructionComposer((current) => (
        current && current.draftId === composer.draftId ? requestComposer : current
      ));
    }
    let currentSource = '';
    editor.getEditorState().read(() => {
      currentSource = serializeEditorDocument(undefined, tableAlignmentsRef.current);
    });
    if (currentSource !== requestComposer.source) {
      const message = t.previewAiSlashChanged;
      setAiInstructionError(message);
      notifyAiInstruction({ tone: 'error', text: message });
      return;
    }
    const abortController = new AbortController();
    aiInstructionAbortRef.current = abortController;
    aiInstructionRequestIdRef.current += 1;
    const requestId = aiInstructionRequestIdRef.current;
    updateAiInstructionBusy(true);
    clearAiInstructionDisplayQueue();
    if (!followUp) setAiInstructionClarification(null);
    setAiInstructionError(null);
    setAiInstructionFollowUpError(null);
    setAiInstructionResult(null);
    clearAiInstructionPartialResult();
    setAiInstructionThoughtSummary('');
    setAiInstructionThinking('');
    setAiInstructionProgress('');
    setAiInstructionThinkingOpen(true);
    aiInstructionThinkingUserToggledRef.current = false;
    aiInstructionResultAutoCollapsedRef.current = false;
    resetAiInstructionThinkingAutoCollapse();
    setDismissedSlashText('');
    try {
      let replacement = '';
      if (deliveryRequestContext?.enableOssAiProvider) {
        replacement = (await requestOssAiText({
          action: 'generate',
          instruction: buildOssAiInstruction(instruction, followUp, clarification),
          range: requestComposer.replaceRange,
          signal: abortController.signal,
          source: requestComposer.source,
          sourceKind: getPublicAiSourceKindForContentType(renderContext?.contentType ?? 'markdown'),
        })).trim();
      } else {
        const gateway = await loadPrivateAiInstructionGateway();
        if (!gateway) {
          throw new Error(t.previewAiRequestDenied(403));
        }
        const { requestPrivateAiInstruction } = gateway;
        const response = await requestPrivateAiInstruction({
          isDevMode: deliveryRequestContext?.isDevMode,
          signal: abortController.signal,
          body: {
            action: 'insert',
            ...(deliveryRequestContext?.draftId ? { draftId: deliveryRequestContext.draftId } : {}),
            insertRange: requestComposer.insertRange,
            instruction,
            replaceRange: requestComposer.replaceRange,
            ...(requestComposer.sessionId ? { sessionId: requestComposer.sessionId } : {}),
            slashText: requestComposer.slashText,
            ...(followUp ? {
              followUpInstruction: followUp.followUpInstruction,
              previousResultText: followUp.previousResultText,
            } : {}),
            ...(clarification ? {
              clarificationAnswer: clarification.answer,
              clarificationQuestions: clarification.questions,
            } : {}),
            source: requestComposer.source,
            sourceLineRange: requestComposer.sourceLineRange,
            sourceVersion: requestComposer.sourceVersion,
            ...(deliveryRequestContext?.isDevMode ? { scenarioId: deliveryRequestContext.scenarioId } : {}),
          },
        });
        if (!response.ok) {
          let body: AiInstructionApiResponse = {};
          try {
            body = await response.json() as AiInstructionApiResponse;
          } catch {
            body = { message: response.statusText };
          }
          throw new Error(getAiInstructionApiErrorMessage(
            body,
            t.previewAiRequestDenied(response.status),
            response.status,
            t,
          ));
        }
        const contentType = response.headers.get('content-type') ?? '';
        if (contentType.includes('text/event-stream')) {
          let queuedPartialResult = '';
          const streamed = await readPreviewAiSelectionStream(
            response,
            (partialResult) => {
              if (abortController.signal.aborted || aiInstructionRequestIdRef.current !== requestId) return;
              const nextDelta = partialResult.startsWith(queuedPartialResult)
                ? partialResult.slice(queuedPartialResult.length)
                : partialResult;
              queuedPartialResult = partialResult;
              if (nextDelta) {
                transitionAiInstructionToGenerating(requestId);
                aiInstructionPartialResultTextRef.current = partialResult;
                aiInstructionResultStartedRef.current = true;
                scheduleAiInstructionPartialResultFlush(requestId, instruction);
              }
            },
            t,
            {
              onProgressDelta: (delta) => {
                if (abortController.signal.aborted || aiInstructionRequestIdRef.current !== requestId) return;
                setAiInstructionProgress((current) => `${current}${delta}`);
              },
              onThinkingDelta: (delta) => {
                if (abortController.signal.aborted || aiInstructionRequestIdRef.current !== requestId) return;
                if (aiInstructionStreamDisplayPhaseRef.current !== 'thinking') return;
                aiInstructionRawThinkingRef.current += delta;
                enqueueAiInstructionDisplayText('thinking', delta, requestId);
              },
              onThoughtSummary: (summary) => {
                if (abortController.signal.aborted || aiInstructionRequestIdRef.current !== requestId) return;
                setAiInstructionThoughtSummary(summary);
              },
              onClarificationDelta: (delta) => {
                if (abortController.signal.aborted || aiInstructionRequestIdRef.current !== requestId) return;
                enqueueAiInstructionDisplayText('clarification', delta, requestId);
              },
              onCandidateReset: () => {
                if (abortController.signal.aborted || aiInstructionRequestIdRef.current !== requestId) return;
                queuedPartialResult = '';
                aiInstructionResultStartedRef.current = false;
                aiInstructionThinkingAutoCollapseVersionRef.current += 1;
                clearAiInstructionDisplayQueue(['thinking']);
                setAiInstructionThinking('');
                resetAiInstructionStreamDisplay('thinking');
                clearAiInstructionPartialResult();
              },
            },
          );
          if (streamed.session?.sessionId) {
            updateAiInstructionComposer((current) => (
              current && current.draftId === composer.draftId
                ? { ...current, sessionId: streamed.session?.sessionId }
                : current
            ));
          }
          if (streamed.clarification) {
            await waitForAiInstructionDisplayQueueIdle(requestId, ['clarification']);
            if (abortController.signal.aborted || aiInstructionRequestIdRef.current !== requestId) return;
            setAiInstructionClarification((current) => ({
              answer: '',
              error: null,
              questions: streamed.clarification.questions,
              streamingText: current?.streamingText?.trim()
                ? current.streamingText
                : streamed.clarification.questions.map(question => `- ${question.question}`).join('\n'),
            }));
            clearAiInstructionPartialResult();
            setAiInstructionResult(null);
            setAiInstructionThoughtSummary('');
            setAiInstructionThinkingOpen(false);
            resetAiInstructionStreamDisplay();
            notifyAiInstruction({ tone: 'info', text: t.previewAiSlashClarificationTitle });
            return;
          }
          replacement = streamed.patchReplacement?.trim() || streamed.resultText.trim();
        } else {
          let body: AiInstructionApiResponse = {};
          try {
            body = await response.json() as AiInstructionApiResponse;
          } catch {
            body = { message: response.statusText };
          }
          replacement = body.patch?.kind === 'replace' && typeof body.patch.replacement === 'string'
            ? body.patch.replacement.trim()
            : typeof body.resultText === 'string'
              ? body.resultText.trim()
              : '';
          if (body.session?.sessionId) {
            updateAiInstructionComposer((current) => (
              current && current.draftId === composer.draftId
                ? { ...current, sessionId: body.session?.sessionId }
                : current
            ));
          }
        }
      }
      if (abortController.signal.aborted || aiInstructionRequestIdRef.current !== requestId) return;
      if (!replacement) throw new Error(t.previewAiEmptyResponse);
      if (replacement) {
        transitionAiInstructionToGenerating(requestId);
        aiInstructionResultStartedRef.current = true;
      }
      clearAiInstructionPartialResult();
      setAiInstructionResult({
        instruction,
        markdown: replacement,
      });
      setAiInstructionStreamDisplayPhase('complete');
      setAiInstructionClarification(null);
      if (followUp) {
        setAiInstructionFollowUpOpen(false);
        setAiInstructionFollowUpText('');
      }
      notifyAiInstruction({ tone: 'success', text: t.previewAiSlashResultReady });
    } catch (error) {
      if (abortController.signal.aborted || aiInstructionRequestIdRef.current !== requestId) {
        clearAiInstructionDisplayQueue();
        setAiInstructionError(null);
        setAiInstructionClarification(null);
        clearAiInstructionPartialResult();
        setAiInstructionResult(null);
        setAiInstructionThoughtSummary('');
        setAiInstructionThinking('');
        setAiInstructionProgress('');
        setAiInstructionThinkingOpen(false);
        resetAiInstructionStreamDisplay();
        aiInstructionThinkingUserToggledRef.current = false;
        aiInstructionResultAutoCollapsedRef.current = false;
        resetAiInstructionThinkingAutoCollapse();
        notifyAiInstruction({ tone: 'info', text: t.previewAiSlashCancelled });
        return;
      }
      const message = getAiInstructionRuntimeErrorMessage(error, t);
      clearAiInstructionDisplayQueue();
      clearAiInstructionPartialResult();
      setAiInstructionResult(null);
      resetAiInstructionStreamDisplay();
      if (followUp) {
        setAiInstructionFollowUpError(message);
        setAiInstructionFollowUpOpen(true);
      }
      if (clarification) {
        setAiInstructionClarification({
          answer: clarification.answer,
          error: message,
          questions: clarification.questions,
        });
      }
      setAiInstructionError(message);
      notifyAiInstruction({ tone: 'error', text: message });
    } finally {
      if (aiInstructionRequestIdRef.current === requestId) {
        if (aiInstructionAbortRef.current === abortController) {
          aiInstructionAbortRef.current = null;
        }
        updateAiInstructionBusy(false);
      }
    }
  }, [
    aiInstructionComposer,
    aiInstructionInputText,
    clearAiInstructionDisplayQueue,
    clearAiInstructionPartialResult,
    deliveryRequestContext,
    enqueueAiInstructionDisplayText,
    editor, isFinalSlashAiEnabled,
    notifyAiInstruction,
    renderContext?.contentType,
    resetAiInstructionThinkingAutoCollapse,
    resetAiInstructionStreamDisplay,
    scheduleAiInstructionPartialResultFlush,
    setAiInstructionStreamDisplayPhase,
    showAiInstructionTooLongNotice,
    showEmptyAiInstructionNotice,
    tableAlignmentsRef,
    t,
    transitionAiInstructionToGenerating,
    updateAiInstructionBusy,
    updateAiInstructionComposer,
    waitForAiInstructionDisplayQueueIdle,
  ]);

  const applyAiInstructionResult = useCallback(() => {
    const composer = aiInstructionComposer;
    const result = aiInstructionResult;
    if (!composer || !result || aiInstructionBusy) return;
    let currentSource = '';
    editor.getEditorState().read(() => {
      currentSource = serializeEditorDocument(undefined, tableAlignmentsRef.current);
    });
    if (currentSource !== composer.source) {
      const message = t.previewAiSlashChanged;
      setAiInstructionError(message);
      notifyAiInstruction({ tone: 'error', text: message });
      return;
    }
    const insertResult = insertFinalAiInstructionMarkdown({
      editor,
      markdown: result.markdown,
      range: composer.replaceRange,
      source: composer.source,
      tableAlignments: tableAlignmentsRef.current,
    });
    if (!insertResult) throw new Error(t.previewAiSlashChanged);
    updateAiInstructionSessionAction(composer.sessionId, 'apply');
    notifyAiInstruction({ tone: 'success', text: t.previewAiSlashInserted });
    clearAiInstructionDisplayQueue();
    updateAiInstructionComposer(null);
    setAiInstructionClarification(null);
    setAiInstructionFollowUpError(null);
    setAiInstructionFollowUpOpen(false);
    setAiInstructionFollowUpText('');
    setAiInstructionInputText('');
    setAiInstructionResult(null);
    clearAiInstructionPartialResult();
    setAiInstructionThoughtSummary('');
    setAiInstructionThinking('');
    setAiInstructionProgress('');
    setAiInstructionThinkingOpen(false);
    resetAiInstructionStreamDisplay();
    aiInstructionThinkingUserToggledRef.current = false;
    aiInstructionResultAutoCollapsedRef.current = false;
    resetAiInstructionThinkingAutoCollapse();
    closeMenu();
  }, [
    aiInstructionBusy,
    aiInstructionComposer,
    aiInstructionResult,
    clearAiInstructionDisplayQueue,
    clearAiInstructionPartialResult,
    closeMenu,
    editor,
    notifyAiInstruction,
    resetAiInstructionStreamDisplay,
    resetAiInstructionThinkingAutoCollapse,
    tableAlignmentsRef,
    t.previewAiSlashChanged,
    t.previewAiSlashInserted,
    updateAiInstructionComposer,
    updateAiInstructionSessionAction,
  ]);

  const safeApplyAiInstructionResult = useCallback(() => {
    try {
      applyAiInstructionResult();
    } catch (error) {
      const message = error instanceof Error ? error.message : t.previewAiRequestFailed;
      setAiInstructionError(message);
      notifyAiInstruction({ tone: 'error', text: message });
    }
  }, [
    applyAiInstructionResult,
    notifyAiInstruction,
    t.previewAiRequestFailed,
  ]);

  const toggleAiInstructionThinking = useCallback(() => {
    aiInstructionThinkingUserToggledRef.current = true;
    setAiInstructionThinkingOpen((open) => !open);
  }, []);

  const submitAiInstructionClarification = useCallback((answerOverride?: string) => {
    const composer = aiInstructionComposerStateRef.current;
    const clarification = aiInstructionClarification;
    const answer = (answerOverride ?? clarification?.answer ?? '').trim();
    if (!composer || !clarification || aiInstructionBusyRef.current) return;
    if (answer.length < AI_INSTRUCTION_MIN_TEXT) {
      setAiInstructionClarification({
        ...clarification,
        error: t.previewAiSlashClarificationEmpty,
      });
      notifyAiInstruction({ tone: 'error', text: t.previewAiSlashClarificationEmpty });
      return;
    }
    if (answer.length > AI_ARTIFACT_INSTRUCTION_MAX_TEXT) {
      setAiInstructionClarification({
        ...clarification,
        error: t.previewAiSlashInstructionTooLong,
      });
      notifyAiInstruction({ tone: 'error', text: t.previewAiSlashInstructionTooLong });
      return;
    }
    void runAiInstruction(composer, composer.instruction, undefined, {
      answer,
      questions: clarification.questions,
    });
  }, [
    aiInstructionClarification,
    notifyAiInstruction,
    runAiInstruction,
    t.previewAiSlashClarificationEmpty,
    t.previewAiSlashInstructionTooLong,
  ]);

  const submitAiInstructionFollowUp = useCallback((instructionOverride?: string) => {
    const composer = aiInstructionComposerStateRef.current;
    const followUpInstruction = (instructionOverride ?? aiInstructionFollowUpText).trim();
    const previousResultText = (aiInstructionResult ?? aiInstructionPartialResult)?.markdown.trim() ?? '';
    if (!composer || aiInstructionBusyRef.current) return;
    if (followUpInstruction.length < AI_INSTRUCTION_MIN_TEXT) {
      setAiInstructionFollowUpError(t.previewAiFollowUpEmpty);
      notifyAiInstruction({ tone: 'error', text: t.previewAiFollowUpEmpty });
      return;
    }
    if (followUpInstruction.length > AI_ARTIFACT_INSTRUCTION_MAX_TEXT) {
      setAiInstructionFollowUpError(t.previewAiSlashInstructionTooLong);
      notifyAiInstruction({ tone: 'error', text: t.previewAiSlashInstructionTooLong });
      return;
    }
    if (!previousResultText) {
      setAiInstructionFollowUpError(t.previewAiEmptyResponse);
      notifyAiInstruction({ tone: 'error', text: t.previewAiEmptyResponse });
      return;
    }
    void runAiInstruction(composer, composer.instruction, {
      followUpInstruction,
      previousResultText,
    });
  }, [
    aiInstructionFollowUpText,
    aiInstructionPartialResult,
    aiInstructionResult,
    notifyAiInstruction,
    runAiInstruction,
    t.previewAiEmptyResponse,
    t.previewAiFollowUpEmpty,
    t.previewAiSlashInstructionTooLong,
  ]);

  const toggleAiInstructionFollowUp = useCallback(() => {
    setAiInstructionFollowUpOpen((open) => !open);
    setAiInstructionFollowUpError(null);
  }, []);

  useEffect(() => {
    const composer = aiInstructionComposer;
    if (!composer) return;
    const displayMarkdown = aiInstructionStreamDisplayPhase === 'thinking'
      ? ''
      : aiInstructionDisplayResult?.markdown ?? '';
    const renderArtifactsReady = Boolean(aiInstructionResult && !aiInstructionBusy);
    const instructionInputOpen = !aiInstructionBusy &&
      !aiInstructionClarification &&
      !displayMarkdown &&
      !aiInstructionResult;
    const payload: FinalSlashAiInlineDraftPayload = {
      busy: aiInstructionBusy,
      clarification: aiInstructionClarification,
      displayMarkdown,
      error: aiInstructionError,
      followUpError: aiInstructionFollowUpError,
      followUpInstruction: aiInstructionFollowUpText,
      followUpOpen: aiInstructionFollowUpOpen,
      id: composer.draftId,
      instructionInput: aiInstructionInputText,
      instructionInputOpen,
      onApply: safeApplyAiInstructionResult,
      onCancel: () => dismissAiInstructionComposer({ restoreCaret: true }),
      onClarificationAnswerChange: (value) => {
        setAiInstructionClarification((current) => (
          current ? { ...current, answer: value, error: null } : current
        ));
      },
      onFollowUpInstructionChange: (value) => {
        setAiInstructionFollowUpText(value);
        setAiInstructionFollowUpError(null);
      },
      onInstructionInputChange: (value) => {
        setAiInstructionInputText(value);
        setAiInstructionError(null);
      },
      onSubmitClarification: submitAiInstructionClarification,
      onSubmitFollowUp: submitAiInstructionFollowUp,
      onSubmitInstruction: (instruction) => {
        void runAiInstruction(composer, instruction);
      },
      onToggleFollowUp: toggleAiInstructionFollowUp,
      onToggleThinking: toggleAiInstructionThinking,
      progress: aiInstructionProgress,
      ready: Boolean(aiInstructionResult),
      renderArtifactsReady,
      renderDeliveryAccess: aiCandidateRenderDeliveryAccess,
      streaming: Boolean(aiInstructionPartialResult && !aiInstructionResult),
      streamDisplayPhase: aiInstructionStreamDisplayPhase,
      t,
      thoughtSummary: aiInstructionThoughtSummary,
      thinking: aiInstructionThinking,
      thinkingOpen: aiInstructionThinkingOpen,
    };
    editor.update(() => {
      const node = $getNodeByKey(composer.inlineNodeKey);
      if (!$isFinalSlashAiInlineDraftNode(node)) return;
      $addUpdateTag(ISLAND_SLASH_AI_DRAFT_UPDATE_TAG);
      node.setPayload(payload);
    });
  }, [
    aiInstructionBusy,
    aiInstructionClarification,
    aiInstructionComposer,
    aiInstructionDisplayResult,
    aiInstructionError,
    aiInstructionFollowUpError,
    aiInstructionFollowUpOpen,
    aiInstructionFollowUpText,
    aiInstructionInputText,
    aiInstructionPartialResult,
    aiInstructionProgress,
    aiInstructionResult,
    aiInstructionStreamDisplayPhase,
    aiInstructionThoughtSummary,
    aiInstructionThinking,
    aiInstructionThinkingOpen,
    aiCandidateRenderDeliveryAccess,
    dismissAiInstructionComposer,
    editor,
    safeApplyAiInstructionResult,
    runAiInstruction,
    submitAiInstructionClarification,
    submitAiInstructionFollowUp,
    t,
    toggleAiInstructionFollowUp,
    toggleAiInstructionThinking,
  ]);

  const runCommand = useCallback((command: FinalInsertCommand) => {
    if (!isFinalInsertExecutable(command)) return;
    closeMenu();
    insertFinalArtifactCommand(editor, command.source ?? '', command.artifactKind ?? '');
  }, [closeMenu, editor]);

  const runTableGridCommand = useCallback((
    command: FinalInsertCommand,
    selection: FinalInsertTableGridSelection = tableGridSelection,
  ) => {
    if (!command.tableGrid || command.disabledReason) return;
    closeMenu();
    insertFinalTableGridCommand(editor, command.tableGrid, selection);
  }, [closeMenu, editor, tableGridSelection]);

  const openCommandSubmenu = useCallback((command: FinalInsertCommand) => {
    if (!hasFinalInsertSubmenu(command)) return false;
    setOpenSubmenuId(command.id);
    setActiveMenuLevel('secondary');
    setSecondaryActiveIndex(0);
    if (command.tableGrid) {
      setTableGridSelection(getDefaultFinalInsertTableGridSelection(command.tableGrid));
    }
    return true;
  }, []);

  useEffect(
    () =>
      editor.registerUpdateListener(({ editorState, tags }) => {
        if (tags.has(ISLAND_SLASH_AI_DRAFT_UPDATE_TAG)) return;
        let slashCandidate: ReturnType<typeof getFinalSlashCommandCandidate> = null;
        let blockKey: string | null = null;
        editorState.read(() => {
          slashCandidate = getFinalSlashCommandCandidate(isFinalSlashAiEnabled);
          blockKey = slashCandidate?.blockKey ?? null;
        });
        if (finalInsertCommands.length === 0) {
          closeMenu();
          setQueuedAiInstructionSlashText(null);
          return;
        }
        if (!slashCandidate) {
          closeMenu();
          setQueuedAiInstructionSlashText(null);
          return;
        }
        if (dismissedSlashText && dismissedSlashText !== slashCandidate.slashText) {
          setDismissedSlashText('');
        }
        if (dismissedSlashText === slashCandidate.slashText) {
          setSlashText(slashCandidate.slashText);
          setQuery(slashCandidate.query);
          setOpenSubmenuId(null);
          setActiveMenuLevel('primary');
          setSecondaryActiveIndex(0);
          setIsMenuOpen(false);
          setQueuedAiInstructionSlashText(null);
          return;
        }
        if (slashCandidate.isAiCommand) {
          const nextLayout = getFinalInsertMenuLayout(editor, blockKey);
          setAiInstructionError(null);
          setDismissedSlashText((current) => (
            current && current !== slashCandidate.slashText ? '' : current
          ));
          setMenuLayout((current) => (
            current.placement === nextLayout.placement &&
            Math.abs(current.top - nextLayout.top) < 1 &&
            Math.abs(current.maxHeight - nextLayout.maxHeight) < 1
              ? current
              : nextLayout
          ));
          setOpenSubmenuId(null);
          setActiveMenuLevel('primary');
          setSecondaryActiveIndex(0);
          setIsMenuOpen(false);
          setSlashText(slashCandidate.slashText);
          setQuery('');
          if (aiInstructionComposerStateRef.current?.blockKey !== blockKey) {
            setQueuedAiInstructionSlashText(slashCandidate.slashText);
          }
          return;
        }
        const nextLayout = getFinalInsertMenuLayout(editor, blockKey);
        debugPreviewLexical('slash-menu-layout', {
          blockKey,
          maxHeight: nextLayout.maxHeight,
          placement: nextLayout.placement,
          query: slashCandidate.query,
          top: nextLayout.top,
        });
        setAiInstructionError(null);
        setDismissedSlashText((current) => (
          current && current !== slashCandidate.slashText ? '' : current
        ));
        setSlashText(slashCandidate.slashText);
        setQuery(slashCandidate.query);
        setQueuedAiInstructionSlashText(null);
        setMenuLayout((current) => (
          current.placement === nextLayout.placement &&
          Math.abs(current.top - nextLayout.top) < 1 &&
          Math.abs(current.maxHeight - nextLayout.maxHeight) < 1
            ? current
            : nextLayout
        ));
        setIsMenuOpen(true);
      }),
    [closeMenu, dismissedSlashText, editor, finalInsertCommands.length, isFinalSlashAiEnabled],
  );

  const moveMenuSelection = useCallback((delta: 1 | -1) => {
    if (activeMenuLevel === 'secondary' && submenuCommands.length > 0) {
      const currentPosition = submenuNavigationIndexes.indexOf(secondaryActiveIndex);
      const currentOrBoundary = currentPosition >= 0
        ? currentPosition
        : delta > 0
          ? -1
          : 0;
      const nextPosition = (currentOrBoundary + delta + submenuNavigationIndexes.length) % submenuNavigationIndexes.length;
      setSecondaryActiveIndex(submenuNavigationIndexes[nextPosition]);
      return;
    }
    if (actionableIndexes.length === 0) return;
    const currentPosition = actionableIndexes.indexOf(activeIndex);
    const currentOrBoundary = currentPosition >= 0
      ? currentPosition
      : delta > 0
        ? -1
        : 0;
    const nextPosition = (currentOrBoundary + delta + actionableIndexes.length) % actionableIndexes.length;
    const nextIndex = actionableIndexes[nextPosition];
    const nextCommand = visibleEntries[nextIndex]?.command;
    setActiveIndex(nextIndex);
    setOpenSubmenuId(nextCommand && hasFinalInsertSubmenu(nextCommand) ? nextCommand.id : null);
    setActiveMenuLevel('primary');
  }, [
    actionableIndexes,
    activeIndex,
    activeMenuLevel,
    secondaryActiveIndex,
    submenuCommands.length,
    submenuNavigationIndexes,
    visibleEntries,
  ]);

  const runFinalSlashAiInstructionFromEnter = useCallback((event: KeyboardEvent) => {
    if (event.isComposing || editor.isComposing()) return false;
    const eventTarget = event.target instanceof Element ? event.target : null;
    if (eventTarget?.closest('.aad-final-slash-ai-inline-draft')) return false;
    if (
      event.key !== 'Enter' ||
      event.altKey ||
      event.shiftKey
    ) {
      return false;
    }
    let slashCandidate: ReturnType<typeof getFinalSlashCommandCandidate> = null;
    editor.getEditorState().read(() => {
      slashCandidate = getFinalSlashCommandCandidate(isFinalSlashAiEnabled);
    });
    if (!slashCandidate?.isAiCommand) return false;
    event.preventDefault();
    event.stopPropagation();
    if (aiInstructionBusyRef.current) {
      showAiInstructionBusyNotice();
      return true;
    }
    const instruction = slashCandidate.instruction.trim();
    if (instruction.length > AI_ARTIFACT_INSTRUCTION_MAX_TEXT) {
      showAiInstructionTooLongNotice();
      return true;
    }
    beginAiInstructionDraft(slashCandidate.slashText);
    return true;
  }, [
    beginAiInstructionDraft,
    editor, isFinalSlashAiEnabled,
    showAiInstructionBusyNotice,
    showAiInstructionTooLongNotice,
  ]);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (runFinalSlashAiInstructionFromEnter(event)) return;
    if (!isMenuOpen) {
      return;
    }
    if (
      event.key === 'Escape' ||
      event.key === 'Tab' ||
      event.key === 'ArrowDown' ||
      event.key === 'ArrowUp' ||
      event.key === 'ArrowLeft' ||
      event.key === 'ArrowRight' ||
      event.key === 'Enter'
    ) {
      markKeyboardMenuNavigation();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeMenu({ dismissCurrentSlash: true });
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      moveMenuSelection(event.shiftKey ? -1 : 1);
      return;
    }
    if (activeMenuLevel === 'secondary' && activeTableGrid && openSubmenuEntry) {
      if (
        event.key === 'ArrowDown' ||
        event.key === 'ArrowUp' ||
        event.key === 'ArrowLeft' ||
        event.key === 'ArrowRight'
      ) {
        event.preventDefault();
        event.stopPropagation();
        setTableGridSelection((current) => {
          const normalized = clampFinalInsertTableGridSelection(current, activeTableGrid);
          return clampFinalInsertTableGridSelection({
            columns: normalized.columns + (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0),
            rows: normalized.rows + (event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0),
          }, activeTableGrid);
        });
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        runTableGridCommand(openSubmenuEntry.command, selectedTableGridSelection);
        return;
      }
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      moveMenuSelection(event.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      event.stopPropagation();
      const command = activeEntry?.command;
      if (command) openCommandSubmenu(command);
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      event.stopPropagation();
      if (activeMenuLevel === 'secondary') setActiveMenuLevel('primary');
      else setOpenSubmenuId(null);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      if (activeMenuLevel === 'secondary') {
        if (openSubmenuEntry?.command.tableGrid) {
          runTableGridCommand(openSubmenuEntry.command, selectedTableGridSelection);
          return;
        }
        const command = submenuCommands[secondaryActiveIndex];
        if (command && isFinalInsertExecutable(command)) runCommand(command);
        return;
      }
      const command = activeEntry?.command;
      if (!command) {
        if (isAiEntryActive) {
          beginAiInstructionDraft(slashText || '/');
        }
        return;
      }
      if (hasFinalInsertSubmenu(command)) {
        openCommandSubmenu(command);
        return;
      }
      if (isFinalInsertExecutable(command)) runCommand(command);
    }
  }, [
    activeEntry,
    activeMenuLevel,
    activeTableGrid,
    beginAiInstructionDraft,
    closeMenu,
    isAiEntryActive,
    isMenuOpen,
    markKeyboardMenuNavigation,
    moveMenuSelection,
    openCommandSubmenu,
    openSubmenuEntry,
    runCommand,
    runFinalSlashAiInstructionFromEnter,
    runTableGridCommand,
    secondaryActiveIndex,
    selectedTableGridSelection,
    slashText,
    submenuCommands,
  ]);

  useEffect(() => {
    let currentRoot: HTMLElement | null = null;
    const unregister = editor.registerRootListener((rootElement, previousRootElement) => {
      previousRootElement?.removeEventListener('keydown', handleKeyDown, true);
      currentRoot = rootElement;
      rootElement?.addEventListener('keydown', handleKeyDown, true);
    });
    return () => {
      currentRoot?.removeEventListener('keydown', handleKeyDown, true);
      unregister();
    };
  }, [editor, handleKeyDown]);

  useEffect(
    () => editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event) => {
        if (!event) return false;
        return runFinalSlashAiInstructionFromEnter(event);
      },
      COMMAND_PRIORITY_HIGH,
    ),
    [editor, runFinalSlashAiInstructionFromEnter],
  );

  return (
    <>
      {isMenuOpen ? (
        <div
          className="aad-final-insert-menu md-public-insert-menu"
          data-navigation-mode={menuNavigationMode}
          data-placement={menuLayout.placement}
          style={{
            '--aad-final-insert-menu-max-height': `${menuLayout.maxHeight}px`,
            top: menuLayout.top,
          } as React.CSSProperties}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <div ref={primaryMenuPanelRef} className="aad-final-insert-menu-panel" role="menu" aria-label="插入内容">
            {primaryPanelMornDraftPreviewCommand ? (
              <FinalInsertMornDraftPreview command={primaryPanelMornDraftPreviewCommand} />
            ) : null}
            {showAiInstructionEntry ? (
              <div className="aad-final-insert-menu-group aad-final-insert-ai-group">
                <div className="aad-final-insert-menu-heading">AI</div>
                <button
                  type="button"
                  role="menuitem"
                  className={[
                    'aad-final-insert-menu-item',
                    'aad-final-insert-ai-item',
                    isAiEntryActive ? 'is-active' : '',
                    aiInstructionBusy ? 'is-busy' : '',
                  ].filter(Boolean).join(' ')}
                  ref={isAiEntryActive ? activePrimaryMenuItemRef : undefined}
                  disabled={aiInstructionBusy}
                  title={t.previewAiSlashDraftTitle}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onMouseEnter={() => {
                    markPointerMenuNavigation();
                    setActiveIndex(FINAL_INSERT_AI_ACTIVE_INDEX);
                    setActiveMenuLevel('primary');
                    setOpenSubmenuId(null);
                  }}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    beginAiInstructionDraft(slashText || '/');
                  }}
                >
                  {aiInstructionBusy ? (
                    <Loader2 className="aad-final-insert-menu-icon animate-spin" size={17} aria-hidden="true" />
                  ) : (
                    <Sparkles className="aad-final-insert-menu-icon" size={17} aria-hidden="true" />
                  )}
                  <span className="aad-final-insert-menu-label">
                    {aiInstructionBusy
                      ? t.previewAiSlashGenerating
                      : t.previewAiSlashStartDraft}
                  </span>
                </button>
                {aiInstructionError ? (
                  <div className="aad-final-insert-menu-error" role="alert">{aiInstructionError}</div>
                ) : null}
              </div>
            ) : null}
            {groupedEntries.length > 0 ? groupedEntries.map((group) => (
              <div className="aad-final-insert-menu-group" key={group.category}>
                <div className="aad-final-insert-menu-heading">{group.category}</div>
                {group.entries.map(({ command, index, parent }) => {
                  const Icon = command.icon;
                  const isDisabled = Boolean(command.disabledReason);
                  const hasSubmenu = !isSearchMode
                    ? hasFinalInsertSubmenu(command)
                    : hasFinalInsertTableGrid(command);
                  const isActive = index === activeIndex && activeMenuLevel === 'primary';
                  const isOpen = hasSubmenu && openSubmenuId === command.id;
                  const ChildIcon = FINAL_INSERT_MENU_CHILD_ICON;
                  return (
                    <button
                      key={`${parent?.id ?? 'root'}:${command.id}`}
                      type="button"
                      role="menuitem"
                      className={[
                        'aad-final-insert-menu-item',
                        hasSubmenu ? 'has-children' : '',
                        isOpen ? 'is-open' : '',
                        isActive ? 'is-active' : '',
                        isDisabled ? 'is-disabled' : '',
                      ].filter(Boolean).join(' ')}
                      ref={isActive ? activePrimaryMenuItemRef : undefined}
                      aria-disabled={isDisabled}
                      aria-haspopup={hasSubmenu ? 'menu' : undefined}
                      aria-expanded={hasSubmenu ? isOpen : undefined}
                      title={command.disabledReason ?? command.label}
                      onMouseEnter={() => {
                        markPointerMenuNavigation();
                        setActiveIndex(index);
                        setActiveMenuLevel('primary');
                        if (hasSubmenu) {
                          setOpenSubmenuId(command.id);
                          setSecondaryActiveIndex(0);
                          if (command.tableGrid) {
                            setTableGridSelection(getDefaultFinalInsertTableGridSelection(command.tableGrid));
                          }
                        } else if (!isSearchMode) {
                          setOpenSubmenuId(null);
                        }
                      }}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        if (hasSubmenu) {
                          openCommandSubmenu(command);
                          return;
                        }
                        if (isDisabled) return;
                        if (isFinalInsertExecutable(command)) runCommand(command);
                      }}
                    >
                      <Icon className="aad-final-insert-menu-icon" size={17} aria-hidden="true" />
                      <span className="aad-final-insert-menu-label">{command.label}</span>
                      {hasSubmenu ? (
                        <ChildIcon className="aad-final-insert-menu-chevron" size={15} aria-hidden="true" />
                      ) : command.disabledReason ? (
                        <span className="aad-final-insert-menu-disabled">{command.disabledReason}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )) : (
              <div className="aad-final-insert-menu-empty">没有匹配项</div>
            )}
          </div>
          {openSubmenuEntry && activeTableGrid ? (
            <div
              className="aad-final-insert-submenu aad-final-insert-table-grid-menu"
              role="menu"
              aria-label={openSubmenuEntry.command.label}
            >
              <div className="aad-final-insert-menu-heading" aria-live="polite">
                {selectedTableGridSelection.columns}x{selectedTableGridSelection.rows} 表格
              </div>
              <div
                className="aad-final-insert-table-grid"
                role="grid"
                aria-label="选择表格行列数"
                style={{
                  '--aad-final-insert-table-grid-columns': activeTableGrid.maxColumns,
                } as React.CSSProperties}
              >
                {Array.from({ length: activeTableGrid.maxRows }, (_, rowIndex) => (
                  Array.from({ length: activeTableGrid.maxColumns }, (_, columnIndex) => {
                    const cellSelection: FinalInsertTableGridSelection = {
                      columns: columnIndex + 1,
                      rows: rowIndex + 1,
                    };
                    const isSelected =
                      cellSelection.columns <= selectedTableGridSelection.columns &&
                      cellSelection.rows <= selectedTableGridSelection.rows;
                    return (
                      <button
                        key={`${cellSelection.columns}x${cellSelection.rows}`}
                        type="button"
                        role="gridcell"
                        className={[
                          'aad-final-insert-table-grid-cell',
                          isSelected ? 'is-selected' : '',
                        ].filter(Boolean).join(' ')}
                        aria-label={`${cellSelection.columns}x${cellSelection.rows} 表格`}
                        aria-selected={isSelected}
                        title={`${cellSelection.columns}x${cellSelection.rows} 表格`}
                        onFocus={() => {
                          markKeyboardMenuNavigation();
                          setActiveMenuLevel('secondary');
                          setTableGridSelection(cellSelection);
                        }}
                        onMouseEnter={() => {
                          markPointerMenuNavigation();
                          setActiveMenuLevel('secondary');
                          setTableGridSelection(cellSelection);
                        }}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          runTableGridCommand(openSubmenuEntry.command, cellSelection);
                        }}
                      />
                    );
                  })
                ))}
              </div>
            </div>
          ) : openSubmenuEntry && submenuCommands.length > 0 ? (
            <div className="aad-final-insert-submenu" role="menu" aria-label={openSubmenuEntry.command.label}>
              <div className="aad-final-insert-menu-heading">{openSubmenuEntry.command.label}</div>
              {submenuMornDraftPreviewCommand ? (
                <FinalInsertMornDraftPreview command={submenuMornDraftPreviewCommand} />
              ) : null}
              <div ref={submenuListRef} className="aad-final-insert-submenu-list">
                {submenuCommands.map((command, index) => {
                  const Icon = command.icon;
                  const isDisabled = Boolean(command.disabledReason);
                  return (
                    <button
                      key={command.id}
                      type="button"
                      role="menuitem"
                      className={[
                        'aad-final-insert-menu-item',
                        activeMenuLevel === 'secondary' && index === secondaryActiveIndex ? 'is-active' : '',
                        isDisabled ? 'is-disabled' : '',
                      ].filter(Boolean).join(' ')}
                      ref={activeMenuLevel === 'secondary' && index === secondaryActiveIndex ? activeSecondaryMenuItemRef : undefined}
                      aria-disabled={isDisabled}
                      title={command.disabledReason ?? command.label}
                      onMouseEnter={() => {
                        markPointerMenuNavigation();
                        setActiveMenuLevel('secondary');
                        setSecondaryActiveIndex(index);
                      }}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        if (isDisabled) return;
                        if (isFinalInsertExecutable(command)) runCommand(command);
                      }}
                    >
                      <Icon className="aad-final-insert-menu-icon" size={17} aria-hidden="true" />
                      <span className="aad-final-insert-menu-label">{command.label}</span>
                      {command.disabledReason ? (
                        <span className="aad-final-insert-menu-disabled">{command.disabledReason}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
};

const LexicalDocumentFormatBridgePlugin: React.FC<{
  editState: PreviewMarkdownEditState;
  documentId: string;
  onFormatIntent: () => void;
  selectedTableNodeKeyRef: React.MutableRefObject<string | null>;
}> = ({ editState, documentId, onFormatIntent, selectedTableNodeKeyRef }) => {
  const [editor] = useLexicalComposerContext();
  const {
    onActiveIslandChange,
    onFinalCursorSourceLineChange,
    onLexicalAiSelectionChange,
    onLexicalFormatChange,
  } = editState;
  const onFormatIntentRef = useRef(onFormatIntent);
  useEffect(() => {
    onFormatIntentRef.current = onFormatIntent;
  }, [onFormatIntent]);
  const applyBlockFormat = useCallback(
    (format: PreviewMarkdownBlockFormat) => {
      if (format === 'mixed') return;
      onFormatIntentRef.current();
      editor.update(
        () => {
          $addUpdateTag(SKIP_SCROLL_INTO_VIEW_TAG);
          const selection = $getSelection();
          if (!$isRangeSelection(selection) || selectionTouchesReadonlyOrTable(selection)) return;
          if (format === 'bulletList') {
            editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
            return;
          }
          if (format === 'numberList') {
            editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
            return;
          }
          editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
          const nextSelection = $getSelection();
          if (!$isRangeSelection(nextSelection)) return;
          if (format === 'quote') {
            $setBlocksType(nextSelection, () => $createQuoteNode());
            return;
          }
          if (/^h[1-6]$/.test(format)) {
            $setBlocksType(nextSelection, () => $createHeadingNode(format as any));
            return;
          }
          $setBlocksType(nextSelection, () => $createParagraphNode());
        },
        { tag: ISLAND_FORMAT_UPDATE_TAG },
      );
      window.requestAnimationFrame(() => {
        editor.getRootElement()?.focus({ preventScroll: true });
      });
    },
    [editor],
  );
  const restoreEditorFocus = useCallback(() => {
    window.requestAnimationFrame(() => {
      editor.getRootElement()?.focus({ preventScroll: true });
    });
  }, [editor]);
  const publishSnapshot = useCallback(() => {
    editor.getEditorState().read(() => {
      const sourceLine = getLexicalSelectionSourceLine();
      const selectedText = window.getSelection()?.toString().trim() || null;
      if (sourceLine) onFinalCursorSourceLineChange?.(sourceLine, selectedText || undefined);
      const aiSelectionCandidate = getLexicalAiSelectionCandidate(documentId, editState.source);
      if (aiSelectionCandidate || (!selectedTableNodeKeyRef.current && !selectionIsCollapsedInsidePreviewTable())) {
        onLexicalAiSelectionChange(aiSelectionCandidate);
      }
      const snapshot = getLexicalFormatSnapshot(documentId);
      onLexicalFormatChange(snapshot, {
        applyBlockFormat,
        applyStyle(style) {
          const patch = createLexicalStylePatch(style);
          const hasLineHeightPatch = Object.prototype.hasOwnProperty.call(style, 'lineHeight');
          const safeLineHeight = hasLineHeightPatch
            ? sanitizeMarkdownInlineStyle({ lineHeight: style.lineHeight }).lineHeight || ''
            : '';
          if (hasLineHeightPatch && style.lineHeight && !safeLineHeight) return;
          if (Object.keys(patch).length === 0 && !hasLineHeightPatch) return;
          onFormatIntentRef.current();
          editor.update(
            () => {
              $addUpdateTag(SKIP_SCROLL_INTO_VIEW_TAG);
              const selection = $getSelection();
              if (!selection) return;
              if (hasLineHeightPatch) {
                applyLineHeightToSelectionBlocks(selection, safeLineHeight || null);
              }
              if (Object.keys(patch).length > 0) $patchStyleText(selection, patch);
            },
            { tag: ISLAND_FORMAT_UPDATE_TAG },
          );
          restoreEditorFocus();
        },
        toggleFormat(format) {
          onFormatIntentRef.current();
          editor.update(
            () => {
              $addUpdateTag(SKIP_SCROLL_INTO_VIEW_TAG);
              const selection = $getSelection();
              if (!$isRangeSelection(selection)) return;
              selection.formatText(PREVIEW_TEXT_FORMAT_TO_LEXICAL[format]);
            },
            { tag: ISLAND_FORMAT_UPDATE_TAG },
          );
          restoreEditorFocus();
        },
      });
    });
  }, [
    applyBlockFormat,
    documentId,
    editState.source,
    editor,
    onFinalCursorSourceLineChange,
    onLexicalAiSelectionChange,
    onLexicalFormatChange,
    restoreEditorFocus,
    selectedTableNodeKeyRef,
  ]);

  useEffect(() => {
    let frameId: number | null = null;
    const schedulePublishSnapshot = () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        publishSnapshot();
      });
    };
    const unregisterUpdate = editor.registerUpdateListener(() => publishSnapshot());
    const unregisterSelection = editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        schedulePublishSnapshot();
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );
    const rootElement = editor.getRootElement();
    const ownerDocument = rootElement?.ownerDocument ?? document;
    const handleFocusIn = () => {
      onActiveIslandChange(documentId);
      schedulePublishSnapshot();
    };
    const handleSelectionActivity = () => schedulePublishSnapshot();
    rootElement?.addEventListener('focusin', handleFocusIn);
    rootElement?.addEventListener('pointerup', handleSelectionActivity);
    rootElement?.addEventListener('keyup', handleSelectionActivity);
    ownerDocument.addEventListener('selectionchange', handleSelectionActivity);
    publishSnapshot();
    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      unregisterUpdate();
      unregisterSelection();
      rootElement?.removeEventListener('focusin', handleFocusIn);
      rootElement?.removeEventListener('pointerup', handleSelectionActivity);
      rootElement?.removeEventListener('keyup', handleSelectionActivity);
      ownerDocument.removeEventListener('selectionchange', handleSelectionActivity);
      onLexicalAiSelectionChange(null);
      onLexicalFormatChange(null);
    };
  }, [documentId, editor, onActiveIslandChange, onLexicalAiSelectionChange, onLexicalFormatChange, publishSnapshot]);

  return null;
};

const LexicalFencedCodeShortcutPlugin: React.FC = () => {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    const unregisterClosedFence = editor.registerUpdateListener(({ editorState, tags }) => {
      if (editor.isComposing()) return;
      if (tags.has(ISLAND_MARKDOWN_SOURCE_PASTE_UPDATE_TAG)) return;
      const shouldTransform = editorState.read(() => getClosedPreviewMarkdownFenceCandidate() !== null);
      if (!shouldTransform) return;
      editor.update(() => {
        const transformResult = transformClosedPreviewMarkdownFence();
        debugPreviewLexical('closed-fence-transform', {
          kind: transformResult?.kind ?? null,
        });
        if (transformResult) {
          $addUpdateTag(HISTORY_PUSH_TAG);
          if (transformResult.kind === 'code-block') {
            $addUpdateTag(ISLAND_CODE_FENCE_SHORTCUT_UPDATE_TAG);
          }
        }
      });
    });
    const unregisterOpenFenceSpace = editor.registerCommand(
      KEY_SPACE_COMMAND,
      (event) => {
        if (editor.isComposing() || !isPlainFenceConfirmSpaceEvent(event)) return false;
        const openFenceCandidate =
          getOpenPreviewMarkdownFenceHeaderCandidate() ??
          getOpenPreviewMarkdownFenceHeaderDomCandidate();
        if (!openFenceCandidate) return false;
        const currentCandidate =
          getOpenPreviewMarkdownFenceHeaderCandidate() ??
          getOpenPreviewMarkdownFenceHeaderDomCandidate();
        const codeTextareaTarget = transformOpenPreviewMarkdownFence(
          currentCandidate ?? openFenceCandidate,
        );
        debugPreviewLexical('open-fence-space', {
          candidateLanguage: (currentCandidate ?? openFenceCandidate).language,
          hasTarget: Boolean(codeTextareaTarget),
        });
        if (!codeTextareaTarget) return false;
        event.preventDefault();
        event.stopPropagation();
        if (codeTextareaTarget) {
          $addUpdateTag(HISTORY_PUSH_TAG);
          $addUpdateTag(ISLAND_CODE_FENCE_SHORTCUT_UPDATE_TAG);
          $addUpdateTag(SKIP_DOM_SELECTION_TAG);
          $addUpdateTag(SKIP_SCROLL_INTO_VIEW_TAG);
        }
        focusCodeBlockTextarea(editor, codeTextareaTarget, { centerHeader: true });
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
    return () => {
      unregisterClosedFence();
      unregisterOpenFenceSpace();
    };
  }, [editor]);
  return null;
};

const LexicalInlineMarkdownShortcutPlugin: React.FC = () => {
  const [editor] = useLexicalComposerContext();
  useEffect(
    () => editor.registerUpdateListener(({ editorState }) => {
      if (editor.isComposing()) return;
      const shouldTransform = editorState.read(() => getClosedPreviewMarkdownInlineShortcutCandidates().length > 0);
      if (!shouldTransform) return;
      editor.update(() => {
        if (transformClosedPreviewMarkdownInlineShortcuts()) {
          $addUpdateTag(HISTORY_PUSH_TAG);
        }
      });
    }),
    [editor],
  );
  return null;
};

const LexicalPipeTableShortcutPlugin: React.FC<{
  tableAlignmentsRef: React.MutableRefObject<TableAlignmentRegistry>;
}> = ({ tableAlignmentsRef }) => {
  const [editor] = useLexicalComposerContext();
  useEffect(
    () => editor.registerUpdateListener(({ editorState }) => {
      if (editor.isComposing()) return;
      const shouldTransform = editorState.read(() => getClosedPreviewMarkdownPipeTableCandidate() !== null);
      if (!shouldTransform) return;
      editor.update(() => {
        if (transformClosedPreviewMarkdownPipeTable(tableAlignmentsRef.current)) {
          $addUpdateTag(HISTORY_PUSH_TAG);
          $addUpdateTag(ISLAND_TABLE_SHORTCUT_UPDATE_TAG);
        }
      });
    }),
    [editor, tableAlignmentsRef],
  );
  return null;
};

const getTableElementFromDomTarget = (target: EventTarget | null, rootElement: HTMLElement | null) => {
  if (!(target instanceof Node) || !rootElement?.contains(target)) return null;
  const targetElement = target instanceof Element ? target : target.parentElement;
  const tableHost = targetElement?.closest('.aad-lexical-table, .aad-lexical-table-scroll-wrapper') ?? null;
  if (!(tableHost instanceof HTMLElement) || !rootElement.contains(tableHost)) return null;
  if (tableHost.classList.contains('aad-lexical-table')) return tableHost;
  return tableHost.querySelector<HTMLElement>('.aad-lexical-table');
};

const resolveTableSourceRangeFromElement = (tableElement: HTMLElement, rootElement: HTMLElement) => {
  const islandRoot = tableElement.closest('.aad-markdown-lexical-island-content');
  if (!(islandRoot instanceof HTMLElement) || islandRoot !== rootElement) return null;
  return (
    readSourceRangeAttributes(tableElement) ??
    readSourceRangeAttributes(findPreviousSourceAnchorElement(tableElement, islandRoot))
  );
};

const getTableNodeKeyFromElement = (editor: LexicalEditor, tableElement: HTMLElement) => {
  let tableNodeKey: string | null = null;
  editor.getEditorState().read(() => {
    const node = $getNearestNodeFromDOMNode(tableElement);
    const tableNode = $isTableNode(node) ? node : findAncestor(node, $isTableNode);
    tableNodeKey = $isTableNode(tableNode) ? tableNode.getKey() : null;
  }, { editor });
  return tableNodeKey;
};

const getTableAiSelectionContextFromElement = (editor: LexicalEditor, tableElement: HTMLElement) => {
  let tableNodeKey: string | null = null;
  let sourceRange: SourcePositionRange | null = null;
  editor.getEditorState().read(() => {
    const node = $getNearestNodeFromDOMNode(tableElement);
    const tableNode = $isTableNode(node) ? node : findAncestor(node, $isTableNode);
    if (!$isTableNode(tableNode)) return;
    tableNodeKey = tableNode.getKey();
    sourceRange = getSourceRangeFromSelectionNode(tableNode);
  }, { editor });
  return { sourceRange, tableNodeKey };
};

const getTableAiSelectionElements = (tableElement: HTMLElement) => {
  const wrapper = tableElement.closest('.aad-lexical-table-scroll-wrapper');
  return wrapper instanceof HTMLElement && wrapper !== tableElement
    ? [tableElement, wrapper]
    : [tableElement];
};

const LexicalTableAiSelectionPlugin: React.FC<{
  editState: PreviewMarkdownEditState;
  onSelectedTableNodeKeyChange: (nodeKey: string | null) => void;
  selectedTableNodeKey: string | null;
}> = ({ editState, onSelectedTableNodeKeyChange, selectedTableNodeKey }) => {
  const [editor] = useLexicalComposerContext();
  const [selectedTableElement, setSelectedTableElement] = useState<HTMLElement | null>(null);
  const editStateRef = useRef(editState);
  editStateRef.current = editState;

  useEffect(() => {
    if (selectedTableNodeKey || !selectedTableElement) return;
    setSelectedTableElement(null);
  }, [selectedTableElement, selectedTableNodeKey]);

  useEffect(() => {
    const rootElement = editor.getRootElement();
    const tableElement =
      selectedTableElement && rootElement?.contains(selectedTableElement)
        ? selectedTableElement
        : selectedTableNodeKey
          ? getTableElementFromDomTarget(editor.getElementByKey(selectedTableNodeKey), rootElement)
          : null;
    if (!(tableElement instanceof HTMLElement)) return undefined;
    const selectedElements = getTableAiSelectionElements(tableElement);
    selectedElements.forEach((element) => element.classList.add('is-ai-selected'));
    return () => selectedElements.forEach((element) => element.classList.remove('is-ai-selected'));
  }, [editor, selectedTableElement, selectedTableNodeKey]);

  const publishTableAiCandidate = useCallback((tableElement: HTMLElement) => {
    const rootElement = editor.getRootElement();
    if (!rootElement) return;
    const lexicalContext = getTableAiSelectionContextFromElement(editor, tableElement);
    const sourceRange = resolveTableSourceRangeFromElement(tableElement, rootElement) ?? lexicalContext.sourceRange;
    const patchTarget = createPreviewAiCandidatePatchTarget(editStateRef.current.source, sourceRange);
    const selectedText = patchTarget?.selectedText.trim() ?? '';
    if (!sourceRange?.startLine || !selectedText) return;
    const tableNodeKey = lexicalContext.tableNodeKey ?? getTableNodeKeyFromElement(editor, tableElement);
    if (!tableNodeKey) return;
    const candidate = createReadonlyAiSelectionCandidate({
      contentKind: 'table',
      islandId: PREVIEW_MARKDOWN_DOCUMENT_ID,
      patchTarget,
      rect: getElementPreviewAiRect(tableElement),
      selectionScope: 'whole',
      selectedText,
      sourceRange,
    });
    if (!candidate) return;
    setSelectedTableElement(tableElement);
    onSelectedTableNodeKeyChange(tableNodeKey);
    editStateRef.current.onLexicalAiSelectionChange(candidate);
  }, [editor, onSelectedTableNodeKeyChange]);

  useEffect(() => {
    let pointerDownTableElement: HTMLElement | null = null;
    let currentRootElement: HTMLElement | null = null;

    const handlePointerDown = (event: PointerEvent) => {
      const rootElement = currentRootElement;
      const tableElement = getTableElementFromDomTarget(event.target, rootElement);
      pointerDownTableElement = tableElement;
      if (tableElement) {
        setSelectedTableElement(null);
        onSelectedTableNodeKeyChange(null);
        editStateRef.current.onLexicalAiSelectionChange(null);
        return;
      }
      if (event.target instanceof Element && event.target.closest('.aad-preview-ai-selection')) return;
      setSelectedTableElement(null);
      onSelectedTableNodeKeyChange(null);
    };

    const handlePointerUp = (event: PointerEvent) => {
      const rootElement = currentRootElement;
      const tableElement = getTableElementFromDomTarget(event.target, rootElement);
      if (!tableElement || (pointerDownTableElement && pointerDownTableElement !== tableElement)) {
        pointerDownTableElement = null;
        return;
      }
      pointerDownTableElement = null;
      window.requestAnimationFrame(() => {
        if (window.getSelection()?.toString().trim()) return;
        const hasMultiCellSelection = editor.getEditorState().read(
          () => isMultiCellTableSelection($getSelection()),
          { editor },
        );
        if (hasMultiCellSelection) {
          setSelectedTableElement(null);
          onSelectedTableNodeKeyChange(null);
          editStateRef.current.onLexicalAiSelectionChange(null);
          return;
        }
        publishTableAiCandidate(tableElement);
      });
    };

    const unregisterRootListener = editor.registerRootListener((rootElement, previousRootElement) => {
      previousRootElement?.removeEventListener('pointerdown', handlePointerDown, true);
      previousRootElement?.removeEventListener('pointerup', handlePointerUp, true);
      rootElement?.addEventListener('pointerdown', handlePointerDown, true);
      rootElement?.addEventListener('pointerup', handlePointerUp, true);
      currentRootElement = rootElement;
    });

    return () => {
      currentRootElement?.removeEventListener('pointerdown', handlePointerDown, true);
      currentRootElement?.removeEventListener('pointerup', handlePointerUp, true);
      unregisterRootListener();
    };
  }, [editor, onSelectedTableNodeKeyChange, publishTableAiCandidate]);

  return null;
};

const LexicalTableKeyboardPlugin: React.FC = () => {
  const [editor] = useLexicalComposerContext();
  const lastTableCellKeyRef = useRef<string | null>(null);

  const insertRowAfterTableCellKey = useCallback((resolvedCell: ResolvedTableCellKey): TableKeyboardResult => {
    if (!resolvedCell.key) return createUnhandledTableKeyboardResult();
    let result = createUnhandledTableKeyboardResult();
    editor.update(() => {
      const context = getSelectedTableCellContext(resolvedCell.key, {
        preferResolvedCell: resolvedCell.preferResolvedCell,
      });
      if (!context) return;
      const rowNode = insertEmptyTableRowAfterCell(context.cellNode);
      if (!rowNode) return;
      $addUpdateTag(HISTORY_PUSH_TAG);
      $addUpdateTag(ISLAND_TABLE_SHORTCUT_UPDATE_TAG);
      const focusedCell = selectFirstTableRowCellStart(rowNode);
      if (!focusedCell) return;
      result = {
        handled: true,
        tableCellKey: focusedCell.getKey(),
      };
    });
    return result;
  }, [editor]);

  const moveSelectionVertically = useCallback((
    resolvedCell: ResolvedTableCellKey,
    direction: 'down' | 'up',
  ): TableKeyboardResult => {
    let result = createUnhandledTableKeyboardResult();
    editor.update(() => {
      result = moveSelectionVerticallyInTable(resolvedCell.key, direction, {
        preferResolvedCell: resolvedCell.preferResolvedCell,
      });
    });
    return result;
  }, [editor]);

  const handleTableBackspace = useCallback((resolvedCell: ResolvedTableCellKey): TableKeyboardResult => {
    let result = createUnhandledTableKeyboardResult();
    editor.update(() => {
      result = handleTableBackspaceAtSelection(resolvedCell.key, {
        preferResolvedCell: resolvedCell.preferResolvedCell,
      });
    });
    return result;
  }, [editor]);

  const insertTableColumnAfterLastCell = useCallback((resolvedCell: ResolvedTableCellKey): TableKeyboardResult => {
    let result = createUnhandledTableKeyboardResult();
    editor.update(() => {
      result = insertTableColumnAfterLastCellAtSelection(resolvedCell.key, {
        preferResolvedCell: resolvedCell.preferResolvedCell,
      });
    });
    return result;
  }, [editor]);

  const commitTableKeyboardResult = useCallback((result: TableKeyboardResult) => {
    if (!result.handled) return false;
    lastTableCellKeyRef.current = result.tableCellKey;
    return true;
  }, []);

  const getTableCellKeyFromDomElement = useCallback((cellElement: Element | null) => {
    const rootElement = editor.getRootElement();
    if (!cellElement || !rootElement.contains(cellElement)) return null;
    let tableCellKey: string | null = null;
    editor.read(() => {
      const node = $getNearestNodeFromDOMNode(cellElement);
      const cell = findAncestor(node, $isTableCellNode);
      tableCellKey = $isTableCellNode(cell) ? cell.getKey() : null;
    });
    return tableCellKey;
  }, [editor]);

  const getTableCellKeyFromDomTarget = useCallback((target: EventTarget | null) => {
    const rootElement = editor.getRootElement();
    if (!(target instanceof Node) || !rootElement?.contains(target)) return null;
    const targetElement = target instanceof Element ? target : target.parentElement;
    return getTableCellKeyFromDomElement(targetElement?.closest('.aad-lexical-table-cell,td,th') ?? null);
  }, [editor, getTableCellKeyFromDomElement]);

  const getTableCellKeyFromDomSelection = useCallback(() => {
    const rootElement = editor.getRootElement();
    const domSelection = window.getSelection();
    const anchorNode = domSelection?.anchorNode ?? null;
    if (!anchorNode || !rootElement?.contains(anchorNode)) return null;
    const anchorElement = anchorNode instanceof Element ? anchorNode : anchorNode.parentElement;
    return getTableCellKeyFromDomElement(anchorElement?.closest('.aad-lexical-table-cell,td,th') ?? null);
  }, [editor, getTableCellKeyFromDomElement]);

  const resolveCurrentTableCell = useCallback((target: EventTarget | null): ResolvedTableCellKey => {
    const domSelectionTableCellKey = getTableCellKeyFromDomSelection();
    const targetTableCellKey = getTableCellKeyFromDomTarget(target);
    return editor.getEditorState().read(() => {
      const selection = $getSelection();
      const selectedTableCellKey = getSelectedTableCellNode()?.getKey() ?? null;
      if (selectedTableCellKey && (!domSelectionTableCellKey || domSelectionTableCellKey === selectedTableCellKey)) {
        return { key: selectedTableCellKey, preferResolvedCell: false };
      }
      if (domSelectionTableCellKey) return { key: domSelectionTableCellKey, preferResolvedCell: true };
      if (selectedTableCellKey) return { key: selectedTableCellKey, preferResolvedCell: false };
      if (targetTableCellKey) return { key: targetTableCellKey, preferResolvedCell: true };
      return {
        key: selection ? null : lastTableCellKeyRef.current,
        preferResolvedCell: false,
      };
    });
  }, [editor, getTableCellKeyFromDomSelection, getTableCellKeyFromDomTarget]);

  const syncLastTableCellFromDomTarget = useCallback((
    target: EventTarget | null,
    options: { preserveWhenMissing?: boolean } = {},
  ) => {
    const tableCellKey = getTableCellKeyFromDomTarget(target);
    if (!tableCellKey) {
      if (!options.preserveWhenMissing) lastTableCellKeyRef.current = null;
      return;
    }
    lastTableCellKeyRef.current = tableCellKey;
  }, [getTableCellKeyFromDomTarget]);

  const syncLastTableCellFromSelection = useCallback(() => {
    lastTableCellKeyRef.current = getSelectedTableCellNode()?.getKey() ?? null;
    return false;
  }, []);

  useEffect(() => {
    let currentRootElement: HTMLElement | null = null;
    const handlePointerDown = (event: PointerEvent) => {
      syncLastTableCellFromDomTarget(event.target);
    };
    const handleFocusIn = (event: FocusEvent) => {
      syncLastTableCellFromDomTarget(event.target);
    };
    const unregisterRootListener = editor.registerRootListener((rootElement, previousRootElement) => {
      previousRootElement?.removeEventListener('pointerdown', handlePointerDown, true);
      previousRootElement?.removeEventListener('focusin', handleFocusIn, true);
      rootElement?.addEventListener('pointerdown', handlePointerDown, true);
      rootElement?.addEventListener('focusin', handleFocusIn, true);
      currentRootElement = rootElement;
    });
    return () => {
      currentRootElement?.removeEventListener('pointerdown', handlePointerDown, true);
      currentRootElement?.removeEventListener('focusin', handleFocusIn, true);
      unregisterRootListener();
    };
  }, [editor, syncLastTableCellFromDomTarget]);

  useEffect(
    () => editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => syncLastTableCellFromSelection(),
      COMMAND_PRIORITY_LOW,
    ),
    [editor, syncLastTableCellFromSelection],
  );

  useEffect(() => {
    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      const rootElement = editor.getRootElement();
      if (!(event.target instanceof Node) || !rootElement?.contains(event.target)) return;
      if (
        (
          event.key !== 'Enter' &&
          event.key !== 'ArrowDown' &&
          event.key !== 'ArrowUp' &&
          event.key !== 'Backspace' &&
          event.key !== 'Tab'
        ) ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.isComposing ||
        editor.isComposing()
      ) {
        return;
      }
      syncLastTableCellFromDomTarget(event.target, { preserveWhenMissing: true });
      const resolvedCell = resolveCurrentTableCell(event.target);
      let result = createUnhandledTableKeyboardResult();
      if (event.key === 'Enter') {
        result = insertRowAfterTableCellKey(resolvedCell);
      } else if (event.key === 'ArrowDown') {
        result = moveSelectionVertically(resolvedCell, 'down');
      } else if (event.key === 'ArrowUp') {
        result = moveSelectionVertically(resolvedCell, 'up');
      } else if (event.key === 'Tab') {
        result = insertTableColumnAfterLastCell(resolvedCell);
      } else {
        result = handleTableBackspace(resolvedCell);
      }
      if (!commitTableKeyboardResult(result)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    document.addEventListener('keydown', handleDocumentKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleDocumentKeyDown, true);
    };
  }, [
    commitTableKeyboardResult,
    editor,
    handleTableBackspace,
    insertTableColumnAfterLastCell,
    insertRowAfterTableCellKey,
    moveSelectionVertically,
    resolveCurrentTableCell,
    syncLastTableCellFromDomTarget,
  ]);

  const handleTableKeyboardCommand = useCallback((
    event: KeyboardEvent,
    key: 'ArrowDown' | 'ArrowUp' | 'Enter' | 'Tab',
  ) => {
    if (
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.isComposing ||
      editor.isComposing()
    ) {
      return false;
    }
    syncLastTableCellFromDomTarget(event.target, { preserveWhenMissing: true });
    const resolvedCell = resolveCurrentTableCell(event.target);
    const result = key === 'Enter'
      ? insertRowAfterTableCellKey(resolvedCell)
      : key === 'ArrowDown'
        ? moveSelectionVertically(resolvedCell, 'down')
        : key === 'ArrowUp'
          ? moveSelectionVertically(resolvedCell, 'up')
          : insertTableColumnAfterLastCell(resolvedCell);
    if (!commitTableKeyboardResult(result)) return false;
    event.preventDefault();
    event.stopPropagation();
    return true;
  }, [
    commitTableKeyboardResult,
    editor,
    insertTableColumnAfterLastCell,
    insertRowAfterTableCellKey,
    moveSelectionVertically,
    resolveCurrentTableCell,
    syncLastTableCellFromDomTarget,
  ]);

  useEffect(
    () => editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event) => {
        if (!event) return false;
        return handleTableKeyboardCommand(event, 'Enter');
      },
      COMMAND_PRIORITY_CRITICAL,
    ),
    [editor, handleTableKeyboardCommand],
  );

  useEffect(
    () => editor.registerCommand(
      KEY_ARROW_DOWN_COMMAND,
      (event) => handleTableKeyboardCommand(event, 'ArrowDown'),
      COMMAND_PRIORITY_CRITICAL,
    ),
    [editor, handleTableKeyboardCommand],
  );

  useEffect(
    () => editor.registerCommand(
      KEY_ARROW_UP_COMMAND,
      (event) => handleTableKeyboardCommand(event, 'ArrowUp'),
      COMMAND_PRIORITY_CRITICAL,
    ),
    [editor, handleTableKeyboardCommand],
  );

  useEffect(
    () => editor.registerCommand(
      KEY_TAB_COMMAND,
      (event) => handleTableKeyboardCommand(event, 'Tab'),
      COMMAND_PRIORITY_CRITICAL,
    ),
    [editor, handleTableKeyboardCommand],
  );

  return null;
};

const LexicalMarkdownSourcePastePlugin: React.FC<{
  editState: PreviewMarkdownEditState;
  tableAlignmentsRef: React.MutableRefObject<TableAlignmentRegistry>;
}> = ({ editState, tableAlignmentsRef }) => {
  const [editor] = useLexicalComposerContext();
  const editStateRef = useRef(editState);
  editStateRef.current = editState;

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const rootElement = editor.getRootElement();
      if (!rootElement || !isPreviewMarkdownSourcePasteDomTarget(event.target, rootElement)) return;
      if (hasClipboardFilePayload(event.clipboardData)) return;
      const pastedText = event.clipboardData?.getData('text/plain') ?? '';
      const shouldReplaceEntireDocument =
        domSelectionCoversPreviewMarkdownDocument(rootElement) ||
        editor.getEditorState().read(() => (
          isPreviewMarkdownDocumentEmpty() ||
          selectionCoversPreviewMarkdownDocument($getSelection())
        ));
      const sourcePaste = shouldReplaceEntireDocument
        ? resolvePreviewMarkdownFullReplacePasteText(pastedText)
        : resolvePreviewMarkdownSourcePasteText(pastedText);
      if (!sourcePaste) return;
      let parsedBlocks: readonly PreviewMarkdownDocumentBlock[] | null = null;
      if (sourcePaste.kind === 'document') {
        const parsed = parsePreviewMarkdownDocument(sourcePaste.source);
        if (!parsed.ok) return;
        parsedBlocks = parsed.blocks as readonly PreviewMarkdownDocumentBlock[];
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      let didHandlePaste = false;
      let nextMarkdown: string | null = null;
      editor.update(() => {
        didHandlePaste = sourcePaste.kind === 'unclosed-fence'
          ? insertPreviewMarkdownUnclosedFencePaste(sourcePaste, { replaceEntireDocument: shouldReplaceEntireDocument })
          : insertPreviewMarkdownSourcePasteBlocks(
            parsedBlocks ?? [],
            tableAlignmentsRef.current,
            { replaceEntireDocument: shouldReplaceEntireDocument },
          );
        if (!didHandlePaste) return;
        $addUpdateTag(HISTORY_PUSH_TAG);
        $addUpdateTag(ISLAND_MARKDOWN_SOURCE_PASTE_UPDATE_TAG);
        nextMarkdown = serializeEditorDocument(undefined, tableAlignmentsRef.current);
      });
      if (!didHandlePaste) return;

      const latestEditState = editStateRef.current;
      if (shouldReplaceEntireDocument) latestEditState.onLexicalFormatChange(null);
      if (nextMarkdown && nextMarkdown !== latestEditState.source) {
        if (!shouldReplaceEntireDocument) latestEditState.onBeforePatch?.();
        latestEditState.onPatch(nextMarkdown, {
          blockId: PREVIEW_MARKDOWN_DOCUMENT_ID,
          commitPhase: 'structural',
          forceDocumentRefresh: true,
          kind: 'text',
          origin: 'preview-markdown-edit',
          renderScope: 'active-block',
          transactionId: Date.now(),
        });
      }
      if (shouldReplaceEntireDocument) resetPreviewMarkdownScrollToTop(rootElement);
      resizeCodeTextareasAcrossFrames(rootElement);
      window.requestAnimationFrame(() => {
        editor.getRootElement()?.focus({ preventScroll: true });
        if (shouldReplaceEntireDocument) resetPreviewMarkdownScrollToTop(editor.getRootElement());
        resizeCodeTextareasAcrossFrames(editor.getRootElement());
      });
    };

    let currentRootElement: HTMLElement | null = null;
    const unregisterRootListener = editor.registerRootListener((rootElement, previousRootElement) => {
      previousRootElement?.removeEventListener('paste', handlePaste, true);
      rootElement?.addEventListener('paste', handlePaste, true);
      currentRootElement = rootElement;
    });

    return () => {
      currentRootElement?.removeEventListener('paste', handlePaste, true);
      unregisterRootListener();
    };
  }, [editor, tableAlignmentsRef]);

  return null;
};

const LexicalImagePasteDropPlugin: React.FC<{
  editState: PreviewMarkdownEditState;
  tableAlignmentsRef: React.MutableRefObject<TableAlignmentRegistry>;
}> = ({ editState, tableAlignmentsRef }) => {
  const [editor] = useLexicalComposerContext();
  const editStateRef = useRef(editState);
  editStateRef.current = editState;

  useEffect(() => {
    const insertImageFile = (file: File) => {
      const currentEditState = editStateRef.current;
      if (!currentEditState.onInsertImageFile) return;
      let target: PreviewImageInsertionTarget = { anchorKey: null, replaceEmptyAnchor: false };
      editor.getEditorState().read(() => {
        target = getPreviewImageInsertionTarget();
      });
      void (async () => {
        try {
          const markdown = await currentEditState.onInsertImageFile?.(file);
          if (!markdown) return;
          let nextMarkdown: string | null = null;
          editor.update(() => {
            if (insertPreviewMarkdownImageArtifact(markdown, target)) {
              $addUpdateTag(HISTORY_PUSH_TAG);
              $addUpdateTag(ISLAND_IMAGE_INSERT_UPDATE_TAG);
              nextMarkdown = serializeEditorDocument(undefined, tableAlignmentsRef.current);
            }
          });
          const latestEditState = editStateRef.current;
          if (nextMarkdown && nextMarkdown !== latestEditState.source) {
            latestEditState.onBeforePatch?.();
            latestEditState.onPatch(nextMarkdown, {
              blockId: PREVIEW_MARKDOWN_DOCUMENT_ID,
              commitPhase: 'input',
              kind: 'image',
              origin: 'preview-markdown-edit',
              renderScope: 'active-block',
              transactionId: Date.now(),
            });
          }
          window.requestAnimationFrame(() => {
            editor.getRootElement()?.focus({ preventScroll: true });
          });
        } catch (error) {
          console.error('Failed to insert image into preview Markdown:', error);
        }
      })();
    };

    const shouldHandleImageEvent = (event: Event, dataTransfer: DataTransfer | null | undefined) => {
      const rootElement = editor.getRootElement();
      const file = getFirstPreviewImageFile(dataTransfer);
      if (!rootElement || !file || !editStateRef.current.onInsertImageFile) return null;
      if (!isPreviewImageInsertionDomTarget(event.target, rootElement)) return null;
      return file;
    };

    const handlePaste = (event: ClipboardEvent) => {
      const file = shouldHandleImageEvent(event, event.clipboardData);
      if (!file) return;
      event.preventDefault();
      event.stopPropagation();
      insertImageFile(file);
    };

    const handleDragOver = (event: DragEvent) => {
      const file = shouldHandleImageEvent(event, event.dataTransfer);
      if (!file) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };

    const handleDrop = (event: DragEvent) => {
      const file = shouldHandleImageEvent(event, event.dataTransfer);
      if (!file) return;
      event.preventDefault();
      event.stopPropagation();
      insertImageFile(file);
    };

    let currentRootElement: HTMLElement | null = null;
    const unregisterRootListener = editor.registerRootListener((rootElement, previousRootElement) => {
      previousRootElement?.removeEventListener('paste', handlePaste, true);
      previousRootElement?.removeEventListener('dragover', handleDragOver, true);
      previousRootElement?.removeEventListener('drop', handleDrop, true);
      rootElement?.addEventListener('paste', handlePaste, true);
      rootElement?.addEventListener('dragover', handleDragOver, true);
      rootElement?.addEventListener('drop', handleDrop, true);
      currentRootElement = rootElement;
    });

    return () => {
      currentRootElement?.removeEventListener('paste', handlePaste, true);
      currentRootElement?.removeEventListener('dragover', handleDragOver, true);
      currentRootElement?.removeEventListener('drop', handleDrop, true);
      unregisterRootListener();
    };
  }, [editor, tableAlignmentsRef]);

  return null;
};

const isCodeBlockSelectionDeleteKeyboardTarget = (target: EventTarget | null) => {
  const element =
    target instanceof Element
      ? target
      : target instanceof Node
        ? target.parentElement
        : null;
  return !element?.closest('textarea,input,select');
};

const LexicalCodeBlockSelectionCommandsPlugin: React.FC<{
  onSelectedCodeLikeArtifactNodeKeyChange: (nodeKey: string | null) => void;
  onSelectedCodeBlockNodeKeyChange: (nodeKey: string | null) => void;
  selectedCodeLikeArtifactNodeKey: string | null;
  selectedCodeBlockNodeKey: string | null;
}> = ({
  onSelectedCodeLikeArtifactNodeKeyChange,
  onSelectedCodeBlockNodeKeyChange,
  selectedCodeLikeArtifactNodeKey,
  selectedCodeBlockNodeKey,
}) => {
  const [editor] = useLexicalComposerContext();
  const selectedCodeLikeArtifactNodeKeyRef = useRef(selectedCodeLikeArtifactNodeKey);
  const selectedCodeBlockNodeKeyRef = useRef(selectedCodeBlockNodeKey);
  selectedCodeLikeArtifactNodeKeyRef.current = selectedCodeLikeArtifactNodeKey;
  selectedCodeBlockNodeKeyRef.current = selectedCodeBlockNodeKey;

  const deleteSelectedCodeBlock = useCallback((direction: 'next' | 'previous') => {
    let didDelete = false;
    let textBlockTarget: EditableTextBlockFocusTarget | null = null;
    editor.update(() => {
      const node =
        getSelectedCodeBlockDecoratorNode(selectedCodeBlockNodeKeyRef.current) ??
        getSelectedCodeLikePreviewArtifactNode(selectedCodeLikeArtifactNodeKeyRef.current);
      if (!node) return;
      textBlockTarget = ensureEditableTextBlockBesideNode(node, direction);
      node.remove();
      ensureDocumentEditableLandingParagraph();
      didDelete = true;
      $addUpdateTag(HISTORY_PUSH_TAG);
      $addUpdateTag(ISLAND_CODE_BLOCK_STRUCTURE_UPDATE_TAG);
    });
    if (!didDelete) return false;
    selectedCodeLikeArtifactNodeKeyRef.current = null;
    selectedCodeBlockNodeKeyRef.current = null;
    onSelectedCodeLikeArtifactNodeKeyChange(null);
    onSelectedCodeBlockNodeKeyChange(null);
    if (textBlockTarget) focusEditorTextBlock(editor, textBlockTarget);
    return true;
  }, [editor, onSelectedCodeBlockNodeKeyChange, onSelectedCodeLikeArtifactNodeKeyChange]);

  const handleDeleteKeyEvent = useCallback((event: KeyboardEvent, direction: 'next' | 'previous') => {
    if (!selectedCodeBlockNodeKeyRef.current && !selectedCodeLikeArtifactNodeKeyRef.current) return false;
    if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return false;
    if (!isCodeBlockSelectionDeleteKeyboardTarget(event.target)) return false;
    event.preventDefault();
    event.stopPropagation();
    return deleteSelectedCodeBlock(direction);
  }, [deleteSelectedCodeBlock]);

  useEffect(() => {
    const unregisterBackspace = editor.registerCommand(
      KEY_BACKSPACE_COMMAND,
      (event) => handleDeleteKeyEvent(event, 'previous'),
      COMMAND_PRIORITY_CRITICAL,
    );
    const unregisterDelete = editor.registerCommand(
      KEY_DELETE_COMMAND,
      (event) => handleDeleteKeyEvent(event, 'next'),
      COMMAND_PRIORITY_CRITICAL,
    );
    const unregisterEscape = editor.registerCommand(
      KEY_ESCAPE_COMMAND,
      (event) => {
        if (!selectedCodeBlockNodeKeyRef.current && !selectedCodeLikeArtifactNodeKeyRef.current) return false;
        event.preventDefault();
        event.stopPropagation();
        selectedCodeLikeArtifactNodeKeyRef.current = null;
        selectedCodeBlockNodeKeyRef.current = null;
        onSelectedCodeLikeArtifactNodeKeyChange(null);
        onSelectedCodeBlockNodeKeyChange(null);
        return true;
      },
      COMMAND_PRIORITY_CRITICAL,
    );
    const unregisterSelection = editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        if (!selectedCodeBlockNodeKeyRef.current && !selectedCodeLikeArtifactNodeKeyRef.current) return false;
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          selectedCodeLikeArtifactNodeKeyRef.current = null;
          selectedCodeBlockNodeKeyRef.current = null;
          onSelectedCodeLikeArtifactNodeKeyChange(null);
          onSelectedCodeBlockNodeKeyChange(null);
        }
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );
    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Backspace') {
        handleDeleteKeyEvent(event, 'previous');
        return;
      }
      if (event.key === 'Delete') {
        handleDeleteKeyEvent(event, 'next');
      }
    };
    document.addEventListener('keydown', handleDocumentKeyDown, true);
    return () => {
      unregisterBackspace();
      unregisterDelete();
      unregisterEscape();
      unregisterSelection();
      document.removeEventListener('keydown', handleDocumentKeyDown, true);
    };
  }, [
    editor,
    handleDeleteKeyEvent,
    onSelectedCodeBlockNodeKeyChange,
    onSelectedCodeLikeArtifactNodeKeyChange,
  ]);

  return null;
};

const LexicalImageSelectionCommandsPlugin: React.FC<{
  editState: PreviewMarkdownEditState;
  onSelectedImageNodeKeyChange: (nodeKey: string | null) => void;
  selectedImageNodeKey: string | null;
}> = ({ editState, onSelectedImageNodeKeyChange, selectedImageNodeKey }) => {
  const [editor] = useLexicalComposerContext();
  const editStateRef = useRef(editState);
  const selectedImageNodeKeyRef = useRef(selectedImageNodeKey);
  editStateRef.current = editState;
  selectedImageNodeKeyRef.current = selectedImageNodeKey;

  const getSelectedReference = useCallback(() => {
    let reference: ReturnType<typeof getPreviewImageReferenceFromArtifactNode> = null;
    editor.getEditorState().read(() => {
      reference = getPreviewImageReferenceFromArtifactNode(
        getSelectedPreviewImageArtifactNode(selectedImageNodeKeyRef.current),
      );
    });
    return reference;
  }, [editor]);

  const deleteSelectedImage = useCallback(() => {
    let didDelete = false;
    editor.update(() => {
      const node = getSelectedPreviewImageArtifactNode(selectedImageNodeKeyRef.current);
      if (!node) return;
      node.remove();
      ensureDocumentEditableLandingParagraph();
      didDelete = true;
      $addUpdateTag(HISTORY_PUSH_TAG);
      $addUpdateTag(ISLAND_IMAGE_INSERT_UPDATE_TAG);
    });
    if (didDelete) onSelectedImageNodeKeyChange(null);
    return didDelete;
  }, [editor, onSelectedImageNodeKeyChange]);

  const replaceSelectedImage = useCallback((markdown: string) => {
    const source = markdown.trim();
    if (!source) return false;
    let didReplace = false;
    editor.update(() => {
      const node = getSelectedPreviewImageArtifactNode(selectedImageNodeKeyRef.current);
      if (!node) return;
      setPreviewImageArtifactSource(node, source);
      didReplace = true;
      $addUpdateTag(HISTORY_PUSH_TAG);
      $addUpdateTag(ISLAND_IMAGE_INSERT_UPDATE_TAG);
    });
    return didReplace;
  }, [editor]);

  const copySelectedImage = useCallback(async () => {
    const reference = getSelectedReference();
    if (!reference) throw new Error('No selected image is available to copy.');
    await copyPreviewImageReference(reference);
  }, [getSelectedReference]);

  useEffect(() => {
    const unregisterCopy = editor.registerCommand(
      COPY_COMMAND,
      (event) => {
        if (!selectedImageNodeKeyRef.current) return false;
        const reference = getSelectedReference();
        if (!reference) return false;
        event?.preventDefault();
        event?.stopPropagation();
        void copyPreviewImageReference(reference).catch((error) => {
          console.error('Failed to copy selected preview image:', error);
        });
        return true;
      },
      COMMAND_PRIORITY_CRITICAL,
    );
    const unregisterCut = editor.registerCommand(
      CUT_COMMAND,
      (event) => {
        if (!selectedImageNodeKeyRef.current) return false;
        const reference = getSelectedReference();
        if (!reference) return false;
        event?.preventDefault();
        event?.stopPropagation();
        void copySelectedImage()
          .then(() => deleteSelectedImage())
          .catch((error) => {
            console.error('Failed to cut selected preview image:', error);
          });
        return true;
      },
      COMMAND_PRIORITY_CRITICAL,
    );
    const unregisterPaste = editor.registerCommand(
      PASTE_COMMAND,
      (event) => {
        const selectedNodeKey = selectedImageNodeKeyRef.current;
        if (!selectedNodeKey) return false;
        const clipboardData = (
          typeof ClipboardEvent !== 'undefined' && event instanceof ClipboardEvent
            ? event.clipboardData
            : null
        );
        const file = getFirstPreviewImageFile(clipboardData);
        if (file) {
          const currentEditState = editStateRef.current;
          if (!currentEditState.onInsertImageFile) return false;
          event?.preventDefault();
          event?.stopPropagation();
          void currentEditState.onInsertImageFile(file)
            .then((markdown) => {
              if (!markdown) return;
              replaceSelectedImage(markdown);
              window.requestAnimationFrame(() => {
                editor.getRootElement()?.focus({ preventScroll: true });
              });
            })
            .catch((error) => {
              console.error('Failed to replace selected preview image:', error);
            });
          return true;
        }
        const reference = resolvePreviewImageClipboardReference({
          html: clipboardData?.getData('text/html') ?? '',
          plain: clipboardData?.getData('text/plain') ?? '',
        });
        if (!reference) return false;
        event?.preventDefault();
        event?.stopPropagation();
        return replaceSelectedImage(reference.markdown);
      },
      COMMAND_PRIORITY_CRITICAL,
    );
    const unregisterBackspace = editor.registerCommand(
      KEY_BACKSPACE_COMMAND,
      (event) => {
        if (!selectedImageNodeKeyRef.current) return false;
        event.preventDefault();
        event.stopPropagation();
        return deleteSelectedImage();
      },
      COMMAND_PRIORITY_CRITICAL,
    );
    const unregisterDelete = editor.registerCommand(
      KEY_DELETE_COMMAND,
      (event) => {
        if (!selectedImageNodeKeyRef.current) return false;
        event.preventDefault();
        event.stopPropagation();
        return deleteSelectedImage();
      },
      COMMAND_PRIORITY_CRITICAL,
    );
    const unregisterEscape = editor.registerCommand(
      KEY_ESCAPE_COMMAND,
      (event) => {
        if (!selectedImageNodeKeyRef.current) return false;
        event.preventDefault();
        event.stopPropagation();
        onSelectedImageNodeKeyChange(null);
        return true;
      },
      COMMAND_PRIORITY_CRITICAL,
    );
    const unregisterSelection = editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        if (!selectedImageNodeKeyRef.current) return false;
        const selection = $getSelection();
        if ($isRangeSelection(selection)) onSelectedImageNodeKeyChange(null);
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );
    return () => {
      unregisterCopy();
      unregisterCut();
      unregisterPaste();
      unregisterBackspace();
      unregisterDelete();
      unregisterEscape();
      unregisterSelection();
    };
  }, [
    copySelectedImage,
    deleteSelectedImage,
    editor,
    getSelectedReference,
    onSelectedImageNodeKeyChange,
    replaceSelectedImage,
  ]);

  return null;
};

const LexicalDocumentKeyboardScopePlugin: React.FC = () => {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const rootElement = editor.getRootElement();
      if (!rootElement || isPreviewInteractiveKeyboardTarget(event.target, rootElement)) return;
      const isPlainVerticalArrow = !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
      if (isPlainVerticalArrow && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        let codeTextareaTarget: CodeBlockTextareaFocusTarget | null = null;
        let didHandleArrow = false;
        editor.update(() => {
          const navigation = getTextBlockCodeNavigationTarget(event.key === 'ArrowDown' ? 'down' : 'up');
          if (!navigation) return;
          didHandleArrow = true;
          if (navigation.type === 'focus-code') {
            codeTextareaTarget = navigation.target;
            return;
          }
          selectEditableTextBlockEdge(navigation.block, navigation.edge);
        });
        if (didHandleArrow) {
          event.preventDefault();
          event.stopPropagation();
          if (codeTextareaTarget) focusCodeBlockTextarea(editor, codeTextareaTarget);
          return;
        }
      }
      if (isPreviewUndoShortcut(event)) {
        event.preventDefault();
        event.stopPropagation();
        editor.dispatchCommand(UNDO_COMMAND, undefined);
        return;
      }
      if (isPreviewRedoShortcut(event)) {
        event.preventDefault();
        event.stopPropagation();
        editor.dispatchCommand(REDO_COMMAND, undefined);
        return;
      }
      if (isPreviewSelectAllShortcut(event)) {
        event.preventDefault();
        event.stopPropagation();
        editor.dispatchCommand(SELECT_ALL_COMMAND, event);
      }
    };
    let currentRootElement: HTMLElement | null = null;
    const unregisterRootListener = editor.registerRootListener((rootElement, previousRootElement) => {
      previousRootElement?.removeEventListener('keydown', handleKeyDown, true);
      rootElement?.addEventListener('keydown', handleKeyDown, true);
      currentRootElement = rootElement;
    });
    return () => {
      currentRootElement?.removeEventListener('keydown', handleKeyDown, true);
      unregisterRootListener();
    };
  }, [editor]);
  return null;
};

const normalizeMarkdownResetToken = (markdown: string) => markdown.trim();

const LexicalDocumentResetPlugin: React.FC<{
  blocks: readonly PreviewMarkdownDocumentBlock[];
  activeBlockId?: string;
  onResetMarkdown: (markdown: string) => void;
  resetToken: string;
  shouldRefreshActiveBlockOnly?: boolean;
  skipActiveBlockRefresh?: boolean;
  forceDocumentRefresh?: boolean;
  refreshMarkdownTextBlocks?: boolean;
  aiReplacement?: PreviewMarkdownPatchMeta['aiReplacement'];
  skipResetToken: string;
  sourceOverridesRef: React.MutableRefObject<ArtifactSourceOverrideMap>;
  tableAlignmentsRef: React.MutableRefObject<TableAlignmentRegistry>;
}> = ({
  activeBlockId,
  blocks,
  onResetMarkdown,
  resetToken,
  shouldRefreshActiveBlockOnly = false,
  skipActiveBlockRefresh = false,
  forceDocumentRefresh = false,
  refreshMarkdownTextBlocks = false,
  aiReplacement,
  skipResetToken,
  sourceOverridesRef,
  tableAlignmentsRef,
}) => {
  const [editor] = useLexicalComposerContext();
  const lastResetTokenRef = useRef(resetToken);
  const prepareDocumentReset = useCallback(() => {
    $addUpdateTag(PREVIEW_RESET_UPDATE_TAG);
    $addUpdateTag(SKIP_DOM_SELECTION_TAG);
    $addUpdateTag(SKIP_SCROLL_INTO_VIEW_TAG);
    $setSelection(null);
  }, []);
  useEffect(() => {
    if (lastResetTokenRef.current === resetToken) return;
    lastResetTokenRef.current = resetToken;
    const isLocalPatchEcho =
      skipResetToken.length > 0 &&
      normalizeMarkdownResetToken(skipResetToken) === normalizeMarkdownResetToken(resetToken);
    let currentMarkdown = '';
    let hasArtifactWithoutSourceRange = false;
    editor.getEditorState().read(() => {
      currentMarkdown = serializeEditorDocument(sourceOverridesRef.current, tableAlignmentsRef.current);
      hasArtifactWithoutSourceRange = editorHasArtifactWithoutSourceRange();
    });
    const isCurrentEditorEcho =
      normalizeMarkdownResetToken(currentMarkdown) === normalizeMarkdownResetToken(resetToken);
    const shouldSyncActiveArtifactPayload =
      shouldRefreshActiveBlockOnly &&
      hasArtifactWithoutSourceRange;
    const resetPatchAiReplacement = refreshMarkdownTextBlocks ? aiReplacement : undefined;
    const shouldSyncMarkdownTextBlocks =
      shouldRefreshActiveBlockOnly &&
      refreshMarkdownTextBlocks &&
      !resetPatchAiReplacement;
    if ((isLocalPatchEcho || isCurrentEditorEcho) && !forceDocumentRefresh) {
      debugPreviewLexical('reset-token-echo', {
        activeBlockId: activeBlockId ?? null,
        blockCount: blocks.length,
        isCurrentEditorEcho,
        isLocalPatchEcho,
        shouldRefreshActiveBlockOnly,
        shouldSyncActiveArtifactPayload,
        shouldSyncMarkdownTextBlocks,
        skipActiveBlockRefresh,
        forceDocumentRefresh,
        hasArtifactWithoutSourceRange,
      });
      // Even for self-originated patches, run targeted update to assign
      // sourceRange to slash-inserted artifacts that have null sourceRange.
      // PREVIEW_RESET_UPDATE_TAG prevents infinite serialization loop.
      if (
        shouldRefreshActiveBlockOnly &&
        (!skipActiveBlockRefresh || shouldSyncActiveArtifactPayload || shouldSyncMarkdownTextBlocks)
      ) {
        editor.update(() => {
          prepareDocumentReset();
          applyActiveDocumentBlockSourceUpdates(blocks, {
            aiReplacement: resetPatchAiReplacement,
            refreshMarkdownTextBlocks,
            source: currentMarkdown,
            tableAlignmentsRef,
          });
        });
      } else if (shouldRefreshActiveBlockOnly && skipActiveBlockRefresh) {
        debugPreviewLexical('reset-token-echo-skip-active-block-refresh', {
          activeBlockId: activeBlockId ?? null,
          blockCount: blocks.length,
          shouldSyncMarkdownTextBlocks,
          hasArtifactWithoutSourceRange,
        });
      }
      sourceOverridesRef.current.clear();
      return;
    }
    if (shouldRefreshActiveBlockOnly) {
      if (skipActiveBlockRefresh) {
        debugPreviewLexical('reset-skip-active-block-refresh', {
          activeBlockId: activeBlockId ?? null,
          blockCount: blocks.length,
          shouldSyncActiveArtifactPayload,
          shouldSyncMarkdownTextBlocks,
          hasArtifactWithoutSourceRange,
        });
        replaceArtifactSourceOverrides(sourceOverridesRef.current, blocks);
        if (shouldSyncActiveArtifactPayload || shouldSyncMarkdownTextBlocks) {
          editor.update(() => {
            prepareDocumentReset();
            applyActiveDocumentBlockSourceUpdates(blocks, {
              aiReplacement: resetPatchAiReplacement,
              refreshMarkdownTextBlocks,
              source: currentMarkdown,
              tableAlignmentsRef,
            });
          });
        }
        onResetMarkdown(resetToken);
        return;
      }
      debugPreviewLexical('reset-refresh-active-block', {
        activeBlockId: activeBlockId ?? null,
        blockCount: blocks.length,
      });
      editor.update(() => {
        prepareDocumentReset();
        applyActiveDocumentBlockSourceUpdates(blocks, {
          aiReplacement: resetPatchAiReplacement,
          refreshMarkdownTextBlocks,
          source: currentMarkdown,
          tableAlignmentsRef,
        });
      });
      onResetMarkdown(resetToken);
      return;
    }
    sourceOverridesRef.current.clear();
    debugPreviewLexical('reset-full-document', {
      activeBlockId: activeBlockId ?? null,
      blockCount: blocks.length,
      forceDocumentRefresh,
      sourceLength: resetToken.length,
      shouldRefreshActiveBlockOnly,
      skipActiveBlockRefresh,
    });
    editor.update(() => {
      prepareDocumentReset();
      loadDocumentIntoEditor(blocks, tableAlignmentsRef.current);
    });
    onResetMarkdown(resetToken);
  }, [
    activeBlockId,
    blocks,
    editor,
    onResetMarkdown,
    prepareDocumentReset,
    resetToken,
    shouldRefreshActiveBlockOnly,
    skipActiveBlockRefresh,
    forceDocumentRefresh,
    refreshMarkdownTextBlocks,
    aiReplacement,
    skipResetToken,
    sourceOverridesRef,
    tableAlignmentsRef,
  ]);
  return null;
};

type MarkdownLexicalDocumentProps = {
  aiCandidateRenderDeliveryAccess?: PreviewRenderDeliveryAccess;
  autoFocusKey?: number;
  autoFocusTarget?: PreviewMarkdownAutoFocusTarget;
  code: string;
  contentType: ContentType;
  diagnostics: readonly ArtifactDiagnostic[];
  editState: PreviewMarkdownEditState;
  getArtifactIdForNode: (node: any) => string;
  getArtifactIdForSourceLine: (line: number) => string;
  HtmlPreviewComponent: PreviewArtifactRenderContextValue['HtmlPreviewComponent'];
  isSourceLineHidden?: (line: number) => boolean;
  MermaidPreviewComponent: PreviewArtifactRenderContextValue['MermaidPreviewComponent'];
  onJsonFormatted: (formatted: string) => void;
  isAiFixBusy?: boolean;
  onBeginFixReview?: PreviewArtifactRenderContextValue['onBeginFixReview'];
  onRequestAiFix?: PreviewArtifactRenderContextValue['onRequestAiFix'];
  repairMode?: PreviewArtifactRenderContextValue['repairMode'];
  onMermaidDiagnosticChange?: PreviewArtifactRenderContextValue['onMermaidDiagnosticChange'];
  onMermaidSvgReady: (svg: string) => void;
  mornDraftComponentScope?: MornDraftComponentScope;
  renderDeliveryAccess?: PreviewRenderDeliveryAccess;
  sourceLineMap?: SourceLineMap;
  t: ArtifactPreviewTranslations;
  withArtifactTarget: (node: any, element: React.ReactElement) => React.ReactElement;
};

const MarkdownLexicalDocumentImpl: React.FC<MarkdownLexicalDocumentProps> = ({
  aiCandidateRenderDeliveryAccess,
  autoFocusKey = 0,
  autoFocusTarget = 'rootEnd',
  code,
  contentType,
  diagnostics,
  editState,
  getArtifactIdForNode,
  getArtifactIdForSourceLine,
  HtmlPreviewComponent,
  isSourceLineHidden,
  MermaidPreviewComponent,
  onJsonFormatted,
  isAiFixBusy = false,
  onBeginFixReview,
  onRequestAiFix,
  repairMode = 'deterministic',
  onMermaidDiagnosticChange,
  onMermaidSvgReady,
  mornDraftComponentScope = 'showcase',
  renderDeliveryAccess,
  sourceLineMap,
  t,
  withArtifactTarget,
}) => {
  const documentSource = editState.source ?? code;
  const parsed = useMemo(() => parsePreviewMarkdownDocument(documentSource), [documentSource]);
  const documentId = PREVIEW_MARKDOWN_DOCUMENT_ID;
  const {
    flushPendingPatch,
    fullSourceRef,
    lastMarkdownRef,
    patchKindRef,
    requestForceDocumentRefresh,
    schedulePatch,
    sourceRef,
    syncCommittedSource,
  } = useMarkdownLexicalPatchQueue({ documentId, documentSource, editState });
  const artifactSourceOverridesRef = useRef<ArtifactSourceOverrideMap>(new Map());
  const tableAlignmentsRef = useRef<TableAlignmentRegistry>(new Map());
  const [selectedCodeBlockNodeKey, setSelectedCodeBlockNodeKey] = useState<string | null>(null);
  const [selectedCodeLikeArtifactNodeKey, setSelectedCodeLikeArtifactNodeKey] = useState<string | null>(null);
  const [selectedImageNodeKey, setSelectedImageNodeKey] = useState<string | null>(null);
  const [selectedTableNodeKey, setSelectedTableNodeKey] = useState<string | null>(null);
  const selectedTableNodeKeyRef = useRef<string | null>(null);
  const handleLocalArtifactSourcePatch = useCallback((
    nextSource: string,
    artifact: ArtifactSourceOverridePatch,
  ) => {
    syncCommittedSource(nextSource);
    writeArtifactSourceOverride(artifactSourceOverridesRef.current, artifact.nodeKey, artifact.sourceRange, artifact.source);
  }, [syncCommittedSource]);
  const handleSelectImageArtifact = useCallback((nodeKey: string | null) => {
    setSelectedImageNodeKey(nodeKey);
    if (nodeKey) {
      setSelectedCodeBlockNodeKey(null);
      setSelectedCodeLikeArtifactNodeKey(null);
      selectedTableNodeKeyRef.current = null;
      setSelectedTableNodeKey(null);
    }
  }, []);
  const handleSelectCodeBlock = useCallback((nodeKey: string | null) => {
    setSelectedCodeBlockNodeKey(nodeKey);
    if (nodeKey) {
      setSelectedCodeLikeArtifactNodeKey(null);
      setSelectedImageNodeKey(null);
      selectedTableNodeKeyRef.current = null;
      setSelectedTableNodeKey(null);
    }
  }, []);
  const handleSelectCodeLikeArtifact = useCallback((nodeKey: string | null) => {
    setSelectedCodeLikeArtifactNodeKey(nodeKey);
    if (nodeKey) {
      setSelectedCodeBlockNodeKey(null);
      setSelectedImageNodeKey(null);
      selectedTableNodeKeyRef.current = null;
      setSelectedTableNodeKey(null);
    }
  }, []);
  const handleSelectTable = useCallback((nodeKey: string | null) => {
    selectedTableNodeKeyRef.current = nodeKey;
    setSelectedTableNodeKey(nodeKey);
    if (nodeKey) {
      setSelectedCodeBlockNodeKey(null);
      setSelectedCodeLikeArtifactNodeKey(null);
      setSelectedImageNodeKey(null);
    }
  }, []);
  const documentSourceLineMap = typeof editState.source === 'string' && documentSource === editState.source
    ? undefined
    : sourceLineMap;
  const activeBlockPatchEcho = isActiveBlockPreviewMarkdownPatchEcho({
    previewCode: documentSource,
    sourcePatchEcho: editState.sourcePatchEcho ?? null,
  });
  const forceDocumentRefresh = Boolean(editState.sourcePatchEcho?.meta.forceDocumentRefresh);
  const shouldRefreshActiveBlockOnly = !forceDocumentRefresh && activeBlockPatchEcho;
  const skipActiveBlockArtifactRefresh = Boolean(
    shouldRefreshActiveBlockOnly &&
    editState.sourcePatchEcho?.meta.skipActiveBlockRefresh,
  );
  const artifactRenderSourceLineMapRef = useRef(sourceLineMap);
  if (!skipActiveBlockArtifactRefresh) {
    artifactRenderSourceLineMapRef.current = documentSourceLineMap;
  }
  const artifactRenderSourceLineMap = skipActiveBlockArtifactRefresh
    ? artifactRenderSourceLineMapRef.current
    : documentSourceLineMap;
  const artifactRenderFullSource = fullSourceRef ? undefined : documentSource;
  const blocks = useMemo<PreviewMarkdownDocumentBlock[]>(
    () => {
      if (!parsed.ok) return [];
      return (parsed.blocks as PreviewMarkdownDocumentBlock[]).map((block) => {
        if (block.type === 'artifact') {
          const sourceRange = mapDocumentBlockSourceRange(block.sourceRange, documentSourceLineMap, diagnostics);
          const artifactId = sourceRange?.startLine
            ? getArtifactIdForSourceLine(sourceRange.startLine)
            : '';
          return { ...block, artifactId };
        }
        if (block.type === 'code-block') {
          const sourceRange = mapDocumentBlockSourceRange(block.sourceRange, documentSourceLineMap, diagnostics);
          const artifactId = sourceRange?.startLine
            ? getArtifactIdForSourceLine(sourceRange.startLine)
            : '';
          return { ...block, artifactId, sourceRange };
        }
        return {
          ...block,
          blocks: block.blocks.map((markdownBlock) => {
            const sourceRange = mapDocumentBlockSourceRange(markdownBlock.sourceRange ?? null, documentSourceLineMap, diagnostics);
            const artifactId = sourceRange?.startLine
              ? getArtifactIdForSourceLine(sourceRange.startLine)
              : '';
            return artifactId ? { ...markdownBlock, artifactId, sourceRange } : markdownBlock;
          }),
        };
      });
    },
    [diagnostics, documentSourceLineMap, getArtifactIdForSourceLine, parsed],
  );
  const renderContext = useMemo<PreviewArtifactRenderContextValue>(
    () => ({
      aiCandidateRenderDeliveryAccess,
      contentType,
      diagnostics,
      fullSource: artifactRenderFullSource,
      fullSourceRef,
      getArtifactIdForNode,
      getArtifactIdForSourceLine,
      HtmlPreviewComponent,
      isSourceLineHidden,
      MermaidPreviewComponent,
      onJsonFormatted,
      isAiFixBusy,
      onBeginFixReview,
      onRequestAiFix,
      repairMode,
      onMermaidDiagnosticChange,
      onMermaidSvgReady,
      onBeforePatch: editState.onBeforePatch,
      onLocalArtifactSourcePatch: handleLocalArtifactSourcePatch,
      onSourcePatch: editState.onPatch,
      onRequestEditorLineFocus: editState.onRequestEditorLineFocus,
      onFinalCursorSourceLineChange: editState.onFinalCursorSourceLineChange,
      onLexicalAiSelectionChange: editState.onLexicalAiSelectionChange,
      onSelectCodeBlock: handleSelectCodeBlock,
      onSelectCodeLikeArtifact: handleSelectCodeLikeArtifact,
      onSelectImageArtifact: handleSelectImageArtifact,
      mornDraftComponentScope,
      previewSourcePatchEnabled: editState.enabled,
      renderDeliveryAccess,
      selectedCodeBlockNodeKey,
      selectedCodeLikeArtifactNodeKey,
      selectedImageNodeKey,
      sourceLineMap: artifactRenderSourceLineMap,
      t,
      withArtifactTarget,
    }),
    [
      aiCandidateRenderDeliveryAccess,
      contentType,
      diagnostics,
      artifactRenderFullSource,
      editState.enabled,
      editState.onBeforePatch,
      editState.onPatch,
      editState.onRequestEditorLineFocus,
      editState.onFinalCursorSourceLineChange,
      editState.onLexicalAiSelectionChange,
      fullSourceRef,
      getArtifactIdForNode,
      getArtifactIdForSourceLine,
      handleLocalArtifactSourcePatch,
      handleSelectCodeBlock,
      handleSelectCodeLikeArtifact,
      handleSelectImageArtifact,
      HtmlPreviewComponent,
      isAiFixBusy,
      isSourceLineHidden,
      MermaidPreviewComponent,
      mornDraftComponentScope,
      onJsonFormatted,
      onBeginFixReview,
      onRequestAiFix,
      repairMode,
      onMermaidDiagnosticChange,
      onMermaidSvgReady,
      selectedCodeBlockNodeKey,
      selectedCodeLikeArtifactNodeKey,
      selectedImageNodeKey,
      renderDeliveryAccess,
      artifactRenderSourceLineMap,
      t,
      withArtifactTarget,
    ],
  );
  const initialConfig = useMemo(
    () => ({
      namespace: 'MornDraftPreviewMarkdownDocument',
      nodes: [
        CodeBlockDecoratorNode,
        FinalSlashAiInlineDraftNode,
        HeadingNode,
        ListNode,
        ListItemNode,
        PreviewArtifactNode,
        PreviewSourceAnchorNode,
        CodeBlockDecoratorNode,
        QuoteNode,
        TableNode,
        TableRowNode,
        TableCellNode,
      ],
      onError(error: Error) {
        throw error;
      },
      theme: {
        heading: {
          h1: 'aad-lexical-heading aad-lexical-heading-h1',
          h2: 'aad-lexical-heading aad-lexical-heading-h2',
          h3: 'aad-lexical-heading aad-lexical-heading-h3',
          h4: 'aad-lexical-heading aad-lexical-heading-h4',
          h5: 'aad-lexical-heading aad-lexical-heading-h5',
          h6: 'aad-lexical-heading aad-lexical-heading-h6',
        },
        list: {
          listitem: 'aad-lexical-list-item',
          nested: {
            listitem: 'aad-lexical-list-item-nested',
          },
          ol: 'aad-lexical-list aad-lexical-list-ordered',
          ul: 'aad-lexical-list aad-lexical-list-bullet',
        },
        paragraph: 'aad-md-paragraph',
        quote: 'aad-lexical-quote',
        table: 'aad-lexical-table',
        tableCell: 'aad-lexical-table-cell',
        tableCellHeader: 'aad-lexical-table-cell-header',
        tableCellSelected: 'aad-lexical-table-cell-selected',
        tableRow: 'aad-lexical-table-row',
        tableSelection: 'aad-lexical-table-selection-active',
        tableScrollableWrapper: 'aad-lexical-table-scroll-wrapper',
        text: {
          bold: 'aad-lexical-text-bold',
          code: 'aad-lexical-text-code',
          highlight: 'aad-lexical-text-highlight',
          italic: 'aad-lexical-text-italic',
          strikethrough: 'aad-lexical-text-strikethrough',
          subscript: 'aad-lexical-text-subscript',
          superscript: 'aad-lexical-text-superscript',
          underline: 'aad-lexical-text-underline',
          underlineStrikethrough: 'aad-lexical-text-underline-strikethrough',
        },
      },
      editorState: () => loadDocumentIntoEditor(blocks, tableAlignmentsRef.current),
    }),
    [blocks],
  );

  const handleBlur = useCallback(
    (event: React.FocusEvent<HTMLDivElement>) => {
      const currentTarget = event.currentTarget;
      const nextTarget = event.relatedTarget;
      if (nextTarget instanceof Node && currentTarget.contains(nextTarget)) return;
      window.requestAnimationFrame(() => {
        const activeElement = document.activeElement;
        if (activeElement instanceof Node && currentTarget.contains(activeElement)) return;
        flushPendingPatch('final');
        editState.onCommitIslandEdit(documentId);
      });
    },
    [documentId, editState, flushPendingPatch],
  );

  if (!parsed.ok) {
    return (
      <MarkdownReadonlyRenderer
        code={documentSource}
        contentType={contentType}
        diagnostics={diagnostics}
        getArtifactIdForNode={getArtifactIdForNode}
        HtmlPreviewComponent={HtmlPreviewComponent}
        isSourceLineHidden={isSourceLineHidden}
        lineMap={sourceLineMap}
        MermaidPreviewComponent={MermaidPreviewComponent}
        isAiFixBusy={isAiFixBusy}
        onJsonFormatted={onJsonFormatted}
        onBeginFixReview={onBeginFixReview}
        onRequestAiFix={onRequestAiFix}
        repairMode={repairMode}
        onMermaidDiagnosticChange={onMermaidDiagnosticChange}
        onMermaidSvgReady={onMermaidSvgReady}
        renderDeliveryAccess={renderDeliveryAccess}
        t={t}
        withArtifactTarget={withArtifactTarget}
      />
    );
  }

  return (
    <div
      className="aad-markdown-lexical-document aad-markdown-lexical-island"
      data-preview-edit-island={documentId}
      onBlur={handleBlur}
    >
      <PreviewArtifactRenderContext.Provider value={renderContext}>
        <LexicalComposer initialConfig={initialConfig}>
            <RichTextPlugin
              contentEditable={
                <ContentEditable
                  className="aad-markdown-lexical-island-content"
                  data-preview-edit-island={documentId}
                  aria-label="编辑 Markdown 内容"
                  spellCheck={false}
                />
              }
              placeholder={
                getFinalInsertCommands(mornDraftComponentScope).length > 0
                  ? <div className="aad-final-slash-placeholder">输入 " / " 快速插入内容，支持Markdown、HTML、Mermaid、JSON等语法</div>
                  : null
              }
              ErrorBoundary={LexicalErrorBoundary}
            />
            <HistoryPlugin />
            <LexicalFinalLineClickPlugin requestForceDocumentRefresh={requestForceDocumentRefresh} />
            <FinalLogicalLineSelectionPlugin />
            <LexicalBlankDocumentFocusPlugin />
            <LexicalBlankDocumentDeleteCaretPlugin />
            <LexicalDocumentKeyboardScopePlugin />
            <MarkdownShortcutPlugin transformers={PREVIEW_MARKDOWN_SHORTCUT_TRANSFORMERS} />
            <LexicalInlineMarkdownShortcutPlugin />
            <LexicalFencedCodeShortcutPlugin />
            <LexicalTableKeyboardPlugin />
            <LexicalTableAiSelectionPlugin
              editState={editState}
              onSelectedTableNodeKeyChange={handleSelectTable}
              selectedTableNodeKey={selectedTableNodeKey}
            />
            <LexicalPipeTableShortcutPlugin tableAlignmentsRef={tableAlignmentsRef} />
            <LexicalMarkdownSourcePastePlugin editState={editState} tableAlignmentsRef={tableAlignmentsRef} />
            <LexicalImagePasteDropPlugin
              editState={editState}
              tableAlignmentsRef={tableAlignmentsRef}
            />
            <LexicalImageSelectionCommandsPlugin
              editState={editState}
              onSelectedImageNodeKeyChange={setSelectedImageNodeKey}
              selectedImageNodeKey={selectedImageNodeKey}
            />
            <LexicalCodeBlockSelectionCommandsPlugin
              onSelectedCodeLikeArtifactNodeKeyChange={setSelectedCodeLikeArtifactNodeKey}
              onSelectedCodeBlockNodeKeyChange={setSelectedCodeBlockNodeKey}
              selectedCodeLikeArtifactNodeKey={selectedCodeLikeArtifactNodeKey}
              selectedCodeBlockNodeKey={selectedCodeBlockNodeKey}
            />
          <ListPlugin />
          <TablePlugin hasCellMerge={false} hasCellBackgroundColor={false} hasHorizontalScroll />
          <LexicalDocumentAutoFocusPlugin autoFocusKey={autoFocusKey} autoFocusTarget={autoFocusTarget} />
          <LexicalFinalInsertCommandPlugin
            editState={editState}
            tableAlignmentsRef={tableAlignmentsRef}
            t={t}
          />
          <LexicalDocumentChangePlugin
            documentId={documentId}
            onChange={schedulePatch}
            sourceOverridesRef={artifactSourceOverridesRef}
            tableAlignmentsRef={tableAlignmentsRef}
          />
          <LexicalAiReplacementApplierPlugin
            documentId={documentId}
            editState={editState}
            fullSourceRef={fullSourceRef}
            lastMarkdownRef={lastMarkdownRef}
            sourceOverridesRef={artifactSourceOverridesRef}
            sourceRef={sourceRef}
            tableAlignmentsRef={tableAlignmentsRef}
          />
          <LexicalDocumentFormatBridgePlugin
            editState={editState}
            documentId={documentId}
            onFormatIntent={() => {
              patchKindRef.current = 'style';
            }}
            selectedTableNodeKeyRef={selectedTableNodeKeyRef}
          />
          <LexicalDocumentResetPlugin
            activeBlockId={editState.sourcePatchEcho?.meta.blockId}
            blocks={blocks}
            onResetMarkdown={(markdown) => {
              lastMarkdownRef.current = markdown;
            }}
            resetToken={documentSource}
            shouldRefreshActiveBlockOnly={shouldRefreshActiveBlockOnly}
            skipActiveBlockRefresh={Boolean(editState.sourcePatchEcho?.meta.skipActiveBlockRefresh)}
            forceDocumentRefresh={forceDocumentRefresh}
            refreshMarkdownTextBlocks={editState.sourcePatchEcho?.meta.kind === 'ai'}
            aiReplacement={editState.sourcePatchEcho?.meta.aiReplacement}
            skipResetToken={lastMarkdownRef.current}
            sourceOverridesRef={artifactSourceOverridesRef}
            tableAlignmentsRef={tableAlignmentsRef}
          />
        </LexicalComposer>
      </PreviewArtifactRenderContext.Provider>
    </div>
  );
};

const isSkippableLocalPatchEcho = (props: MarkdownLexicalDocumentProps) => isSkippableLocalPreviewPatchEcho({
  previewCode: props.editState.source ?? props.code, sourcePatchEcho: props.editState.sourcePatchEcho,
});

const arePreviewDiagnosticsEqual = (
  previous: readonly ArtifactDiagnostic[],
  next: readonly ArtifactDiagnostic[],
) => {
  if (previous === next) return true;
  if (previous.length !== next.length) return false;
  return previous.every((diagnostic, index) => {
    const other = next[index];
    return (
      diagnostic.id === other.id &&
      diagnostic.code === other.code &&
      diagnostic.severity === other.severity &&
      diagnostic.messageZh === other.messageZh &&
      diagnostic.messageEn === other.messageEn &&
      diagnostic.line === other.line &&
      diagnostic.column === other.column &&
      diagnostic.endLine === other.endLine &&
      diagnostic.endColumn === other.endColumn &&
      diagnostic.fixId === other.fixId &&
      diagnostic.fix?.id === other.fix?.id
    );
  });
};

const areDeliveryRequestContextsEqual = (
  previous: PreviewMarkdownEditState['deliveryRequestContext'],
  next: PreviewMarkdownEditState['deliveryRequestContext'],
) => (
  previous === next ||
  Boolean(
      previous &&
      next &&
      previous.draftId === next.draftId &&
      previous.disableAiAssistUi === next.disableAiAssistUi && previous.enableOssAiProvider === next.enableOssAiProvider &&
      previous.isDevMode === next.isDevMode &&
      previous.publicAllOpen === next.publicAllOpen &&
      previous.refresh === next.refresh &&
      previous.scenarioId === next.scenarioId,
  )
);

const getMarkdownLexicalDocumentSource = (props: MarkdownLexicalDocumentProps) =>
  props.editState.source ?? props.code;

const getMarkdownLexicalDocumentDifferences = (
  previous: MarkdownLexicalDocumentProps,
  next: MarkdownLexicalDocumentProps,
) => [
  ['aiCandidateRenderDeliveryAccess', arePreviewRenderDeliveryAccessEqual(previous.aiCandidateRenderDeliveryAccess, next.aiCandidateRenderDeliveryAccess)],
  ['autoFocusKey', previous.autoFocusKey === next.autoFocusKey],
  ['autoFocusTarget', previous.autoFocusTarget === next.autoFocusTarget],
  ['code', previous.code === next.code],
  ['contentType', previous.contentType === next.contentType],
  ['diagnostics', arePreviewDiagnosticsEqual(previous.diagnostics, next.diagnostics)],
  ['documentSource', getMarkdownLexicalDocumentSource(previous) === getMarkdownLexicalDocumentSource(next)],
  ['editState.deliveryRequestContext', areDeliveryRequestContextsEqual(previous.editState.deliveryRequestContext, next.editState.deliveryRequestContext)],
  ['editState.enabled', previous.editState.enabled === next.editState.enabled],
  ['editState.onActiveIslandChange', previous.editState.onActiveIslandChange === next.editState.onActiveIslandChange],
  ['editState.onBeforePatch', previous.editState.onBeforePatch === next.editState.onBeforePatch],
  ['editState.onCommitIslandEdit', previous.editState.onCommitIslandEdit === next.editState.onCommitIslandEdit],
  ['editState.onInsertImageFile', previous.editState.onInsertImageFile === next.editState.onInsertImageFile],
  ['editState.onLexicalAiSelectionChange', previous.editState.onLexicalAiSelectionChange === next.editState.onLexicalAiSelectionChange],
  ['editState.onLexicalFormatChange', previous.editState.onLexicalFormatChange === next.editState.onLexicalFormatChange],
  ['editState.onPatch', previous.editState.onPatch === next.editState.onPatch],
  ['editState.onRequestEditorLineFocus', previous.editState.onRequestEditorLineFocus === next.editState.onRequestEditorLineFocus],
  ['editState.sourcePatchEcho', previous.editState.sourcePatchEcho === next.editState.sourcePatchEcho],
  ['editState.stateResetKey', previous.editState.stateResetKey === next.editState.stateResetKey],
  ['getArtifactIdForNode', previous.getArtifactIdForNode === next.getArtifactIdForNode],
  ['getArtifactIdForSourceLine', previous.getArtifactIdForSourceLine === next.getArtifactIdForSourceLine],
  ['HtmlPreviewComponent', previous.HtmlPreviewComponent === next.HtmlPreviewComponent],
  ['isSourceLineHidden', previous.isSourceLineHidden === next.isSourceLineHidden],
  ['MermaidPreviewComponent', previous.MermaidPreviewComponent === next.MermaidPreviewComponent],
  ['onJsonFormatted', previous.onJsonFormatted === next.onJsonFormatted],
  ['isAiFixBusy', previous.isAiFixBusy === next.isAiFixBusy],
  ['onBeginFixReview', previous.onBeginFixReview === next.onBeginFixReview],
  ['onRequestAiFix', previous.onRequestAiFix === next.onRequestAiFix],
  ['repairMode', previous.repairMode === next.repairMode],
  ['onMermaidDiagnosticChange', previous.onMermaidDiagnosticChange === next.onMermaidDiagnosticChange],
  ['onMermaidSvgReady', previous.onMermaidSvgReady === next.onMermaidSvgReady],
  ['renderDeliveryAccess', arePreviewRenderDeliveryAccessEqual(previous.renderDeliveryAccess, next.renderDeliveryAccess)],
  ['sourceLineMap', arePreviewSourceLineMapsEqual(previous.sourceLineMap, next.sourceLineMap)],
  ['t', previous.t === next.t],
  ['withArtifactTarget', previous.withArtifactTarget === next.withArtifactTarget],
] as const;

const areMarkdownLexicalDocumentPropsEqual = (
  previous: MarkdownLexicalDocumentProps,
  next: MarkdownLexicalDocumentProps,
) => {
  const differences = getMarkdownLexicalDocumentDifferences(previous, next)
    .filter(([, isEqual]) => !isEqual)
    .map(([name]) => name);
  if (differences.length === 0) return true;
  if (!isSkippableLocalPatchEcho(next)) return false;
  const blockingDifferences = [
    ['aiCandidateRenderDeliveryAccess', arePreviewRenderDeliveryAccessEqual(previous.aiCandidateRenderDeliveryAccess, next.aiCandidateRenderDeliveryAccess)],
    ['editState.enabled', previous.editState.enabled === next.editState.enabled],
    ['HtmlPreviewComponent', previous.HtmlPreviewComponent === next.HtmlPreviewComponent],
    ['MermaidPreviewComponent', previous.MermaidPreviewComponent === next.MermaidPreviewComponent],
    ['renderDeliveryAccess', arePreviewRenderDeliveryAccessEqual(previous.renderDeliveryAccess, next.renderDeliveryAccess)],
  ].filter(([, isEqual]) => !isEqual).map(([name]) => name);
  const skip = blockingDifferences.length === 0;
  debugPreviewLexical('lexical-document-memo-local-echo', {
    blockingDifferences,
    blockingDifferencesText: blockingDifferences.join(','),
    differenceCount: differences.length,
    differences,
    differencesText: differences.join(','),
    skip,
  });
  return skip;
};

export const MarkdownLexicalDocument = React.memo(
  MarkdownLexicalDocumentImpl,
  areMarkdownLexicalDocumentPropsEqual,
) as React.FC<MarkdownLexicalDocumentProps>;
