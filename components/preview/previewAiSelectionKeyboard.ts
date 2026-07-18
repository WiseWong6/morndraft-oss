import type {
  PreviewAiAppliedReplacement,
  PreviewAiSelection,
} from './previewMarkdownEditingTypes';

type PreviewAiSelectionKeyboardState = {
  currentAppliedReplacement: PreviewAiAppliedReplacement | null;
  dismissAppliedNotice: () => void;
  dismissToolbar: (options?: {
    restoreDocumentFocus?: boolean;
    selection?: PreviewAiSelection | null;
  }) => void;
  hasActiveAiInteraction: boolean;
  isAppliedNoticeVisible: boolean;
  undoApply: () => void;
  visibleSelection: PreviewAiSelection | null;
};

type PreviewAiSelectionKeyboardEventLike = Pick<
  KeyboardEvent,
  'altKey' | 'ctrlKey' | 'key' | 'metaKey' | 'preventDefault' | 'shiftKey' | 'stopImmediatePropagation' | 'stopPropagation'
>;

type PreviewAiSelectionKeyboardResult = 'dismiss-applied-notice' | 'dismiss-toolbar' | 'ignore' | 'undo-applied';

const isPreviewPrimaryShortcut = (event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'metaKey'>) =>
  (event.metaKey || event.ctrlKey) && !event.altKey;

const isPreviewAiUndoShortcut = (event: PreviewAiSelectionKeyboardEventLike) =>
  isPreviewPrimaryShortcut(event) &&
  !event.shiftKey &&
  String(event.key ?? '').toLowerCase() === 'z';

const consumePreviewAiKeyboardEvent = (event: PreviewAiSelectionKeyboardEventLike) => {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
};

export const handlePreviewAiSelectionToolbarKeyboardEvent = (
  event: PreviewAiSelectionKeyboardEventLike,
  keyboardState: PreviewAiSelectionKeyboardState,
): PreviewAiSelectionKeyboardResult => {
  if (
    keyboardState.currentAppliedReplacement &&
    !keyboardState.hasActiveAiInteraction &&
    isPreviewAiUndoShortcut(event)
  ) {
    consumePreviewAiKeyboardEvent(event);
    keyboardState.undoApply();
    return 'undo-applied';
  }
  if (event.key === 'Escape' && keyboardState.isAppliedNoticeVisible) {
    consumePreviewAiKeyboardEvent(event);
    keyboardState.dismissAppliedNotice();
    return 'dismiss-applied-notice';
  }
  if (!keyboardState.visibleSelection) return 'ignore';
  if (event.key !== 'Escape') return 'ignore';
  consumePreviewAiKeyboardEvent(event);
  keyboardState.dismissToolbar({
    restoreDocumentFocus: true,
    selection: keyboardState.visibleSelection,
  });
  return 'dismiss-toolbar';
};
