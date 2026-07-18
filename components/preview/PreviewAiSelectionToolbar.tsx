import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Copy, FilePenLine, FileText, Loader2, MessageCirclePlus, Send, Wrench } from 'lucide-react';
import { AI_INSTRUCTION_MAX_TEXT, AI_INSTRUCTION_MIN_TEXT } from '@morndraft/core';
import type { ArtifactPreviewTranslations } from '../../i18n';
import type { DeliveryRequestContext } from './deliveryActionTypes';
import type { DeliveryNotice, PreviewRenderDeliveryAccess } from './deliveryAccess';
import { copyPlainText } from './clipboardWriters';
import type {
  PreviewAiAppliedReplacement,
  PreviewAiReplacementResult,
  PreviewAiSelection,
  PreviewAiSelectionRect,
} from './previewMarkdownEditingTypes';
import { AiImeSafeTextArea, resizeAiTextAreaToContent } from './AiImeSafeTextArea';
import {
  createPreviewAiFinalRepairSelection,
  requestPreviewAiFinalRepair,
} from './previewAiFinalRepairSelection';
import { PreviewAiMarkdownResult } from './PreviewAiMarkdownResult';
import { PreviewAiAppliedNotice, usePreviewAiAppliedNotice } from './PreviewAiAppliedNotice';
import { handlePreviewAiSelectionToolbarKeyboardEvent } from './previewAiSelectionKeyboard';
import {
  assertPreviewAiSourceSnapshotCurrent,
  requestPreviewOssAiSelection,
} from './previewOssAiPrivacy';
import { useStreamingAutoScroll } from './useStreamingAutoScroll';
import type { FinalSyntaxAiRepairRequestHandler } from './finalSyntaxAiRepairTypes';
import { getPrivateRuntimeGateway } from '../../utils/privateRuntimeGateways';

const loadPrivatePreviewAiSelectionGateway = () => getPrivateRuntimeGateway('previewAiSelection')?.();

type PreviewAiSelectionTextAction = 'modify' | 'summarize';
type PreviewAiSelectionAction = PreviewAiSelectionTextAction | 'repair';

type PreviewAiSelectionApiResponse = {
  code?: string;
  error?: {
    code?: string;
    message?: string;
  };
  message?: string;
  patch?: {
    kind?: string;
    range?: {
      end?: number;
      start?: number;
    };
    replacement?: string;
  };
  resultText?: string;
  session?: PreviewAiInstructionSessionSnapshot;
  status?: number;
  text?: string;
  questions?: PreviewAiClarificationQuestion[];
};

export type PreviewAiClarificationQuestion = {
  id: string;
  placeholder?: string;
  question: string;
  reason?: string;
  required: boolean;
};

type PreviewAiSelectionResult = {
  action: PreviewAiSelectionAction;
  instruction: string;
  patch?: {
    replacement: string;
  };
  resultText: string;
  usesThinking: boolean;
};

const isMornDraftHtmlSourceCandidate = (value: string) => (
  (/morndraft:structure/iu.test(value) && /data-morndraft-source\s*=\s*["']morndraft-flat["']/iu.test(value))
  || /morndraft:fallback/iu.test(value)
  || /data-morndraft-origin\s*=\s*["']fallback["']/iu.test(value)
);

type PreviewAiSelectionFollowUpPayload = {
  followUpInstruction: string;
  previousResultText: string;
};

type PreviewAiSelectionToolbarProps = {
  appliedReplacement: PreviewAiAppliedReplacement | null;
  applyReplacement: (selection: PreviewAiSelection, replacement: string) => PreviewAiReplacementResult;
  deliveryRequestContext?: DeliveryRequestContext;
  disableTextActions?: boolean;
  getLatestSource: () => string;
  restoreSelectionFocus: (selection: PreviewAiSelection | null | undefined) => void;
  restoreReplacement: (
    selection: PreviewAiSelection,
    previousSource: string,
    expectedSource: string,
    replacement: string,
  ) => PreviewAiReplacementResult;
  renderDeliveryAccess?: PreviewRenderDeliveryAccess;
  scrollContainerRef: React.RefObject<HTMLElement | null>;
  selection: PreviewAiSelection | null;
  setDeliveryNotice: (notice: DeliveryNotice | null) => void;
  isFinalAiFixBusy?: boolean;
  onRequestAiFix?: FinalSyntaxAiRepairRequestHandler;
  t: ArtifactPreviewTranslations;
};

type PreviewAiSelectionStreamReadOptions = {
  onCandidateReset?: () => void;
  onClarificationDelta?: (delta: string) => void;
  onThinkingDelta?: (delta: string) => void;
  onProgressDelta?: (delta: string) => void;
  onThoughtSummary?: (summary: string) => void;
};

type PreviewAiSelectionStreamResult = {
  clarification?: {
    questions: PreviewAiClarificationQuestion[];
  };
  patchReplacement?: string;
  resultText: string;
  session?: PreviewAiInstructionSessionSnapshot;
};

export type PreviewAiInstructionSessionSnapshot = {
  candidateSource?: string | null;
  clarificationAnswer?: string | null;
  clarificationQuestions?: PreviewAiClarificationQuestion[];
  draftId: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  expiresAt?: string;
  insertRange: { end: number; start: number };
  instruction: string;
  progressText?: string;
  replaceRange: { end: number; start: number };
  sessionId: string;
  slashText: string;
  sourceLineRange: { endLine: number; startLine: number };
  sourceVersion: string;
  status: 'planning' | 'clarification_required' | 'generating' | 'repairing' | 'ready' | 'failed' | 'cancelled' | 'applied' | 'interrupted';
  thoughtSummary?: string;
  updatedAt?: string;
};

type AiStreamDisplayPhase = 'thinking' | 'generating' | 'complete';

const ACTIONS = [
  { action: 'summarize', Icon: FileText, label: (t: ArtifactPreviewTranslations) => t.previewAiSummarizeSelection },
  { action: 'modify', Icon: FilePenLine, label: (t: ArtifactPreviewTranslations) => t.previewAiModifySelection },
] satisfies Array<{
  action: PreviewAiSelectionTextAction;
  Icon: typeof FileText;
  label: (t: ArtifactPreviewTranslations) => string;
}>;

const PREVIEW_MARKDOWN_DOCUMENT_ID = 'document:preview-markdown';
const DOCUMENT_FULL_SELECTION_TOOLBAR_RAISE_RATIO = 0.05;
const DOCUMENT_FULL_SELECTION_TOOLBAR_INLINE_INSET = 8;
const DOCUMENT_SELECTION_HIGHLIGHT_HORIZONTAL_EXPAND_RATIO = 0.05;
const DOCUMENT_SELECTION_HIGHLIGHT_VERTICAL_EXPAND_RATIO = 0.05;
const DOCUMENT_SELECTION_HIGHLIGHT_TOP_INSET_PX = 2;
const isUsablePreviewAiSelectionRect = (rect: PreviewAiSelectionRect | null | undefined) =>
  Boolean(
    rect &&
    Number.isFinite(rect.left) &&
    Number.isFinite(rect.top) &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height) &&
    rect.width > 0 &&
    rect.height > 0,
  );

const getDocumentTextAreaRect = (documentSurface: HTMLElement): DOMRect => {
  const textArea = documentSurface.querySelector<HTMLElement>('.aad-markdown-lexical-island-content');
  const textAreaRect = textArea?.getBoundingClientRect();
  return textAreaRect && textAreaRect.width > 0 ? textAreaRect : documentSurface.getBoundingClientRect();
};

const getActionLabel = (t: ArtifactPreviewTranslations, action: PreviewAiSelectionTextAction) =>
  ACTIONS.find((item) => item.action === action)?.label(t) ?? action;

const getFollowUpPlaceholder = (t: ArtifactPreviewTranslations, action: PreviewAiSelectionTextAction) =>
  action === 'modify' ? t.previewAiModifyFollowUpPlaceholder : t.previewAiSummarizeFollowUpPlaceholder;

const readApiErrorCode = (body: PreviewAiSelectionApiResponse) => body.error?.code || body.code || '';

const getProductizedAiErrorMessage = (
  body: PreviewAiSelectionApiResponse,
  fallback: string,
  status: number,
  t: ArtifactPreviewTranslations,
) => {
  const code = readApiErrorCode(body);
  if (status === 401 || code === 'unauthorized') return t.previewAiLoginRequired;
  if (code === 'missing_entitlement') return t.previewAiUpgradeRequired;
  if (code === 'quota_exhausted') return t.previewAiQuotaExhausted;
  if (code === 'provider_unavailable') return t.previewAiProviderUnavailable;
  if (code === 'stale_ai_selection_source' || code === 'selection_range_mismatch') {
    return t.previewAiSelectionChanged;
  }
  return body.error?.message || body.message || fallback;
};

const previewAiSelectionUsesThinking = (selection: PreviewAiSelection | null | undefined) => (
  selection?.selectionScope === 'whole'
);

const readPatchReplacement = (body: PreviewAiSelectionApiResponse) => (
  body.patch?.kind === 'replace' && typeof body.patch.replacement === 'string'
    ? body.patch.replacement
    : undefined
);

const isReplacementResultAction = (action: PreviewAiSelectionAction) => (
  action === 'modify' || action === 'repair'
);

const getCopyableResultText = (result: PreviewAiSelectionResult) => (
  isReplacementResultAction(result.action)
    ? result.patch?.replacement ?? result.resultText
    : result.resultText
);

const clearPreviewNativeSelection = () => {
  if (typeof window === 'undefined') return;
  const domSelection = window.getSelection();
  if (!domSelection || domSelection.rangeCount === 0) return;
  domSelection.removeAllRanges();
};

const getSelectionDismissKey = (selection: PreviewAiSelection | null | undefined) => (
  selection
    ? [
        selection.capturedAt,
        selection.contentKind ?? 'text',
        selection.image?.url ?? '',
        selection.sourceVersion,
        selection.visibleText,
        selection.patchTarget?.sourceRange.start ?? selection.contextRange?.start ?? -1,
        selection.patchTarget?.sourceRange.end ?? selection.contextRange?.end ?? -1,
      ].join(':')
    : ''
);

export const parsePreviewAiSelectionSseFrame = (rawFrame: string) => {
  let event = 'message';
  const dataLines: string[] = [];
  for (const line of rawFrame.split(/\r?\n/u)) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
      continue;
    }
    if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
  }
  return {
    data: dataLines.join('\n'),
    event,
  };
};

export const readPreviewAiSelectionStream = async (
  response: Response,
  onPartialResult: (resultText: string) => void,
  t: ArtifactPreviewTranslations,
  options: PreviewAiSelectionStreamReadOptions = {},
): Promise<PreviewAiSelectionStreamResult> => {
  if (!response.body) throw new Error(t.previewAiEmptyResponse);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let resultText = '';
  let donePatchReplacement: string | undefined;
  let doneResultText: string | undefined;
  let clarificationQuestions: PreviewAiClarificationQuestion[] | undefined;
  let session: PreviewAiInstructionSessionSnapshot | undefined;
  let done = false;

  const handleFrame = (rawFrame: string) => {
    const frame = parsePreviewAiSelectionSseFrame(rawFrame);
    if (!frame.data || frame.data === '[DONE]') return;
    const body = JSON.parse(frame.data) as PreviewAiSelectionApiResponse;
    if (frame.event === 'error') {
      const status = typeof body.status === 'number' ? body.status : 500;
      throw new Error(getProductizedAiErrorMessage(body, t.previewAiRequestDenied(status), status, t));
    }
    if (frame.event === 'done') {
      donePatchReplacement = readPatchReplacement(body);
      if (typeof body.resultText === 'string') doneResultText = body.resultText;
      done = true;
      return;
    }
    if (frame.event === 'session_started') {
      if (body.session && typeof body.session.sessionId === 'string') {
        session = body.session;
      }
      return;
    }
    if (frame.event === 'clarification_required') {
      clarificationQuestions = Array.isArray(body.questions)
        ? body.questions
          .filter(question => question && typeof question.question === 'string')
          .slice(0, 3)
        : [];
      done = true;
      return;
    }
    if (frame.event === 'candidate_reset') {
      resultText = '';
      options.onCandidateReset?.();
      onPartialResult('');
      return;
    }
    const delta = typeof body.text === 'string' ? body.text : '';
    if (!delta) return;
    if (frame.event === 'progress_delta') {
      options.onProgressDelta?.(delta);
      return;
    }
    if (frame.event === 'thought_summary') {
      options.onThoughtSummary?.(delta);
      return;
    }
    if (frame.event === 'thinking_delta') {
      options.onThinkingDelta?.(delta);
      return;
    }
    if (frame.event === 'clarification_delta') {
      options.onClarificationDelta?.(delta);
      return;
    }
    resultText += delta;
    onPartialResult(resultText);
  };

  try {
    for (;;) {
      const { done: readerDone, value } = await reader.read();
      if (readerDone) break;
      buffer += decoder.decode(value, { stream: true });
      for (;;) {
        const delimiter = /\r?\n\r?\n/u.exec(buffer);
        if (!delimiter) break;
        const rawFrame = buffer.slice(0, delimiter.index);
        buffer = buffer.slice(delimiter.index + delimiter[0].length);
        handleFrame(rawFrame);
      }
    }
    const trailing = decoder.decode();
    if (trailing) buffer += trailing;
    if (buffer.trim()) handleFrame(buffer);
  } finally {
    reader.releaseLock();
  }

  if (!done) {
    throw new Error(resultText.trim() ? t.previewAiRequestFailed : t.previewAiEmptyResponse);
  }
  if (clarificationQuestions) {
    return {
      clarification: { questions: clarificationQuestions },
      resultText: '',
      ...(session ? { session } : {}),
    };
  }
  return {
    patchReplacement: donePatchReplacement,
    resultText: doneResultText ?? resultText,
    ...(session ? { session } : {}),
  };
};

export const PreviewAiSelectionToolbar: React.FC<PreviewAiSelectionToolbarProps> = ({
  appliedReplacement,
  applyReplacement,
  deliveryRequestContext, disableTextActions = false,
  getLatestSource,
  isFinalAiFixBusy = false,
  onRequestAiFix,
  renderDeliveryAccess,
  restoreSelectionFocus,
  restoreReplacement,
  scrollContainerRef,
  selection,
  setDeliveryNotice,
  t,
}) => {
  const [busyAction, setBusyAction] = useState<PreviewAiSelectionAction | null>(null);
  const [draftAction, setDraftAction] = useState<PreviewAiSelectionTextAction | null>(null);
  const [instruction, setInstruction] = useState('');
  const [result, setResult] = useState<PreviewAiSelectionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [followUpText, setFollowUpText] = useState('');
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const [thinkingText, setThinkingText] = useState('');
  const [, setProgressText] = useState('');
  const [thoughtSummary, setThoughtSummary] = useState('');
  const [thinkingOpen, setThinkingOpen] = useState(false);
  const [streamDisplayPhase, setStreamDisplayPhaseState] = useState<AiStreamDisplayPhase>('complete');
  const [pinnedSelection, setPinnedSelection] = useState<PreviewAiSelection | null>(null);
  const [dismissedSelectionKey, setDismissedSelectionKey] = useState<string | null>(null);
  const [layoutRevision, setLayoutRevision] = useState(0);
  const instructionInputRef = useRef<HTMLTextAreaElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const requestAbortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const thinkingUserToggledRef = useRef(false);
  const thinkingResultAutoCollapsedRef = useRef(false);
  const thinkingResultStartedRef = useRef(false);
  const thinkingAutoCollapseVersionRef = useRef(0);
  const rawThinkingTextRef = useRef('');
  const streamDisplayPhaseRef = useRef<AiStreamDisplayPhase>('complete');
  const lastSelectionKeyRef = useRef<string | null>(null);
  const latestDraftIdRef = useRef(deliveryRequestContext?.draftId ?? null);
  useEffect(() => {
    latestDraftIdRef.current = deliveryRequestContext?.draftId ?? null;
  }, [deliveryRequestContext?.draftId]);

  const setScopedDeliveryNotice = useCallback((notice: DeliveryNotice | null) => {
    if ((deliveryRequestContext?.draftId ?? null) !== latestDraftIdRef.current) return;
    setDeliveryNotice(notice);
  }, [deliveryRequestContext?.draftId, setDeliveryNotice]);

  const resetThinkingAutoCollapse = useCallback(() => {
    thinkingResultStartedRef.current = false;
    thinkingAutoCollapseVersionRef.current += 1;
  }, []);

  const setStreamDisplayPhase = useCallback((phase: AiStreamDisplayPhase) => {
    streamDisplayPhaseRef.current = phase;
    setStreamDisplayPhaseState(phase);
  }, []);

  const resetStreamDisplay = useCallback((phase: AiStreamDisplayPhase = 'complete') => {
    rawThinkingTextRef.current = '';
    setStreamDisplayPhase(phase);
  }, [setStreamDisplayPhase]);

  const transitionToGenerating = useCallback(() => {
    if (streamDisplayPhaseRef.current !== 'thinking') return;
    setThinkingText(rawThinkingTextRef.current);
    setStreamDisplayPhase('generating');
  }, [setStreamDisplayPhase]);

  const incomingSelectionKey = getSelectionDismissKey(selection);
  const isSelectionInteractionLocked = Boolean(busyAction || draftAction);
  const hasActiveAiInteraction = Boolean(isSelectionInteractionLocked || result || error);
  const latestSource = getLatestSource();
  const currentAppliedReplacement = appliedReplacement?.afterSource === latestSource
    ? appliedReplacement
    : null;
  const handleAppliedNoticeDismissed = useCallback(() => {
    setDismissedSelectionKey(getSelectionDismissKey(currentAppliedReplacement?.selection) || null);
    setPinnedSelection(null);
  }, [currentAppliedReplacement]);
  const {
    dismiss: dismissAppliedNotice,
    show: showAppliedNotice,
    visible: appliedNoticeVisible,
  } = usePreviewAiAppliedNotice(handleAppliedNoticeDismissed);
  const isAppliedNoticeVisible = Boolean(currentAppliedReplacement && appliedNoticeVisible);

  useEffect(() => {
    if (currentAppliedReplacement || !appliedNoticeVisible) return;
    dismissAppliedNotice();
  }, [appliedNoticeVisible, currentAppliedReplacement, dismissAppliedNotice]);

  useEffect(() => {
    lastSelectionKeyRef.current = null;
    setDismissedSelectionKey(null);
  }, [latestSource]);

  useEffect(() => {
    if (!incomingSelectionKey) {
      lastSelectionKeyRef.current = null;
      return;
    }
    if (lastSelectionKeyRef.current === incomingSelectionKey) return;
    lastSelectionKeyRef.current = incomingSelectionKey;
    setDismissedSelectionKey(null);
  }, [incomingSelectionKey]);

  useEffect(() => {
    if (!selection) return;
    if (hasActiveAiInteraction || isAppliedNoticeVisible) return;
    setPinnedSelection(selection);
    setBusyAction(null);
    setDraftAction(null);
    setInstruction('');
    setResult(null);
    setError(null);
    setFollowUpOpen(false);
    setFollowUpText('');
    setFollowUpError(null);
    setThinkingText('');
    setProgressText('');
    setThoughtSummary('');
    setThinkingOpen(false);
    resetStreamDisplay();
    thinkingUserToggledRef.current = false;
    thinkingResultAutoCollapsedRef.current = false;
    resetThinkingAutoCollapse();
  }, [
    hasActiveAiInteraction,
    isAppliedNoticeVisible,
    resetStreamDisplay,
    resetThinkingAutoCollapse,
    selection,
  ]);

  useEffect(() => {
    if (selection || hasActiveAiInteraction || isAppliedNoticeVisible) return;
    setPinnedSelection(null);
    setInstruction('');
    setThinkingText('');
    setProgressText('');
    setThoughtSummary('');
    setThinkingOpen(false);
    resetStreamDisplay();
    thinkingUserToggledRef.current = false;
    thinkingResultAutoCollapsedRef.current = false;
    resetThinkingAutoCollapse();
  }, [hasActiveAiInteraction, isAppliedNoticeVisible, resetStreamDisplay, resetThinkingAutoCollapse, selection]);

  const activeSelection = isAppliedNoticeVisible && currentAppliedReplacement && !hasActiveAiInteraction
    ? currentAppliedReplacement.selection
    : hasActiveAiInteraction
      ? pinnedSelection ?? selection
      : selection ?? pinnedSelection;
  const activeSelectionKey = getSelectionDismissKey(activeSelection);
  const visibleSelection = isAppliedNoticeVisible
    ? activeSelection
    : activeSelectionKey && activeSelectionKey === dismissedSelectionKey
      ? null
      : activeSelection;
  const isAppliedToast = Boolean(
    currentAppliedReplacement &&
    isAppliedNoticeVisible &&
    visibleSelection === currentAppliedReplacement.selection &&
    !hasActiveAiInteraction,
  );
  const isRepairResult = result?.action === 'repair';
  const isDocumentFullReplacementSelection = Boolean(
    visibleSelection?.islandId === PREVIEW_MARKDOWN_DOCUMENT_ID &&
    visibleSelection.patchTarget?.sourceRange.start === 0 &&
    visibleSelection.patchTarget.sourceRange.end === latestSource.length,
  );
  const finalRepairDiagnostic = visibleSelection?.repairDiagnostic?.severity === 'error'
    ? visibleSelection.repairDiagnostic
    : null;
  const activeDraftAction = draftAction;
  const shouldShowPersistedSelectionHighlight = Boolean(
    visibleSelection &&
    !isAppliedToast &&
    (activeDraftAction || busyAction || result || error) &&
    visibleSelection.contentKind !== 'image' &&
    visibleSelection.contentKind !== 'table',
  );
  const hasPersistedSelectionRects = Boolean(
    shouldShowPersistedSelectionHighlight &&
    visibleSelection?.selectionRects?.some(isUsablePreviewAiSelectionRect),
  );
  const shouldShowInlineSelectionHighlight = Boolean(
    shouldShowPersistedSelectionHighlight &&
    (!isDocumentFullReplacementSelection || hasPersistedSelectionRects),
  );
  const hasVisibleSelection = Boolean(visibleSelection);

  const shouldRestoreFocusAfterOutsidePointer = useCallback((target: EventTarget | null) => {
    const container = scrollContainerRef.current;
    if (!container || !(target instanceof Node) || !container.contains(target)) return false;
    const element = target instanceof HTMLElement ? target : target.parentElement;
    return Boolean(element?.closest('.aad-document-surface, .aad-markdown-lexical-island'));
  }, [scrollContainerRef]);

  useEffect(() => {
    if (!activeDraftAction) return undefined;
    const frameId = window.requestAnimationFrame(() => instructionInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frameId);
  }, [activeDraftAction]);

  useLayoutEffect(() => {
    if (
      !hasVisibleSelection ||
      isAppliedToast ||
      (!isDocumentFullReplacementSelection && !shouldShowInlineSelectionHighlight)
    ) {
      return;
    }
    setLayoutRevision((revision) => revision + 1);
  }, [
    activeSelectionKey,
    hasVisibleSelection,
    isAppliedToast,
    isDocumentFullReplacementSelection,
    shouldShowInlineSelectionHighlight,
  ]);

  useEffect(() => {
    if (
      !visibleSelection ||
      isAppliedToast ||
      (!isDocumentFullReplacementSelection && !shouldShowInlineSelectionHighlight)
    ) {
      return undefined;
    }
    const container = scrollContainerRef.current;
    if (!container) return undefined;
    const documentSurface = container.querySelector('.aad-document-surface');
    const textArea = documentSurface instanceof HTMLElement
      ? documentSurface.querySelector<HTMLElement>('.aad-markdown-lexical-island-content')
      : null;
    let frameId: number | null = null;
    const schedulePositionUpdate = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        setLayoutRevision((revision) => revision + 1);
      });
    };
    window.addEventListener('resize', schedulePositionUpdate);
    window.visualViewport?.addEventListener('resize', schedulePositionUpdate);
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(schedulePositionUpdate);
      resizeObserver.observe(container);
      if (documentSurface instanceof HTMLElement) resizeObserver.observe(documentSurface);
      if (textArea) resizeObserver.observe(textArea);
    }
    return () => {
      window.removeEventListener('resize', schedulePositionUpdate);
      window.visualViewport?.removeEventListener('resize', schedulePositionUpdate);
      resizeObserver?.disconnect();
      if (frameId !== null) window.cancelAnimationFrame(frameId);
    };
  }, [
    isAppliedToast,
    isDocumentFullReplacementSelection,
    scrollContainerRef,
    shouldShowInlineSelectionHighlight,
    visibleSelection,
  ]);

  const style = useMemo<React.CSSProperties | null>(() => {
    void layoutRevision;
    if (!visibleSelection) return null;
    const container = scrollContainerRef.current;
    if (!container) return null;
    const containerRect = container.getBoundingClientRect();
    if (isAppliedToast || isRepairResult) {
      const frame = container.closest('.aad-preview-content-frame');
      const anchorRect = frame instanceof HTMLElement
        ? frame.getBoundingClientRect()
        : containerRect;
      return {
        position: 'fixed',
        left: anchorRect.left + (anchorRect.width / 2),
        top: containerRect.top + 14,
        transform: 'translateX(-50%)',
        width: isAppliedToast ? 'auto' : undefined,
      };
    }
    if (isDocumentFullReplacementSelection && visibleSelection.islandId === PREVIEW_MARKDOWN_DOCUMENT_ID) {
      const documentSurface = container.querySelector('.aad-document-surface');
      if (documentSurface instanceof HTMLElement) {
        const textAreaRect = getDocumentTextAreaRect(documentSurface);
        return {
          position: 'fixed',
          left: textAreaRect.left + DOCUMENT_FULL_SELECTION_TOOLBAR_INLINE_INSET,
          top: containerRect.top + (container.clientHeight * (1 - DOCUMENT_FULL_SELECTION_TOOLBAR_RAISE_RATIO)),
          transform: 'translateY(-100%)',
          width: Math.max(0, textAreaRect.width - (DOCUMENT_FULL_SELECTION_TOOLBAR_INLINE_INSET * 2)),
          willChange: 'transform',
        };
      }
    }
    const rawLeft = visibleSelection.rect.left - containerRect.left + container.scrollLeft;
    const maxToolbarWidth = Math.min(538, Math.max(0, container.clientWidth - 24));
    const minLeft = container.scrollLeft + 12;
    const maxLeft = container.scrollLeft + Math.max(12, container.clientWidth - maxToolbarWidth - 12);
    const left = Math.max(minLeft, Math.min(rawLeft, maxLeft));
    const top = visibleSelection.rect.top - containerRect.top + container.scrollTop + visibleSelection.rect.height + 10;
    return {
      left,
      top,
    };
  }, [isAppliedToast, isDocumentFullReplacementSelection, isRepairResult, layoutRevision, scrollContainerRef, visibleSelection]);
  const documentSelectionHighlightStyle = useMemo<React.CSSProperties | null>(() => {
    void layoutRevision;
    if (!visibleSelection || isAppliedToast || !isDocumentFullReplacementSelection) return null;
    if (hasPersistedSelectionRects) return null;
    const container = scrollContainerRef.current;
    if (!container || visibleSelection.islandId !== PREVIEW_MARKDOWN_DOCUMENT_ID) return null;
    const documentSurface = container.querySelector('.aad-document-surface');
    if (!(documentSurface instanceof HTMLElement)) return null;
    const containerRect = container.getBoundingClientRect();
    const controlsBarRect = container.querySelector('.aad-preview-display-controls-bar')?.getBoundingClientRect();
    const controlsBottom = controlsBarRect?.bottom ?? containerRect.top;
    const visibleTopBoundary = Math.max(containerRect.top, controlsBottom) + DOCUMENT_SELECTION_HIGHLIGHT_TOP_INSET_PX;
    const textAreaRect = getDocumentTextAreaRect(documentSurface);
    const horizontalPadding = textAreaRect.width * DOCUMENT_SELECTION_HIGHLIGHT_HORIZONTAL_EXPAND_RATIO;
    const verticalPadding = textAreaRect.height * DOCUMENT_SELECTION_HIGHLIGHT_VERTICAL_EXPAND_RATIO;
    const expandedLeft = textAreaRect.left - horizontalPadding;
    const expandedTop = textAreaRect.top - verticalPadding;
    const expandedRight = textAreaRect.right + horizontalPadding;
    const expandedBottom = textAreaRect.bottom + verticalPadding;
    const left = Math.max(expandedLeft, containerRect.left);
    const top = Math.max(expandedTop, visibleTopBoundary);
    const right = Math.min(expandedRight, containerRect.right);
    const bottom = Math.min(expandedBottom, containerRect.bottom);
    const width = Math.max(0, right - left);
    const height = Math.max(0, bottom - top);
    if (width <= 0 || height <= 0) return null;
    return {
      background: 'color-mix(in srgb, var(--aad-accent) 14%, transparent)',
      borderRadius: 2,
      height,
      left,
      pointerEvents: 'none',
      position: 'fixed',
      top,
      width,
      zIndex: 22,
    };
  }, [
    hasPersistedSelectionRects,
    isAppliedToast,
    isDocumentFullReplacementSelection,
    layoutRevision,
    scrollContainerRef,
    visibleSelection,
  ]);
  const inlineSelectionHighlightStyles = useMemo<React.CSSProperties[]>(() => {
    void layoutRevision;
    if (!visibleSelection || !shouldShowInlineSelectionHighlight) return [];
    const container = scrollContainerRef.current;
    if (!container) return [];
    const containerRect = container.getBoundingClientRect();
    const rects = visibleSelection.selectionRects?.length
      ? visibleSelection.selectionRects
      : [visibleSelection.rect];
    const styles: React.CSSProperties[] = [];
    for (const rect of rects) {
      if (!isUsablePreviewAiSelectionRect(rect)) continue;
      styles.push({
        background: 'color-mix(in srgb, var(--aad-accent) 14%, transparent)',
        borderRadius: 2,
        height: rect.height,
        left: rect.left - containerRect.left + container.scrollLeft,
        pointerEvents: 'none',
        position: 'absolute',
        top: rect.top - containerRect.top + container.scrollTop,
        width: rect.width,
        zIndex: 22,
      });
    }
    return styles;
  }, [layoutRevision, scrollContainerRef, shouldShowInlineSelectionHighlight, visibleSelection]);

  const dismissToolbar = useCallback((options: {
    restoreDocumentFocus?: boolean;
    selection?: PreviewAiSelection | null;
  } = {}) => {
    const selectionToRestore = options.selection ?? visibleSelection ?? activeSelection;
    requestIdRef.current += 1;
    requestAbortRef.current?.abort();
    requestAbortRef.current = null;
    setDismissedSelectionKey(activeSelectionKey || null);
    setBusyAction(null);
    setDraftAction(null);
    setInstruction('');
    setResult(null);
    setError(null);
    setFollowUpOpen(false);
    setFollowUpText('');
    setFollowUpError(null);
    setThinkingText('');
    setProgressText('');
    setThoughtSummary('');
    setThinkingOpen(false);
    resetStreamDisplay();
    thinkingUserToggledRef.current = false;
    thinkingResultAutoCollapsedRef.current = false;
    resetThinkingAutoCollapse();
    setPinnedSelection(null);
    if (options.restoreDocumentFocus && selectionToRestore) {
      window.requestAnimationFrame(() => restoreSelectionFocus(selectionToRestore));
    }
  }, [activeSelection, activeSelectionKey, resetStreamDisplay, resetThinkingAutoCollapse, restoreSelectionFocus, visibleSelection]);

  useEffect(() => () => {
    requestAbortRef.current?.abort();
  }, []);

  const undoApply = useCallback(() => {
    if (!currentAppliedReplacement) return;
    const selectionToRestore = currentAppliedReplacement.selection;
    const restored = restoreReplacement(
      selectionToRestore,
      currentAppliedReplacement.beforeSource,
      currentAppliedReplacement.afterSource,
      currentAppliedReplacement.replacement,
    );
    if (restored.ok === false) {
      const message = t.previewAiSelectionChanged;
      setError(message);
      setScopedDeliveryNotice({ tone: 'error', text: message });
      return;
    }
    dismissAppliedNotice();
    setScopedDeliveryNotice({ tone: 'success', text: t.previewAiUndoApplied });
    setPinnedSelection(null);
    window.requestAnimationFrame(() => restoreSelectionFocus(selectionToRestore));
  }, [currentAppliedReplacement, dismissAppliedNotice, restoreReplacement, restoreSelectionFocus, setScopedDeliveryNotice, t]);

  useLayoutEffect(() => {
    resizeAiTextAreaToContent(instructionInputRef.current);
  }, [instruction, activeDraftAction]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const container = scrollContainerRef.current;
      const toolbar = toolbarRef.current;
      if (!(target instanceof Node) || (!container?.contains(target) && !toolbar?.contains(target))) return;
      handlePreviewAiSelectionToolbarKeyboardEvent(event, {
        currentAppliedReplacement, dismissAppliedNotice, dismissToolbar, hasActiveAiInteraction,
        isAppliedNoticeVisible, undoApply, visibleSelection,
      });
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [currentAppliedReplacement, dismissAppliedNotice, dismissToolbar, hasActiveAiInteraction,
    isAppliedNoticeVisible, scrollContainerRef, undoApply, visibleSelection]);

  useEffect(() => {
    if (!visibleSelection) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      const toolbar = toolbarRef.current;
      if (!toolbar) return;
      if (event.target instanceof Node && toolbar.contains(event.target)) return;
      if (isAppliedToast) {
        dismissAppliedNotice();
        return;
      }
      dismissToolbar({
        restoreDocumentFocus: shouldRestoreFocusAfterOutsidePointer(event.target),
        selection: visibleSelection,
      });
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [dismissAppliedNotice, dismissToolbar, isAppliedToast, shouldRestoreFocusAfterOutsidePointer, visibleSelection]);

  const handleFinalRepairClick = async () => {
    if (!finalRepairDiagnostic || !onRequestAiFix || isFinalAiFixBusy) return;
    if (!visibleSelection) return;
    const requestSelection = visibleSelection;
    const requestSource = getLatestSource();
    setPinnedSelection(requestSelection);
    clearPreviewNativeSelection();
    requestAbortRef.current?.abort();
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    setDraftAction(null);
    setInstruction('');
    setResult(null);
    setError(null);
    setFollowUpOpen(false);
    setFollowUpText('');
    setFollowUpError(null);
    setThinkingText('');
    setProgressText('');
    setThoughtSummary('');
    setThinkingOpen(false);
    thinkingUserToggledRef.current = false;
    thinkingResultAutoCollapsedRef.current = false;
    resetThinkingAutoCollapse();
    setBusyAction('repair');
    try {
      const repaired = await requestPreviewAiFinalRepair({
        changedMessage: t.previewAiSelectionChanged,
        getLatestSource,
        request: sourceSnapshot => onRequestAiFix(finalRepairDiagnostic, sourceSnapshot),
        sourceSnapshot: requestSelection.sourceSnapshot,
      });
      if (requestIdRef.current !== requestId) return;
      if (!repaired) {
        setPinnedSelection(null);
        return;
      }
      const repairCandidate = createPreviewAiFinalRepairSelection(requestSelection, requestSource, repaired);
      if (!repairCandidate) throw new Error(t.previewAiSelectionChanged);
      setPinnedSelection(repairCandidate.selection);
      setResult({
        action: 'repair',
        instruction: '',
        patch: {
          replacement: repairCandidate.replacement,
        },
        resultText: repairCandidate.replacement,
        usesThinking: false,
      });
      setScopedDeliveryNotice({ tone: 'success', text: t.previewAiResultReady });
    } catch (requestError) {
      if (requestIdRef.current !== requestId) return;
      const message = requestError instanceof Error ? requestError.message : t.previewAiRequestFailed;
      setResult(null);
      setError(message);
      setScopedDeliveryNotice({ tone: 'error', text: message });
    } finally {
      if (requestIdRef.current === requestId) {
        requestAbortRef.current = null;
        setBusyAction(null);
      }
    }
  };

  const activeStreamUsesThinking = busyAction
    ? busyAction !== 'repair' && previewAiSelectionUsesThinking(visibleSelection)
    : Boolean(result?.usesThinking);
  const streamMetaVisible = activeStreamUsesThinking && Boolean(busyAction || thinkingText || thoughtSummary);
  const isThinkingPhase = streamDisplayPhase === 'thinking';
  const thinkingContent = thinkingText || (busyAction && isThinkingPhase ? t.previewAiSlashThinkingWaiting : '');
  const thinkingContentRef = useStreamingAutoScroll<HTMLDivElement>(
    Boolean(busyAction && isThinkingPhase && thinkingOpen && streamMetaVisible),
  );
  const toggleThinkingOpen = useCallback(() => {
    thinkingUserToggledRef.current = true;
    setThinkingOpen((open) => !open);
  }, []);

  if (!visibleSelection || !style) return null;
  if (finalRepairDiagnostic && !onRequestAiFix) return null; if (disableTextActions && !finalRepairDiagnostic) return null;

  const postAiSelectionRequest = async (
    action: PreviewAiSelectionTextAction,
    requestSelection: PreviewAiSelection,
    requestInstruction: string,
    signal: AbortSignal,
    onPartialResult: (resultText: string) => void,
    followUp?: PreviewAiSelectionFollowUpPayload,
    streamOptions: PreviewAiSelectionStreamReadOptions = {},
  ) => {
    const patchTarget = requestSelection.patchTarget;
    const sourceSnapshot = requestSelection.sourceSnapshot;
    assertPreviewAiSourceSnapshotCurrent(
      getLatestSource(),
      sourceSnapshot,
      t.previewAiSelectionChanged,
    );
    if (action === 'modify' && !patchTarget) {
      throw new Error(t.previewAiSelectionChanged);
    }
    const requestSourceRange = requestSelection.sourceRange;
    if (action === 'modify' && !requestSourceRange) {
      throw new Error(t.previewAiSelectionChanged);
    }
    const contextLineRange = requestSelection.contextLineRange ?? (
      patchTarget
        ? {
            startLine: patchTarget.sourceRange.startLine,
            endLine: patchTarget.sourceRange.endLine,
          }
        : undefined
    );
    const sourceRangeBody = patchTarget
      ? {
          start: patchTarget.sourceRange.start,
          end: patchTarget.sourceRange.end,
          startLine: patchTarget.sourceRange.startLine,
          endLine: patchTarget.sourceRange.endLine,
        }
      : undefined;
    if (deliveryRequestContext?.enableOssAiProvider) {
      const resultText = await requestPreviewOssAiSelection({
        action,
        changedMessage: t.previewAiSelectionChanged,
        followUp,
        getLatestSource,
        patchRange: action === 'modify' && patchTarget
          ? { start: patchTarget.sourceRange.start, end: patchTarget.sourceRange.end }
          : undefined,
        range: requestSourceRange
          ? { start: requestSourceRange.start, end: requestSourceRange.end }
          : undefined,
        requestInstruction,
        signal,
        sourceKind: requestSelection.sourceKind,
        sourceSnapshot,
        visibleText: requestSelection.visibleText,
      });
      onPartialResult(resultText);
      return {
        action,
        instruction: requestInstruction,
        patch: action === 'modify'
          ? {
              replacement: resultText,
            }
          : undefined,
        resultText,
        usesThinking: previewAiSelectionUsesThinking(requestSelection),
      };
    }

    const gateway = await loadPrivatePreviewAiSelectionGateway();
    if (!gateway) {
      throw new Error(t.previewAiRequestDenied(403));
    }
    const { requestPrivatePreviewAiSelection } = gateway;
    const response = await requestPrivatePreviewAiSelection({
      isDevMode: deliveryRequestContext?.isDevMode,
      signal,
      body: {
        action,
        contentKind: requestSelection.contentKind,
        image: requestSelection.image,
        instruction: requestInstruction || undefined,
        visibleText: requestSelection.visibleText,
        selectedText: patchTarget?.selectedText ?? requestSelection.visibleText,
        ...(requestSelection.selectionScope ? { selectionScope: requestSelection.selectionScope } : {}),
        ...(patchTarget
          ? {
              patchTarget: {
                kind: patchTarget.kind,
                selectedText: patchTarget.selectedText,
                sourceRange: sourceRangeBody,
              },
              selectionRange: {
                start: patchTarget.sourceRange.start,
                end: patchTarget.sourceRange.end,
              },
            }
          : {}),
        source: sourceSnapshot,
        ...(requestSelection.contextRange
          ? {
              contextRange: {
                start: requestSelection.contextRange.start,
                end: requestSelection.contextRange.end,
              },
            }
          : {}),
        ...(contextLineRange ? { contextLineRange, sourceLineRange: contextLineRange } : {}),
        sourceVersion: requestSelection.sourceVersion,
        ...(followUp
          ? {
              followUpInstruction: followUp.followUpInstruction,
              previousResultText: followUp.previousResultText,
            }
          : {}),
        ...(deliveryRequestContext?.isDevMode ? { scenarioId: deliveryRequestContext.scenarioId } : {}),
      },
    });
    if (!response.ok) {
      let body: PreviewAiSelectionApiResponse = {};
      try {
        body = await response.json() as PreviewAiSelectionApiResponse;
      } catch {
        body = { message: response.statusText };
      }
      throw new Error(getProductizedAiErrorMessage(
        body,
        t.previewAiRequestDenied(response.status),
        response.status,
        t,
      ));
    }

    const responseContentType = response.headers.get('content-type') ?? '';
    if (responseContentType.includes('text/event-stream')) {
      const streamed = await readPreviewAiSelectionStream(response, (partial) => {
        assertPreviewAiSourceSnapshotCurrent(
          getLatestSource(),
          sourceSnapshot,
          t.previewAiSelectionChanged,
        );
        onPartialResult(partial);
      }, t, streamOptions);
      assertPreviewAiSourceSnapshotCurrent(
        getLatestSource(),
        sourceSnapshot,
        t.previewAiSelectionChanged,
      );
      const resultText = streamed.resultText.trim();
      if (!resultText) throw new Error(t.previewAiEmptyResponse);
      const patchReplacement = typeof streamed.patchReplacement === 'string' && streamed.patchReplacement.trim()
        ? streamed.patchReplacement
        : resultText;
      return {
        action,
        instruction: requestInstruction,
        patch: action === 'modify'
          ? {
              replacement: patchReplacement,
            }
          : undefined,
        resultText,
        usesThinking: previewAiSelectionUsesThinking(requestSelection),
      };
    }

    let body: PreviewAiSelectionApiResponse = {};
    try {
      body = await response.json() as PreviewAiSelectionApiResponse;
    } catch {
      body = { message: response.statusText };
    }
    const resultText = typeof body.resultText === 'string' ? body.resultText.trim() : '';
    assertPreviewAiSourceSnapshotCurrent(
      getLatestSource(),
      sourceSnapshot,
      t.previewAiSelectionChanged,
    );
    if (!resultText) throw new Error(t.previewAiEmptyResponse);
    return {
      action,
      instruction: requestInstruction,
      resultText,
      patch: action === 'modify'
        ? {
            replacement: readPatchReplacement(body) ?? resultText,
          }
        : undefined,
      usesThinking: previewAiSelectionUsesThinking(requestSelection),
    };
  };

  const runAction = async (
    action: PreviewAiSelectionTextAction,
    actionInstruction = instruction,
    options: { followUp?: PreviewAiSelectionFollowUpPayload } = {},
  ) => {
    if (disableTextActions || !visibleSelection || busyAction) return;
    if (action === 'modify' && !visibleSelection.patchTarget) return;
    const requestSelection = visibleSelection;
    const requestInstruction = actionInstruction.trim();
    const isFollowUp = Boolean(options.followUp);
    const actionUsesThinking = previewAiSelectionUsesThinking(requestSelection);
    requestAbortRef.current?.abort();
    const abortController = new AbortController();
    requestAbortRef.current = abortController;
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    let pendingPartialText = '';
    let partialFrameId: number | null = null;
    const flushPartialResult = () => {
      partialFrameId = null;
      if (abortController.signal.aborted || requestIdRef.current !== requestId) return;
      setResult({
        action,
        instruction: requestInstruction,
        patch: action === 'modify'
          ? {
              replacement: pendingPartialText,
            }
          : undefined,
        resultText: pendingPartialText,
        usesThinking: actionUsesThinking,
      });
    };
    setPinnedSelection(requestSelection);
    setBusyAction(action);
    setError(null);
    setFollowUpError(null);
    setThinkingText('');
    setProgressText('');
    setThoughtSummary('');
    setThinkingOpen(actionUsesThinking);
    resetStreamDisplay(actionUsesThinking ? 'thinking' : 'complete');
    thinkingUserToggledRef.current = false;
    thinkingResultAutoCollapsedRef.current = false;
    resetThinkingAutoCollapse();
    if (!isFollowUp) {
      setResult(null);
      setFollowUpOpen(false);
      setFollowUpText('');
    }
    setDraftAction(null);
    try {
      const nextResult = await postAiSelectionRequest(
        action,
        requestSelection,
        requestInstruction,
        abortController.signal,
        (partialResultText) => {
          if (abortController.signal.aborted || requestIdRef.current !== requestId) return;
          if (partialResultText && actionUsesThinking) {
            transitionToGenerating();
            thinkingResultStartedRef.current = true;
          }
          pendingPartialText = partialResultText;
          if (partialFrameId !== null) return;
          partialFrameId = window.requestAnimationFrame(flushPartialResult);
        },
        options.followUp,
        {
          onProgressDelta: (delta) => {
            if (abortController.signal.aborted || requestIdRef.current !== requestId) return;
            if (!actionUsesThinking) return;
            setProgressText((current) => `${current}${delta}`);
          },
          onThinkingDelta: (delta) => {
            if (abortController.signal.aborted || requestIdRef.current !== requestId) return;
            if (!actionUsesThinking) return;
            if (streamDisplayPhaseRef.current !== 'thinking') return;
            rawThinkingTextRef.current += delta;
            setThinkingText((current) => `${current}${delta}`);
          },
          onThoughtSummary: (summary) => {
            if (abortController.signal.aborted || requestIdRef.current !== requestId) return;
            if (!actionUsesThinking) return;
            setThoughtSummary(summary);
          },
        },
      );
      if (abortController.signal.aborted || requestIdRef.current !== requestId) return;
      if (getCopyableResultText(nextResult) && actionUsesThinking) {
        transitionToGenerating();
        thinkingResultStartedRef.current = true;
      }
      setResult(nextResult);
      setStreamDisplayPhase('complete');
      setFollowUpOpen(false);
      setFollowUpText('');
      setDraftAction(null);
      setInstruction('');
      if (action !== 'modify') {
        setScopedDeliveryNotice({ tone: 'success', text: t.previewAiResultReady });
      }
    } catch (requestError) {
      if (abortController.signal.aborted || requestIdRef.current !== requestId) return;
      const message = requestError instanceof Error ? requestError.message : t.previewAiRequestFailed;
      if (isFollowUp) {
        setFollowUpError(message);
        setFollowUpOpen(true);
      } else {
        setResult(null);
      }
      setError(message);
      setScopedDeliveryNotice({ tone: 'error', text: message });
    } finally {
      if (partialFrameId !== null) {
        window.cancelAnimationFrame(partialFrameId);
      }
      if (requestIdRef.current === requestId) {
        requestAbortRef.current = null;
        setBusyAction(null);
      }
    }
  };

  const selectAction = (action: PreviewAiSelectionTextAction) => {
    if (disableTextActions || !visibleSelection) return;
    if (action === 'modify' && !visibleSelection.patchTarget) return;
    setPinnedSelection(visibleSelection);
    clearPreviewNativeSelection();
    setDraftAction(action);
    setInstruction('');
    setResult(null);
    setError(null);
    setFollowUpOpen(false);
    setFollowUpText('');
    setFollowUpError(null);
    setThinkingText('');
    setProgressText('');
    setThoughtSummary('');
    setThinkingOpen(false);
    resetStreamDisplay();
    thinkingUserToggledRef.current = false;
    thinkingResultAutoCollapsedRef.current = false;
    resetThinkingAutoCollapse();
  };

  const copyResult = async () => {
    if (!result) return;
    const copyText = getCopyableResultText(result);
    if (!copyText) return;
    try {
      await copyPlainText(copyText);
      setScopedDeliveryNotice({ tone: 'success', text: t.copied });
    } catch {
      setScopedDeliveryNotice({ tone: 'error', text: t.copyFailed });
    }
  };

  const applyResult = () => {
    const replacement = result?.patch?.replacement;
    if (!replacement || !visibleSelection.patchTarget) return;
    setPinnedSelection(visibleSelection);
    const applied = applyReplacement(visibleSelection, replacement);
    if (applied.ok === false) {
      const message = applied.reason === 'empty-replacement'
        ? t.previewAiEmptyResponse
        : applied.reason === 'no-change'
          ? t.previewAiNoChange
          : t.previewAiSelectionChanged;
      setError(message);
      setScopedDeliveryNotice({ tone: 'error', text: message });
      return;
    }
    setScopedDeliveryNotice(null);
    showAppliedNotice();
    setResult(null);
    setError(null);
    setFollowUpOpen(false);
    setFollowUpText('');
    setFollowUpError(null);
    setThinkingText('');
    setProgressText('');
    setThoughtSummary('');
    setThinkingOpen(false);
    resetStreamDisplay();
    thinkingUserToggledRef.current = false;
    thinkingResultAutoCollapsedRef.current = false;
    resetThinkingAutoCollapse();
    window.requestAnimationFrame(() => restoreSelectionFocus(visibleSelection));
  };

  const submitFollowUp = (instructionOverride?: string) => {
    if (!result || !visibleSelection || busyAction) return;
    if (result.action === 'repair') return;
    const followUpInstruction = (instructionOverride ?? followUpText).trim();
    if (followUpInstruction.length < AI_INSTRUCTION_MIN_TEXT) {
      setFollowUpError(t.previewAiFollowUpEmpty);
      setScopedDeliveryNotice({ tone: 'error', text: t.previewAiFollowUpEmpty });
      return;
    }
    if (followUpInstruction.length > AI_INSTRUCTION_MAX_TEXT) {
      setFollowUpError(t.previewAiSlashInstructionTooLong);
      setScopedDeliveryNotice({ tone: 'error', text: t.previewAiSlashInstructionTooLong });
      return;
    }
    const previousResultText = getCopyableResultText(result).trim();
    if (!previousResultText) {
      setFollowUpError(t.previewAiEmptyResponse);
      setScopedDeliveryNotice({ tone: 'error', text: t.previewAiEmptyResponse });
      return;
    }
    if (result.action === 'modify' && !visibleSelection.patchTarget) {
      const message = t.previewAiSelectionChanged;
      setFollowUpError(message);
      setScopedDeliveryNotice({ tone: 'error', text: message });
      return;
    }
    void runAction(result.action, result.instruction, {
      followUp: { followUpInstruction, previousResultText },
    });
    setFollowUpOpen(false);
    setFollowUpText('');
    setFollowUpError(null);
  };

  const currentDraftActionLabel = activeDraftAction ? getActionLabel(t, activeDraftAction) : '';
  const canApplyResult = result ? isReplacementResultAction(result.action) : false;
  const resultFollowUpClassName = result?.action === 'summarize' ? 'is-summary' : 'is-modify';
  const canContinueResult = result?.action !== 'repair';

  return (
    <>
      {documentSelectionHighlightStyle ? (
        <div
          aria-hidden="true"
          className="aad-preview-ai-document-selection-highlight"
          data-copy-remove="true"
          style={documentSelectionHighlightStyle}
        />
      ) : null}
      {inlineSelectionHighlightStyles.map((highlightStyle, index) => (
        <div
          aria-hidden="true"
          className="aad-preview-ai-inline-selection-highlight"
          data-copy-remove="true"
          key={`inline-selection-${index}`}
          style={highlightStyle}
        />
      ))}
      <div
        ref={toolbarRef}
        className={[
          'aad-preview-ai-selection',
          isAppliedToast ? 'is-applied-toast' : '',
          isDocumentFullReplacementSelection && !isAppliedToast ? 'is-document-full-selection' : '',
        ].filter(Boolean).join(' ')}
        style={style}
        role={isAppliedToast ? 'status' : 'dialog'}
        aria-label={isAppliedToast ? t.previewAiApplied : t.previewAiSelectionToolbar}
        onPointerDown={(event) => {
          const target = event.target instanceof HTMLElement ? event.target : null;
          if (!target?.closest('input, textarea')) event.preventDefault();
          event.stopPropagation();
        }}
        onMouseDown={(event) => {
          const target = event.target instanceof HTMLElement ? event.target : null;
          if (!target?.closest('input, textarea')) event.preventDefault();
          event.stopPropagation();
        }}
      >
        {isAppliedToast && appliedReplacement ? (
          <PreviewAiAppliedNotice
            onDismiss={dismissAppliedNotice}
            onUndo={undoApply}
            t={t}
          />
        ) : (
          <>
            {finalRepairDiagnostic ? (
              <div className="aad-preview-ai-selection-actions" role="toolbar" aria-label={t.fix}>
                <button
                  type="button"
                  className="aad-preview-ai-selection-action"
                  disabled={Boolean(busyAction) || isFinalAiFixBusy}
                  title={t.fix}
                  onClick={() => void handleFinalRepairClick()}
                >
                  {busyAction === 'repair' || isFinalAiFixBusy ? (
                    <Loader2 size={15} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Wrench size={15} aria-hidden="true" />
                  )}
                  <span>{t.fix}</span>
                </button>
              </div>
            ) : (
              <>
                <div className="aad-preview-ai-selection-actions" role="toolbar" aria-label={t.previewAiSelectionToolbar}>
                  {ACTIONS.map(({ action, Icon, label }) => {
                    const modifyUnavailable = action === 'modify' && !visibleSelection?.patchTarget;
                    return (
                      <button
                        key={action}
                        type="button"
                        className={[
                          'aad-preview-ai-selection-action',
                          activeDraftAction === action ? 'is-active' : '',
                        ].filter(Boolean).join(' ')}
                        disabled={Boolean(busyAction) || modifyUnavailable}
                        title={modifyUnavailable ? t.previewEditUnavailable : label(t)}
                        onClick={() => selectAction(action)}
                      >
                        <Icon size={15} aria-hidden="true" />
                        <span>{label(t)}</span>
                      </button>
                    );
                  })}
                </div>
                {activeDraftAction ? (
                  <form
                    className="aad-preview-ai-selection-instruction"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void runAction(activeDraftAction);
                    }}
                  >
                    <div className="aad-preview-ai-selection-instruction-row">
                      <textarea
                        id="aad-preview-ai-selection-instruction-input"
                        ref={instructionInputRef}
                        className="aad-preview-ai-selection-instruction-input"
                        value={instruction}
                        disabled={Boolean(busyAction)}
                        aria-label={t.previewAiInstructionLabel(currentDraftActionLabel)}
                        placeholder={t.previewAiInstructionPlaceholder(currentDraftActionLabel)}
                        onChange={(event) => setInstruction(event.currentTarget.value)}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' || (!event.metaKey && !event.ctrlKey) || busyAction) return;
                          event.preventDefault();
                          event.currentTarget.form?.requestSubmit();
                        }}
                      />
                    </div>
                    <div className="aad-preview-ai-selection-instruction-actions">
                      <button
                        type="submit"
                        className="aad-preview-ai-selection-result-button is-primary"
                        disabled={Boolean(busyAction)}
                      >
                        <Check size={15} aria-hidden="true" />
                        <span>{t.previewAiGenerateAction(currentDraftActionLabel)}</span>
                      </button>
                    </div>
                  </form>
                ) : null}
              </>
            )}
            {error ? (
              <div className="aad-preview-ai-selection-error" role="alert">{error}</div>
            ) : null}
            {streamMetaVisible ? (
              <div className="aad-preview-ai-selection-thinking">
                <button
                  type="button"
                  className="aad-preview-ai-selection-thinking-title"
                  aria-expanded={thinkingOpen}
                  onClick={toggleThinkingOpen}
                >
                  <span className="aad-preview-ai-selection-thinking-title-text">
                    <span>{busyAction && isThinkingPhase ? t.previewAiSlashThoughtLabel : t.previewAiSlashThinkingReady}</span>
                  </span>
                  <span className="aad-preview-ai-selection-thinking-toggle" aria-hidden="true">
                    {thinkingOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </span>
                </button>
                {thinkingOpen ? (
                  <div ref={thinkingContentRef} className="aad-preview-ai-selection-thinking-content">
                    {thoughtSummary ? (
                      <div className="aad-preview-ai-selection-thinking-section">
                        <div className="aad-preview-ai-selection-thinking-section-title">{t.previewAiSlashThoughtSummaryLabel}</div>
                        <div>{thoughtSummary}</div>
                      </div>
                    ) : null}
                    {thinkingContent ? (
                      <div className="aad-preview-ai-selection-thinking-section">
                        {busyAction && isThinkingPhase ? (
                          <div className="aad-preview-ai-selection-thinking-title-text">
                            <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                            <span>{thinkingContent}</span>
                          </div>
                        ) : (
                          <div>{thinkingContent}</div>
                        )}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
            {result ? (
              <div className="aad-preview-ai-selection-result">
                {canApplyResult ? (
                  <div className="aad-preview-ai-selection-change-pane">
                    <PreviewAiMarkdownResult
                      artifactRenderMode={busyAction ? 'source-only' : 'render'}
                      markdown={result.patch?.replacement ?? result.resultText}
                      renderDeliveryAccess={renderDeliveryAccess}
                      streaming={Boolean(busyAction)}
                      t={t}
                    />
                  </div>
                ) : (
                  <PreviewAiMarkdownResult
                    artifactRenderMode={busyAction ? 'source-only' : 'render'}
                    markdown={result.resultText}
                    renderDeliveryAccess={renderDeliveryAccess}
                    streaming={Boolean(busyAction)}
                    t={t}
                  />
                )}
                {canApplyResult || followUpOpen || followUpError ? (
                  <div className={`aad-preview-ai-follow-up ${resultFollowUpClassName}`.trim()}>
                    {canApplyResult ? (
                      <>
                        <div className="aad-preview-ai-follow-up-hint">{t.previewAiCandidateNotApplied}</div>
                        {isMornDraftHtmlSourceCandidate(result.patch?.replacement ?? result.resultText) ? (
                          <div className="aad-preview-ai-follow-up-hint">{t.previewAiMornDraftHtmlFallbackNotice}</div>
                        ) : null}
                      </>
                    ) : null}
                    {followUpOpen && result.action !== 'repair' ? (
                      <form
                        className="aad-preview-ai-follow-up-shell"
                        onSubmit={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                      >
                        <AiImeSafeTextArea
                          value={followUpText}
                          disabled={Boolean(busyAction)}
                          placeholder={getFollowUpPlaceholder(t, result.action)}
                          ariaLabel={t.previewAiContinueFollowUp}
                          onValueChange={(value) => {
                            setFollowUpText(value);
                            setFollowUpError(null);
                          }}
                          onSubmit={submitFollowUp}
                          submitClassName="aad-preview-ai-selection-result-button is-primary"
                          submitContent={(
                            <>
                              {busyAction === result.action ? (
                                <Loader2 size={15} className="animate-spin" aria-hidden="true" />
                              ) : (
                                <Send size={15} aria-hidden="true" />
                              )}
                              <span>{t.previewAiFollowUpSend}</span>
                            </>
                          )}
                        />
                      </form>
                    ) : null}
                    {followUpError ? (
                      <div className="aad-preview-ai-follow-up-error" role="alert">{followUpError}</div>
                    ) : null}
                  </div>
                ) : null}
                <div className="aad-preview-ai-selection-result-actions">
                  {canApplyResult ? (
                    <button
                      type="button"
                      className="aad-preview-ai-selection-result-button"
                      disabled={Boolean(busyAction)}
                      onClick={applyResult}
                    >
                      <Check size={15} aria-hidden="true" />
                      <span>{t.previewAiApply}</span>
                    </button>
                  ) : null}
                  {canContinueResult ? (
                    <button
                      type="button"
                      className="aad-preview-ai-selection-result-button"
                      disabled={Boolean(busyAction)}
                      onClick={() => {
                        setFollowUpOpen((open) => !open);
                        setFollowUpError(null);
                      }}
                    >
                      <MessageCirclePlus size={15} aria-hidden="true" />
                      <span>{t.previewAiContinueFollowUp}</span>
                    </button>
                  ) : null}
                  <button type="button" className="aad-preview-ai-selection-result-button" onClick={() => void copyResult()}>
                    <Copy size={15} aria-hidden="true" />
                    <span>{t.previewAiCopyResult}</span>
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </>
  );
};
