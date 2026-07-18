export const ISLAND_TEXT_PATCH_DELAY_MS = 160;
export const ISLAND_FORMAT_UPDATE_TAG = 'preview-format';
export const ISLAND_AI_INSERT_UPDATE_TAG = 'preview-ai-insert';
export const ISLAND_CODE_BLOCK_UPDATE_TAG = 'preview-code-block';
export const ISLAND_CODE_BLOCK_STRUCTURE_UPDATE_TAG = 'preview-code-block-structure';
export const ISLAND_CODE_FENCE_SHORTCUT_UPDATE_TAG = 'preview-code-fence-shortcut';
export const ISLAND_IMAGE_INSERT_UPDATE_TAG = 'preview-image-insert';
export const ISLAND_MARKDOWN_SOURCE_PASTE_UPDATE_TAG = 'preview-markdown-source-paste';
export const ISLAND_SLASH_AI_DRAFT_UPDATE_TAG = 'preview-slash-ai-draft';
export const ISLAND_TABLE_SHORTCUT_UPDATE_TAG = 'preview-table-shortcut';
export const PREVIEW_MARKDOWN_DOCUMENT_ID = 'document:preview-markdown';
export const PREVIEW_RESET_UPDATE_TAG = 'preview-reset';

export const isPreviewLexicalDebugEnabled = () => {
  if (typeof window === 'undefined') return false;
  const debugWindow = window as Window & {
    __MORNDRAFT_DEBUG_PREVIEW?: boolean;
    __MORNDRAFT_DEBUG_PREVIEW_LEXICAL?: boolean;
  };
  return Boolean(
    debugWindow.__MORNDRAFT_DEBUG_PREVIEW ||
    debugWindow.__MORNDRAFT_DEBUG_PREVIEW_LEXICAL ||
    window.location.search.includes('debugPreview=1') ||
    window.localStorage?.getItem('morndraft.debug.preview') === '1',
  );
};

export const debugPreviewLexical = (event: string, payload: Record<string, unknown>) => {
  if (!isPreviewLexicalDebugEnabled()) return;
  console.info(`[preview-lexical] ${event} ${JSON.stringify(payload)}`);
};
