export const isPlainFenceConfirmSpaceEvent = (event: KeyboardEvent) =>
  (event.key === ' ' || event.code === 'Space') &&
  !event.altKey &&
  !event.ctrlKey &&
  !event.metaKey &&
  !event.shiftKey &&
  !event.isComposing;

export type PreviewKeyboardShortcutEvent = Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'>;

export const isPreviewPrimaryShortcut = (event: PreviewKeyboardShortcutEvent) =>
  (event.metaKey || event.ctrlKey) && !event.altKey;

export const getPreviewShortcutKey = (event: PreviewKeyboardShortcutEvent) =>
  String(event.key ?? '').toLowerCase();

export const isPreviewUndoShortcut = (event: PreviewKeyboardShortcutEvent) =>
  isPreviewPrimaryShortcut(event) && !event.shiftKey && getPreviewShortcutKey(event) === 'z';

export const isPreviewRedoShortcut = (event: PreviewKeyboardShortcutEvent) =>
  isPreviewPrimaryShortcut(event) &&
  (
    (event.shiftKey && getPreviewShortcutKey(event) === 'z') ||
    (!event.metaKey && getPreviewShortcutKey(event) === 'y')
  );

export const isPreviewSelectAllShortcut = (event: PreviewKeyboardShortcutEvent) =>
  isPreviewPrimaryShortcut(event) && !event.shiftKey && getPreviewShortcutKey(event) === 'a';

export const PREVIEW_INTERACTIVE_ELEMENT_SELECTOR =
  'textarea,input,select,button,[role="button"],[contenteditable="false"]';

export const isPreviewInteractiveKeyboardTarget = (target: EventTarget | null, rootElement: HTMLElement) => {
  if (!(target instanceof Element)) return false;
  if (!rootElement.contains(target)) return true;
  return Boolean(target.closest(PREVIEW_INTERACTIVE_ELEMENT_SELECTOR));
};

export const isPreviewBlankDocumentPointerTarget = (
  target: EventTarget | null,
  surfaceElement: HTMLElement,
  rootElement: HTMLElement,
) => {
  if (!(target instanceof Node) || !surfaceElement.contains(target) || rootElement.contains(target)) return false;
  const targetElement = target instanceof Element ? target : target.parentElement;
  return !targetElement?.closest(PREVIEW_INTERACTIVE_ELEMENT_SELECTOR);
};

export const isPlainPreviewDeleteKeyEvent = (event: KeyboardEvent) => (
  (event.key === 'Backspace' || event.key === 'Delete') &&
  !event.altKey &&
  !event.ctrlKey &&
  !event.metaKey &&
  !event.shiftKey &&
  !event.isComposing
);

export const isPreviewFinalDeleteKeyboardTarget = (
  target: EventTarget | null,
  rootElement: HTMLElement,
) => {
  if (!(target instanceof Node) || !rootElement.contains(target)) return false;
  const targetElement = target instanceof Element ? target : target.parentElement;
  return Boolean(targetElement && !targetElement.closest(PREVIEW_INTERACTIVE_ELEMENT_SELECTOR));
};
