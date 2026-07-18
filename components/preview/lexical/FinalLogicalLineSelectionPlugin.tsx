import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect } from 'react';
import {
  $addUpdateTag,
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
  SKIP_SCROLL_INTO_VIEW_TAG,
  type NodeKey,
} from 'lexical';
import { PREVIEW_INTERACTIVE_ELEMENT_SELECTOR } from './keyboardPredicates';
import {
  $getFinalLogicalLineNode,
  $selectFinalLogicalLine,
  shouldHandleFinalLogicalLineDoubleClick,
} from './finalLogicalLineSelection';

export const FINAL_LOGICAL_LINE_SELECTION_EXCLUDED_SELECTOR = [
  PREVIEW_INTERACTIVE_ELEMENT_SELECTOR,
  '.aad-lexical-table-editor',
  '.aad-lexical-table',
  '.aad-lexical-table-cell',
  'td',
  'th',
  '.aad-preview-artifact-decorator',
  '.aad-preview-artifact-decorator-content',
  '.aad-code-frame',
  '.aad-json-block',
  '.aad-code-edit-textarea',
  'iframe',
  '.aad-final-insert-menu',
  '.aad-preview-ai-selection-toolbar',
  '[data-copy-role]',
].join(',');

const isProtectedFinalLogicalLineTarget = (
  target: EventTarget | null,
  rootElement: HTMLElement,
) => {
  if (!(target instanceof Node) || !rootElement.contains(target)) return true;
  const element = target instanceof Element ? target : target.parentElement;
  return !element || Boolean(element.closest(FINAL_LOGICAL_LINE_SELECTION_EXCLUDED_SELECTOR));
};

export const FinalLogicalLineSelectionPlugin = () => {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    let currentRootElement: HTMLElement | null = null;
    let lastPointerType = '';
    const handlePointerDown = (event: PointerEvent) => {
      lastPointerType = event.pointerType;
    };
    const handleDoubleClick = (event: MouseEvent) => {
      const pointerType = lastPointerType;
      lastPointerType = '';
      const rootElement = editor.getRootElement();
      if (!rootElement || !(event.target instanceof Node)) return;
      if (!shouldHandleFinalLogicalLineDoubleClick({
        altKey: event.altKey,
        button: event.button,
        ctrlKey: event.ctrlKey,
        detail: event.detail,
        isProtectedTarget: isProtectedFinalLogicalLineTarget(event.target, rootElement),
        metaKey: event.metaKey,
        pointerType,
        shiftKey: event.shiftKey,
      })) return;

      let logicalLineKey: NodeKey | null = null;
      editor.read(() => {
        logicalLineKey = $getFinalLogicalLineNode(
          $getNearestNodeFromDOMNode(event.target as Node),
        )?.getKey() ?? null;
      });
      if (!logicalLineKey) return;

      event.preventDefault();
      rootElement.focus({ preventScroll: true });
      editor.update(() => {
        $addUpdateTag(SKIP_SCROLL_INTO_VIEW_TAG);
        $selectFinalLogicalLine($getNodeByKey(logicalLineKey));
      });
    };
    const unregisterRootListener = editor.registerRootListener((rootElement, previousRootElement) => {
      previousRootElement?.removeEventListener('pointerdown', handlePointerDown, true);
      previousRootElement?.removeEventListener('dblclick', handleDoubleClick, true);
      currentRootElement = rootElement;
      rootElement?.addEventListener('pointerdown', handlePointerDown, true);
      rootElement?.addEventListener('dblclick', handleDoubleClick, true);
    });
    return () => {
      currentRootElement?.removeEventListener('pointerdown', handlePointerDown, true);
      currentRootElement?.removeEventListener('dblclick', handleDoubleClick, true);
      unregisterRootListener();
    };
  }, [editor]);

  return null;
};
