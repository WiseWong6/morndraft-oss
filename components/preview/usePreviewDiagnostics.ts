import { useCallback, useEffect, useRef } from 'react';
import type { ArtifactDiagnostic } from './MarkdownCodeBlockRenderer';

export type PreviewDiagnosticInput = {
  code: string;
  line?: number | null;
  messageZh: string;
  messageEn?: string;
};

export const usePreviewDiagnostics = ({
  resetKey,
  sourceKey,
  onChange,
}: {
  resetKey: string;
  sourceKey: string;
  onChange?: (diagnostics: ArtifactDiagnostic[], sourceKey: string) => void;
}) => {
  const diagnosticsRef = useRef(new Map<string, ArtifactDiagnostic>());
  const sourceKeyRef = useRef(sourceKey);

  useEffect(() => {
    sourceKeyRef.current = sourceKey;
  }, [sourceKey]);

  const publish = useCallback((publishSourceKey = sourceKeyRef.current) => {
    if (publishSourceKey !== sourceKeyRef.current) return;
    onChange?.(Array.from(diagnosticsRef.current.values()), publishSourceKey);
  }, [onChange]);

  useEffect(() => {
    sourceKeyRef.current = sourceKey;
    if (diagnosticsRef.current.size === 0) {
      publish(sourceKey);
      return;
    }
    diagnosticsRef.current.clear();
    publish(sourceKey);
  }, [publish, resetKey, sourceKey]);

  const updatePreviewDiagnostic = useCallback((id: string, input: PreviewDiagnosticInput | null) => {
    const eventSourceKey = sourceKey;
    if (eventSourceKey !== sourceKeyRef.current) return;
    if (!input || !input.line) {
      if (!diagnosticsRef.current.has(id)) return;
      diagnosticsRef.current.delete(id);
      publish(eventSourceKey);
      return;
    }

    const previous = diagnosticsRef.current.get(id);
    if (
      previous?.line === input.line &&
      previous.messageZh === input.messageZh &&
      previous.messageEn === input.messageEn &&
      previous.code === input.code
    ) {
      return;
    }

    diagnosticsRef.current.set(id, {
      id,
      code: input.code,
      severity: 'error',
      messageZh: input.messageZh,
      messageEn: input.messageEn,
      line: input.line,
    });
    publish(eventSourceKey);
  }, [publish, sourceKey]);

  return { updatePreviewDiagnostic };
};
