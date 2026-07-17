import {
  createLocalPublicImportAdapter,
  type PublicAiAdapter,
  type PublicDeliveryAdapter,
  type PublicDeliveryInput,
  type PublicImportAdapter,
} from '../../../components/public-workspace';
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

export const OSS_INITIAL_SOURCE = `# MornDraft Open Source

Source 是唯一真相源；你可以在 Source 或 Final 修改内容。

\`\`\`json5
{
  // JSON5 支持注释、单引号和尾逗号
  edition: 'open-source',
  storage: 'memory-only',
}
\`\`\`

\`\`\`mermaid
flowchart LR
  Agent[Agent 生成] --> Review[人工审核]
  Review --> Deliver[本地交付]
\`\`\`

输入 \`/\` 可以插入 Markdown 表格和 MornDraft flat 组件；输入 \`/AI\` 可以调用你配置的生成模型。`;

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
