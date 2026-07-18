export const HTML_PREVIEW_FRAME_SELECTOR = '[data-copy-role="html-preview"] iframe[data-html-preview-live="true"]';
export const HTML_CAPTURE_FRAME_SELECTOR = HTML_PREVIEW_FRAME_SELECTOR;

export const getHtmlPreviewFrames = (sourceRoot: HTMLElement) =>
  Array.from(sourceRoot.querySelectorAll<HTMLIFrameElement>(HTML_PREVIEW_FRAME_SELECTOR));

export const getHtmlCaptureFrameCount = (sourceRoot: HTMLElement | null) =>
  sourceRoot ? sourceRoot.querySelectorAll(HTML_CAPTURE_FRAME_SELECTOR).length : 0;
