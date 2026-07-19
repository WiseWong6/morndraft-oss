import type { ArtifactDiagnostic } from './MarkdownCodeBlockRenderer';
import type { DeliveryAccessState } from './deliveryAccess';
import { createPreviewAiSourceVersion } from './usePreviewMarkdownEditing';
import { requestOssAiText } from '../../utils/ossAiConfig';
import type { PublicAiSourceKind } from '../../packages/features-personal/src/ai';
import type {
  FinalSyntaxAiRepairPatch,
  FinalSyntaxAiRepairResult,
} from './finalSyntaxAiRepairTypes';
export type {
  FinalSyntaxAiRepairPatch,
  FinalSyntaxAiRepairRequestHandler,
  FinalSyntaxAiRepairResult,
} from './finalSyntaxAiRepairTypes';

type FinalSyntaxRepairApiResponse = {
  attempts?: number;
  code?: string;
  error?: {
    code?: string;
    message?: string;
  };
  message?: string;
  ok?: boolean;
  patch?: {
    kind?: string;
    range?: {
      end?: number;
      start?: number;
    };
    replacement?: string;
  };
  source?: string;
  sourceVersion?: string;
  status?: number;
};

export class FinalSyntaxAiRepairRequestError extends Error {
  readonly body: FinalSyntaxRepairApiResponse;
  readonly status: number;

  constructor(status: number, body: FinalSyntaxRepairApiResponse, fallback: string) {
    super(body.error?.message ?? body.message ?? body.error?.code ?? body.code ?? fallback);
    this.body = body;
    this.status = status;
  }
}

export const getFinalSyntaxRepairDiagnosticFixId = (diagnostic: ArtifactDiagnostic) =>
  diagnostic.fixId ?? diagnostic.fix?.id ?? '';

export const formatFinalSyntaxAiRepairError = (error: unknown, fallback: string) => {
  if (error instanceof FinalSyntaxAiRepairRequestError) {
    const code = error.body.error?.code ?? error.body.code;
    const status = error.status || error.body.status;
    const message = error.message || fallback;
    const details = [
      code ? `code: ${code}` : '',
      status ? `status: ${status}` : '',
    ].filter(Boolean);
    return details.length > 0 ? `${message} (${details.join(', ')})` : message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
};

const toFinalSyntaxRepairDiagnostic = (diagnostic: ArtifactDiagnostic) => ({
  code: diagnostic.code,
  severity: diagnostic.severity,
  message: diagnostic.messageZh || diagnostic.messageEn || diagnostic.code,
  messageZh: diagnostic.messageZh,
  ...(diagnostic.messageEn ? { messageEn: diagnostic.messageEn } : {}),
  ...(typeof diagnostic.line === 'number' ? { line: diagnostic.line } : {}),
  ...(typeof diagnostic.column === 'number' ? { column: diagnostic.column } : {}),
  ...(typeof diagnostic.endLine === 'number' ? { endLine: diagnostic.endLine } : {}),
  ...(typeof diagnostic.endColumn === 'number' ? { endColumn: diagnostic.endColumn } : {}),
});

const createFullSourceRepairPatch = (source: string, replacement: string): FinalSyntaxAiRepairPatch => ({
  kind: 'replace',
  range: { start: 0, end: source.length },
  replacement,
});

export async function requestFinalSyntaxAiRepair({
  deliveryAccess,
  diagnostic,
  enableOssAiProvider = false,
  requestPrivateRepair,
  source,
  sourceKind,
}: {
  deliveryAccess?: DeliveryAccessState;
  diagnostic: ArtifactDiagnostic;
  enableOssAiProvider?: boolean;
  requestPrivateRepair?: (input: {
    deliveryAccess?: DeliveryAccessState;
    diagnostic: ArtifactDiagnostic;
    source: string;
  }) => Promise<FinalSyntaxAiRepairResult>;
  source: string;
  sourceKind: PublicAiSourceKind;
}): Promise<FinalSyntaxAiRepairResult> {
  if (enableOssAiProvider) {
    const repaired = await requestOssAiText({
      action: 'fix',
      diagnostic: JSON.stringify(toFinalSyntaxRepairDiagnostic(diagnostic)),
      source,
      sourceKind,
    });
    if (!repaired.trim()) {
      throw new FinalSyntaxAiRepairRequestError(
        200,
        { message: 'OSS AI Fix returned an empty source.' },
        'OSS AI Fix returned an empty source.',
      );
    }
    return {
      attempts: 1,
      patch: createFullSourceRepairPatch(source, repaired),
      source: repaired,
      sourceVersion: createPreviewAiSourceVersion(repaired),
    };
  }

  if (!requestPrivateRepair) {
    throw new FinalSyntaxAiRepairRequestError(
      501,
      { message: 'Private AI repair is unavailable on this surface.' },
      'AI Fix is unavailable on this surface.',
    );
  }
  return requestPrivateRepair({ deliveryAccess, diagnostic, source });
}
