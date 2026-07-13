import {
  buildPublicMornDraftSampleSource,
  getPublicMornDraftInsertEntries,
  getPublicMornDraftShowcaseCount,
} from '@morndraft/core/oss-public';
import { getDefaultPublicSyntaxEntries } from './publicSamples';
import type { PublicFlatInsertEntry, PublicSyntaxEntry, PublicWorkspaceLocale } from './types';

export const PUBLIC_MORNDRAFT_SYNTAX_FIXTURE_COUNT = getPublicMornDraftShowcaseCount('syntax', 'showcase');
export const PUBLIC_MORNDRAFT_INSERT_ENTRY_COUNT = getPublicMornDraftShowcaseCount('insert', 'showcase');

export const getPublicSyntaxEntries = (locale: PublicWorkspaceLocale): readonly PublicSyntaxEntry[] => [
  ...getDefaultPublicSyntaxEntries(locale),
  {
    id: 'morndraft',
    label: 'MornDraft',
    source: () => buildPublicMornDraftSampleSource('showcase'),
  },
];

export const getPublicFlatInsertEntries = (): readonly PublicFlatInsertEntry[] => (
  getPublicMornDraftInsertEntries('showcase').map((entry) => ({
    id: `morndraft-${entry.id}`,
    label: entry.label,
    keywords: ['morndraft', entry.pair],
    source: entry.source,
  }))
);
