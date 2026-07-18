const THEME_TOKENS = Object.freeze({
  dark: Object.freeze({
    background: '#242426',
    border: '#3A3A3C',
    label: '#F5F5F7',
    muted: '#A1A1A6',
  }),
  light: Object.freeze({
    background: '#F5F5F0',
    border: '#D9D6CC',
    label: '#1D1D18',
    muted: '#6E6E62',
  }),
});

const FONT_FAMILY = "-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',Arial,sans-serif";

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const getTokens = (theme) => THEME_TOKENS[theme === 'dark' ? 'dark' : 'light'];

const normalizePortableText = (value) => String(value ?? '')
  .replace(/\u00a0/g, ' ')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

/**
 * @param {{ explicitText?: string | null, fallbackText?: string | null }} [input]
 */
export const selectPortableRichBlockText = ({
  explicitText,
  fallbackText = '',
} = {}) => {
  const explicit = normalizePortableText(explicitText);
  return explicit || normalizePortableText(fallbackText);
};

const DEFAULT_HTML_PREVIEW_FALLBACK_MESSAGE =
  '这段 HTML 预览包含完整页面、脚本或外链样式，不适合直接复制为富文本。请使用分享图片或 HTML 交付。';

const CODE_THEME_TOKENS = Object.freeze({
  dark: Object.freeze({
    background: '#1a1a2e',
    headerBackground: '#2b2b43',
    border: '#2f3248',
    text: '#e4e4e7',
    muted: '#a9afc5',
  }),
  light: Object.freeze({
    background: '#f7f7f2',
    headerBackground: '#efede4',
    border: '#d9d6cc',
    text: '#1d1d18',
    muted: '#6e6e62',
  }),
});

const normalizeCodeLabel = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized.replace(/[^a-z0-9_+#.-]/g, '') || 'text';
};

const getCodeTokens = (theme) => CODE_THEME_TOKENS[theme === 'light' ? 'light' : 'dark'];

const createMacWindowDotsHtml = () => [
  '<span class="code-dots" style="float:left;display:inline;font-size:0;line-height:1;">',
  '<span class="code-dot" style="display:inline-block;font-size:14px;line-height:1;margin-right:6px;vertical-align:middle;color:#ff5f56;">●</span>',
  '<span class="code-dot" style="display:inline-block;font-size:14px;line-height:1;margin-right:6px;vertical-align:middle;color:#ffbd2e;">●</span>',
  '<span class="code-dot" style="display:inline-block;font-size:14px;line-height:1;vertical-align:middle;color:#27c93f;">●</span>',
  '</span>',
].join('');

export const createPortableBlockHeaderHtml = (label, theme = 'light', meta = '') => {
  const tokens = getTokens(theme);
  const metaHtml = meta
    ? `<span style="display:inline;margin-left:10px;color:${tokens.muted};font-size:12px;line-height:18px;font-weight:600;">${escapeHtml(meta)}</span>`
    : '';
  return `<div style="display:block;width:100%;box-sizing:border-box;margin:0;padding:8px 10px;border:0;border-bottom:1px solid ${tokens.border};border-radius:0;background:${tokens.background};color:${tokens.label};font-family:${FONT_FAMILY};font-size:13px;line-height:18px;font-weight:700;text-align:left;"><span style="display:inline;color:${tokens.label};font-weight:800;">${escapeHtml(label)}</span>${metaHtml}</div>`;
};

/**
 * @param {{
 *   label: string,
 *   meta?: string,
 *   theme?: 'dark' | 'light',
 *   bodyHtml?: string,
 *   bodyKind?: 'content' | 'media' | 'message',
 *   bodyPadding?: string,
 * }} input
 */
export const createPortableRichBlockHtml = ({
  label,
  meta = '',
  theme = 'light',
  bodyHtml = '',
  bodyKind = 'content',
  bodyPadding,
}) => {
  const tokens = getCodeTokens(theme);
  const metaHtml = meta
    ? `<span class="rich-artifact-meta" style="display:inline;margin-left:8px;color:${tokens.muted};font-size:12px;line-height:18px;font-family:${FONT_FAMILY};">${escapeHtml(meta)}</span>`
    : '';
  const resolvedBodyPadding = bodyPadding ?? (bodyKind === 'media' ? '12px' : '12px 16px');
  const bodyBackground = bodyKind === 'media'
    ? (theme === 'dark' ? '#161618' : '#FFFFFF')
    : tokens.background;
  const bodyLineHeight = bodyKind === 'message' ? '1.7' : '24px';

  return [
    `<section class="rich-artifact__fix" data-copy-preserve-layout="true" style="display:block;width:100%;max-width:677px;box-sizing:border-box;margin:0 auto 24px;padding:0;background:${bodyBackground};border:1px solid ${tokens.border};border-radius:12px;overflow:hidden;color:${tokens.text};font-family:${FONT_FAMILY};text-align:left;">`,
    `<p class="rich-artifact-header" style="display:block;box-sizing:border-box;margin:0;overflow:hidden;padding:12px 16px;background:${tokens.headerBackground};border:0;border-bottom:1px solid ${tokens.border};color:${tokens.muted};font-family:${FONT_FAMILY};font-size:12px;line-height:18px;text-align:left;">`,
    createMacWindowDotsHtml(),
    `<span class="rich-artifact-label" style="float:right;display:inline;font-size:12px;color:${tokens.muted};line-height:18px;font-family:${FONT_FAMILY};">${escapeHtml(label)}${metaHtml}</span>`,
    '</p>',
    `<div class="rich-artifact-body" style="display:block;width:100%;max-width:100%;box-sizing:border-box;margin:0;padding:${resolvedBodyPadding};background:${bodyBackground};border:0;border-radius:0;color:${tokens.text};font-family:${FONT_FAMILY};font-size:14px;line-height:${bodyLineHeight};font-weight:500;text-align:left;white-space:normal;word-break:break-word;overflow-wrap:anywhere;">${bodyHtml}</div>`,
    '</section>',
  ].join('');
};

/**
 * @param {{ label: string, theme?: 'dark' | 'light', code?: string }} input
 */
export const createPortableRichCodeBlockHtml = ({
  label,
  theme = 'dark',
  code = '',
}) => {
  const lang = normalizeCodeLabel(label);
  const tokens = getCodeTokens(theme);
  return [
    `<section class="code-snippet__fix" data-copy-preserve-layout="true" style="display:block;width:100%;max-width:677px;box-sizing:border-box;margin:0 auto 24px;padding:0;background:${tokens.background};border:1px solid ${tokens.border};border-radius:12px;overflow:hidden;color:${tokens.text};font-family:${FONT_FAMILY};text-align:left;">`,
    `<p class="code-header" style="display:block;box-sizing:border-box;margin:0;overflow:hidden;padding:12px 16px;background:${tokens.headerBackground};border:0;border-bottom:1px solid ${tokens.border};color:${tokens.muted};font-family:${FONT_FAMILY};font-size:12px;line-height:18px;text-align:left;">`,
    createMacWindowDotsHtml(),
    `<span class="code-lang" style="float:right;display:inline;font-size:12px;color:${tokens.muted};line-height:18px;font-family:${FONT_FAMILY};">${escapeHtml(lang)}</span>`,
    '</p>',
    `<pre data-lang="${escapeHtml(lang)}" style="display:block;width:auto;min-width:0;max-width:100%;box-sizing:border-box;margin:0;padding:12px 14px;background:${tokens.background};border:0;border-radius:0;overflow:auto;color:${tokens.text};font-family:Consolas,Monaco,monospace;font-size:12px;line-height:1.55;white-space:pre;word-break:normal;overflow-wrap:normal;tab-size:2;text-indent:0;text-align:left;"><code style="display:block;min-width:0;max-width:100%;font-family:inherit;font-size:inherit;line-height:inherit;color:inherit;background:transparent;white-space:inherit;word-break:inherit;overflow-wrap:inherit;tab-size:inherit;text-indent:inherit;text-align:inherit;"><span class="code-snippet_outer" style="display:block;min-width:0;max-width:100%;white-space:inherit;word-break:inherit;overflow-wrap:inherit;tab-size:inherit;text-indent:inherit;text-align:inherit;">${escapeHtml(code)}</span></code></pre>`,
    '</section>',
  ].join('');
};

export const createPortableRichMediaBlockHtml = ({
  label,
  meta = '',
  theme = 'light',
  mediaHtml = '',
}) =>
  createPortableRichBlockHtml({
    label,
    meta,
    theme,
    bodyHtml: mediaHtml,
    bodyKind: 'media',
  });

/**
 * @param {{ label: string, meta?: string, theme?: 'dark' | 'light', message?: string }} input
 */
export const createPortableRichMessageBlockHtml = ({
  label,
  meta = '',
  theme = 'light',
  message = '',
}) =>
  createPortableRichBlockHtml({
    label,
    meta,
    theme,
    bodyHtml: escapeHtml(message),
    bodyKind: 'message',
  });

export const createHtmlPreviewRichCopyFallbackHtml = (
  label = 'HTML Preview',
  theme = 'light',
  message = DEFAULT_HTML_PREVIEW_FALLBACK_MESSAGE,
  meta = '',
) =>
  createPortableRichMessageBlockHtml({
    label,
    meta,
    theme,
    message,
  });

export const createHtmlPreviewRichCopyFallbackBodyHtml = (
  theme = 'light',
  message = DEFAULT_HTML_PREVIEW_FALLBACK_MESSAGE,
) => {
  const tokens = getTokens(theme);
  return [
    `<div style="display:block;width:100%;box-sizing:border-box;margin:0 0 16px;padding:12px 14px;border:1px solid ${tokens.border};border-radius:0 0 6px 6px;background:${theme === 'dark' ? '#161618' : '#FFFFFF'};color:${tokens.label};font-family:${FONT_FAMILY};font-size:14px;line-height:24px;font-weight:500;text-align:left;">`,
    escapeHtml(message),
    '</div>',
  ].join('');
};
