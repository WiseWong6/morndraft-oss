import { useEffect } from 'react';
import type { RefObject } from 'react';
import { isHtmlPreviewBridgeMessage } from '../../utils/htmlPreviewBridge';
import type { HtmlPreviewBridgeHeightKind, HtmlPreviewSelectionChange } from '../../utils/htmlPreviewBridge';

export type QueueHtmlPreviewSettledSize = (
  height: number,
  width?: number | null,
  commitImmediately?: boolean,
  widthKind?: 'content' | 'viewport-feedback',
  heightKind?: HtmlPreviewBridgeHeightKind,
) => void;

export const useHtmlPreviewBridge = ({
  frameId,
  iframeRef,
  onBlockActivate,
  onSelectionChange,
  queueSettledSize,
}: {
  frameId: string;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  onBlockActivate?: () => void;
  onSelectionChange?: (selection: HtmlPreviewSelectionChange) => void;
  queueSettledSize: QueueHtmlPreviewSettledSize;
}) => {
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const iframe = iframeRef.current;
      if (!iframe || event.source !== iframe.contentWindow) return;
      if (!isHtmlPreviewBridgeMessage(event.data, frameId)) return;
      if (event.data.kind === 'activate') {
        onBlockActivate?.();
        return;
      }
      if (event.data.kind === 'selection-change') {
        onSelectionChange?.({
          editPath: event.data.editPath,
          pathTextOccurrenceIndex: event.data.pathTextOccurrenceIndex,
          text: event.data.text,
          textOccurrenceIndex: event.data.textOccurrenceIndex,
        });
        return;
      }
      if (event.data.kind !== 'size' && event.data.kind !== 'ready') return;
      // ready / size 都走 settle，让 iframe 内部首报高度与后续 ResizeObserver 测量在 settle 严格合并，
      // 避免首报中间态（如 272）被立即提交后又提交真实值（240）造成高度横跳。
      queueSettledSize(
        event.data.height,
        event.data.width,
        false,
        event.data.widthKind,
        event.data.heightKind ?? 'content',
      );
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [frameId, iframeRef, onBlockActivate, onSelectionChange, queueSettledSize]);
};
