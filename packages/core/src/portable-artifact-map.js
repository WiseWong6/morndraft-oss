const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const normalizeDepth = (level) => Math.min(6, Math.max(1, Number.isFinite(level) ? level : 1));

const getTokens = (theme) => theme === 'dark'
  ? {
      background: '#161618',
      border: 'rgba(245,245,247,.12)',
      muted: '#a1a1aa',
      text: '#f5f5f7',
      title: '#d1d1d6',
    }
  : {
      background: '#ffffff',
      border: 'rgba(29,29,24,.12)',
      muted: '#6f6f68',
      text: '#1d1d18',
      title: '#424238',
    };

export const createPortableArtifactMapSidecarHtml = (
  entries,
  {
    theme = 'light',
    title = '目录',
  } = {},
) => {
  if (!Array.isArray(entries) || entries.length === 0) return '';
  const tokens = getTokens(theme);
  const hoverBackground = theme === 'dark' ? 'rgba(245,245,247,0.09)' : 'rgba(29,29,24,0.06)';
  const items = entries.map((entry) => {
    const depth = normalizeDepth(entry?.level);
    const indent = 10 + (depth - 1) * 10;
    return `<li style="display:block;margin:0;padding:0;list-style:none;"><a data-morndraft-portable-artifact-map-link="true" href="#${escapeHtml(entry?.id || '')}" style="display:block;box-sizing:border-box;padding:7px 10px 7px ${indent}px;color:${tokens.text};font-family:-apple-system,BlinkMacSystemFont,'Inter','PingFang SC','Microsoft YaHei',sans-serif;font-size:12px;line-height:17px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-decoration:none;border-radius:4px;margin:0 6px;">${escapeHtml(entry?.title || entry?.kindLabel || 'Item')}</a></li>`;
  }).join('');

  return `<aside data-morndraft-portable-artifact-map="sidecar" style="--morndraft-portable-artifact-map-hover:${hoverBackground};display:flex;box-sizing:border-box;flex-direction:column;flex:0 0 13.5rem;width:13.5rem;max-width:13.5rem;position:sticky;top:0;align-self:flex-start;height:100vh;min-height:0;margin:0;padding:0;border-right:1px solid ${tokens.border};background:${tokens.background};color:${tokens.text};"><div style="display:flex;align-items:center;justify-content:space-between;gap:0.5rem;padding:0.75rem 0.8rem;flex-shrink:0;"><span style="display:inline-flex;align-items:center;gap:0.4rem;color:${tokens.title};font-family:-apple-system,BlinkMacSystemFont,'Inter','PingFang SC','Microsoft YaHei',sans-serif;font-size:0.76rem;font-weight:750;">${escapeHtml(title)}</span></div><nav style="flex:1 1 auto;min-height:0;overflow-y:auto;padding:0.45rem 0;"><ol style="display:block;margin:0;padding:0;list-style:none;">${items}</ol></nav></aside>`;
};
