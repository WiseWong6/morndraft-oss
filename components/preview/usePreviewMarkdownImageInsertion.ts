import { useCallback, useMemo, useRef } from 'react';
import type { ArtifactPreviewTranslations } from '../../i18n';
import { EditorImportError } from '../editor/editorImport';
import { createLocalEditorImportImageAssetResolver } from '../editor/editorImportLocalAssets';
import { getPrivateRuntimeGateway } from '../../utils/privateRuntimeGateways';
import {
  canUseLocalEditorImportAssetsByAccess,
  getDeliveryDecision,
  shouldAuthorizeEditorImportByAccess,
  type DeliveryAccessState,
  type DeliveryNotice,
} from './deliveryAccess';

type UsePreviewMarkdownImageInsertionOptions = {
  deliveryAccess?: DeliveryAccessState;
  setDeliveryNotice: (notice: DeliveryNotice | null) => void;
  t: ArtifactPreviewTranslations;
};

const loadPrivateEditorImportGateway = () => getPrivateRuntimeGateway('editorImport')?.();

export const usePreviewMarkdownImageInsertion = ({
  deliveryAccess,
  setDeliveryNotice,
  t,
}: UsePreviewMarkdownImageInsertionOptions) => {
  const shouldUseLocalPreviewImageAssets = canUseLocalEditorImportAssetsByAccess(deliveryAccess);
  const resolvePreviewMarkdownImageAsset = useMemo(() => {
    if (shouldUseLocalPreviewImageAssets) return createLocalEditorImportImageAssetResolver();
    return async (file: File) => {
      const gateway = await loadPrivateEditorImportGateway();
      if (!gateway) {
        throw new EditorImportError('asset_upload_unavailable', 'Remote image upload is unavailable.');
      }
      const { createPrivateEditorImportImageAssetResolver } = gateway;
      return createPrivateEditorImportImageAssetResolver(deliveryAccess)(file);
    };
  }, [deliveryAccess, shouldUseLocalPreviewImageAssets]);
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
      if (error.code === 'asset_upload_unavailable') {
        return t.previewImageUploadUnavailable;
      }
      if (error.code === 'file-too-large' || error.code === 'batch-too-large') {
        return t.previewImageFileTooLarge;
      }
      if (error.code === 'public_output_moderation_rejected') {
        return t.previewImageModerationRejected;
      }
      if (error.code === 'public_output_moderation_request_invalid') {
        return t.previewImageModerationRequestInvalid;
      }
      if (error.code === 'public_output_moderation_unavailable') {
        return t.previewImageModerationUnavailable;
      }
      return t.previewImageUnsupportedFile;
    }
    return error instanceof Error && error.message ? error.message : t.previewImageInsertFailed;
  }, [t]);

  const authorizePreviewMarkdownImageInsert = useCallback(async (access?: DeliveryAccessState) => {
    if (!shouldAuthorizeEditorImportByAccess(access)) return;
    const gateway = await loadPrivateEditorImportGateway();
    if (!gateway) {
      throw new EditorImportError('asset_upload_unavailable', 'Remote image upload is unavailable.');
    }
    const { authorizePrivateEditorImport } = gateway;
    await authorizePrivateEditorImport(access, translationsRef.current);
  }, []);

  const handlePreviewMarkdownInsertImageFile = useCallback(async (file: File) => {
    const access = deliveryAccessRef.current;
    const translations = translationsRef.current;
    const decision = getDeliveryDecision(access, translations, 'editorImport');
    if (!decision.isProAllowed) {
      setDeliveryNoticeRef.current({ tone: 'error', text: decision.text });
      return null;
    }
    setDeliveryNoticeRef.current(null);
    try {
      await authorizePreviewMarkdownImageInsert(access);
      const asset = await resolvePreviewMarkdownImageAssetRef.current(file);
      setDeliveryNoticeRef.current({ tone: 'success', text: translations.previewImageInserted });
      void access?.refresh?.();
      return asset.markdown;
    } catch (error) {
      setDeliveryNoticeRef.current({ tone: 'error', text: getPreviewMarkdownImageInsertErrorMessage(error) });
      console.error('Failed to insert image into preview Markdown:', error);
      return null;
    }
  }, [authorizePreviewMarkdownImageInsert, getPreviewMarkdownImageInsertErrorMessage]);

  return { handlePreviewMarkdownInsertImageFile };
};
