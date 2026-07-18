import { buildHtmlPreviewSrcDoc, type HtmlPreviewRenderMode } from './htmlPreviewDocument';
import type { HtmlPreviewSecurityMode } from './HtmlPreviewFrameTypes';
import { sanitizeHtmlForStaticCapture } from '../../utils/html-preview-capture-source.js';

type PreviewTheme = 'dark' | 'light';

export const isFullHtmlDocument = (html: string) => /^(?:<!doctype\s+html|<html[\s>])/i.test(html.trim());

export const buildHtmlPreviewFrameSrcDoc = ({
  code,
  id,
  isMobilePreview,
  renderMode,
  requiresStableReady,
  securityMode = 'liveCompat',
  theme,
}: {
  code: string;
  id: string;
  isMobilePreview: boolean;
  renderMode: HtmlPreviewRenderMode;
  requiresStableReady: boolean;
  securityMode?: HtmlPreviewSecurityMode;
  theme: PreviewTheme;
}) => {
  void requiresStableReady;
  return buildHtmlPreviewSrcDoc({
    html: securityMode === 'publicStrict' ? sanitizeHtmlForStaticCapture(code) : code,
    id,
    theme,
    renderMode,
    isMobilePreview,
    securityMode,
  });
};
