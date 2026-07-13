export type PublicStandaloneFence = Readonly<{
  closing: string;
  content: string;
  contentStart: number;
  info: string;
  language: string;
  marker: string;
  opening: string;
  openingLineBreak: '\n' | '\r\n';
  closingLineBreak: '\n' | '\r\n';
}>;

const PUBLIC_STANDALONE_FENCE_RE = /^(((?:[ \t]*(?:\r?\n))*[ \t]*)(`{3,}|~{3,})[ \t]*([^\r\n]*))(\r?\n)([\s\S]*?)(\r?\n)(\3[ \t]*)([ \t\r\n]*)$/u;

export const normalizePublicFenceInfoLanguage = (value: string) => (
  value.trim().split(/\s+/u, 1)[0]?.toLowerCase() ?? ''
);

/**
 * Parses the one closed top-level fence contract used by browser-local
 * delivery. It remains self-contained so this framework-agnostic package has
 * no workspace dependency and can be projected into an OSS candidate alone.
 */
export const parsePublicStandaloneFence = (source: string): PublicStandaloneFence | null => {
  const match = String(source ?? '').match(PUBLIC_STANDALONE_FENCE_RE);
  if (!match) return null;
  const opening = match[1] ?? '';
  const marker = match[3] ?? '';
  const info = match[4] ?? '';
  const openingLineBreak = match[5] ?? '\n';
  return {
    closing: `${match[8] ?? marker}${match[9] ?? ''}`,
    content: match[6] ?? '',
    contentStart: opening.length + openingLineBreak.length,
    info,
    language: normalizePublicFenceInfoLanguage(info),
    marker,
    opening,
    openingLineBreak: openingLineBreak as '\n' | '\r\n',
    closingLineBreak: (match[7] ?? '\n') as '\n' | '\r\n',
  };
};

export const extractPublicRawHtmlSource = (source: string) => {
  const fence = parsePublicStandaloneFence(source);
  return fence && (fence.language === 'html' || fence.language === 'html-preview')
    ? fence.content
    : source;
};
