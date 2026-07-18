export const isHtmlPreviewInteractionTarget = (target: EventTarget | null) => (
  target instanceof Element &&
  Boolean(target.closest('.aad-html-edit-hitarea, .aad-html-stage, [data-copy-role="html-preview"], iframe[data-html-preview-live="true"]'))
);

export const isMornDraftPreviewCommandTarget = (target: EventTarget | null) => (
  target instanceof Element &&
  Boolean(target.closest('.aad-morndraft-flat-header-actions'))
);
