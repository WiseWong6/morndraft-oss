export const buildStableHtmlPreviewFrameId = (frameKey: string) => {
  const key = frameKey || 'html-preview';
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index += 1) hash = Math.imul(hash ^ key.charCodeAt(index), 0x01000193);
  return `hpf${(hash >>> 0).toString(36)}`;
};
