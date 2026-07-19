import { createPortableArtifactMapSidecarHtml } from '@morndraft/core';

export type DeliveryDisplayOptions = {
  includeA4Pagination?: boolean;
  includeCodeChrome?: boolean;
  includeArtifactMap?: boolean;
};

export type PortableArtifactMapEntry = {
  id: string;
  kind: string;
  kindLabel: string;
  line: number;
  level: number;
  title: string;
};

const hidePortableFrameBorder = (element: HTMLElement) => {
  element.style.setProperty('border-color', 'transparent');
  element.style.setProperty('box-shadow', 'none');
};

export const removePortableBlockChrome = (root: HTMLElement) => {
  root.querySelectorAll<HTMLElement>('.aad-collapsible-block > .aad-block-header').forEach((header) => {
    header.remove();
  });
  root.querySelectorAll<HTMLElement>('.aad-artifact-block, .aad-collapsible-block, .aad-code-frame').forEach((block) => {
    hidePortableFrameBorder(block);
  });
};

export const removePortableRichCopyChrome = (root: HTMLElement) => {
  root.querySelectorAll<HTMLElement>('.code-snippet__fix, .rich-artifact__fix').forEach((section) => {
    hidePortableFrameBorder(section);
  });
  root.querySelectorAll<HTMLElement>('.code-snippet__fix > .code-header, .rich-artifact__fix > .rich-artifact-header').forEach((header) => {
    header.remove();
  });
};

const createPortableArtifactMapList = (
  doc: Document,
  entries: readonly PortableArtifactMapEntry[] | undefined,
  theme: 'dark' | 'light',
  title: string | undefined,
) => {
  if (!entries?.length) return null;

  const isDark = theme === 'dark';
  const map = doc.createElement('section');
  map.setAttribute('data-morndraft-portable-artifact-map', 'linear');
  map.style.cssText = [
    'display:block',
    'width:100%',
    'max-width:677px',
    'box-sizing:border-box',
    'margin:0 auto 16px',
    'padding:12px 14px',
    `border:1px solid ${isDark ? '#3A3A3C' : '#D9D6CC'}`,
    'border-radius:6px',
    `background:${isDark ? '#242426' : '#F5F5F0'}`,
    `color:${isDark ? '#F5F5F7' : '#1D1D18'}`,
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',Arial,sans-serif",
  ].join(';');

  const heading = doc.createElement('p');
  heading.style.cssText = [
    'display:block',
    'margin:0 0 8px',
    'padding:0',
    `color:${isDark ? '#F5F5F7' : '#1D1D18'}`,
    'font-size:13px',
    'line-height:18px',
    'font-weight:800',
  ].join(';');
  heading.textContent = title || '目录';
  map.appendChild(heading);

  const list = doc.createElement('ol');
  list.style.cssText = 'display:block;margin:0;padding:0;list-style:none;';
  entries.forEach((entry) => {
    const item = doc.createElement('li');
    const level = Math.min(6, Math.max(1, Number.isFinite(entry.level) ? entry.level : 1));
    item.style.cssText = [
      'display:block',
      'margin:0',
      `padding:4px 0 4px ${(level - 1) * 12}px`,
      `color:${isDark ? '#D1D1D6' : '#424238'}`,
      'font-size:12px',
      'line-height:18px',
      'font-weight:650',
    ].join(';');
    item.textContent = entry.title || entry.kindLabel || 'Item';
    list.appendChild(item);
  });
  map.appendChild(list);

  return map;
};

export const prependPortableArtifactMapList = (
  clone: HTMLElement,
  entries: readonly PortableArtifactMapEntry[] | undefined,
  theme: 'dark' | 'light',
  title: string | undefined,
) => {
  const map = createPortableArtifactMapList(clone.ownerDocument, entries, theme, title);
  if (!map) return clone;

  const wrapper = clone.ownerDocument.createElement('section');
  wrapper.setAttribute('data-morndraft-portable-preview-with-map', 'linear');
  wrapper.style.cssText = [
    'display:block',
    'width:100%',
    'max-width:100%',
    'box-sizing:border-box',
  ].join(';');
  wrapper.appendChild(map);
  wrapper.appendChild(clone);
  return wrapper;
};

export const wrapPortableArtifactMapSidecar = (
  clone: HTMLElement,
  entries: readonly PortableArtifactMapEntry[] | undefined,
  theme: 'dark' | 'light',
  title: string | undefined,
) => {
  const sidecarHtml = createPortableArtifactMapSidecarHtml(entries, {
    theme,
    title: title || '目录',
  });
  if (!sidecarHtml) return clone;

  const wrapper = clone.ownerDocument.createElement('section');
  wrapper.setAttribute('data-morndraft-portable-preview-with-map', 'true');
  wrapper.style.cssText = [
    'display:flex',
    '--morndraft-portable-artifact-map-width:13.5rem',
    'align-items:flex-start',
    'width:100%',
    'max-width:100%',
    'height:auto',
    'min-height:100vh',
    'box-sizing:border-box',
    'overflow:visible',
  ].join(';');

  const template = clone.ownerDocument.createElement('template');
  template.innerHTML = sidecarHtml;
  const sidecar = template.content.firstElementChild;
  if (sidecar) wrapper.appendChild(sidecar);
  wrapper.appendChild(clone);
  return wrapper;
};
