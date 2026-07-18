import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CollapsibleArtifactBlock } from './CollapsibleArtifactBlock';
import { BlockHeaderCopyAction } from './BlockHeaderCopyAction';
import { HtmlPreviewFrameStage } from './HtmlPreviewFrameStage';
import { isMobileStaticImageVisibleForConsumer, useMobileHtmlPreviewImages } from './useMobileHtmlPreviewImages';
import { useHtmlPreviewFrameStyles } from './useHtmlPreviewFrameStyles';
import { useHtmlPreviewReadyNotification } from './useHtmlPreviewReadyNotification';
import { buildHtmlPreviewSourceCacheKey } from './htmlPreviewSizeCache';
import { buildHtmlPreviewFrameSrcDoc, isFullHtmlDocument } from './htmlPreviewFrameDocument';
import { useHtmlPreviewEditMode, type HtmlPreviewEditCommitMeta } from './useHtmlPreviewEditMode';
import { useHtmlPreviewLiveFrameSource } from './useHtmlPreviewLiveFrameSource';
import { useHtmlPreviewFrameSizeState } from './useHtmlPreviewFrameSizeState';
import { debugHtmlPreview, getHtmlPreviewDebugHash, recordHtmlPreviewRenderProbe } from './htmlPreviewDebug';
import { HTML_PREVIEW_BRIDGE_SOURCE } from '../../utils/htmlPreviewBridge';
import { isHtmlTrustedEditingSafe } from '../../utils/htmlPreviewEditSafety';
import { useHtmlPreviewMountFrameReady, useScheduledHtmlPreviewLiveMount } from './htmlPreviewMountScheduler';
import type { HtmlPreviewFrameProps } from './HtmlPreviewFrameTypes';
import { buildStableHtmlPreviewFrameId } from './htmlPreviewFrameId';
export type { HtmlPreviewRenderMode } from './htmlPreviewDocument';
export type { MobileHtmlPreviewFallbackMode } from './useMobileHtmlPreviewImages';
export { HTML_PREVIEW_RAW_DOCUMENT_FALLBACK_HEIGHT } from './useHtmlPreviewFrameSizeState';
export { buildStableHtmlPreviewFrameId } from './htmlPreviewFrameId';
export const HtmlPreviewFrame: React.FC<HtmlPreviewFrameProps> = ({ code, copyContentKind = 'html', copySource, headerActions, deliveryWidth, enableFullscreen = false, label = 'HTML', meta, renderMode = 'embedded', securityMode = 'liveCompat', theme, t, isMobilePreview = false, mobileFallbackMode = 'none', mobileChromeMode = 'default', initialHeight, lockInitialHeight = false, deferMountUntilVisible = false, frameKey, onPreviewReady, onPreviewPendingChange, canEdit = false, isEditing = false, onEditStart, onEditCommit, onEditCancel, onEditDraft, editCommitStrategy, onBlockActivate, onSelectionChange }) => {
  const id = useMemo(() => buildStableHtmlPreviewFrameId(frameKey ?? `${renderMode}:${code}`), [code, frameKey, renderMode]);
  const codeHash = useMemo(() => getHtmlPreviewDebugHash(code), [code]);
  recordHtmlPreviewRenderProbe({ code, frameKey: frameKey ?? id, kind: 'html-frame' });
  const requiresStableReady = renderMode === 'raw' && isFullHtmlDocument(code);
  const [internalEditing, setInternalEditing] = useState(false);
  const [isBlockFullscreen, setIsBlockFullscreen] = useState(false);
  const effectiveIsEditing = isEditing || internalEditing;
  const sourceKind = isFullHtmlDocument(code) ? 'document' : 'fragment';
  const stageRef = React.useRef<HTMLDivElement>(null);
  const editIframeRef = React.useRef<HTMLIFrameElement>(null);
  const scheduledLiveIframeMount = useScheduledHtmlPreviewLiveMount({
    deferMountUntilVisible,
    effectiveIsEditing,
    frameId: id,
    isMobilePreview,
    stageRef,
  });
  const wrappedCode = useMemo(
    () => scheduledLiveIframeMount
      ? buildHtmlPreviewFrameSrcDoc({ code, id, isMobilePreview, renderMode, requiresStableReady, securityMode, theme })
      : '',
    [code, id, isMobilePreview, renderMode, requiresStableReady, scheduledLiveIframeMount, securityMode, theme],
  );
  const wrappedCodeHash = useMemo(() => getHtmlPreviewDebugHash(wrappedCode), [wrappedCode]);
  const {
    fit,
    handlePreviewIframeLoad,
    hasLoadFallback: hasSizeLoadFallback,
    isIframeReady,
    liveIframeRef,
    normalizedDeliveryWidth,
    previewHeight,
    previewWidth,
    stageAvailableWidth,
    staticCaptureIframeRef,
  } = useHtmlPreviewFrameSizeState({
    code,
    deliveryWidth,
    effectiveIsEditing,
    frameId: id,
    initialHeight,
    isMobilePreview,
    liveIframeMountEnabled: scheduledLiveIframeMount,
    lockInitialHeight, onBlockActivate,
    onSelectionChange,
    renderMode,
    requiresStableReady,
    sourceKind,
    stageRef,
    theme,
    wrappedCode,
  });
  const shouldUseMobileStaticImage = effectiveIsEditing ? false : (isMobilePreview && mobileFallbackMode === 'static-image');
  const shouldHideMobileChrome = isMobilePreview && mobileChromeMode === 'hidden';
  const readyKeyRef = React.useRef(wrappedCode); const hasReadyForCurrentCodeRef = React.useRef(false);
  if (readyKeyRef.current !== wrappedCode) { readyKeyRef.current = wrappedCode; hasReadyForCurrentCodeRef.current = false; }
  const canUseTrustedHtmlEdit = useMemo(() => isHtmlTrustedEditingSafe(code), [code]);
  const shouldMountLiveIframe = scheduledLiveIframeMount;
  const handleBlockFullscreenChange = useCallback((active: boolean) => {
    setIsBlockFullscreen(active);
  }, []);
  const handleEditStart = useCallback(() => { setInternalEditing(true); onEditStart?.(); }, [onEditStart]);
  const handleEditCommit = useCallback((newCode: string, meta?: HtmlPreviewEditCommitMeta) => { setInternalEditing(false); onPreviewPendingChange?.(false); onEditCommit?.(newCode, meta); }, [onEditCommit, onPreviewPendingChange]);
  const handleEditCancel = useCallback(() => { setInternalEditing(false); onPreviewPendingChange?.(false); onEditCancel?.(); }, [onEditCancel, onPreviewPendingChange]);
  const htmlInteractionReady = isIframeReady || hasReadyForCurrentCodeRef.current;
  const { effectiveWrappedCode, handleFinishEditing, handleLiveIframePointerDown, handleTrustedEditIframeLoad, isEditableReady, trustedEditSrcDoc } = useHtmlPreviewEditMode({
    canEdit: canUseTrustedHtmlEdit && canEdit && !isMobilePreview,
    editIframeRef,
    frameId: id,
    isIframeReady: htmlInteractionReady,
    liveIframeRef,
    onEditStart: handleEditStart,
    sourceCode: code,
    isEditing: effectiveIsEditing,
    onEditCommit: handleEditCommit,
    onEditCancel: handleEditCancel,
    onEditDraft,
    editCommitStrategy,
    wrappedCode,
  });
  const isHtmlEditActive = effectiveIsEditing && isEditableReady;
  const canStartHtmlEdit = canUseTrustedHtmlEdit && canEdit && !isMobilePreview && htmlInteractionReady && !effectiveIsEditing;
  const shouldUseParentEditHitarea = canStartHtmlEdit;
  const handleLiveIframeBlockPointerDown = useCallback((event: React.PointerEvent<HTMLElement> | React.MouseEvent<HTMLElement>) => { onBlockActivate?.(); if (Number(event.detail) >= 2) handleLiveIframePointerDown(event); }, [handleLiveIframePointerDown, onBlockActivate]);
  const handleLiveIframeBlockDoubleClick = useCallback((event: React.MouseEvent<HTMLElement>) => { onBlockActivate?.(); handleLiveIframePointerDown(event); }, [handleLiveIframePointerDown, onBlockActivate]);
  const postFullscreenStateToIframe = useCallback(() => {
    liveIframeRef.current?.contentWindow?.postMessage({
      active: isBlockFullscreen,
      id,
      kind: 'fullscreen-change',
      source: HTML_PREVIEW_BRIDGE_SOURCE,
    }, '*');
  }, [id, isBlockFullscreen, liveIframeRef]);
  useEffect(() => {
    if (!effectiveIsEditing) return undefined;
    const handleParentPointerDown = (event: PointerEvent) => {
      if (event.target === liveIframeRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      handleFinishEditing();
    };
    window.addEventListener('pointerdown', handleParentPointerDown, true);
    document.addEventListener('pointerdown', handleParentPointerDown, true);
    return () => { window.removeEventListener('pointerdown', handleParentPointerDown, true); document.removeEventListener('pointerdown', handleParentPointerDown, true); };
  }, [effectiveIsEditing, handleFinishEditing, liveIframeRef]);
  const handleIframeLoad = useCallback(() => {
    recordHtmlPreviewRenderProbe({ code, frameKey: frameKey ?? id, kind: 'iframe-load' });
    debugHtmlPreview('iframe-load', {
      codeHash,
      frameId: id,
      frameKey: frameKey ?? null,
      initialHeight: initialHeight ?? null,
      label,
      lockInitialHeight,
      previewHeight,
      previewWidth,
      wrappedCodeHash,
    });
    handlePreviewIframeLoad();
    window.requestAnimationFrame(postFullscreenStateToIframe);
  }, [
    code,
    codeHash,
    frameKey,
    handlePreviewIframeLoad,
    id,
    initialHeight,
    label,
    lockInitialHeight,
    postFullscreenStateToIframe,
    previewHeight,
    previewWidth,
    wrappedCodeHash,
  ]);
  useEffect(() => {
    if (!shouldMountLiveIframe) return;
    postFullscreenStateToIframe();
  }, [effectiveWrappedCode, postFullscreenStateToIframe, shouldMountLiveIframe]);
  const {
    mobileFallbackImageSrc,
    mobileStaticImage,
    shouldMountStaticCaptureFrame,
  } = useMobileHtmlPreviewImages({
    cacheKeySource: buildHtmlPreviewSourceCacheKey({ code, normalizedDeliveryWidth }),
    isIframeReady,
    isMobilePreview,
    liveIframeRef,
    mobileFallbackMode,
    previewHeight,
    previewWidth,
    renderMode,
    shouldUseMobileStaticImage,
    stageRef,
    stageAvailableWidth,
    staticCaptureIframeRef,
    theme,
  });
  useHtmlPreviewLiveFrameSource({ enabled: shouldMountLiveIframe && !shouldUseMobileStaticImage && !mobileFallbackImageSrc, frameRef: liveIframeRef, source: wrappedCode });
  const {
    iframeStyle,
    mobileStaticStageStyle,
    stageStyle,
    staticCaptureIframeStyle,
    viewportStyle,
  } = useHtmlPreviewFrameStyles({
    animateHeight: renderMode !== 'raw',
    fit,
    isFullscreen: isBlockFullscreen,
    mobileStaticImageStatus: mobileStaticImage?.status,
    mobileStaticImageWidth: mobileStaticImage?.width,
    previewHeight,
    stageAvailableWidth,
  });
  const baseIsPreviewReadyForConsumer = shouldUseMobileStaticImage
    ? isMobileStaticImageVisibleForConsumer(mobileStaticImage)
    : Boolean(mobileFallbackImageSrc) || isIframeReady || hasSizeLoadFallback;
  if (baseIsPreviewReadyForConsumer) hasReadyForCurrentCodeRef.current = true;
  const isPreviewReadyForConsumer = effectiveIsEditing || baseIsPreviewReadyForConsumer || hasReadyForCurrentCodeRef.current;
  useHtmlPreviewMountFrameReady({
    frameId: id,
    isFrameReady: isPreviewReadyForConsumer,
  });
  const shouldTrackPreviewPending = shouldMountLiveIframe || shouldUseMobileStaticImage || effectiveIsEditing;

  useEffect(() => {
    const isPending = shouldTrackPreviewPending && !isPreviewReadyForConsumer;
    debugHtmlPreview('pending-change', {
      codeHash,
      frameId: id,
      frameKey: frameKey ?? null,
      isPending,
      label,
      previewHeight,
      wrappedCodeHash,
    });
    onPreviewPendingChange?.(isPending);
  }, [
    codeHash,
    frameKey,
    id,
    isPreviewReadyForConsumer,
    label,
    onPreviewPendingChange,
    previewHeight,
    shouldTrackPreviewPending,
    wrappedCodeHash,
  ]);
  useEffect(() => () => { onPreviewPendingChange?.(false); }, [onPreviewPendingChange]);
  useEffect(() => {
    debugHtmlPreview('mount', {
      codeHash,
      frameId: id,
      frameKey: frameKey ?? null,
      initialHeight: initialHeight ?? null,
      label,
      lockInitialHeight,
      renderMode,
      wrappedCodeHash,
    });
    return () => {
      debugHtmlPreview('unmount', {
        codeHash,
        frameId: id,
        frameKey: frameKey ?? null,
        label,
        lockInitialHeight,
        renderMode,
        wrappedCodeHash,
      });
    };
  }, [codeHash, frameKey, id, initialHeight, label, lockInitialHeight, renderMode, wrappedCodeHash]);

  useEffect(() => {
    debugHtmlPreview('size-state', {
      codeHash,
      deliveryWidth: normalizedDeliveryWidth,
      fitHeight: fit.height,
      fitScale: fit.scale,
      fitWidth: fit.width,
      frameId: id,
      frameKey: frameKey ?? null,
      initialHeight: initialHeight ?? null,
      isIframeReady,
      label,
      lockInitialHeight,
      previewHeight,
      previewWidth,
      stageAvailableWidth,
      wrappedCodeHash,
    });
  }, [
    codeHash,
    fit.height,
    fit.scale,
    fit.width,
    frameKey,
    id,
    initialHeight,
    isIframeReady,
    label,
    lockInitialHeight,
    normalizedDeliveryWidth,
    previewHeight,
    previewWidth,
    stageAvailableWidth,
    wrappedCodeHash,
  ]);

  useHtmlPreviewReadyNotification({
    isPreviewReady: isPreviewReadyForConsumer,
    onPreviewReady,
    resetKey: effectiveWrappedCode,
  });
  return (
    <CollapsibleArtifactBlock
      label={label}
      meta={meta}
      className={`aad-html-frame flex flex-col ${isMobilePreview ? 'aad-html-frame--mobile' : ''} ${shouldUseMobileStaticImage ? 'aad-html-frame--mobile-static' : ''} ${shouldHideMobileChrome ? 'aad-html-frame--mobile-chromeless' : ''}`.trim()}
      copyRole="html-preview"
      resetKey={effectiveWrappedCode}
      fullscreen={enableFullscreen ? {
        enterLabel: t.enterBlockFullscreen,
        exitLabel: t.exitBlockFullscreen,
        onChange: handleBlockFullscreenChange,
      } : undefined}
      actions={(
        <>
          {headerActions}
          <BlockHeaderCopyAction contentKind={copyContentKind} text={copySource ?? code} t={t} />
        </>
      )}
      dataAttributes={{
        ...(shouldUseMobileStaticImage ? { 'data-mobile-html-static': 'true' } : {}),
        ...(shouldHideMobileChrome ? { 'data-mobile-html-chrome': 'hidden' } : {}),
        ...(isBlockFullscreen ? { 'data-html-preview-fullscreen': 'true' } : {}),
        ...(isHtmlEditActive ? { 'data-html-editing': 'true' } : {}),
        ...(effectiveIsEditing && !isHtmlEditActive ? { 'data-html-edit-pending': 'true' } : {}),
      }}
      expandLabel={t.expandBlock}
      collapseLabel={t.collapseBlock}
    >
      <HtmlPreviewFrameStage
        editIframeRef={editIframeRef}
        editSrcDoc={trustedEditSrcDoc}
        frameId={id}
        handleIframeLoad={handleIframeLoad}
        handleTrustedEditIframeLoad={handleTrustedEditIframeLoad}
        canStartEditing={shouldUseParentEditHitarea}
        iframeStyle={iframeStyle}
        isEditing={effectiveIsEditing}
        isFullscreen={isBlockFullscreen}
        isMobilePreview={isMobilePreview}
        label={label}
        meta={meta}
        mobileFallbackImageSrc={mobileFallbackImageSrc}
        mobileStaticImage={mobileStaticImage}
        mobileStaticStageStyle={mobileStaticStageStyle}
        renderMode={renderMode} securityMode={securityMode}
        deliveryWidth={normalizedDeliveryWidth}
        shouldMountStaticCaptureFrame={shouldMountStaticCaptureFrame}
        shouldMountLiveIframe={shouldMountLiveIframe}
        shouldUseMobileStaticImage={shouldUseMobileStaticImage}
        sourceKind={sourceKind}
        stageRef={stageRef}
        stageStyle={stageStyle}
        liveIframeRef={liveIframeRef}
        onLiveIframeDoubleClick={handleLiveIframeBlockDoubleClick}
        onLiveIframePointerDown={handleLiveIframeBlockPointerDown}
        staticCaptureIframeRef={staticCaptureIframeRef}
        staticCaptureIframeStyle={staticCaptureIframeStyle}
        t={t}
        viewportStyle={viewportStyle}
        wrappedCode={effectiveWrappedCode}
      />
    </CollapsibleArtifactBlock>
  );
};
