const RENDERED_ARTIFACT_MAP_KINDS = new Set(['mermaid', 'html', 'morndraftFlat', 'documentSpec']);

export const isRenderedArtifactMapKind = (kind: string | undefined) => (
  Boolean(kind) && RENDERED_ARTIFACT_MAP_KINDS.has(kind as string)
);
