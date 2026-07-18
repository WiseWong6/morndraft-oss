export const MOUNT_DEFERRED_HTML_PREVIEWS_EVENT = 'morndraft:mount-deferred-html-previews';

export const requestDeferredHtmlPreviewMount = () => {
  document.dispatchEvent(new CustomEvent(MOUNT_DEFERRED_HTML_PREVIEWS_EVENT));
};
