const SCRIPT_ELEMENT_PATTERN = /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi;
const SCRIPT_START_TAG_PATTERN = /<script\b[^>]*\/?>/gi;

const TRUSTED_EDIT_CSP = [
  "default-src 'none'",
  "script-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'",
  "connect-src 'none'",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'font-src data:',
].join('; ');

const TRUSTED_EDIT_CSP_META = `<meta data-morndraft-trusted-edit-csp http-equiv="Content-Security-Policy" content="${TRUSTED_EDIT_CSP}">`;

/**
 * Builds the visual-editing document. The iframe that receives this source is
 * sandboxed with allow-same-origin but deliberately without allow-scripts.
 * Removing scripts and installing a deny-by-default CSP are defense in depth;
 * the missing allow-scripts token is the execution boundary.
 */
export const buildTrustedHtmlEditSrcDoc = (wrappedCode: string) => {
  const scriptless = wrappedCode
    .replace(SCRIPT_ELEMENT_PATTERN, '')
    .replace(SCRIPT_START_TAG_PATTERN, '');
  if (/<head\b[^>]*>/i.test(scriptless)) {
    return scriptless.replace(/<head\b[^>]*>/i, match => `${match}${TRUSTED_EDIT_CSP_META}`);
  }
  return `${TRUSTED_EDIT_CSP_META}${scriptless}`;
};

export const isTrustedHtmlEditRequest = (
  activeRequestId: string | null | undefined,
  candidateRequestId: string | null | undefined,
) => Boolean(
  activeRequestId &&
  candidateRequestId &&
  activeRequestId === candidateRequestId,
);

export const createTrustedHtmlEditRequestId = (
  frameId: string,
  sequence: number,
  now = Date.now(),
) => `html-edit:${encodeURIComponent(frameId)}:${now}:${sequence}`;
