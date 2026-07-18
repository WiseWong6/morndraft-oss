const DARK_FALLBACK = {
  colorScheme: 'dark',
  background: '#111113',
  foreground: '#d1d1d6',
};

const LIGHT_FALLBACK = {
  colorScheme: 'light',
  background: '#ffffff',
  foreground: '#0f172a',
};

const TRANSPARENT_COLOR_RE = /^rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)$/i;

const normalizeTheme = (theme) => (theme === 'dark' ? 'dark' : 'light');

export const getThemeFallbackPalette = (theme) =>
  normalizeTheme(theme) === 'dark' ? { ...DARK_FALLBACK } : { ...LIGHT_FALLBACK };

const parseRgb = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const hexMatch = trimmed.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (hex.length === 3) {
      return {
        r: Number.parseInt(hex[0] + hex[0], 16),
        g: Number.parseInt(hex[1] + hex[1], 16),
        b: Number.parseInt(hex[2] + hex[2], 16),
        a: 1,
      };
    }

    return {
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16),
      a: 1,
    };
  }

  const match = trimmed.match(/^rgba?\(([^)]+)\)$/i);
  if (!match) return null;

  const [r, g, b, a = 1] = match[1].split(',').map((part) => Number.parseFloat(part.trim()));
  if (![r, g, b, a].every(Number.isFinite)) return null;
  return { r, g, b, a };
};

const srgbToLinear = (value) => {
  const normalized = value / 255;
  return normalized <= 0.03928
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
};

const getLuminance = (rgb) =>
  0.2126 * srgbToLinear(rgb.r) + 0.7152 * srgbToLinear(rgb.g) + 0.0722 * srgbToLinear(rgb.b);

const getContrastRatio = (foreground, background) => {
  const lighter = Math.max(getLuminance(foreground), getLuminance(background));
  const darker = Math.min(getLuminance(foreground), getLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
};

const sameRgb = (left, right) =>
  Boolean(left && right) &&
  left.r === right.r &&
  left.g === right.g &&
  left.b === right.b &&
  Math.round((left.a ?? 1) * 1000) === Math.round((right.a ?? 1) * 1000);

const isTransparent = (value) =>
  value === 'transparent' || (typeof value === 'string' && TRANSPARENT_COLOR_RE.test(value.trim()));

/**
 * Pick a readable fallback color only when the element is inheriting a color
 * that becomes unreadable on its own custom background.
 *
 * @param {{
 *   backgroundColor: string,
 *   computedColor: string,
 *   inheritedColor?: string | null,
 *   minimumContrast?: number,
 *   theme?: 'dark' | 'light',
 * }} input
 * @returns {string | null}
 */
export const pickAdaptiveTextColor = ({
  backgroundColor,
  computedColor,
  inheritedColor = null,
  minimumContrast = 4.5,
  theme = 'light',
}) => {
  if (isTransparent(backgroundColor)) return null;

  const background = parseRgb(backgroundColor);
  const current = parseRgb(computedColor);
  if (!background || !current) return null;

  const inherited = inheritedColor ? parseRgb(inheritedColor) : null;
  if (inherited && !sameRgb(current, inherited)) {
    return null;
  }

  if (getContrastRatio(current, background) >= minimumContrast) {
    return null;
  }

  const palette = getThemeFallbackPalette(theme);
  const darkCandidate = parseRgb(DARK_FALLBACK.background);
  const lightCandidate = parseRgb(DARK_FALLBACK.foreground);
  if (!darkCandidate || !lightCandidate) {
    return palette.foreground;
  }

  return getContrastRatio(darkCandidate, background) >= getContrastRatio(lightCandidate, background)
    ? DARK_FALLBACK.background
    : DARK_FALLBACK.foreground;
};

/**
 * Inject a conservative theme bridge for HTML preview iframes.
 * It only fills in html/body background and foreground when they are still
 * transparent or on browser-default black text in dark mode.
 *
 * @param {'dark' | 'light'} theme
 * @returns {string}
 */
export const buildHtmlPreviewThemeBridge = (theme) => {
  const palette = getThemeFallbackPalette(theme);
  const palettes = {
    dark: getThemeFallbackPalette('dark'),
    light: getThemeFallbackPalette('light'),
  };
  const escapedBackground = JSON.stringify(palette.background);
  const escapedForeground = JSON.stringify(palette.foreground);
  const escapedScheme = JSON.stringify(palette.colorScheme);
  const escapedPalettes = JSON.stringify(palettes);

  return `
<style>:root { color-scheme: ${palette.colorScheme}; } html, body { overscroll-behavior: none; }</style>
<script>
(function() {
  var palettes = ${escapedPalettes};
  var fallbackTheme = {
    colorScheme: ${escapedScheme},
    backgroundColor: ${escapedBackground},
    foregroundColor: ${escapedForeground}
  };
  var transparentValues = ['transparent', 'rgba(0, 0, 0, 0)', 'rgba(0,0,0,0)'];
  var isTransparent = function(value) {
    return transparentValues.indexOf(value) !== -1;
  };
  var hasInlineColor = function(el) {
    return !!(el && el.style && el.style.color);
  };
  var setTheme = function(theme) {
    var next = palettes[theme === 'dark' ? 'dark' : 'light'];
    fallbackTheme = {
      colorScheme: next.colorScheme,
      backgroundColor: next.background,
      foregroundColor: next.foreground
    };
    apply();
  };
  var apply = function() {
    var html = document.documentElement;
    var body = document.body;
    if (!html || !body) return;
    html.style.colorScheme = fallbackTheme.colorScheme;
    [html, body].forEach(function(el) {
      var computed = window.getComputedStyle(el);
      if (isTransparent(computed.backgroundColor)) {
        el.style.backgroundColor = fallbackTheme.backgroundColor;
      }
      if (
        fallbackTheme.colorScheme === 'dark' &&
        !hasInlineColor(el) &&
        computed.color === 'rgb(0, 0, 0)'
      ) {
        el.style.color = fallbackTheme.foregroundColor;
      }
    });
  };
  window.__setArtifactPreviewTheme = setTheme;
  window.addEventListener('message', function(event) {
    if (event && event.data && event.data.type === 'html-preview-theme') {
      setTheme(event.data.theme);
    }
  });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply, { once: true });
  } else {
    apply();
  }
})();
</script>`;
};

const getStandaloneTokens = (theme) =>
  normalizeTheme(theme) === 'dark'
    ? {
        canvas: '#111113',
        paper: '#161618',
        surface: '#1C1C1E',
        mutedSurface: '#242426',
        border: '#3A3A3C',
        text: '#D1D1D6',
        textStrong: '#F5F5F7',
        muted: '#A1A1A6',
        mutedStrong: '#C7C7CC',
        accent: '#93C5FD',
        accentFill: '#2962FF',
        accentSoft: 'rgba(147,197,253,.16)',
        codeBg: '#161618',
        codeHeaderBg: '#242426',
        codeBorder: '#3A3A3C',
        codeText: '#BFD2FF',
        syntaxText: '#E4E4E7',
        syntaxComment: '#8E8E93',
        syntaxKeyword: '#9BB8FF',
        syntaxFunction: '#F2D58A',
        syntaxType: '#74D6C5',
        syntaxString: '#E6AA7A',
        syntaxNumber: '#B8D98F',
        syntaxVariable: '#9FD3FF',
        syntaxProperty: '#C7B2FF',
        syntaxPunctuation: '#D1D1D6',
        syntaxRegex: '#FF9F9F',
        shadow: 'none',
        blockShadow: 'none',
      }
    : {
        canvas: '#F5F5F0',
        paper: '#FFFFFF',
        surface: '#FFFFFF',
        mutedSurface: '#EEEDE6',
        border: '#D9D6CC',
        text: '#1D1D18',
        textStrong: '#000000',
        muted: '#6E6E62',
        mutedStrong: '#424238',
        accent: '#002FA7',
        accentFill: '#002FA7',
        accentSoft: 'rgba(0,47,167,.08)',
        codeBg: '#F7F7F2',
        codeHeaderBg: '#EFEDE4',
        codeBorder: '#D9D6CC',
        codeText: '#123B8F',
        syntaxText: '#1D1D18',
        syntaxComment: '#7A7568',
        syntaxKeyword: '#002FA7',
        syntaxFunction: '#6B4A00',
        syntaxType: '#1F7668',
        syntaxString: '#8A3A16',
        syntaxNumber: '#6B5F00',
        syntaxVariable: '#315F8F',
        syntaxProperty: '#7A3F7A',
        syntaxPunctuation: '#424238',
        syntaxRegex: '#A23A3A',
        shadow: '0 12px 32px rgba(29,29,24,.06)',
        blockShadow: 'none',
      };

export const buildStandaloneThemeCss = (theme) => {
  const tokens = getStandaloneTokens(theme);

  return `
:root{color-scheme:${normalizeTheme(theme)};--aad-canvas:${tokens.canvas};--aad-paper:${tokens.paper};--aad-surface:${tokens.surface};--aad-muted-surface:${tokens.mutedSurface};--aad-border:${tokens.border};--aad-text:${tokens.text};--aad-text-strong:${tokens.textStrong};--aad-muted:${tokens.muted};--aad-muted-strong:${tokens.mutedStrong};--aad-accent:${tokens.accent};--aad-accent-fill:${tokens.accentFill};--aad-accent-soft:${tokens.accentSoft};--aad-code-bg:${tokens.codeBg};--aad-code-header-bg:${tokens.codeHeaderBg};--aad-code-border:${tokens.codeBorder};--aad-code-text:${tokens.codeText};--aad-syntax-text:${tokens.syntaxText};--aad-syntax-comment:${tokens.syntaxComment};--aad-syntax-keyword:${tokens.syntaxKeyword};--aad-syntax-function:${tokens.syntaxFunction};--aad-syntax-type:${tokens.syntaxType};--aad-syntax-string:${tokens.syntaxString};--aad-syntax-number:${tokens.syntaxNumber};--aad-syntax-variable:${tokens.syntaxVariable};--aad-syntax-property:${tokens.syntaxProperty};--aad-syntax-punctuation:${tokens.syntaxPunctuation};--aad-syntax-regex:${tokens.syntaxRegex};--aad-radius:8px;--aad-radius-sm:6px;--aad-shadow:${tokens.shadow};--aad-shadow-subtle:${tokens.blockShadow};--aad-font-sans:'MornDraft Sans SC','Noto Sans SC','Source Han Sans SC','PingFang SC','Microsoft YaHei',sans-serif;--aad-font-serif:'MornDraft Serif SC','Noto Serif SC','Source Han Serif SC','Songti SC','SimSun',serif;--aad-font-mono:'IBM Plex Mono','JetBrains Mono','SFMono-Regular',Consolas,monospace}
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;min-height:100%;background:var(--aad-canvas);color:var(--aad-text);overscroll-behavior:auto}
body{font-family:var(--aad-font-sans);line-height:1.75}
main.container{width:100%;min-height:100vh;margin:0;padding:clamp(18px,3vw,40px);background:var(--aad-canvas)}
[data-morndraft-portable-preview-with-map="true"]{--morndraft-portable-artifact-map-width:13.5rem;display:block!important;position:relative;width:100%;max-width:100%;min-height:100vh;box-sizing:border-box;padding-left:var(--morndraft-portable-artifact-map-width);overflow:visible!important}
[data-morndraft-portable-preview-with-map="true"]>[data-morndraft-portable-artifact-map="sidecar"]{position:fixed!important;inset:0 auto 0 0;width:var(--morndraft-portable-artifact-map-width)!important;max-width:var(--morndraft-portable-artifact-map-width)!important;height:100vh!important;height:100dvh!important;z-index:20;overflow:hidden}
[data-morndraft-portable-preview-with-map="true"]>[data-morndraft-portable-artifact-map="sidecar"] nav{overscroll-behavior:contain}
[data-morndraft-portable-artifact-map="sidecar"] a[data-morndraft-portable-artifact-map-link="true"]:hover{background:var(--morndraft-portable-artifact-map-hover,rgba(29,29,24,0.06))}
@media (max-width:1023px){[data-morndraft-portable-preview-with-map="true"]{padding-left:0!important;min-height:0!important}[data-morndraft-portable-preview-with-map="true"]>[data-morndraft-portable-artifact-map="sidecar"]{display:none!important}}
.aad-document-surface{width:min(100%,920px);margin:0 auto;overflow-x:auto;border:1px solid var(--aad-border);border-radius:var(--aad-radius);background:var(--aad-paper);color:var(--aad-text);box-shadow:var(--aad-shadow);padding:clamp(24px,4vw,52px);font-family:var(--aad-font-sans);font-size:16px;font-weight:300;line-height:1.75}
.aad-document-surface[data-preview-a4-pagination="true"]{--aad-preview-a4-page-width:min(100%,920px);--aad-preview-a4-page-height:calc(var(--aad-preview-a4-page-width) * 1.4142857143);--aad-preview-a4-page-margin:calc(var(--aad-preview-a4-page-width) * .060475);--aad-preview-a4-page-gap:44px;position:relative;width:var(--aad-preview-a4-page-width);max-width:100%;min-height:var(--aad-preview-a4-page-height);overflow:visible;border:0;border-radius:0;background:repeating-linear-gradient(to bottom,var(--aad-paper) 0,var(--aad-paper) var(--aad-preview-a4-page-height),transparent var(--aad-preview-a4-page-height),transparent calc(var(--aad-preview-a4-page-height) + var(--aad-preview-a4-page-gap)));box-shadow:none;padding:var(--aad-preview-a4-page-margin)}
.aad-document-surface[data-preview-a4-pagination="true"]>*{break-inside:avoid;page-break-inside:avoid}
.aad-document-surface[data-preview-a4-pagination="true"] [data-preview-a4-break-before="true"]{break-before:page;page-break-before:always}
.aad-artifact-block,.aad-code-block,.aad-json-viewer,.mermaid-container,.aad-document-surface pre{width:100%;max-width:100%;box-sizing:border-box}
.aad-document-surface :where(h1,h2,h3,h4,h5,h6){color:var(--aad-text-strong);font-family:var(--aad-font-serif);font-weight:700;line-height:1.35;letter-spacing:0}
.aad-document-surface h1{margin:0 0 1.05em;font-size:clamp(1.85rem,3vw,2.55rem)}
.aad-document-surface h2{margin:1.75em 0 .75em;font-size:clamp(1.38rem,2vw,1.72rem)}
.aad-document-surface h3{margin:1.45em 0 .65em;font-size:1.16rem}
.aad-document-surface :where(h1,h2,h3,h4,h5,h6):has(+ .aad-code-block-wrapper),.aad-document-surface :where(h1,h2,h3,h4,h5,h6):has(+ [data-artifact-id] .aad-code-block-wrapper){margin-bottom:.45em}
.aad-document-surface p,.aad-document-surface .aad-md-paragraph{margin:0 0 1em;color:var(--aad-text)}
.aad-document-surface a{color:var(--aad-accent);text-decoration-color:var(--aad-accent);text-underline-offset:.18em}
.aad-document-surface a:hover{text-decoration:underline}
.aad-document-surface strong{color:var(--aad-text-strong);font-weight:700}
.aad-document-surface blockquote{margin:1.25em 0;padding:.85em 1em;border-left:3px solid var(--aad-accent-fill);border-radius:0 var(--aad-radius-sm) var(--aad-radius-sm) 0;background:var(--aad-muted-surface);color:var(--aad-muted-strong);font-style:normal}
.aad-document-surface :where(ul,ol){margin:.85em 0 1.2em;padding-left:1.45em}
.aad-document-surface li{margin:.28em 0}
.aad-document-surface table{width:100%;margin:1.25em 0;border-collapse:separate;border-spacing:0;overflow:hidden;border:1px solid var(--aad-border);border-radius:var(--aad-radius)}
.aad-document-surface th,.aad-document-surface td{border-right:1px solid var(--aad-border);border-bottom:1px solid var(--aad-border);padding:.58rem .78rem;line-height:1.45;text-align:left;vertical-align:middle}
.aad-document-surface td{font-size:15px}
.aad-document-surface th{background:var(--aad-muted-surface);color:var(--aad-text-strong);font-weight:650}
.aad-document-surface :where(th,td)>:where(p,.aad-md-paragraph){margin:0}
.aad-document-surface tr:last-child td{border-bottom:0}
.aad-document-surface th:last-child,.aad-document-surface td:last-child{border-right:0}
.aad-document-surface hr{margin:2em 0;border:0;border-top:1px solid var(--aad-border)}
.aad-inline-code{border:1px solid var(--aad-border);border-radius:5px;background:var(--aad-code-bg);color:var(--aad-code-text);font-family:var(--aad-font-mono);font-size:.88em;padding:.12em .36em}
.aad-code-block{background:var(--aad-code-bg)!important;color:var(--aad-syntax-text);border:0!important;border-radius:0!important;box-shadow:none!important;overflow-x:auto;overflow-wrap:normal;font-family:var(--aad-font-mono);font-size:13px;line-height:1.6;margin:0!important;padding:12px 14px!important;tab-size:2;text-align:left;text-indent:0;white-space:pre;word-break:normal}
.aad-document-surface pre:not(.aad-code-block):not(.aad-json-viewer){background:var(--aad-code-bg)!important;color:var(--aad-syntax-text);border:1px solid var(--aad-code-border);border-radius:var(--aad-radius);overflow-x:auto;font-family:var(--aad-font-mono);font-size:13px;line-height:1.6;margin:0 0 1.5rem;padding:16px}
.aad-code-block .token.comment,.aad-code-block .token.prolog,.aad-code-block .token.doctype,.aad-code-block .token.cdata{color:var(--aad-syntax-comment)!important}
.aad-code-block .token.keyword{color:var(--aad-syntax-keyword)!important}
.aad-code-block .token.function{color:var(--aad-syntax-function)!important}
.aad-code-block .token.class-name,.aad-code-block .token.maybe-class-name,.aad-code-block .token.builtin{color:var(--aad-syntax-type)!important}
.aad-code-block .token.string,.aad-code-block .token.char,.aad-code-block .token.template-string{color:var(--aad-syntax-string)!important}
.aad-code-block .token.number,.aad-code-block .token.boolean{color:var(--aad-syntax-number)!important}
.aad-code-block .token.variable,.aad-code-block .token.parameter,.aad-code-block .token.interpolation{color:var(--aad-syntax-variable)!important}
.aad-code-block .token.property,.aad-code-block .token.tag,.aad-code-block .token.constant,.aad-code-block .token.symbol{color:var(--aad-syntax-property)!important}
.aad-code-block .token.punctuation,.aad-code-block .token.operator,.aad-code-block .token.interpolation-punctuation{color:var(--aad-syntax-punctuation)!important}
.aad-code-block .token.regex,.aad-code-block .token.important{color:var(--aad-syntax-regex)!important}
.aad-code-block code{display:block;min-width:max-content;background:transparent;color:inherit;border:0;font:inherit;overflow-wrap:inherit;padding:0;tab-size:inherit;text-align:inherit;text-indent:inherit;white-space:inherit;word-break:inherit}
pre code{background:transparent;color:inherit;border:0;padding:0}
.aad-artifact-block{margin:1.25rem 0;overflow:hidden;border:1px solid var(--aad-border);border-radius:var(--aad-radius);background:var(--aad-surface);box-shadow:var(--aad-shadow-subtle)}
.aad-code-frame{margin:0 0 1.5rem;border-color:var(--aad-code-border);background:var(--aad-code-bg)}
.aad-block-header{display:flex;min-height:36px;align-items:center;justify-content:space-between;gap:.75rem;border-bottom:1px solid var(--aad-border);background:var(--aad-muted-surface);color:var(--aad-muted-strong);font-family:var(--aad-font-mono);font-size:.74rem;font-weight:650;padding:.42rem .75rem}
.aad-code-frame .aad-block-header{border-bottom-color:var(--aad-code-border);background:var(--aad-code-header-bg)}
.aad-block-label{display:inline-flex;align-items:center;gap:.36rem;color:var(--aad-muted-strong)}
.aad-block-label::before{content:"";width:.45rem;height:.45rem;border-radius:999px;background:var(--aad-accent-fill)}
.aad-block-header-main{display:inline-flex;min-width:0;align-items:center;gap:.5rem}
.aad-block-header-actions{display:inline-flex;align-items:center;gap:.35rem}
.aad-collapsible-toggle{display:inline-flex;width:26px;height:26px;flex:0 0 26px;align-items:center;justify-content:center;border:0;border-radius:var(--aad-radius-sm);background:transparent;color:var(--aad-muted);padding:0;cursor:pointer}
.aad-collapsible-toggle svg{transition:transform .18s ease}
.aad-collapsible-block[data-collapsed="true"] .aad-collapsible-toggle svg{transform:rotate(-90deg)}
.aad-collapsible-body{display:grid;grid-template-rows:1fr;opacity:1;overflow:hidden;transition:grid-template-rows .22s ease,opacity .16s ease,visibility 0s linear 0s;visibility:visible}
.aad-collapsible-body-inner{min-height:0;overflow:hidden}
.aad-markdown-preview-block .aad-collapsible-body-inner{padding:1rem}
.aad-collapsible-block[data-collapsed="true"] .aad-collapsible-body{grid-template-rows:0fr;opacity:0;pointer-events:none;transition:grid-template-rows .22s ease,opacity .16s ease,visibility 0s linear .22s;visibility:hidden}
.aad-editable-code-layer{position:relative;background:var(--aad-code-bg)}
.aad-json-block pre,.aad-json-block code{font-family:var(--aad-font-mono)!important;font-size:13px!important;line-height:1.6!important;tab-size:2;text-align:left;text-indent:0}
.aad-json-block pre{background:var(--aad-code-bg)!important}
.aad-json-viewer{box-sizing:border-box;width:100%;max-width:100%;margin:0;overflow:auto;background:var(--aad-code-bg);color:var(--aad-syntax-text);padding:12px 14px}
.aad-json-viewer code{display:block;min-width:max-content;background:transparent;color:inherit;padding:0;border:0}
.aad-json-line{white-space:pre}
.aad-json-tree-line{display:flex;min-width:max-content;align-items:baseline;padding-left:calc(var(--aad-json-depth,0) * 2ch)}
.aad-json-tree-toggle,.aad-json-tree-spacer{width:18px;height:18px;flex:0 0 18px;margin-right:2px}
.aad-json-tree-toggle{display:inline-flex;align-items:center;justify-content:center;align-self:center;padding:0;border:0;border-radius:4px;background:transparent;color:var(--aad-muted);cursor:pointer}
.aad-json-tree-toggle:hover{background:color-mix(in srgb,var(--aad-accent) 10%,transparent);color:var(--aad-accent)}
.aad-json-tree-toggle svg{transition:transform .16s ease}
.aad-json-tree-toggle[aria-expanded="false"] svg{transform:rotate(-90deg)}
.aad-json-node-summary{color:var(--aad-muted)}
.aad-json-key{color:var(--aad-accent)}
.aad-json-string{color:${normalizeTheme(theme) === 'dark' ? '#B8C97A' : '#5C6F2F'}}
.aad-json-number{color:${normalizeTheme(theme) === 'dark' ? '#F2B56B' : '#985B10'}}
.aad-json-boolean{color:${normalizeTheme(theme) === 'dark' ? '#D7B6FF' : '#7D4DB3'}}
.aad-json-null,.aad-json-punctuation,.aad-json-indent{color:var(--aad-muted)}
.aad-mermaid-canvas,.mermaid-container{background:var(--aad-surface)}
.mermaid-container{align-items:center;min-height:160px;overflow:auto}
.mermaid-diagram-canvas{width:max-content;max-width:none;margin:0 auto;display:flex;justify-content:center}
.mermaid-container svg{max-width:100%;height:auto;display:block;margin:0 auto}
.mermaid-diagram-canvas>svg,.mermaid-container svg[id^="mermaid-"]{display:block;width:100%;min-width:0;margin:0 auto}
img,svg{max-width:100%;height:auto}
`;
};

export const injectThemeBridgeIntoHtmlDocument = (html, theme) => {
  const trimmed = html.trim();
  if (!trimmed) return trimmed;

  const bridge = buildHtmlPreviewThemeBridge(theme);
  const charsetMetaPattern =
    /(<meta\b[^>]*(?:charset\s*=|content\s*=\s*["'][^"']*charset\s*=)[^>]*>)/i;
  const charsetMeta = '<meta charset="UTF-8">';
  const headContent = `${charsetMeta}${bridge}`;

  if (/<head[\s>]/i.test(trimmed)) {
    return trimmed.replace(/(<head[^>]*>)([\s\S]*?)(<\/head>)/i, (_, openHead, head, closeHead) => {
      if (charsetMetaPattern.test(head)) {
        return `${openHead}${head.replace(charsetMetaPattern, `$1${bridge}`)}${closeHead}`;
      }

      return `${openHead}${headContent}${head}${closeHead}`;
    });
  }

  if (/<html[\s>]/i.test(trimmed)) {
    return trimmed.replace(/(<html[^>]*>)/i, `$1<head>${headContent}</head>`);
  }

  if (/^<!doctype\s+html[\s>]/i.test(trimmed)) {
    return trimmed.replace(/^(<!doctype\s+html[^>]*>)/i, `$1<html><head>${headContent}</head>`);
  }

  return `${headContent}${trimmed}`;
};
