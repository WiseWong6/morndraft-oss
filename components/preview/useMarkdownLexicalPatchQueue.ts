import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { PreviewMarkdownEditState } from './previewMarkdownEditingTypes';
import {
  preserveHtmlFenceDocumentOuterWhitespace,
  resolveHtmlFenceOuterWhitespaceSource,
} from './standaloneHtmlFenceEditing';
import {
  ISLAND_TEXT_PATCH_DELAY_MS,
  debugPreviewLexical,
} from './lexical/islandUpdateTags';

export type MarkdownLexicalPatchKind = 'ai' | 'code' | 'image' | 'structure' | 'style' | 'table' | 'text';

type MarkdownLexicalPatchQueueOptions = {
  documentId: string;
  documentSource: string;
  editState: PreviewMarkdownEditState;
};

export const useMarkdownLexicalPatchQueue = ({
  documentId,
  documentSource,
  editState,
}: MarkdownLexicalPatchQueueOptions) => {
  const sourceRef = useRef(documentSource);
  const fullSourceRef = useRef<string | undefined>(documentSource);
  const lastMarkdownRef = useRef(documentSource);
  const patchKindRef = useRef<MarkdownLexicalPatchKind>('text');
  const pendingMarkdownRef = useRef<string | null>(null);
  const pendingPatchTimerRef = useRef<number | null>(null);
  const forceDocumentRefreshRef = useRef(false);
  const whitespaceResetKey = editState.stateResetKey ?? documentId;
  const pendingResetKeyRef = useRef(whitespaceResetKey);
  const transactionIdRef = useRef(0);
  const htmlFenceOuterWhitespaceSourceRef = useRef({
    resetKey: whitespaceResetKey,
    source: resolveHtmlFenceOuterWhitespaceSource(documentSource),
  });

  if (htmlFenceOuterWhitespaceSourceRef.current.resetKey !== whitespaceResetKey) {
    htmlFenceOuterWhitespaceSourceRef.current = {
      resetKey: whitespaceResetKey,
      source: resolveHtmlFenceOuterWhitespaceSource(documentSource),
    };
  } else if (!htmlFenceOuterWhitespaceSourceRef.current.source) {
    htmlFenceOuterWhitespaceSourceRef.current.source = resolveHtmlFenceOuterWhitespaceSource(documentSource);
  }

  const syncCommittedSource = useCallback((nextSource: string) => {
    sourceRef.current = nextSource;
    fullSourceRef.current = nextSource;
    lastMarkdownRef.current = nextSource;
  }, []);

  const clearPendingPatch = useCallback(() => {
    pendingMarkdownRef.current = null;
    patchKindRef.current = 'text';
    if (pendingPatchTimerRef.current !== null) {
      window.clearTimeout(pendingPatchTimerRef.current);
      pendingPatchTimerRef.current = null;
    }
  }, []);

  useLayoutEffect(() => {
    if (pendingResetKeyRef.current === whitespaceResetKey) return;
    pendingResetKeyRef.current = whitespaceResetKey;
    clearPendingPatch();
    forceDocumentRefreshRef.current = false;
    syncCommittedSource(documentSource);
  }, [clearPendingPatch, documentSource, syncCommittedSource, whitespaceResetKey]);

  useEffect(() => {
    sourceRef.current = documentSource;
    fullSourceRef.current = documentSource;
  }, [documentSource]);

  useEffect(
    () => clearPendingPatch,
    [clearPendingPatch],
  );

  const flushPendingPatch = useCallback(
    (commitPhase: 'final' | 'idle' | 'input' | 'structural' = 'idle') => {
      const markdown = pendingMarkdownRef.current;
      if (markdown === null) return;
      pendingMarkdownRef.current = null;
      if (pendingPatchTimerRef.current !== null) {
        window.clearTimeout(pendingPatchTimerRef.current);
        pendingPatchTimerRef.current = null;
      }
      if (markdown === sourceRef.current) return;
      editState.onBeforePatch?.();
      transactionIdRef.current += 1;
      syncCommittedSource(markdown);
      const isStructuralPatch = patchKindRef.current === 'structure';
      const skipActiveBlockRefresh = !isStructuralPatch && (
        patchKindRef.current === 'ai' || patchKindRef.current === 'code'
      );
      const forceDocumentRefresh = forceDocumentRefreshRef.current;
      forceDocumentRefreshRef.current = false;
      debugPreviewLexical('flush-pending-patch', {
        blockId: documentId,
        commitPhase,
        forceDocumentRefresh,
        kind: patchKindRef.current,
        markdownLength: markdown.length,
        skipActiveBlockRefresh,
        transactionId: transactionIdRef.current,
      });
      editState.onPatch(markdown, {
        blockId: documentId,
        commitPhase,
        forceDocumentRefresh: forceDocumentRefresh || undefined,
        kind: patchKindRef.current,
        origin: 'preview-markdown-edit',
        renderScope: 'active-block',
        skipActiveBlockRefresh: skipActiveBlockRefresh || undefined,
        transactionId: transactionIdRef.current,
      });
      patchKindRef.current = 'text';
    },
    [documentId, editState, syncCommittedSource],
  );

  const schedulePatch = useCallback(
    (markdown: string, kind: MarkdownLexicalPatchKind = 'text') => {
      const nextMarkdown = preserveHtmlFenceDocumentOuterWhitespace(
        sourceRef.current,
        markdown,
        htmlFenceOuterWhitespaceSourceRef.current.source,
      );
      if (nextMarkdown === lastMarkdownRef.current) {
        // Undo can restore the committed document before a debounced edit flushes.
        clearPendingPatch();
        return;
      }
      pendingMarkdownRef.current = nextMarkdown;
      patchKindRef.current = kind;
      if (pendingPatchTimerRef.current !== null) window.clearTimeout(pendingPatchTimerRef.current);
      if (kind === 'structure') {
        window.queueMicrotask(() => flushPendingPatch('structural'));
        return;
      }
      pendingPatchTimerRef.current = window.setTimeout(
        () => flushPendingPatch('input'),
        ISLAND_TEXT_PATCH_DELAY_MS,
      );
    },
    [clearPendingPatch, flushPendingPatch],
  );

  const requestForceDocumentRefresh = useCallback(() => {
    forceDocumentRefreshRef.current = true;
  }, []);

  return {
    flushPendingPatch,
    fullSourceRef,
    lastMarkdownRef,
    patchKindRef,
    requestForceDocumentRefresh,
    schedulePatch,
    sourceRef,
    syncCommittedSource,
  };
};
