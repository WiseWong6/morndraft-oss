import { MORNDRAFT_FLAT_ADAPTER_FIXTURES } from '../fixtures/morndraft-flat-adapter-fixtures.js';
import {
  MORNDRAFT_FLAT_PUBLIC_CATEGORIES,
  MORNDRAFT_FLAT_SAMPLE_PAIRS,
  MORNDRAFT_FLAT_SHOWCASE_PAIRS,
} from './morndraft-flat-adapter.js';
import { createMornDraftHtmlSource } from './morndraft-html-source.js';

const fixturePair = (fixture) => `${fixture.input.layout}/${fixture.input.variant}`;
const fixtureByPair = new Map(
  MORNDRAFT_FLAT_ADAPTER_FIXTURES.map((fixture) => [fixturePair(fixture), fixture]),
);
const allPublicPairs = Object.freeze(
  MORNDRAFT_FLAT_PUBLIC_CATEGORIES.flatMap((category) => category.pairs),
);

const resolvePairs = (scope, purpose) => {
  if (scope === 'allPublicV2') return allPublicPairs;
  return purpose === 'syntax' ? MORNDRAFT_FLAT_SAMPLE_PAIRS : MORNDRAFT_FLAT_SHOWCASE_PAIRS;
};

const resolveFixtures = (scope, purpose) => resolvePairs(scope, purpose).map((pair) => {
  const fixture = fixtureByPair.get(pair);
  if (!fixture) throw new Error(`Missing public MornDraft fixture for ${pair}.`);
  return fixture;
});

const renderFixtureSource = (fixture) => {
  const result = createMornDraftHtmlSource(fixture.input);
  if (!result.ok || !result.markdown) {
    throw new Error(`Failed to render public MornDraft fixture ${fixture.id}.`);
  }
  return result.markdown;
};

export const getPublicMornDraftInsertEntries = (scope = 'showcase') => (
  resolveFixtures(scope, 'insert').map((fixture) => Object.freeze({
    id: fixture.id,
    label: fixture.title,
    pair: fixturePair(fixture),
    source: renderFixtureSource(fixture),
  }))
);

const sampleSourceCache = new Map();

export const buildPublicMornDraftSampleSource = (scope = 'showcase') => {
  const cached = sampleSourceCache.get(scope);
  if (cached) return cached;
  const source = [
    '# MornDraft 语法',
    '',
    ...resolveFixtures(scope, 'syntax').flatMap((fixture, index) => [
      `## ${String(index + 1).padStart(2, '0')}. ${fixture.title}`,
      '',
      renderFixtureSource(fixture),
      '',
    ]),
  ].join('\n').trim();
  sampleSourceCache.set(scope, source);
  return source;
};

export const getPublicMornDraftShowcaseCount = (purpose = 'insert', scope = 'showcase') => (
  resolvePairs(scope, purpose === 'syntax' ? 'syntax' : 'insert').length
);
