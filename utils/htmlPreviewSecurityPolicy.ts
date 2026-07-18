export type HtmlPreviewSandboxKind =
  | 'srcdoc'
  | 'standalone';

export type HtmlPreviewSecurityPolicyMode =
  | 'compat'
  | 'liveCompat'
  | 'publicStrict'
  | 'sharedCompat'
  | 'strict';

export const HTML_PREVIEW_COMPAT_SECURITY_POLICY = Object.freeze({
  sandbox: Object.freeze({
    srcdoc: 'allow-scripts',
    standalone: 'allow-scripts',
  }),
});

export const HTML_PREVIEW_LIVE_COMPAT_SECURITY_POLICY = Object.freeze({
  sandbox: Object.freeze({
    srcdoc: 'allow-scripts',
    standalone: 'allow-scripts',
  }),
});

export const HTML_PREVIEW_SHARED_COMPAT_SECURITY_POLICY = Object.freeze({
  sandbox: Object.freeze({
    srcdoc: 'allow-scripts',
    standalone: 'allow-scripts',
  }),
});

export const HTML_PREVIEW_STRICT_SECURITY_POLICY = Object.freeze({
  sandbox: Object.freeze({
    srcdoc: 'allow-same-origin',
    standalone: '',
  }),
});

export const HTML_PREVIEW_PUBLIC_STRICT_SECURITY_POLICY = Object.freeze({
  sandbox: Object.freeze({
    srcdoc: 'allow-scripts',
    standalone: '',
  }),
});

export const getHtmlPreviewSecurityPolicy = (
  mode: HtmlPreviewSecurityPolicyMode = 'compat',
) => (
  mode === 'strict'
    ? HTML_PREVIEW_STRICT_SECURITY_POLICY
    : mode === 'publicStrict'
      ? HTML_PREVIEW_PUBLIC_STRICT_SECURITY_POLICY
    : mode === 'sharedCompat'
      ? HTML_PREVIEW_SHARED_COMPAT_SECURITY_POLICY
      : mode === 'liveCompat'
        ? HTML_PREVIEW_LIVE_COMPAT_SECURITY_POLICY
        : HTML_PREVIEW_COMPAT_SECURITY_POLICY
);

export const getHtmlPreviewIframeSandbox = (
  kind: HtmlPreviewSandboxKind,
  mode: HtmlPreviewSecurityPolicyMode = 'compat',
) =>
  getHtmlPreviewSecurityPolicy(mode).sandbox[kind];
