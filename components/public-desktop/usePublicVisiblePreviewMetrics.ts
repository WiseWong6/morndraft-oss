import { useEffect, useRef, useState } from 'react';
import { formatCompactCount, getEditorTextMetrics } from '../../utils/text-metrics';

const METRICS_DEBOUNCE_MS = 200;

type PublicVisiblePreviewMetrics = ReturnType<typeof getEditorTextMetrics> & {
  compactCharacters: string;
  compactTokens: string;
};

const EMPTY_METRICS: PublicVisiblePreviewMetrics = Object.freeze({
  characters: 0,
  compactCharacters: '0',
  compactTokens: '0',
  estimatedTokens: 0,
});

const buildVisibleMetrics = (text: string): PublicVisiblePreviewMetrics => {
  const next = getEditorTextMetrics(text);
  return {
    ...next,
    compactCharacters: formatCompactCount(next.characters),
    compactTokens: formatCompactCount(next.estimatedTokens),
  };
};

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
      const next = buildVisibleMetrics(target.innerText ?? '');
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
