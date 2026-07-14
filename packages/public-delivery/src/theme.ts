import type { PublicDeliveryTheme } from './types';

const PUBLIC_THEME_VARIABLES = [
  '--md-public-bg',
  '--md-public-paper',
  '--md-public-text',
  '--md-public-muted',
  '--md-public-border',
  '--md-public-hover',
] as const;

const PUBLIC_THEME_FALLBACKS: Record<PublicDeliveryTheme, Record<(typeof PUBLIC_THEME_VARIABLES)[number], string>> = {
  light: {
    '--md-public-bg': '#f3f3ef',
    '--md-public-paper': '#fff',
    '--md-public-text': '#1d1d18',
    '--md-public-muted': '#6f7068',
    '--md-public-border': 'rgba(29, 29, 24, .15)',
    '--md-public-hover': 'rgba(29, 29, 24, .06)',
  },
  dark: {
    '--md-public-bg': '#171713',
    '--md-public-paper': '#22221d',
    '--md-public-text': '#f4f4ed',
    '--md-public-muted': '#b6b6aa',
    '--md-public-border': 'rgba(255, 255, 255, .16)',
    '--md-public-hover': 'rgba(255, 255, 255, .08)',
  },
};

export const getPublicThemePaperColor = (theme: PublicDeliveryTheme) => (
  PUBLIC_THEME_FALLBACKS[theme]['--md-public-paper']
);

/**
 * Delivery targets are detached from `.md-public-workspace`, which normally
 * owns these inherited variables. Snapshot the resolved values so captures and
 * portable files keep the exact public Final palette in either theme.
 */
export const serializePublicThemeVariables = (
  previewRoot: HTMLElement,
  theme: PublicDeliveryTheme,
) => {
  const computed = previewRoot.ownerDocument.defaultView?.getComputedStyle(previewRoot);
  return PUBLIC_THEME_VARIABLES.map((name) => {
    const value = computed?.getPropertyValue(name).trim() || PUBLIC_THEME_FALLBACKS[theme][name];
    return `${name}:${value}`;
  }).join(';');
};
