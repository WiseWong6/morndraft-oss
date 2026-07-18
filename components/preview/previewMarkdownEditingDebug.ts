/**
 * Compact diagnostic fingerprint retained for logs and private protocol
 * compatibility. It is intentionally not a stale-source or privacy guard.
 */
export const createPreviewAiSourceVersion = (source: string) => {
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${source.length}:${(hash >>> 0).toString(16)}`;
};

const isPreviewMarkdownEditingDebugEnabled = () => {
  if (typeof window === 'undefined') return false;
  const debugWindow = window as Window & {
    __MORNDRAFT_DEBUG_PREVIEW?: boolean;
    __MORNDRAFT_DEBUG_PREVIEW_LEXICAL?: boolean;
  };
  return Boolean(
    debugWindow.__MORNDRAFT_DEBUG_PREVIEW
    || debugWindow.__MORNDRAFT_DEBUG_PREVIEW_LEXICAL
    || window.location.search.includes('debugPreview=1')
    || window.localStorage?.getItem('morndraft.debug.preview') === '1'
  );
};

export const debugPreviewMarkdownEditing = (event: string, payload: Record<string, unknown>) => {
  if (!isPreviewMarkdownEditingDebugEnabled()) return;
  console.info(`[preview-markdown-editing] ${event} ${JSON.stringify(payload)}`);
};
