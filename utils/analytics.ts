import { getPrivateRuntimeGateway } from './privateRuntimeGateways';

export type MornDraftAnalyticsOptions = {
  target?: Record<string, unknown>;
  context?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

const loadPrivateAnalyticsGateway = () => getPrivateRuntimeGateway('analytics')?.();

export const trackMornDraftPageView = (
  eventName = 'morndraft_page_view',
  options?: MornDraftAnalyticsOptions,
) => {
  void loadPrivateAnalyticsGateway()?.then(({ trackMornDraftPageView: track }) => track(eventName, options));
};

export const trackMornDraftClick = (
  eventName: string,
  options?: MornDraftAnalyticsOptions,
) => {
  void loadPrivateAnalyticsGateway()?.then(({ trackMornDraftClick: track }) => track(eventName, options));
};
