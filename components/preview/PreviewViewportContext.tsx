import React from 'react';

export type MobileHtmlFallbackMode = 'render-with-image-fallback' | 'static-image' | 'none';
export type MobileHtmlChromeMode = 'default' | 'hidden';

export type PreviewViewportContextValue = {
  isMobilePreview: boolean;
  mobileHtmlFallbackMode: MobileHtmlFallbackMode;
  mobileHtmlChromeMode: MobileHtmlChromeMode;
};

export const PREVIEW_VIEWPORT_DEFAULT: PreviewViewportContextValue = Object.freeze({
  isMobilePreview: false,
  mobileHtmlFallbackMode: 'none',
  mobileHtmlChromeMode: 'default',
});

export const PreviewViewportContext = React.createContext<PreviewViewportContextValue>(
  PREVIEW_VIEWPORT_DEFAULT,
);

export const getPreviewViewportContext = (
  isMobilePreview: boolean,
  options: Partial<Pick<PreviewViewportContextValue, 'mobileHtmlChromeMode' | 'mobileHtmlFallbackMode'>> = {},
): PreviewViewportContextValue => ({
  isMobilePreview,
  mobileHtmlFallbackMode: isMobilePreview
    ? options.mobileHtmlFallbackMode ?? 'none'
    : 'none',
  mobileHtmlChromeMode: isMobilePreview
    ? options.mobileHtmlChromeMode ?? 'default'
    : 'default',
});
