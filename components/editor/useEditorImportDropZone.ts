import { useCallback, useRef, useState } from 'react';
import {
  hasEditorImportDropPayload,
  snapshotEditorImportDropData,
  type EditorImportDropData,
} from './editorImport';

type UseEditorImportDropZoneOptions = {
  onImportDrop: (dropData: EditorImportDropData) => void;
};

export const useEditorImportDropZone = ({ onImportDrop }: UseEditorImportDropZoneOptions) => {
  const [isDragActive, setIsDragActive] = useState(false);
  const dragDepthRef = useRef(0);
  const isInternalDragRef = useRef(false);
  const pendingDropDataRef = useRef<EditorImportDropData | null>(null);

  const resetDragState = useCallback(() => {
    dragDepthRef.current = 0;
    setIsDragActive(false);
  }, []);

  const acceptsEvent = useCallback((event: React.DragEvent<HTMLElement>) => (
    !isInternalDragRef.current && hasEditorImportDropPayload(event.dataTransfer)
  ), []);

  const onDragStartCapture = useCallback(() => {
    isInternalDragRef.current = true;
    resetDragState();
  }, [resetDragState]);

  const onDragEndCapture = useCallback(() => {
    isInternalDragRef.current = false;
    pendingDropDataRef.current = null;
    resetDragState();
  }, [resetDragState]);

  const onDragEnter = useCallback((event: React.DragEvent<HTMLElement>) => {
    if (!acceptsEvent(event)) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDragActive(true);
  }, [acceptsEvent]);

  const onDragLeave = useCallback((event: React.DragEvent<HTMLElement>) => {
    if (isInternalDragRef.current || dragDepthRef.current === 0) return;
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragActive(false);
  }, []);

  const onDragOver = useCallback((event: React.DragEvent<HTMLElement>) => {
    if (!acceptsEvent(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, [acceptsEvent]);

  const onDropCapture = useCallback((event: React.DragEvent<HTMLElement>) => {
    pendingDropDataRef.current = acceptsEvent(event)
      ? snapshotEditorImportDropData({
          files: event.dataTransfer.files,
          getData: event.dataTransfer.getData.bind(event.dataTransfer),
        })
      : null;
    resetDragState();
    // React delegates capture and bubble handling through separate native listeners.
    // A microtask can run between them for a real browser drag, clearing the
    // protected-mode snapshot before the bubble handler can import it. Keep the
    // snapshot through the current drop dispatch; the next task only cleans up
    // the child-handled single-image path that intentionally stops propagation.
    window.setTimeout(() => {
      pendingDropDataRef.current = null;
    }, 0);
  }, [acceptsEvent, resetDragState]);

  const onDrop = useCallback((event: React.DragEvent<HTMLElement>) => {
    const dropData = pendingDropDataRef.current;
    pendingDropDataRef.current = null;
    isInternalDragRef.current = false;
    if (!dropData) return;
    event.preventDefault();
    onImportDrop(dropData);
  }, [onImportDrop]);

  return {
    isDragActive,
    dropZoneProps: {
      onDragStartCapture,
      onDragEndCapture,
      onDragEnter,
      onDragLeave,
      onDragOver,
      onDropCapture,
      onDrop,
    },
  };
};
