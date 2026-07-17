import React, { useEffect, useRef } from 'react';
import {
  insertPublicFinalBlankLineSource,
  resolvePublicFinalBlankLineTarget,
  shouldHandlePublicFinalBlankLinePointer,
  type PublicFinalBlankLineBlock,
} from './publicFinalBlankLine';
import type { PublicWorkspaceLocale } from './types';

type ActiveBlankLineInput = {
  cancel(): void;
  requestSource: string;
};

const PUBLIC_FINAL_BLANK_LINE_INTERACTIVE_SELECTOR = [
  'a',
  'button',
  'iframe',
  'img',
  'input',
  'pre',
  'select',
  'summary',
  'table',
  'textarea',
  '[contenteditable="true"]',
  '[data-copy-role]',
  '[role="button"]',
].join(',');

const readSourceOffset = (
  element: Element,
  name: 'data-public-source-end' | 'data-public-source-start',
  sourceLength: number,
) => {
  const raw = element.getAttribute(name);
  if (raw === null || !/^\d+$/u.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value <= sourceLength ? value : null;
};

const readDirectBlockSourceRange = (element: HTMLElement, sourceLength: number) => {
  const rangeElements = [
    element,
    ...element.querySelectorAll<HTMLElement>(
      '[data-public-source-start][data-public-source-end]',
    ),
  ];
  let sourceStart: number | null = null;
  let sourceEnd: number | null = null;
  for (const candidate of rangeElements) {
    const start = readSourceOffset(candidate, 'data-public-source-start', sourceLength);
    const end = readSourceOffset(candidate, 'data-public-source-end', sourceLength);
    if (start === null || end === null || end < start) continue;
    sourceStart = sourceStart === null ? start : Math.min(sourceStart, start);
    sourceEnd = sourceEnd === null ? end : Math.max(sourceEnd, end);
  }
  return { sourceEnd, sourceStart };
};

const readPublicFinalDirectBlocks = (
  previewRoot: HTMLElement,
  sourceLength: number,
) => Array.from(previewRoot.children)
  .filter((child): child is HTMLElement => (
    child instanceof HTMLElement && !child.matches('.md-public-final-blank-line-input')
  ))
  .flatMap((child, index): PublicFinalBlankLineBlock[] => {
    const { bottom, height, top } = child.getBoundingClientRect();
    if (height <= 0) return [];
    const range = readDirectBlockSourceRange(child, sourceLength);
    return [{
      bottom,
      id: String(index),
      sourceEnd: range.sourceEnd,
      sourceStart: range.sourceStart,
      top,
    }];
  });

export const PublicFinalBlankLineController: React.FC<{
  emptyDocumentOffset: number;
  enabled: boolean;
  locale: PublicWorkspaceLocale;
  onSourcePatch(next: string): void;
  source: string;
  surfaceRef: React.RefObject<HTMLElement | null>;
}> = ({ emptyDocumentOffset, enabled, locale, onSourcePatch, source, surfaceRef }) => {
  const activeInputRef = useRef<ActiveBlankLineInput | null>(null);
  const emptyDocumentOffsetRef = useRef(emptyDocumentOffset);
  const latestSourceRef = useRef(source);
  const localeRef = useRef(locale);
  const onSourcePatchRef = useRef(onSourcePatch);
  latestSourceRef.current = source;
  emptyDocumentOffsetRef.current = emptyDocumentOffset;
  localeRef.current = locale;
  onSourcePatchRef.current = onSourcePatch;

  useEffect(() => {
    const activeInput = activeInputRef.current;
    if (activeInput && activeInput.requestSource !== source) activeInput.cancel();
  }, [source]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!enabled || !surface) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !surface.contains(event.target)) return;
      const targetElement = event.target instanceof Element ? event.target : event.target.parentElement;
      if (!shouldHandlePublicFinalBlankLinePointer({
        altKey: event.altKey,
        button: event.button,
        ctrlKey: event.ctrlKey,
        isInteractiveTarget: Boolean(targetElement?.closest(PUBLIC_FINAL_BLANK_LINE_INTERACTIVE_SELECTOR)),
        metaKey: event.metaKey,
        pointerType: event.pointerType,
        shiftKey: event.shiftKey,
      })) return;
      const previewRoot = surface.querySelector<HTMLElement>('.md-public-markdown-preview');
      if (!previewRoot) return;
      const blocks = readPublicFinalDirectBlocks(previewRoot, latestSourceRef.current.length);
      const target = resolvePublicFinalBlankLineTarget(
        event.clientY,
        blocks,
        emptyDocumentOffsetRef.current,
      );
      if (!target || target.offset > latestSourceRef.current.length) return;
      const targetBlock = target.id === null
        ? null
        : Array.from(previewRoot.children).filter((child) => (
          child instanceof HTMLElement && !child.matches('.md-public-final-blank-line-input')
        ))[Number(target.id)] as HTMLElement | undefined;
      if (target.id !== null && !targetBlock) return;

      event.preventDefault();
      activeInputRef.current?.cancel();
      const input = document.createElement('textarea');
      input.className = 'md-public-final-blank-line-input';
      input.dataset.morndraftDeliveryExclude = 'true';
      input.setAttribute(
        'aria-label',
        localeRef.current === 'zh' ? 'Final 空白行编辑器' : 'Final blank line editor',
      );
      input.rows = 1;
      input.spellcheck = true;
      if (target.placement === 'before' && targetBlock) {
        previewRoot.insertBefore(input, targetBlock);
      } else if (target.placement === 'after' && targetBlock) {
        previewRoot.insertBefore(input, targetBlock.nextSibling);
      } else {
        previewRoot.append(input);
      }

      const requestSource = latestSourceRef.current;
      let composing = false;
      let settled = false;
      const finish = (commit: boolean) => {
        if (settled) return;
        settled = true;
        const value = input.value;
        if (activeInputRef.current?.requestSource === requestSource) activeInputRef.current = null;
        input.remove();
        if (!commit || latestSourceRef.current !== requestSource) return;
        const next = insertPublicFinalBlankLineSource(requestSource, target.offset, value);
        if (next !== null && next !== requestSource) onSourcePatchRef.current(next);
      };
      const cancel = () => finish(false);
      const handleKeyDown = (keyboardEvent: KeyboardEvent) => {
        if (keyboardEvent.key === 'Escape') {
          keyboardEvent.preventDefault();
          cancel();
          return;
        }
        if (
          keyboardEvent.key === 'Enter'
          && !keyboardEvent.shiftKey
          && !keyboardEvent.isComposing
          && !composing
          && keyboardEvent.keyCode !== 229
        ) {
          keyboardEvent.preventDefault();
          finish(true);
        }
      };
      input.addEventListener('blur', () => finish(true), { once: true });
      input.addEventListener('compositionstart', () => { composing = true; });
      input.addEventListener('compositionend', () => { composing = false; });
      input.addEventListener('keydown', handleKeyDown);
      activeInputRef.current = { cancel, requestSource };
      input.focus({ preventScroll: true });
    };

    surface.addEventListener('pointerdown', handlePointerDown, true);
    return () => {
      surface.removeEventListener('pointerdown', handlePointerDown, true);
      activeInputRef.current?.cancel();
    };
  }, [enabled, surfaceRef]);

  return null;
};
