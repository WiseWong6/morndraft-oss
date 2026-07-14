import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PublicWorkspaceMode } from './types';

export type FinalWorkspaceSnapshot = Readonly<{
  documentKey: string;
  source: string;
}>;

export type PublicWorkspaceDocumentIdentity = Readonly<{
  key: string;
  revision: string | number;
}>;

export type PublicWorkspaceAsyncReplacementToken = Readonly<{
  documentKey: string;
  documentRevision: string | number;
  operationId: number;
  source: string;
}>;

export type UsePublicWorkspaceControllerOptions<SourceMeta = never, FinalMeta = SourceMeta> = {
  source: string;
  settledSource?: string;
  documentKey: string;
  documentRevision: string | number;
  initialMode?: PublicWorkspaceMode;
  mode?: PublicWorkspaceMode;
  onModeChange?(mode: PublicWorkspaceMode): void;
  onCommitSource(next: string, meta?: SourceMeta): void;
  onCommitFinal(next: string, meta?: FinalMeta): void;
};

export const createFinalWorkspaceSnapshot = (
  documentKey: string,
  source: string,
): FinalWorkspaceSnapshot => ({ documentKey, source });

export const resolveFinalWorkspaceSnapshot = (
  current: FinalWorkspaceSnapshot,
  options: {
    code: string;
    debouncedCode: string;
    documentKey: string;
    workspaceMode: PublicWorkspaceMode;
  },
): FinalWorkspaceSnapshot => {
  const { code, debouncedCode, documentKey, workspaceMode } = options;

  // A document identity transition must never render the previous document's
  // settled source under the new document key.
  if (current.documentKey !== documentKey) {
    return createFinalWorkspaceSnapshot(documentKey, code);
  }

  // Inside one document, keep Final stable until the current source settles.
  // Source -> Final transitions explicitly commit the live source in the shell.
  if (workspaceMode !== 'final' || code !== debouncedCode || current.source === code) {
    return current;
  }

  return createFinalWorkspaceSnapshot(documentKey, code);
};

export const isFinalWorkspaceSnapshotCurrent = (
  snapshot: FinalWorkspaceSnapshot,
  documentKey: string,
  source: string,
) => snapshot.documentKey === documentKey && snapshot.source === source;

/**
 * Public-only controller shared by the OSS workspace and the commercial shell.
 * Source remains the only persisted truth; the Final snapshot only prevents a
 * half-settled commercial preview from flashing while Source is debouncing.
 */
export const usePublicWorkspaceController = <SourceMeta, FinalMeta = SourceMeta>({
  source,
  settledSource = source,
  documentKey,
  documentRevision,
  initialMode = 'final',
  mode: controlledMode,
  onModeChange,
  onCommitSource,
  onCommitFinal,
}: UsePublicWorkspaceControllerOptions<SourceMeta, FinalMeta>) => {
  const [uncontrolledMode, setUncontrolledMode] = useState<PublicWorkspaceMode>(initialMode);
  const mode = controlledMode ?? uncontrolledMode;
  const document = useMemo<PublicWorkspaceDocumentIdentity>(() => ({
    key: documentKey,
    revision: documentRevision,
  }), [documentKey, documentRevision]);
  const operationIdRef = useRef(0);
  const currentDocumentRef = useRef({ document, source });
  const [storedFinalWorkspaceSnapshot, setStoredFinalWorkspaceSnapshot] = useState(() => (
    createFinalWorkspaceSnapshot(documentKey, settledSource)
  ));
  const finalWorkspaceSnapshot = useMemo(() => resolveFinalWorkspaceSnapshot(
    storedFinalWorkspaceSnapshot,
    {
      code: source,
      debouncedCode: settledSource,
      documentKey,
      workspaceMode: mode,
    },
  ), [documentKey, mode, settledSource, source, storedFinalWorkspaceSnapshot]);

  const invalidateAsyncReplacements = useCallback(() => {
    operationIdRef.current += 1;
  }, []);

  useLayoutEffect(() => {
    currentDocumentRef.current = { document, source };
    invalidateAsyncReplacements();
  }, [document, invalidateAsyncReplacements, source]);

  useEffect(() => () => invalidateAsyncReplacements(), [invalidateAsyncReplacements]);

  useEffect(() => {
    setStoredFinalWorkspaceSnapshot((current) => (
      isFinalWorkspaceSnapshotCurrent(
        current,
        finalWorkspaceSnapshot.documentKey,
        finalWorkspaceSnapshot.source,
      )
        ? current
        : finalWorkspaceSnapshot
    ));
  }, [finalWorkspaceSnapshot]);

  const setMode = useCallback((next: PublicWorkspaceMode) => {
    if (controlledMode === undefined) setUncontrolledMode(next);
    onModeChange?.(next);
  }, [controlledMode, onModeChange]);

  const commitSource = useCallback((next: string, meta?: SourceMeta) => {
    invalidateAsyncReplacements();
    onCommitSource(next, meta);
  }, [invalidateAsyncReplacements, onCommitSource]);

  const commitFinal = useCallback((next: string, meta?: FinalMeta) => {
    invalidateAsyncReplacements();
    onCommitFinal(next, meta);
  }, [invalidateAsyncReplacements, onCommitFinal]);

  const commitFinalSnapshot = useCallback((next: string) => {
    setStoredFinalWorkspaceSnapshot((current) => (
      isFinalWorkspaceSnapshotCurrent(current, documentKey, next)
        ? current
        : createFinalWorkspaceSnapshot(documentKey, next)
    ));
  }, [documentKey]);

  const beginAsyncReplacement = useCallback((): PublicWorkspaceAsyncReplacementToken => {
    const operationId = operationIdRef.current + 1;
    operationIdRef.current = operationId;
    const current = currentDocumentRef.current;
    return {
      documentKey: current.document.key,
      documentRevision: current.document.revision,
      operationId,
      source: current.source,
    };
  }, []);

  const isAsyncReplacementCurrent = useCallback((token: PublicWorkspaceAsyncReplacementToken) => {
    const current = currentDocumentRef.current;
    return operationIdRef.current === token.operationId &&
      current.document.key === token.documentKey &&
      current.document.revision === token.documentRevision &&
      current.source === token.source;
  }, []);

  const commitAsyncSourceReplacement = useCallback((
    token: PublicWorkspaceAsyncReplacementToken,
    next: string,
    meta?: SourceMeta,
  ) => {
    if (!isAsyncReplacementCurrent(token)) return false;
    commitSource(next, meta);
    return true;
  }, [commitSource, isAsyncReplacementCurrent]);

  const commitAsyncFinalReplacement = useCallback((
    token: PublicWorkspaceAsyncReplacementToken,
    next: string,
    meta?: FinalMeta,
  ) => {
    if (!isAsyncReplacementCurrent(token)) return false;
    commitFinal(next, meta);
    return true;
  }, [commitFinal, isAsyncReplacementCurrent]);

  return {
    beginAsyncReplacement,
    commitAsyncFinalReplacement,
    commitAsyncSourceReplacement,
    commitFinal,
    commitFinalSnapshot,
    commitSource,
    document,
    finalWorkspaceSnapshot,
    invalidateAsyncReplacements,
    isAsyncReplacementCurrent,
    mode,
    setMode,
  } as const;
};
