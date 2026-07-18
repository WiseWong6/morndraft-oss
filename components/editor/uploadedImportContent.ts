import {
  buildEditorImportContentFromFiles,
  EditorImportError,
  type EditorImportImageAsset,
} from './editorImport';
import {
  buildEditorImportContentFromHtmlAssetFiles,
  buildEditorImportContentFromMarkdownAssetFiles,
} from './markdownImageImport';

type MissingAssetErrorCode = 'local-markdown-required' | 'unsupported-file-type';

type UploadedImportContentOptions = {
  missingAssetErrorCode?: MissingAssetErrorCode;
  resolveImageAsset: (file: File) => Promise<EditorImportImageAsset>;
};

export type DraftUploadImportUnit = {
  assetFiles: readonly File[];
  primaryFile: File;
  suggestedTitle: string;
};

const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown']);
const HTML_EXTENSIONS = new Set(['htm', 'html']);
const IMAGE_EXTENSIONS = new Set(['avif', 'gif', 'jpeg', 'jpg', 'png', 'webp']);
const IMAGE_MIME_TYPES = new Set(['image/avif', 'image/gif', 'image/jpeg', 'image/png', 'image/webp']);

const getExtension = (fileName: string) => {
  const lastDot = fileName.lastIndexOf('.');
  return lastDot >= 0 ? fileName.slice(lastDot + 1).toLowerCase() : '';
};

const isImageFile = (file: File) => {
  const extension = getExtension(file.name);
  if (extension === 'svg' || file.type === 'image/svg+xml') return false;
  return IMAGE_EXTENSIONS.has(extension) || IMAGE_MIME_TYPES.has(file.type);
};

const canReferenceImportAssets = (file: File) => {
  const extension = getExtension(file.name);
  return MARKDOWN_EXTENSIONS.has(extension) || HTML_EXTENSIONS.has(extension);
};

export const toSingleEditorImportFiles = (files: readonly File[]) => {
  const firstFile = files[0];
  return firstFile ? [firstFile] : [];
};

export const buildUploadedEditorImportContent = async (
  files: readonly File[],
  options: UploadedImportContentOptions,
) => {
  try {
    const markdownContent = await buildEditorImportContentFromMarkdownAssetFiles(files, {
      missingAssetErrorCode: options.missingAssetErrorCode,
      resolveImageAsset: options.resolveImageAsset,
    });
    if (markdownContent !== null) return markdownContent;
  } catch (error) {
    if (!(error instanceof EditorImportError) || error.code !== 'empty-import') throw error;
  }
  const htmlContent = await buildEditorImportContentFromHtmlAssetFiles(files, {
    missingAssetErrorCode: options.missingAssetErrorCode,
    resolveImageAsset: options.resolveImageAsset,
  });
  if (htmlContent !== null) return htmlContent;
  return buildEditorImportContentFromFiles(files, { resolveImageAsset: options.resolveImageAsset });
};

export const buildDraftUploadImportUnits = (files: readonly File[]): DraftUploadImportUnit[] => {
  const assetFiles = files.filter(isImageFile);
  const primaryFiles = files.filter(file => !isImageFile(file));
  if (primaryFiles.length === 0) {
    return assetFiles.map(file => ({
      assetFiles: [],
      primaryFile: file,
      suggestedTitle: file.name,
    }));
  }
  return primaryFiles.map(file => ({
    assetFiles: canReferenceImportAssets(file) ? assetFiles : [],
    primaryFile: file,
    suggestedTitle: file.name,
  }));
};

export const buildDraftUploadImportContentFromUnit = async (
  unit: DraftUploadImportUnit,
  options: UploadedImportContentOptions,
) => {
  if (unit.assetFiles.length > 0 && canReferenceImportAssets(unit.primaryFile)) {
    const filesWithAssets = [unit.primaryFile, ...unit.assetFiles];
    try {
      const markdownContent = await buildEditorImportContentFromMarkdownAssetFiles(filesWithAssets, {
        missingAssetErrorCode: options.missingAssetErrorCode,
        resolveImageAsset: options.resolveImageAsset,
      });
      if (markdownContent !== null) return markdownContent;
    } catch (error) {
      if (!(error instanceof EditorImportError) || error.code !== 'empty-import') throw error;
    }
    const htmlContent = await buildEditorImportContentFromHtmlAssetFiles(filesWithAssets, {
      missingAssetErrorCode: options.missingAssetErrorCode,
      resolveImageAsset: options.resolveImageAsset,
    });
    if (htmlContent !== null) return htmlContent;
  }
  return buildUploadedEditorImportContent([unit.primaryFile], options);
};
