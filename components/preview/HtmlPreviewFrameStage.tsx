import React from 'react';
import { Loader2 } from 'lucide-react';
import type { ArtifactPreviewTranslations } from '../../i18n';
import type { HtmlPreviewRenderMode } from './htmlPreviewDocument';
import {
  shouldShowMobileStaticImageError,
  shouldShowMobileStaticImageLoading,
  type MobileStaticImageState,
} from './useMobileHtmlPreviewImages';
import { getHtmlPreviewIframeSandbox } from './htmlPreviewSecurityPolicy';
import type { HtmlPreviewSecurityMode } from './HtmlPreviewFrameTypes';

type HtmlPreviewFrameStageProps = {
  canStartEditing?: boolean;
  deliveryWidth?: number;
  editIframeRef: React.RefObject<HTMLIFrameElement | null>;
  editSrcDoc?: string | null;
  handleIframeLoad: () => void;
  handleTrustedEditIframeLoad?: () => void;
  iframeStyle: React.CSSProperties;
  frameId: string;
  isEditing?: boolean;
  isFullscreen?: boolean;
  isMobilePreview: boolean;
  label: string;
  liveIframeRef: React.RefObject<HTMLIFrameElement | null>;
  meta?: string;
  mobileFallbackImageSrc: string | null;
  mobileStaticImage: MobileStaticImageState | null;
  mobileStaticStageStyle: React.CSSProperties;
  onLiveIframeBlur?: () => void;
  onLiveIframeDoubleClick?: (event: React.MouseEvent<HTMLElement>) => void;
  onLiveIframePointerDown?: (event: React.PointerEvent<HTMLElement> | React.MouseEvent<HTMLElement>) => void;
  renderMode: HtmlPreviewRenderMode;
  securityMode: HtmlPreviewSecurityMode;
  shouldMountLiveIframe: boolean;
  shouldMountStaticCaptureFrame: boolean;
  shouldUseMobileStaticImage: boolean;
  sourceKind: 'document' | 'fragment';
  stageRef: React.RefObject<HTMLDivElement | null>;
  stageStyle: React.CSSProperties;
  staticCaptureIframeRef: React.RefObject<HTMLIFrameElement | null>;
  staticCaptureIframeStyle: React.CSSProperties;
  t: ArtifactPreviewTranslations;
  viewportStyle: React.CSSProperties;
  wrappedCode: string;
};

export const HtmlPreviewFrameStage: React.FC<HtmlPreviewFrameStageProps> = ({
  canStartEditing = false,
  deliveryWidth,
  editIframeRef,
  editSrcDoc,
  handleIframeLoad,
  handleTrustedEditIframeLoad,
  iframeStyle,
  frameId,
  isEditing = false,
  isFullscreen = false,
  isMobilePreview,
  label,
  liveIframeRef,
  meta,
  mobileFallbackImageSrc,
  mobileStaticImage,
  mobileStaticStageStyle,
  onLiveIframeBlur,
  onLiveIframeDoubleClick,
  onLiveIframePointerDown,
  renderMode,
  securityMode,
  shouldMountLiveIframe,
  shouldMountStaticCaptureFrame,
  shouldUseMobileStaticImage,
  sourceKind,
  stageRef,
  stageStyle,
  staticCaptureIframeRef,
  staticCaptureIframeStyle,
  t,
  viewportStyle,
  wrappedCode,
}) => {
  const showMobileStaticLoading = shouldUseMobileStaticImage &&
    shouldShowMobileStaticImageLoading(mobileStaticImage);
  const showMobileStaticError = shouldUseMobileStaticImage &&
    shouldShowMobileStaticImageError(mobileStaticImage);
  const isReadonlyMobileLivePreview = isMobilePreview && renderMode !== 'raw';

  return (
    <div
      ref={stageRef}
      className="aad-html-stage relative w-full overflow-hidden"
      data-html-preview-fullscreen={isFullscreen ? 'true' : undefined}
      data-mobile-html-static-status={shouldUseMobileStaticImage ? mobileStaticImage?.status ?? 'pending' : undefined}
      data-html-editing={isEditing ? 'true' : undefined}
      style={shouldUseMobileStaticImage ? mobileStaticStageStyle : stageStyle}
    >
      {shouldUseMobileStaticImage ? (
        <>
          {mobileStaticImage?.status === 'ready' && mobileStaticImage.src ? (
            <img className="aad-html-mobile-static-image" src={mobileStaticImage.src} alt={meta ?? label} />
          ) : null}
          {showMobileStaticError ? (
            <p className="aad-html-mobile-static-fallback">{t.htmlPreviewNotReady}</p>
          ) : null}
          {showMobileStaticLoading ? (
            <div className="aad-loading-overlay absolute inset-0 flex items-center justify-center z-10">
              <Loader2 size={20} className="animate-spin" style={{ color: 'var(--aad-accent)' }} />
            </div>
          ) : null}
          {shouldMountStaticCaptureFrame ? (
            <iframe
              ref={staticCaptureIframeRef}
              aria-hidden="true"
              tabIndex={-1}
              data-html-source-kind={sourceKind}
              data-html-render-mode={renderMode}
              data-html-delivery-width={deliveryWidth}
              data-mobile-preview="true"
              data-mobile-html-capture="static-image"
              srcDoc={wrappedCode}
              scrolling="no"
              sandbox={getHtmlPreviewIframeSandbox('srcdoc', securityMode === 'publicStrict' ? 'publicStrict' : 'strict')}
              className="aad-html-mobile-static-capture-frame border-none bg-white"
              style={staticCaptureIframeStyle}
              onLoad={handleIframeLoad}
            />
          ) : null}
        </>
      ) : mobileFallbackImageSrc ? (
        <img className="aad-html-mobile-fallback-image" src={mobileFallbackImageSrc} alt={meta ?? label} />
      ) : (
        <>
          <div
            className="aad-html-viewport"
            data-html-preview-viewport="true"
            style={{ ...viewportStyle, position: 'relative' }}
          >
            {shouldMountLiveIframe ? (
              <iframe
                ref={liveIframeRef}
                tabIndex={isReadonlyMobileLivePreview ? -1 : undefined}
                data-html-preview-live="true"
                data-html-preview-frame-id={frameId}
                data-html-source-kind={sourceKind}
                data-html-render-mode={renderMode}
                data-html-delivery-width={deliveryWidth}
                data-html-preview-fullscreen={isFullscreen ? 'true' : undefined}
                data-mobile-preview={isMobilePreview ? 'true' : undefined}
                data-mobile-html-live={isReadonlyMobileLivePreview ? 'readonly' : undefined}
                scrolling={isFullscreen ? 'auto' : 'no'}
                sandbox={getHtmlPreviewIframeSandbox('srcdoc', securityMode)}
                className="md-public-html-frame border-none bg-white transition-opacity duration-300 opacity-100"
                style={{
                  ...iframeStyle,
                  pointerEvents: isEditing ? 'none' : undefined,
                  visibility: isEditing ? 'hidden' : undefined,
                }}
                onBlur={onLiveIframeBlur}
                onDoubleClickCapture={onLiveIframeDoubleClick}
                onLoad={handleIframeLoad}
                onMouseDownCapture={onLiveIframePointerDown}
                onPointerDownCapture={onLiveIframePointerDown}
              />
            ) : (
              <div
                aria-hidden="true"
                className="aad-html-frame-deferred-placeholder"
                data-html-preview-deferred="true"
                style={iframeStyle}
              />
            )}
            {isEditing && editSrcDoc ? (
              <iframe
                ref={editIframeRef}
                data-html-preview-edit="trusted-scriptless"
                data-html-preview-frame-id={frameId}
                data-html-source-kind={sourceKind}
                data-html-render-mode={renderMode}
                data-html-delivery-width={deliveryWidth}
                srcDoc={editSrcDoc}
                scrolling={isFullscreen ? 'auto' : 'no'}
                sandbox={getHtmlPreviewIframeSandbox('srcdoc', 'strict')}
                className="border-none bg-white"
                style={{ ...iframeStyle, inset: 0, position: 'absolute' }}
                onLoad={handleTrustedEditIframeLoad}
              />
            ) : null}
            {canStartEditing ? (
              <div
                aria-hidden="true"
                className="aad-html-edit-hitarea"
                onDoubleClickCapture={onLiveIframeDoubleClick}
                onMouseDownCapture={onLiveIframePointerDown}
                onPointerDownCapture={onLiveIframePointerDown}
              />
            ) : null}
          </div>
        </>
      )}
    </div>
  );
};
