import { useCallback, useMemo, useState } from 'react';
import type { EditorTranslations } from '../../i18n';
import { trackMornDraftClick } from '../../utils/analytics';
import type { DeliveryAccessState } from '../preview/deliveryAccess';
import {
  buildEditorImportContentFromDropData,
  EditorImportError,
  type EditorImportDropData,
} from './editorImport';
import { createLocalEditorImportImageAssetResolver } from './editorImportLocalAssets';
import {
  buildDraftUploadImportContentFromUnit,
  buildDraftUploadImportUnits,
  buildUploadedEditorImportContent,
  toSingleEditorImportFiles,
} from './uploadedImportContent';

export type EditorImportNotice = { tone: 'success' | 'error'; text: string };
export type EditorImportSource = 'drop' | 'paste-image' | 'upload';
export type EditorImportContentMeta = {
  activateImportedDraft?: boolean;
  activatePendingDraft?: boolean;
  pendingDraftId?: string;
  source: EditorImportSource;
  suggestedTitle?: string;
};
export type EditorImportContentResult = { draftId?: string } | void;
export type EditorImportBatchCompleteMeta = { draftId?: string; source: EditorImportSource };
export type EditorImportStartResult = { pendingDraftId?: string } | void;
type EditorImportRunResult = { draftId?: string; ok: true } | { ok: false };
export type UploadedImportMode = 'combined' | 'draft-units' | 'single-file';

type UseEditorImportOptions = {
  deliveryAccess?: DeliveryAccessState;
  onImportBatchComplete?: (meta: EditorImportBatchCompleteMeta) => void | Promise<void>;
  onImportContent: (content: string, meta: EditorImportContentMeta) => EditorImportContentResult | Promise<EditorImportContentResult>;
  onImportError?: (error: unknown, meta: EditorImportContentMeta) => void;
  onImportStart?: (meta: EditorImportContentMeta) => EditorImportStartResult | Promise<EditorImportStartResult>;
  successText?: string;
  trackingComponent?: string;
  t: EditorTranslations;
  uploadedImportMode?: UploadedImportMode;
};

const getExtension = (fileName: string) => {
  const lastDot = fileName.lastIndexOf('.');
  return lastDot >= 0 ? fileName.slice(lastDot + 1).toLowerCase() : '';
};

const getRelativePath = (file: File) => {
  const value = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  return value && value.trim() ? value : file.name;
};

const getImportSuggestedTitleFromFiles = (files: readonly File[]) => {
  const entries = files.map(file => ({
    file,
    relativePath: getRelativePath(file),
  }));
  const sortedTextEntries = entries
    .filter(entry => ['htm', 'html', 'markdown', 'md'].includes(getExtension(entry.relativePath)))
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath, undefined, { numeric: true, sensitivity: 'base' }));
  const markdownEntry = sortedTextEntries.find(entry => ['markdown', 'md'].includes(getExtension(entry.relativePath)));
  const preferredMarkdownEntry = markdownEntry
    ? sortedTextEntries.find(entry => ['markdown', 'md'].includes(getExtension(entry.relativePath)) && /终稿|final/i.test(entry.relativePath)) ?? markdownEntry
    : null;
  const htmlEntry = sortedTextEntries.find(entry => ['htm', 'html'].includes(getExtension(entry.relativePath)));
  return (preferredMarkdownEntry ?? htmlEntry ?? entries[0])?.file.name;
};

export const useEditorImport = ({
  onImportBatchComplete,
  onImportContent,
  onImportError,
  onImportStart,
  successText,
  trackingComponent = 'editor',
  t,
  uploadedImportMode = 'single-file',
}: UseEditorImportOptions) => {
  const [importNotice, setImportNotice] = useState<EditorImportNotice | null>(null);
  const [activeImportCount, setActiveImportCount] = useState(0);
  const resolveImageAsset = useMemo(() => createLocalEditorImportImageAssetResolver(), []);

  const getImportErrorMessage = useCallback((error: unknown) => {
    if (error instanceof EditorImportError) {
      switch (error.code) {
        case 'batch-too-large':
          return t.importBatchTooLarge;
        case 'empty-import':
          return t.importEmpty;
        case 'file-too-large':
          return t.importFileTooLarge;
        case 'local-markdown-required':
          return t.importLocalMarkdownRequired;
        case 'too-many-files':
          return t.importTooManyFiles;
        case 'unsupported-file-type':
        default:
          return t.importUnsupportedFile;
      }
    }
    return error instanceof Error ? error.message : t.importUnsupportedFile;
  }, [t]);

  const startImportTask = useCallback(() => {
    setActiveImportCount(count => count + 1);
  }, []);

  const finishImportTask = useCallback(() => {
    setActiveImportCount(count => Math.max(0, count - 1));
  }, []);

  const runEditorImport = useCallback(async (
    createContent: () => Promise<string>,
    source: EditorImportSource,
    options: {
      activateImportedDraft?: boolean;
      activatePendingDraft?: boolean;
      suggestedTitle?: string;
    } = {},
  ): Promise<EditorImportRunResult> => {
    startImportTask();
    setImportNotice(null);
    let importMeta: EditorImportContentMeta = {
      source,
      ...(typeof options.activateImportedDraft === 'boolean' ? { activateImportedDraft: options.activateImportedDraft } : {}),
      ...(typeof options.activatePendingDraft === 'boolean' ? { activatePendingDraft: options.activatePendingDraft } : {}),
      ...(options.suggestedTitle ? { suggestedTitle: options.suggestedTitle } : {}),
    };
    try {
      const startResult = await onImportStart?.(importMeta);
      if (startResult && 'pendingDraftId' in startResult && startResult.pendingDraftId) {
        importMeta = { ...importMeta, pendingDraftId: startResult.pendingDraftId };
      }
      const nextContent = await createContent();
      const contentResult = await onImportContent(nextContent, importMeta);
      trackMornDraftClick('morndraft_editor_import_source', {
        target: { type: source, text: t.importFile },
        context: { component: trackingComponent },
        metadata: { source, characters: nextContent.length, suggested_title: options.suggestedTitle },
      });
      setImportNotice({ tone: 'success', text: successText ?? t.importSuccess });
      return {
        ok: true,
        ...((contentResult && 'draftId' in contentResult && contentResult.draftId) ? { draftId: contentResult.draftId } : {}),
      };
    } catch (error) {
      onImportError?.(error, importMeta);
      setImportNotice({ tone: 'error', text: getImportErrorMessage(error) });
      console.error(`Failed to import into ${trackingComponent}:`, error);
      return { ok: false };
    } finally {
      finishImportTask();
    }
  }, [
    finishImportTask,
    getImportErrorMessage,
    onImportContent,
    onImportError,
    onImportStart,
    startImportTask,
    successText,
    t.importFile,
    t.importSuccess,
    trackingComponent,
  ]);

  const buildUploadedImportContent = useCallback(async (files: readonly File[]) => {
    return buildUploadedEditorImportContent(files, {
      resolveImageAsset,
      missingAssetErrorCode: 'local-markdown-required',
    });
  }, [resolveImageAsset]);

  const runDraftUploadImportUnits = useCallback(async (files: readonly File[], source: EditorImportSource) => {
    const units = buildDraftUploadImportUnits(files);
    if (units.length === 0) {
      await runEditorImport(() => buildUploadedImportContent([]), source);
      return;
    }
    let activatedDraftId: string | undefined;
    let lastSuccessfulDraftId: string | undefined;
    for (const [index, unit] of units.entries()) {
      const isLastUnit = index === units.length - 1;
      const result = await runEditorImport(
        () => buildDraftUploadImportContentFromUnit(unit, {
          missingAssetErrorCode: 'local-markdown-required',
          resolveImageAsset,
        }),
        source,
        {
          activateImportedDraft: isLastUnit,
          activatePendingDraft: false,
          suggestedTitle: unit.suggestedTitle,
        },
      );
      if (!result.ok || !result.draftId) continue;
      lastSuccessfulDraftId = result.draftId;
      if (isLastUnit) activatedDraftId = result.draftId;
    }
    if (lastSuccessfulDraftId && lastSuccessfulDraftId !== activatedDraftId) {
      await onImportBatchComplete?.({ draftId: lastSuccessfulDraftId, source });
    }
  }, [buildUploadedImportContent, onImportBatchComplete, resolveImageAsset, runEditorImport]);

  const handleImportFiles = useCallback((files: readonly File[]) => {
    if (uploadedImportMode === 'draft-units') {
      return runDraftUploadImportUnits(files, 'upload');
    }
    const importFiles = uploadedImportMode === 'single-file' ? toSingleEditorImportFiles(files) : files;
    return runEditorImport(() => buildUploadedImportContent(importFiles), 'upload', {
      suggestedTitle: getImportSuggestedTitleFromFiles(importFiles),
    });
  }, [buildUploadedImportContent, runDraftUploadImportUnits, runEditorImport, uploadedImportMode]);

  const handleImportPasteImages = useCallback((files: readonly File[]) => {
    const importFiles = toSingleEditorImportFiles(files);
    void runEditorImport(() => buildUploadedImportContent(importFiles), 'paste-image', {
      suggestedTitle: getImportSuggestedTitleFromFiles(importFiles),
    });
  }, [buildUploadedImportContent, runEditorImport]);

  const handleImportDrop = useCallback((dropData: EditorImportDropData) => {
    const files = dropData.files ? Array.from(dropData.files as ArrayLike<File>) : [];
    if (files.length > 0 && uploadedImportMode === 'draft-units') {
      void runDraftUploadImportUnits(files, 'drop');
      return;
    }
    const importFiles = files.length > 0 && uploadedImportMode === 'single-file'
      ? toSingleEditorImportFiles(files)
      : files;
    void runEditorImport(() => {
      if (importFiles.length > 0) return buildUploadedImportContent(importFiles);
      return buildEditorImportContentFromDropData(dropData, { resolveImageAsset });
    }, 'drop', {
      suggestedTitle: importFiles.length > 0 ? getImportSuggestedTitleFromFiles(importFiles) : undefined,
    });
  }, [buildUploadedImportContent, resolveImageAsset, runDraftUploadImportUnits, runEditorImport, uploadedImportMode]);

  return {
    handleImportDrop,
    handleImportFiles,
    handleImportPasteImages,
    importNotice,
    isImporting: activeImportCount > 0,
  };
};
