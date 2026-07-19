import { useEffect, useRef, useState } from 'react';
import { getEditorTextMetrics } from '../../utils/text-metrics';

const METRICS_DEBOUNCE_MS = 200;

const EMPTY_METRICS: ReturnType<typeof getEditorTextMetrics> = Object.freeze({
  characters: 0,
  compactCharacters: '0',
  compactTokens: '0',
  estimatedTokens: 0,
});

/**
 * Counts the visible text of the public Final preview (characters and
 * estimated tokens) without touching the commercial standalone-HTML metrics
 * pipeline. Recomputes on preview DOM mutations with a small debounce.
 */
export const usePublicVisiblePreviewMetrics = ({
  enabled,
  root,
}: {
  enabled: boolean;
  root: HTMLElement | null;
}) => {
  const [metrics, setMetrics] = useState(EMPTY_METRICS);
  const rootRef = useRef(root);
  rootRef.current = root;

  useEffect(() => {
    if (!enabled || !root) {
      setMetrics(EMPTY_METRICS);
      return undefined;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const recompute = () => {
      const target = rootRef.current;
      if (!enabled || !target) {
        setMetrics(EMPTY_METRICS);
        return;
      }
      const next = getEditorTextMetrics(target.innerText ?? '');
      setMetrics((current) => (
        current.characters === next.characters && current.estimatedTokens === next.estimatedTokens
          ? current
          : next
      ));
    };
    const schedule = (delay = METRICS_DEBOUNCE_MS) => {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(recompute, delay);
    };
    schedule(0);
    const observer = new MutationObserver(() => schedule());
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['aria-hidden', 'data-collapsed', 'hidden', 'srcdoc', 'style'],
      characterData: true,
      childList: true,
      subtree: true,
    });
    return () => {
      if (timer !== undefined) clearTimeout(timer);
      observer.disconnect();
    };
  }, [enabled, root]);

  return metrics;
};
