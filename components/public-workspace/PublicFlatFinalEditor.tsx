import React, { useEffect, useMemo, useState } from 'react';
import {
  createMornDraftFlatSourceEditMap,
  parseMornDraftHtmlSourceStructure,
  patchMornDraftFlatSourceValues,
  updateMornDraftHtmlSourceComponent,
} from '@morndraft/core/oss-public';
import type { PublicWorkspaceLocale } from './types';

type FlatTextEntry = { path: string; value: string };

export const updatePublicFlatDraftValue = (
  current: Readonly<Record<string, string>>,
  path: string,
  value: string,
) => ({ ...current, [path]: value });

const createFlatEditModel = (html: string) => {
  const structure = parseMornDraftHtmlSourceStructure(html);
  if (!structure.ok || !structure.component || typeof structure.component !== 'object') return null;
  const componentSource = JSON.stringify(structure.component, null, 2);
  const sourceEditMap = createMornDraftFlatSourceEditMap(componentSource) as Record<string, { value?: unknown }>;
  const entries = Object.entries(sourceEditMap)
    .filter(([path, entry]) => (
      typeof entry.value === 'string' && path !== '$.layout' && path !== '$.variant'
    ))
    .map(([path, entry]) => ({ path, value: String(entry.value) }));
  return entries.length ? { componentSource, entries } : null;
};

export const isPublicMornDraftFlatHtml = (html: string) => createFlatEditModel(html) !== null;

export const patchPublicMornDraftFlatHtml = (
  html: string,
  path: string,
  value: string,
) => {
  const model = createFlatEditModel(html);
  if (!model) return null;
  const sourcePatch = patchMornDraftFlatSourceValues(model.componentSource, [{ path, value }]);
  if (!sourcePatch.ok || !('source' in sourcePatch)) return null;
  let component: unknown;
  try {
    component = JSON.parse(sourcePatch.source);
  } catch {
    return null;
  }
  const htmlPatch = updateMornDraftHtmlSourceComponent(html, () => component);
  return htmlPatch.ok && typeof htmlPatch.html === 'string' ? htmlPatch.html : null;
};

export const PublicFlatFinalEditor: React.FC<{
  html: string;
  locale: PublicWorkspaceLocale;
  onHtmlChange(next: string): void;
}> = ({ html, locale, onHtmlChange }) => {
  const model = useMemo(() => createFlatEditModel(html), [html]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  useEffect(() => {
    setDrafts(Object.fromEntries(model?.entries.map(entry => [entry.path, entry.value]) ?? []));
    setError('');
  }, [model]);

  if (!model) return null;
  const commit = (entry: FlatTextEntry) => {
    const value = drafts[entry.path] ?? entry.value;
    if (value === entry.value) return;
    const next = patchPublicMornDraftFlatHtml(html, entry.path, value);
    if (!next) {
      setError(locale === 'zh' ? '这个字段暂时无法写回 Source。' : 'This field could not be written back to Source.');
      return;
    }
    setError('');
    onHtmlChange(next);
  };

  return (
    <section
      className="md-public-flat-editor"
      data-morndraft-delivery-exclude="true"
      aria-label={locale === 'zh' ? 'MornDraft 组件字段' : 'MornDraft component fields'}
    >
      <strong>{locale === 'zh' ? '组件内容' : 'Component content'}</strong>
      <div className="md-public-flat-fields">
        {model.entries.map((entry) => (
          <label key={entry.path}>
            <span>{entry.path}</span>
            <input
              data-testid="oss-flat-final-field"
              data-flat-path={entry.path}
              value={drafts[entry.path] ?? entry.value}
              onChange={(event) => {
                // Read the DOM value synchronously. React may evaluate a queued
                // state updater after the SyntheticEvent currentTarget is gone.
                const value = event.currentTarget.value;
                setDrafts(current => updatePublicFlatDraftValue(current, entry.path, value));
              }}
              onBlur={() => commit(entry)}
            />
          </label>
        ))}
      </div>
      {error && <p className="md-public-inline-error" role="alert">{error}</p>}
    </section>
  );
};

export const PublicHtmlFenceFinalEditor: React.FC<{
  html: string;
  locale: PublicWorkspaceLocale;
  onHtmlChange(next: string): void;
}> = ({ html, locale, onHtmlChange }) => {
  const [draft, setDraft] = useState(html);
  useEffect(() => setDraft(html), [html]);
  return (
    <label className="md-public-html-fence-editor" data-morndraft-delivery-exclude="true">
      <span>{locale === 'zh' ? 'HTML 源码' : 'HTML source'}</span>
      <textarea
        aria-label={locale === 'zh' ? 'Final HTML 编辑器' : 'Final HTML editor'}
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={() => { if (draft !== html) onHtmlChange(draft); }}
      />
    </label>
  );
};
