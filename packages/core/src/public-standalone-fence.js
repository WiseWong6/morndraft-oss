const PUBLIC_STANDALONE_OPENING_RE = /^((?:[ \t]*(?:\r?\n))*[ \t]*)(`{3,}|~{3,})[ \t]*([^\r\n]*)(\r?\n)/u;
const PUBLIC_STANDALONE_CLOSING_RE = /(\r?\n)([ \t]*)(`{3,}|~{3,})[ \t]*([ \t\r\n]*)$/u;

export const normalizePublicFenceInfoLanguage = (value) => (
  String(value ?? '').trim().split(/\s+/u, 1)[0]?.toLowerCase() ?? ''
);

/**
 * Parses one closed top-level fence while preserving exact whitespace and line
 * endings. Public editors and local delivery share this narrow source contract.
 */
export const parsePublicStandaloneFence = (source) => {
  const value = String(source ?? '');
  const openingMatch = value.match(PUBLIC_STANDALONE_OPENING_RE);
  if (!openingMatch) return null;
  const openingLineBreak = openingMatch[4] ?? '\n';
  const opening = value.slice(0, openingMatch[0].length - openingLineBreak.length);
  const marker = openingMatch[2] ?? '';
  const info = openingMatch[3] ?? '';
  const remainder = value.slice(openingMatch[0].length);
  const closingMatch = remainder.match(PUBLIC_STANDALONE_CLOSING_RE);
  if (!closingMatch) return null;
  const closingMarker = closingMatch[3] ?? '';
  if (closingMarker[0] !== marker[0] || closingMarker.length < marker.length) return null;
  const closingStart = openingMatch[0].length + (closingMatch.index ?? 0) + (closingMatch[1]?.length ?? 0);
  return {
    closing: value.slice(closingStart),
    content: remainder.slice(0, closingMatch.index ?? 0),
    contentStart: opening.length + openingLineBreak.length,
    info,
    language: normalizePublicFenceInfoLanguage(info),
    marker,
    opening,
    openingLineBreak,
    closingLineBreak: closingMatch[1] ?? '\n',
  };
};
