export type ValidatedAiBaseUrl = {
  baseUrl: string;
  origin: string;
};

export const validateOssAiBaseUrl = (rawValue: string): ValidatedAiBaseUrl => {
  const value = rawValue.trim();
  if (!value) throw new Error('base_url_required');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('base_url_invalid');
  }
  if (url.username || url.password) throw new Error('base_url_credentials');
  if (url.search || url.hash) throw new Error('base_url_query_or_fragment');
  const hostname = url.hostname.toLowerCase();
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocalhost)) {
    throw new Error('base_url_https');
  }
  return { baseUrl: url.toString().replace(/\/$/, ''), origin: url.origin };
};

export const normalizeOssAiModels = (rawValue: string): string[] => (
  [...new Set(rawValue.split(',').map((model) => model.trim()).filter(Boolean))]
    .filter((model) => model.length <= 128)
    .slice(0, 10)
);
