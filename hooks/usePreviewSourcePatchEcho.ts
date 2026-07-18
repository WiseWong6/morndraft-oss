import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  PreviewMarkdownPatchMeta,
  PreviewSourcePatchEcho,
} from '../components/preview/previewMarkdownPatchMeta';

type UsePreviewSourcePatchEchoOptions = {
  flushPreviewSource?: (nextSource: string) => void;
  previewSource: string;
  setCode: (nextSource: string) => void;
};

export const usePreviewSourcePatchEcho = ({
  flushPreviewSource,
  previewSource,
  setCode,
}: UsePreviewSourcePatchEchoOptions) => {
  const [previewSourcePatchEcho, setPreviewSourcePatchEcho] = useState<PreviewSourcePatchEcho>(null);
  const previewSourcePatchSequenceRef = useRef(0);
  const previewSourceRef = useRef(previewSource);

  useEffect(() => {
    previewSourceRef.current = previewSource;
  }, [previewSource]);

  const clearPreviewSourcePatchEcho = useCallback(() => {
    setPreviewSourcePatchEcho(null);
  }, []);

  const handleEditorChange = useCallback((nextSource: string) => {
    setPreviewSourcePatchEcho(null);
    setCode(nextSource);
  }, [setCode]);

  const handlePreviewSourcePatch = useCallback((nextSource: string, meta?: PreviewMarkdownPatchMeta) => {
    setPreviewSourcePatchEcho(meta ? {
      baseSource: previewSourceRef.current,
      meta,
      sequence: previewSourcePatchSequenceRef.current + 1,
      source: nextSource,
    } : null);
    if (meta) previewSourcePatchSequenceRef.current += 1;
    setCode(nextSource);
    flushPreviewSource?.(nextSource);
  }, [flushPreviewSource, setCode]);

  return {
    clearPreviewSourcePatchEcho,
    handleEditorChange,
    handlePreviewSourcePatch,
    previewSourcePatchEcho,
  };
};
