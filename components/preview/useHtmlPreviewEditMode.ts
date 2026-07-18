import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { debugHtmlPreview } from './htmlPreviewDebug';
import {
  buildTrustedHtmlEditSrcDoc,
  createTrustedHtmlEditRequestId,
  isTrustedHtmlEditRequest,
} from './trustedHtmlEditDocument';

type EditPointer = { x: number; y: number };
type ScrollSnapshot = { left: number; target: HTMLElement | Window; top: number };

export type HtmlPreviewEditCommitStrategy = 'cached-first' | 'iframe-snapshot-first';

export type HtmlPreviewEditCommitMeta = {
  commitSource?: 'cached-fallback' | 'iframe-snapshot' | 'trusted-editor-snapshot';
  markerCount?: number;
  pathValues?: Record<string, string>;
  requestId?: string;
};

const EDIT_PATH_ATTRIBUTE = 'data-morndraft-edit-path';

const isScrollableElement = (element: HTMLElement) => {
  const style = window.getComputedStyle(element);
  const overflow = `${style.overflow} ${style.overflowX} ${style.overflowY}`;
  return /(auto|scroll)/.test(overflow) &&
    (element.scrollHeight > element.clientHeight ||
      element.scrollWidth > element.clientWidth ||
      element.scrollTop !== 0 ||
      element.scrollLeft !== 0);
};

const captureHtmlEditScrollRestore = (iframe: HTMLIFrameElement | null) => {
  if (!iframe || typeof window === 'undefined') return null;
  const snapshots: ScrollSnapshot[] = [];
  const seen = new Set<HTMLElement | Window>();
  const addTarget = (target: HTMLElement | Window | null) => {
    if (!target || seen.has(target)) return;
    seen.add(target);
    snapshots.push({
      left: target instanceof Window ? target.scrollX : target.scrollLeft,
      target,
      top: target instanceof Window ? target.scrollY : target.scrollTop,
    });
  };
  addTarget(window);
  addTarget(iframe.closest<HTMLElement>('.aad-preview-scroll'));
  let ancestor = iframe.parentElement;
  while (ancestor && ancestor !== document.body) {
    if (isScrollableElement(ancestor)) addTarget(ancestor);
    ancestor = ancestor.parentElement;
  }
  const restore = () => snapshots.forEach((snapshot) => {
    if (snapshot.target instanceof Window) snapshot.target.scrollTo(snapshot.left, snapshot.top);
    else {
      snapshot.target.scrollLeft = snapshot.left;
      snapshot.target.scrollTop = snapshot.top;
    }
  });
  return () => {
    restore();
    window.requestAnimationFrame(restore);
    window.setTimeout(restore, 0);
  };
};

const resolveIframePoint = (
  event: ReactPointerEvent<HTMLElement> | ReactMouseEvent<HTMLElement>,
  iframe: HTMLIFrameElement | null,
): EditPointer | null => {
  const targetRect = event.currentTarget.getBoundingClientRect();
  const iframeRect = iframe?.getBoundingClientRect() ?? targetRect;
  if (iframeRect.width <= 0 || iframeRect.height <= 0) return null;
  const naturalWidth = iframe?.offsetWidth || iframeRect.width;
  const naturalHeight = iframe?.offsetHeight || iframeRect.height;
  return {
    x: Math.max(0, (event.clientX - iframeRect.left) * (naturalWidth / iframeRect.width)),
    y: Math.max(0, (event.clientY - iframeRect.top) * (naturalHeight / iframeRect.height)),
  };
};

const cleanupEditableState = (root: ParentNode) => {
  root.querySelectorAll<HTMLElement>('[contenteditable], .morndraft-editing, [spellcheck]').forEach((element) => {
    element.removeAttribute('contenteditable');
    element.removeAttribute('spellcheck');
    element.classList.remove('morndraft-editing');
    if (element.getAttribute('class') === '') element.removeAttribute('class');
  });
};

const removeTrustedEditInjectedNodes = (root: ParentNode) => {
  root.querySelectorAll('[data-morndraft-inject], [data-morndraft-trusted-edit-csp]').forEach(element => element.remove());
};

const serializeDoctype = (doctype: DocumentType | null) => {
  if (!doctype) return '';
  let value = `<!DOCTYPE ${doctype.name}`;
  if (doctype.publicId) value += ` PUBLIC "${doctype.publicId}"`;
  if (doctype.systemId) value += `${doctype.publicId ? ' "' : ' SYSTEM "'}${doctype.systemId}"`;
  return `${value}>`;
};

const extractTrustedEditedHtml = (doc: Document) => {
  const fragment = doc.querySelector<HTMLElement>('[data-morndraft-fragment] .morndraft-html-fragment-content');
  if (fragment) {
    const clone = fragment.cloneNode(true) as HTMLElement;
    cleanupEditableState(clone);
    removeTrustedEditInjectedNodes(clone);
    return clone.innerHTML.trim();
  }
  const clone = doc.documentElement.cloneNode(true) as HTMLElement;
  cleanupEditableState(clone);
  removeTrustedEditInjectedNodes(clone);
  return `${serializeDoctype(doc.doctype)}${clone.outerHTML}`;
};

const collectTrustedEditPathValues = (doc: Document) => {
  const values: Record<string, string> = {};
  doc.querySelectorAll<HTMLElement>(`[${EDIT_PATH_ATTRIBUTE}]`).forEach((element) => {
    const path = element.getAttribute(EDIT_PATH_ATTRIBUTE);
    if (path) values[path] = element.textContent ?? '';
  });
  return values;
};

const placeCaretAtPoint = (doc: Document, point: EditPointer | null) => {
  if (!point) return;
  const legacyDoc = doc as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null };
  let range = legacyDoc.caretRangeFromPoint?.(point.x, point.y) ?? null;
  if (!range && doc.caretPositionFromPoint) {
    const position = doc.caretPositionFromPoint(point.x, point.y);
    if (position) {
      range = doc.createRange();
      range.setStart(position.offsetNode, position.offset);
      range.collapse(true);
    }
  }
  const selection = doc.getSelection();
  if (!range || !selection) return;
  selection.removeAllRanges();
  selection.addRange(range);
};

export function useHtmlPreviewEditMode({
  canEdit = false,
  editCommitStrategy = 'cached-first',
  editIframeRef,
  frameId,
  isIframeReady,
  liveIframeRef,
  onEditCancel,
  onEditCommit,
  onEditDraft,
  onEditStart,
  sourceCode,
  isEditing,
  wrappedCode,
}: {
  canEdit?: boolean;
  editCommitStrategy?: HtmlPreviewEditCommitStrategy;
  editIframeRef: RefObject<HTMLIFrameElement | null>;
  frameId: string;
  isIframeReady: boolean;
  liveIframeRef: RefObject<HTMLIFrameElement | null>;
  onEditStart?: () => void;
  sourceCode: string;
  isEditing: boolean;
  onEditCommit?: (newCode: string, meta?: HtmlPreviewEditCommitMeta) => void;
  onEditCancel?: () => void;
  onEditDraft?: (newCode: string) => void;
  wrappedCode: string;
}) {
  const callbacksRef = useRef({ onEditCancel, onEditCommit, onEditDraft });
  callbacksRef.current = { onEditCancel, onEditCommit, onEditDraft };
  const sourceCodeRef = useRef(sourceCode);
  sourceCodeRef.current = sourceCode;
  const [frozenWrappedCode, setFrozenWrappedCode] = useState<string | null>(null);
  const [isEditableReady, setIsEditableReady] = useState(false);
  const activeRequestIdRef = useRef<string | null>(null);
  const requestSequenceRef = useRef(0);
  const pendingEditPointerRef = useRef<EditPointer | null>(null);
  const pendingScrollRestoreRef = useRef<(() => void) | null>(null);
  const trustedDocumentRef = useRef<Document | null>(null);
  const trustedDocumentCleanupRef = useRef<(() => void) | null>(null);
  const latestDraftHtmlRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  const didFinishRef = useRef(false);
  const previousEditingRef = useRef(false);
  const trustedEditSrcDoc = useMemo(
    () => isEditing ? buildTrustedHtmlEditSrcDoc(frozenWrappedCode ?? wrappedCode) : null,
    [frozenWrappedCode, isEditing, wrappedCode],
  );

  const cleanupTrustedDocument = useCallback(() => {
    trustedDocumentCleanupRef.current?.();
    trustedDocumentCleanupRef.current = null;
    trustedDocumentRef.current = null;
    setIsEditableReady(false);
  }, []);

  const cancelEditSession = useCallback(() => {
    if (didFinishRef.current || !activeRequestIdRef.current) return false;
    didFinishRef.current = true;
    activeRequestIdRef.current = null;
    cleanupTrustedDocument();
    callbacksRef.current.onEditCancel?.();
    return true;
  }, [cleanupTrustedDocument]);

  const commitTrustedSnapshot = useCallback((candidateRequestId: string | null) => {
    const activeRequestId = activeRequestIdRef.current;
    if (
      didFinishRef.current ||
      !isTrustedHtmlEditRequest(activeRequestId, candidateRequestId)
    ) {
      debugHtmlPreview('trusted-edit-commit-rejected', { activeRequestId, candidateRequestId, frameId });
      return false;
    }
    const doc = trustedDocumentRef.current;
    if (!doc || !dirtyRef.current) return cancelEditSession();
    const freshHtml = extractTrustedEditedHtml(doc);
    const html = editCommitStrategy === 'cached-first'
      ? latestDraftHtmlRef.current ?? freshHtml
      : freshHtml || latestDraftHtmlRef.current || sourceCodeRef.current;
    const pathValues = collectTrustedEditPathValues(doc);
    didFinishRef.current = true;
    activeRequestIdRef.current = null;
    cleanupTrustedDocument();
    callbacksRef.current.onEditCommit?.(html, {
      commitSource: 'trusted-editor-snapshot',
      markerCount: Object.keys(pathValues).length,
      pathValues,
      requestId: candidateRequestId ?? undefined,
    });
    return true;
  }, [cancelEditSession, cleanupTrustedDocument, editCommitStrategy, frameId]);

  const handleFinishEditing = useCallback(() => {
    if (!isEditing || didFinishRef.current) return;
    commitTrustedSnapshot(activeRequestIdRef.current);
  }, [commitTrustedSnapshot, isEditing]);

  const handleTrustedEditIframeLoad = useCallback(() => {
    cleanupTrustedDocument();
    const iframe = editIframeRef.current;
    const doc = iframe?.contentDocument ?? null;
    if (!doc || !isEditing) return false;
    const activeRequestId = activeRequestIdRef.current ?? createTrustedHtmlEditRequestId(frameId, ++requestSequenceRef.current);
    activeRequestIdRef.current = activeRequestId;

    const targets = [...doc.querySelectorAll<HTMLElement>(`[${EDIT_PATH_ATTRIBUTE}]`)];
    const editableTargets = targets.length ? targets : (doc.body ? [doc.body] : []);
    if (!editableTargets.length) return false;
    editableTargets.forEach((element) => {
      element.setAttribute('contenteditable', targets.length ? 'plaintext-only' : 'true');
      element.setAttribute('spellcheck', 'false');
      element.classList.add('morndraft-editing');
    });

    const publishDraft = () => {
      if (!isTrustedHtmlEditRequest(activeRequestIdRef.current, activeRequestId)) return;
      dirtyRef.current = true;
      const html = extractTrustedEditedHtml(doc);
      latestDraftHtmlRef.current = html;
      callbacksRef.current.onEditDraft?.(html);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelEditSession();
      } else if (targets.length && event.key === 'Enter') {
        event.preventDefault();
      }
    };
    const handlePaste = (event: ClipboardEvent) => {
      if (!targets.length) return;
      event.preventDefault();
      doc.execCommand('insertText', false, event.clipboardData?.getData('text/plain') ?? '');
      publishDraft();
    };
    doc.addEventListener('input', publishDraft, true);
    doc.addEventListener('beforeinput', publishDraft, true);
    doc.addEventListener('cut', publishDraft, true);
    doc.addEventListener('drop', publishDraft, true);
    doc.addEventListener('paste', handlePaste, true);
    doc.addEventListener('keydown', handleKeyDown, true);
    trustedDocumentCleanupRef.current = () => {
      doc.removeEventListener('input', publishDraft, true);
      doc.removeEventListener('beforeinput', publishDraft, true);
      doc.removeEventListener('cut', publishDraft, true);
      doc.removeEventListener('drop', publishDraft, true);
      doc.removeEventListener('paste', handlePaste, true);
      doc.removeEventListener('keydown', handleKeyDown, true);
    };
    trustedDocumentRef.current = doc;
    setIsEditableReady(true);
    const target = pendingEditPointerRef.current && doc.elementFromPoint
      ? doc.elementFromPoint(pendingEditPointerRef.current.x, pendingEditPointerRef.current.y)?.closest<HTMLElement>(`[${EDIT_PATH_ATTRIBUTE}]`) ?? editableTargets[0]
      : editableTargets[0];
    target?.focus({ preventScroll: true });
    placeCaretAtPoint(doc, pendingEditPointerRef.current);
    pendingEditPointerRef.current = null;
    pendingScrollRestoreRef.current?.();
    pendingScrollRestoreRef.current = null;
    return true;
  }, [cancelEditSession, cleanupTrustedDocument, editIframeRef, frameId, isEditing]);

  const handleLiveIframePointerDown = useCallback((event: ReactPointerEvent<HTMLElement> | ReactMouseEvent<HTMLElement>) => {
    if (!canEdit || isEditing || !isIframeReady || event.button !== 0 || activeRequestIdRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    pendingEditPointerRef.current = resolveIframePoint(event, liveIframeRef.current);
    pendingScrollRestoreRef.current = captureHtmlEditScrollRestore(liveIframeRef.current);
    activeRequestIdRef.current = createTrustedHtmlEditRequestId(frameId, ++requestSequenceRef.current);
    didFinishRef.current = false;
    dirtyRef.current = false;
    latestDraftHtmlRef.current = null;
    setFrozenWrappedCode(wrappedCode);
    onEditStart?.();
  }, [canEdit, frameId, isEditing, isIframeReady, liveIframeRef, onEditStart, wrappedCode]);

  useEffect(() => {
    const wasEditing = previousEditingRef.current;
    previousEditingRef.current = isEditing;
    if (isEditing && !wasEditing && !activeRequestIdRef.current) {
      activeRequestIdRef.current = createTrustedHtmlEditRequestId(frameId, ++requestSequenceRef.current);
      didFinishRef.current = false;
      dirtyRef.current = false;
      latestDraftHtmlRef.current = null;
      setFrozenWrappedCode(wrappedCode);
    }
    if (!isEditing && wasEditing) {
      if (!didFinishRef.current) commitTrustedSnapshot(activeRequestIdRef.current);
      cleanupTrustedDocument();
      activeRequestIdRef.current = null;
      pendingEditPointerRef.current = null;
      pendingScrollRestoreRef.current = null;
      latestDraftHtmlRef.current = null;
      dirtyRef.current = false;
      setFrozenWrappedCode(null);
    }
  }, [cleanupTrustedDocument, commitTrustedSnapshot, frameId, isEditing, wrappedCode]);

  useEffect(() => () => {
    if (previousEditingRef.current && !didFinishRef.current) {
      commitTrustedSnapshot(activeRequestIdRef.current);
    }
    trustedDocumentCleanupRef.current?.();
  }, [commitTrustedSnapshot]);

  return {
    effectiveWrappedCode: wrappedCode,
    ensureEditableReady: handleTrustedEditIframeLoad,
    handleFinishEditing,
    handleLiveIframePointerDown,
    handleTrustedEditIframeLoad,
    isEditableReady,
    trustedEditSrcDoc,
  };
}
