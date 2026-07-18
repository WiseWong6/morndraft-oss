const COMMON_ICON_FONTS = ['Font Awesome 6 Free', 'Font Awesome 6 Brands', 'Font Awesome 5 Free', 'Font Awesome 5 Brands', 'FontAwesome', 'Material Icons', 'Material Icons Outlined', 'Material Symbols Outlined', 'Bootstrap Icons'];

export const getUsedFontFamilies = (root: HTMLElement): Set<string> => {
  const families = new Set<string>();
  const view = root.ownerDocument.defaultView;
  if (!view) return families;
  const elements = [root, ...Array.from(root.querySelectorAll('*'))];
  for (const el of elements) {
    const family = view.getComputedStyle(el).fontFamily;
    if (!family) continue;
    family.split(',').forEach((f) => {
      const name = f.trim().replace(/^["']|["']$/g, '');
      if (
        name &&
        !/^(inherit|initial|unset|serif|sans-serif|monospace|cursive|fantasy|system-ui)$/.test(name)
      ) {
        families.add(name);
      }
    });
  }
  return families;
};

export const resolveCaptureFontFamilies = (root: HTMLElement): Set<string> => {
  const fontFamilies = new Set<string>([...COMMON_ICON_FONTS, ...getUsedFontFamilies(root)]);
  return fontFamilies;
};
