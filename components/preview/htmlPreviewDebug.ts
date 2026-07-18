const isHtmlPreviewDebugEnabled = () => {
  if (typeof window === 'undefined') return false;
  const debugWindow = window as Window & {
    __MORNDRAFT_DEBUG_HTML_PREVIEW?: boolean;
    __MORNDRAFT_DEBUG_PREVIEW?: boolean;
  };
  return Boolean(
    debugWindow.__MORNDRAFT_DEBUG_HTML_PREVIEW ||
    debugWindow.__MORNDRAFT_DEBUG_PREVIEW ||
    new URLSearchParams(window.location.search).get('morndraft-debug-preview') === '1' ||
    window.localStorage?.getItem('morndraft.debug.preview') === '1',
  );
};

export const recordHtmlPreviewRenderProbe = ({
  code,
  frameKey,
  kind,
}: {
  code?: string;
  frameKey?: string;
  kind: string;
}) => {
  if (!isHtmlPreviewDebugEnabled() || typeof document === 'undefined') return;
  try {
    const probeId = 'morndraft-html-preview-render-probes';
    let probeNode = document.getElementById(probeId) as HTMLScriptElement | null;
    if (!probeNode) {
      probeNode = document.createElement('script');
      probeNode.id = probeId;
      probeNode.type = 'application/json';
      probeNode.hidden = true;
      document.head.appendChild(probeNode);
    }
    const resetToken = probeNode.dataset.resetToken ?? '';
    const previousResetToken = probeNode.dataset.appliedResetToken ?? '';
    const probes = resetToken === previousResetToken && probeNode.textContent
      ? JSON.parse(probeNode.textContent) as Record<string, {
        codeHash: string | null;
        count: number;
        frameKey: string | null;
        kind: string;
      }>
      : {};
    probeNode.dataset.appliedResetToken = resetToken;
    const key = `${kind}:${frameKey ?? 'unkeyed'}`;
    const previous = probes[key];
    probes[key] = {
      codeHash: typeof code === 'string' ? getHtmlPreviewDebugHash(code) : null,
      count: (previous?.count ?? 0) + 1,
      frameKey: frameKey ?? null,
      kind,
    };
    probeNode.textContent = JSON.stringify(probes);
  } catch {
    // Render probes are debug-only and must never affect preview rendering.
  }
};

export const getHtmlPreviewDebugHash = (value: string) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
};

export const debugHtmlPreview = (event: string, payload: Record<string, unknown>) => {
  if (!isHtmlPreviewDebugEnabled()) return;
  console.info(`[html-preview] ${event}`, payload);
};
