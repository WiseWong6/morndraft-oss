export const MORNDRAFT_FLAT_LAYOUT_TIERS = Object.freeze({
  FREE: 'free',
  PRO: 'pro',
});

export const FREE_MORNDRAFT_FLAT_LAYOUT_STYLES = Object.freeze([
  Object.freeze({ layout: 'flow', variants: Object.freeze(['chain', 'timeline', 'loop', 'gantt']) }),
  Object.freeze({ layout: 'metrics', variants: Object.freeze(['radar-hex']) }),
  Object.freeze({ layout: 'map', variants: Object.freeze(['mind']) }),
]);

const normalizeStyleValue = (value) => String(value ?? '').trim();

const getLayoutStyleKey = ({ layout, variant }) =>
  `${normalizeStyleValue(layout)}::${normalizeStyleValue(variant)}`;

const FREE_MORNDRAFT_FLAT_LAYOUT_STYLE_KEYS = new Set(
  FREE_MORNDRAFT_FLAT_LAYOUT_STYLES.flatMap(({ layout, variants }) =>
    variants.map((variant) => getLayoutStyleKey({ layout, variant }))),
);

export const resolveMornDraftFlatLayoutTier = ({ layout, variant } = {}) =>
  FREE_MORNDRAFT_FLAT_LAYOUT_STYLE_KEYS.has(getLayoutStyleKey({ layout, variant }))
    ? MORNDRAFT_FLAT_LAYOUT_TIERS.FREE
    : MORNDRAFT_FLAT_LAYOUT_TIERS.PRO;
