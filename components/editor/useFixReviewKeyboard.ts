import { useEffect } from 'react';

export const useFixReviewKeyboard = ({
  enabled,
  mode,
  onCancel,
  onDismiss,
  onUndo,
  scopeSelector,
}: {
  enabled: boolean;
  mode: 'pending' | 'applied';
  onCancel?: () => void;
  onDismiss: () => void;
  onUndo?: () => void;
  scopeSelector: string;
}) => {
  useEffect(() => {
    if (!enabled) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const isScopedTarget = target instanceof Element && Boolean(target.closest(scopeSelector));
      if (!isScopedTarget) return;
      const isUndoShortcut = event.key.toLowerCase() === 'z'
        && (event.metaKey || event.ctrlKey)
        && !event.altKey
        && !event.shiftKey;
      if (mode === 'pending') {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        onCancel?.();
        return;
      }
      if (event.key !== 'Escape' && !isUndoShortcut) return;
      event.preventDefault();
      event.stopPropagation();
      if (isUndoShortcut) onUndo?.(); else onDismiss();
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [enabled, mode, onCancel, onDismiss, onUndo, scopeSelector]);
};
