import {
  buildPublicMornDraftSampleSource,
  getPublicMornDraftShowcaseCount,
} from '../packages/core/src/public-morndraft-showcase.js';
import type { MornDraftComponentScope } from '../utils/releaseConfigTypes';

export const buildMornDraftSampleSource = (scope: MornDraftComponentScope = 'showcase') => {
  return buildPublicMornDraftSampleSource(scope);
};

export const getMornDraftSampleFixtureCount = (scope: MornDraftComponentScope = 'showcase') =>
  getPublicMornDraftShowcaseCount('syntax', scope);
