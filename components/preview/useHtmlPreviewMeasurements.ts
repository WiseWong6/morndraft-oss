import type { RefObject } from 'react';
import { useHtmlPreviewBridge } from './useHtmlPreviewBridge';
import type { QueueHtmlPreviewSettledSize } from './useHtmlPreviewBridge';
import type { HtmlPreviewSelectionChange } from '../../utils/htmlPreviewBridge';
import { useHtmlPreviewParentMeasurement } from './useHtmlPreviewParentMeasurement';

export const useHtmlPreviewMeasurements = ({
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
  const parentMeasurement = useHtmlPreviewParentMeasurement({ queueSettledSize });
  useHtmlPreviewBridge({ frameId, iframeRef, onBlockActivate, onSelectionChange, queueSettledSize });
  return parentMeasurement;
};
