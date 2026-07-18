import {
  EditorImportError,
  type EditorImportImageAsset,
} from './editorImport';
import {
  compressPublicImportImage,
  PUBLIC_IMPORT_FINAL_IMAGE_MAX_BYTES,
  PublicImageCompressionError,
  type CompressedPublicImportImage,
} from '../public-workspace/publicImageCompression';

export type LocalEditorImportImageAssetResolverOptions = {
  compressImage?: (file: File) => Promise<CompressedPublicImportImage>;
};

const sanitizeAltText = (value: string) =>
  value.replace(/[\r\n[\]]+/g, ' ').replace(/\s+/g, ' ').trim() || 'image';

const compressEditorImportImage = async (file: File) => {
  try {
    return await compressPublicImportImage(file);
  } catch (error) {
    if (error instanceof PublicImageCompressionError) {
      throw new EditorImportError(error.code, error.message);
    }
    throw error;
  }
};

const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error('Failed to read image data.'));
  reader.readAsDataURL(blob);
});

export const createLocalEditorImportImageAssetResolver = ({
  compressImage = compressEditorImportImage,
}: LocalEditorImportImageAssetResolverOptions = {}) => async (
  file: File,
): Promise<EditorImportImageAsset> => {
  const compressed = await compressImage(file);
  if (compressed.blob.size > PUBLIC_IMPORT_FINAL_IMAGE_MAX_BYTES) {
    throw new EditorImportError('file-too-large', `${file.name} is larger than the image import limit.`);
  }
  const dataUrl = await blobToDataUrl(compressed.blob);
  return {
    markdown: `![${sanitizeAltText(file.name)}](${dataUrl})`,
  };
};
