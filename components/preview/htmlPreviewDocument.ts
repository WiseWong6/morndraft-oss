import {
  injectMornDraftSwissCatalogSharedStyles,
} from '@morndraft/core';
import { buildPortableDocument } from '@morndraft/public-delivery';
import {
  buildStandaloneThemeCss,
} from '../../utils/html-theme.js';
import { resolveMornDraftStaticAssetUrl } from '../../utils/staticAssetUrl';
import {
  deferPreviewBlockingExternalScripts,
  stabilizeMobileHtmlPreviewSource,
} from './htmlPreviewSourceTransforms';
import {
  buildStandaloneMermaidZoomRuntimeScript,
  buildStandaloneUiRuntimeScript,
  buildCspMetaTag,
  buildStaticHtmlDeliveryCsp,
  injectCspMetaIntoHtml,
  injectHeadMarkupIntoHtml,
  STATIC_HTML_DELIVERY_CSP,
  trimHtmlAsciiWhitespace,
  USER_HTML_PREVIEW_CSP,
  USER_HTML_PREVIEW_LIVE_CSP,
} from '../../utils/htmlStandaloneViewer';
import { buildHtmlPreviewBridgeScript } from '../../utils/htmlPreviewBridge';
import type { HtmlPreviewSecurityMode } from './HtmlPreviewFrameTypes';

type PreviewTheme = 'dark' | 'light';
export type HtmlPreviewRenderMode = 'embedded' | 'raw';

export const HTML_RESPONSIVE_FIT_BRIDGE = `
<style data-morndraft-inject>html{overflow-x:hidden;overflow-y:hidden;}body{max-width:none;overflow-y:hidden;}img,svg,canvas,video,iframe,table{max-width:100%;}</style>`;

const HTML_STANDALONE_FIT_BRIDGE = `
<style data-morndraft-inject data-morndraft-standalone-fit>html{height:auto!important;min-height:100%;overflow-x:hidden!important;overflow-y:auto!important;}body{max-width:none;height:auto!important;min-height:100vh;overflow-x:hidden!important;overflow-y:visible!important;}main.container{display:block!important;height:auto!important;min-height:100vh;overflow:visible!important;}img,svg,canvas,video,iframe,table{max-width:100%;}</style>`;

const HTML_STANDALONE_MERMAID_ZOOM_CSS = `
<style data-morndraft-inject data-morndraft-standalone-mermaid-zoom-style>
.aad-block-header-main{display:inline-flex;min-width:0;height:26px;align-items:center;gap:.5rem;flex:1 1 auto;line-height:1.75;}
.aad-block-header-main .aad-block-label{align-items:center;line-height:1.75;color:light-dark(#6e6e62,#c7c7cc);}
.aad-block-header-main .aad-block-label::before{flex:0 0 .45rem;}
.aad-mermaid-toolbar{display:inline-flex;height:24px;align-items:center;gap:.22rem;line-height:1.75;}
.aad-mermaid-toolbar .aad-icon-button{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border:0;border-radius:var(--aad-radius-sm);background:transparent;color:light-dark(#7a7568,#a1a1a6);padding:.25rem;cursor:pointer;transition:color .16s ease,opacity .16s ease,transform .16s ease;}
.aad-mermaid-toolbar .aad-icon-button:hover:not(:disabled){background:transparent;color:var(--aad-text-strong);transform:translateY(-1px);}
.aad-mermaid-toolbar .aad-icon-button:disabled{cursor:not-allowed;opacity:.3;}
.aad-mermaid-toolbar .aad-icon-button:focus-visible{outline:2px solid color-mix(in srgb,var(--aad-accent) 58%,transparent);outline-offset:2px;}
.aad-mermaid-toolbar .aad-icon-button svg{display:block;flex:0 0 auto;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}
.aad-standalone-mermaid-zoom-value{display:inline-flex;height:16px;align-items:center;justify-content:center;min-width:36px;font-size:12px;line-height:16px;font-variant-numeric:tabular-nums;color:light-dark(#6e6e62,#c7c7cc);text-align:center;}
.aad-standalone-mermaid-viewport{box-sizing:border-box;width:100%;max-width:100%;overflow:auto;background:var(--aad-surface);padding:1rem;touch-action:auto;}
.aad-standalone-mermaid-viewport[data-morndraft-standalone-mermaid-pannable="true"]{max-height:70vh;cursor:grab;overscroll-behavior:contain;user-select:none;}
.aad-standalone-mermaid-viewport[data-morndraft-standalone-mermaid-dragging="true"]{cursor:grabbing;}
.aad-standalone-mermaid-spacer{position:relative;min-width:100%;min-height:1px;}
.aad-standalone-mermaid-stage{position:absolute;top:0;transform-origin:top left;}
.aad-standalone-mermaid-stage svg{display:block;width:100%!important;max-width:none!important;height:auto!important;margin:0!important;}
@media (max-width:640px){.aad-mermaid-toolbar{gap:.1rem}.aad-standalone-mermaid-viewport{padding:.75rem}}
</style>`;

export const HTML_RAW_PREVIEW_FIT_BRIDGE = `
<style data-morndraft-inject data-morndraft-raw-preview-fit>
html,body{margin:0!important;min-height:0!important;overflow-x:hidden!important;overflow-y:hidden!important;}
body{max-width:none!important;min-height:0!important;overflow-y:hidden!important;}
img,svg,canvas,video,iframe,table{max-width:100%;}
</style>`;

export const HTML_MOBILE_PREVIEW_FIT_BRIDGE = `
<style data-morndraft-inject data-morndraft-mobile-preview-fit>
html,body{width:100%!important;min-width:0!important;max-width:100%!important;overflow-x:hidden!important;overflow-y:hidden!important;overscroll-behavior:auto!important;}
body{min-height:0!important;margin-left:0!important;margin-right:0!important;overflow-y:hidden!important;}
.morndraft-html-fragment-viewport,.morndraft-html-fragment-content{width:100%!important;min-width:0!important;box-sizing:border-box!important;}
body :where(article,aside,div,figure,footer,form,header,main,section){box-sizing:border-box!important;}
body :where(p,h1,h2,h3,h4,h5,h6,li,span,blockquote,pre,code){overflow-wrap:anywhere;}
img,svg,canvas,video,iframe,table{max-width:100%!important;height:auto;}
table{width:100%;min-width:0;table-layout:auto;}
*{box-sizing:border-box;}
</style>`;

const HTML_FRAGMENT_FIT_BRIDGE = `
<style data-morndraft-inject>html{overflow-x:hidden;overflow-y:hidden;}body{max-width:none;overflow-y:hidden;}img,svg,canvas,video,iframe,table{max-width:100%;}table{width:100%;}</style>`;

const escapeHtmlAttribute = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/'/g, '&#39;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const STYLE_TAG_PATTERN = /<style\b([^>]*)>([\s\S]*?)<\/style>/gi;

const dedupeStandaloneHtmlStyleTags = (html: string) => {
  const styleTags = Array.from(html.matchAll(STYLE_TAG_PATTERN), (match) => ({
    end: (match.index ?? 0) + match[0].length,
    index: match.index ?? 0,
    key: `${match[1] ?? ''}\u0000${match[2] ?? ''}`,
  }));
  if (styleTags.length < 2) return html;

  const lastIndexByKey = new Map<string, number>();
  styleTags.forEach((styleTag, index) => {
    lastIndexByKey.set(styleTag.key, index);
  });

  const duplicateIndexes = new Set<number>();
  styleTags.forEach((styleTag, index) => {
    if (lastIndexByKey.get(styleTag.key) !== index) {
      duplicateIndexes.add(index);
    }
  });
  if (duplicateIndexes.size === 0) return html;

  let output = '';
  let cursor = 0;
  styleTags.forEach((styleTag, index) => {
    if (!duplicateIndexes.has(index)) return;
    output += html.slice(cursor, styleTag.index);
    cursor = styleTag.end;
  });
  output += html.slice(cursor);
  return output;
};

const STANDALONE_SCRIPT_NONCE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';

const createStandaloneScriptNonce = () => {
  const bytes = new Uint8Array(24);
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(
    bytes,
    (byte) => STANDALONE_SCRIPT_NONCE_CHARS[byte % STANDALONE_SCRIPT_NONCE_CHARS.length] ?? 'A',
  ).join('');
};

const getMornDraftFontStylesheetHref = () => {
  const resolvedAssetUrl = resolveMornDraftStaticAssetUrl('fonts/morndraft-fonts-critical.css');
  if (/^https?:\/\//i.test(resolvedAssetUrl)) return resolvedAssetUrl;
  if (typeof window !== 'undefined' && window.location?.href) {
    return new URL('./fonts/morndraft-fonts-critical.css', window.location.href).href;
  }
  return resolvedAssetUrl;
};

const buildMornDraftFontStylesheetLink = () =>
  `<link data-morndraft-inject data-morndraft-local-fonts rel="stylesheet" href="${escapeHtmlAttribute(getMornDraftFontStylesheetHref())}">`;

export const buildRawHtmlFragmentViewportCss = (isMobilePreview = false) => `
<style data-morndraft-inject>
html,body{margin:0;min-height:0;overflow-y:hidden;}
body{min-height:0;overflow-y:hidden;}
.morndraft-html-fragment-viewport{min-height:0;box-sizing:border-box;display:block;padding:0;}
.morndraft-html-fragment-content{width:100%;box-sizing:border-box;}
.morndraft-html-fragment-content>:where(article,aside,canvas,div,figure,form,img,main,section,svg,table){margin-left:auto;margin-right:auto;}
</style>${isMobilePreview ? HTML_MOBILE_PREVIEW_FIT_BRIDGE : ''}`;

const buildStandaloneRawHtmlFragmentViewportCss = () => `
<style data-morndraft-inject data-morndraft-standalone-fragment-fit>
html{height:auto!important;min-height:100%;overflow-x:hidden!important;overflow-y:auto!important;}
body{margin:0;max-width:none;height:auto!important;min-height:0;overflow-x:hidden!important;overflow-y:visible!important;}
.morndraft-html-fragment-viewport{height:auto!important;min-height:0;box-sizing:border-box;display:block;overflow:visible!important;padding:0;}
.morndraft-html-fragment-content{width:100%;box-sizing:border-box;overflow:visible!important;}
.morndraft-html-fragment-content>:where(article,aside,canvas,div,figure,form,img,main,section,svg,table){margin-left:auto;margin-right:auto;}
</style>`;

export const wrapRawHtmlFragment = (html: string) => `
<main class="morndraft-html-fragment-viewport" data-morndraft-fragment>
  <div class="morndraft-html-fragment-content">
${html}
  </div>
</main>`;

export const buildHtmlPreviewSrcDoc = ({
  html,
  id,
  renderMode = 'embedded',
  isMobilePreview = false,
  securityMode = 'liveCompat',
}: {
  html: string;
  id: string;
  theme: PreviewTheme;
  renderMode?: HtmlPreviewRenderMode;
  isMobilePreview?: boolean;
  securityMode?: HtmlPreviewSecurityMode;
}) => {
  const source = injectMornDraftSwissCatalogSharedStyles(
    deferPreviewBlockingExternalScripts(stabilizeMobileHtmlPreviewSource(html)),
  );
  const trimmed = trimHtmlAsciiWhitespace(source);
  const hasDocType = /^<!doctype[\t\n\f\r ]+html(?:[\t\n\f\r ]|>)/i.test(trimmed);
  const hasHtmlTag = /^<html(?:[\t\n\f\r ]|>)/i.test(trimmed);
  const isRawMode = renderMode === 'raw';
  const mobileBridge = isMobilePreview ? HTML_MOBILE_PREVIEW_FIT_BRIDGE : '';
  const rawPreviewBridge = isMobilePreview ? mobileBridge : HTML_RAW_PREVIEW_FIT_BRIDGE;
  const fontStylesheet = buildMornDraftFontStylesheetLink();
  const previewBridge = isRawMode
    ? `${fontStylesheet}${rawPreviewBridge}`
    : `${fontStylesheet}${HTML_RESPONSIVE_FIT_BRIDGE}${mobileBridge}`;
  const isPublicStrict = securityMode === 'publicStrict';
  // Public preview source is sanitized before it reaches this builder. Keep
  // the bridge nonce stable per frame so unrelated editor updates do not
  // navigate every sibling iframe.
  const previewNonce = isPublicStrict ? `preview_${id}` : undefined;
  const csp = previewNonce ? buildStaticHtmlDeliveryCsp(previewNonce) : USER_HTML_PREVIEW_LIVE_CSP;
  const sizeBridge = buildHtmlPreviewBridgeScript(id, previewNonce);

  if (hasDocType || hasHtmlTag) {
    const headMarkup = `<base data-morndraft-inject href="about:blank"><meta data-morndraft-inject http-equiv="Content-Security-Policy" content="${escapeHtmlAttribute(csp)}">${previewBridge}${sizeBridge}`;
    return injectHeadMarkupIntoHtml(trimmed, headMarkup);
  }

  return `<!DOCTYPE html><html><head><base data-morndraft-inject href="about:blank"><meta data-morndraft-inject charset="UTF-8"><meta data-morndraft-inject http-equiv="Content-Security-Policy" content="${escapeHtmlAttribute(csp)}">${fontStylesheet}${buildRawHtmlFragmentViewportCss(isMobilePreview)}${isRawMode ? '' : HTML_FRAGMENT_FIT_BRIDGE}${sizeBridge}</head><body>${wrapRawHtmlFragment(source)}<div data-morndraft-inject data-html-preview-doc="${escapeHtmlAttribute(id)}"></div></body></html>`;
};

export const wrapStandaloneHtml = (
  html: string,
  title: string = 'MornDraft',
  theme: PreviewTheme = 'light',
  options: {
    includeA4PaginationRuntime?: boolean;
    includeMornDraftRuntime?: boolean;
    includeMermaidZoomRuntime?: boolean;
    scriptNonce?: string;
  } = {},
) => {
  const standaloneRuntimeNonce = options.includeMornDraftRuntime || options.includeMermaidZoomRuntime
    ? (options.scriptNonce ?? createStandaloneScriptNonce())
    : null;
  const csp = standaloneRuntimeNonce
    ? buildStaticHtmlDeliveryCsp(standaloneRuntimeNonce)
    : STATIC_HTML_DELIVERY_CSP;
  const mermaidZoomHead = options.includeMermaidZoomRuntime && standaloneRuntimeNonce ? HTML_STANDALONE_MERMAID_ZOOM_CSS : '';
  const mornDraftRuntime = options.includeMornDraftRuntime && standaloneRuntimeNonce
    ? buildStandaloneUiRuntimeScript(standaloneRuntimeNonce)
    : '';
  const mermaidZoomRuntime = options.includeMermaidZoomRuntime && standaloneRuntimeNonce
    ? buildStandaloneMermaidZoomRuntimeScript(standaloneRuntimeNonce)
    : '';
  const standaloneHtml = dedupeStandaloneHtmlStyleTags(injectMornDraftSwissCatalogSharedStyles(html));
  return buildPortableDocument({
    body: `<main class="container">
${standaloneHtml}
</main>
${mornDraftRuntime}
${mermaidZoomRuntime}`,
    bodyAttributes: { style: 'min-height:100vh;margin:0;' },
    doctype: '<!DOCTYPE html>',
    headBeforeTitle: `<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
${buildCspMetaTag(csp)}
`,
    headAfterTitle: `<style>${buildStandaloneThemeCss(theme)}</style>
${HTML_STANDALONE_FIT_BRIDGE}
${mermaidZoomHead}
`,
    language: 'zh-CN',
    title,
  });
};

export const buildStandaloneRawHtml = (
  html: string,
  theme: PreviewTheme,
  title: string,
  options: { cspPolicy?: string | null; stabilizeForMobilePreview?: boolean } = {},
) => {
  const cspPolicy = options.cspPolicy === undefined ? USER_HTML_PREVIEW_CSP : options.cspPolicy;
  const source = injectMornDraftSwissCatalogSharedStyles(
    options.stabilizeForMobilePreview ? stabilizeMobileHtmlPreviewSource(html) : html,
  );
  const trimmed = trimHtmlAsciiWhitespace(source);
  if (!trimmed) return wrapStandaloneHtml('', title, theme);

  const hasDocType = /^<!doctype[\t\n\f\r ]+html(?:[\t\n\f\r ]|>)/i.test(trimmed);
  const hasHtmlTag = /^<html(?:[\t\n\f\r ]|>)/i.test(trimmed);
  if (hasDocType || hasHtmlTag) {
    return cspPolicy ? injectCspMetaIntoHtml(trimmed, cspPolicy) : trimmed;
  }

  return buildPortableDocument({
    body: wrapRawHtmlFragment(source),
    doctype: '<!DOCTYPE html>',
    headBeforeTitle: `<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
${cspPolicy ? buildCspMetaTag(cspPolicy) : ''}
`,
    headAfterTitle: `${buildStandaloneRawHtmlFragmentViewportCss()}
`,
    language: 'zh-CN',
    title,
  });
};
