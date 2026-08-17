import { useCallback, useMemo, useRef } from 'react';
import type { ArtifactPreviewTranslations } from '../../i18n';
import { EditorImportError } from '../editor/editorImport';
import { createLocalEditorImportImageAssetResolver } from '../editor/editorImportLocalAssets';
import type { DeliveryAccessState, DeliveryNotice } from './deliveryAccess';

type UsePreviewMarkdownImageInsertionOptions = {
  deliveryAccess?: DeliveryAccessState;
  setDeliveryNotice: (notice: DeliveryNotice | null) => void;
  t: ArtifactPreviewTranslations;
};

export const usePreviewMarkdownImageInsertion = ({
  deliveryAccess,
  setDeliveryNotice,
  t,
}: UsePreviewMarkdownImageInsertionOptions) => {
  const resolvePreviewMarkdownImageAsset = useMemo(() => createLocalEditorImportImageAssetResolver(), []);
  const deliveryAccessRef = useRef(deliveryAccess);
  deliveryAccessRef.current = deliveryAccess;
  const resolvePreviewMarkdownImageAssetRef = useRef(resolvePreviewMarkdownImageAsset);
  resolvePreviewMarkdownImageAssetRef.current = resolvePreviewMarkdownImageAsset;
  const setDeliveryNoticeRef = useRef(setDeliveryNotice);
  setDeliveryNoticeRef.current = setDeliveryNotice;
  const translationsRef = useRef(t);
  translationsRef.current = t;

  const getPreviewMarkdownImageInsertErrorMessage = useCallback((error: unknown) => {
    if (error instanceof EditorImportError) {
      if (error.code === 'file-too-large' || error.code === 'batch-too-large') {
        return t.previewImageFileTooLarge;
      }
      return t.previewImageUnsupportedFile;
    }
    return error instanceof Error && error.message ? error.message : t.previewImageInsertFailed;
  }, [t]);

  const handlePreviewMarkdownInsertImageFile = useCallback(async (file: File) => {
    const access = deliveryAccessRef.current;
    const translations = translationsRef.current;
    setDeliveryNoticeRef.current(null);
    try {
      const asset = await resolvePreviewMarkdownImageAssetRef.current(file);
      setDeliveryNoticeRef.current({ tone: 'success', text: translations.previewImageInserted });
      void access?.refresh?.();
      return asset.markdown;
    } catch (error) {
      setDeliveryNoticeRef.current({ tone: 'error', text: getPreviewMarkdownImageInsertErrorMessage(error) });
      console.error('Failed to insert image into preview Markdown:', error);
      return null;
    }
  }, [getPreviewMarkdownImageInsertErrorMessage]);

  return { handlePreviewMarkdownInsertImageFile };
};
