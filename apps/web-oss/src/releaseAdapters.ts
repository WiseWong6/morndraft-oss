import { createLocalPublicImportAdapter } from '../../../components/public-workspace/publicImport';
import type {
  PublicAiAdapter,
  PublicDeliveryAdapter,
  PublicDeliveryInput,
  PublicImportAdapter,
} from '../../../components/public-workspace/types';
import { createPublicAiAdapter } from '@morndraft/features-personal/ai';

export type OssAuthAdapter = Readonly<{
  mode: 'none';
}>;

export type OssPersistenceAdapter = Readonly<{
  mode: 'memory';
  readInitialSource(): string;
}>;

export type OssTelemetryAdapter = Readonly<{
  mode: 'noop';
  track(): void;
}>;

export type OssLinkSharingAdapter = Readonly<{
  mode: 'hidden';
}>;

export type OssReleaseAdapters = Readonly<{
  auth: OssAuthAdapter;
  persistence: OssPersistenceAdapter;
  telemetry: OssTelemetryAdapter;
  linkSharing: OssLinkSharingAdapter;
  import: PublicImportAdapter;
  delivery: PublicDeliveryAdapter;
  ai: PublicAiAdapter;
}>;

export const OSS_INITIAL_SOURCE = '';

type PublicDeliveryAction = 'copyImage' | 'downloadImage' | 'downloadPdf' | 'downloadHtml';

const runPublicDeliveryAction = async (
  action: PublicDeliveryAction,
  input: PublicDeliveryInput,
) => {
  const { runBrowserPublicDeliveryAction } = await import('./publicDeliveryAdapter');
  await runBrowserPublicDeliveryAction(action, input);
};

const createLazyPublicDeliveryAdapter = (): PublicDeliveryAdapter => ({
  copyImage: (input) => runPublicDeliveryAction('copyImage', input),
  downloadImage: (input) => runPublicDeliveryAction('downloadImage', input),
  downloadPdf: (input) => runPublicDeliveryAction('downloadPdf', input),
  downloadHtml: (input) => runPublicDeliveryAction('downloadHtml', input),
});

export const createOssReleaseAdapters = (): OssReleaseAdapters => ({
  auth: Object.freeze({ mode: 'none' }),
  persistence: Object.freeze({
    mode: 'memory',
    readInitialSource: () => OSS_INITIAL_SOURCE,
  }),
  telemetry: Object.freeze({
    mode: 'noop',
    track: () => undefined,
  }),
  linkSharing: Object.freeze({ mode: 'hidden' }),
  import: createLocalPublicImportAdapter(),
  delivery: createLazyPublicDeliveryAdapter(),
  ai: createPublicAiAdapter(),
});
