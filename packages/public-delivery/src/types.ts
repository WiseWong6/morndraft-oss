export type PublicDeliveryContentType = 'markdown' | 'json' | 'html' | 'mermaid' | 'mixed';

export type PublicDeliveryTheme = 'light' | 'dark';

export type PublicDeliveryInput = {
  previewRoot: HTMLElement;
  source: string;
  contentType: PublicDeliveryContentType;
  theme: PublicDeliveryTheme;
  title: string;
  /** Optional outline rendered as an anchor-linked table of contents in the standalone HTML export. */
  artifactMap?: {
    title: string;
    entries: readonly { id: string; kind?: string; level: number; title: string }[];
  };
  ensureRendered?: () => Promise<void>;
  /** Fails if the document changed while an asynchronous artifact was built. */
  assertCurrent?: () => void;
  signal?: AbortSignal;
};

export interface PublicDeliveryAdapter {
  copyImage?(input: PublicDeliveryInput): Promise<void>;
  downloadImage?(input: PublicDeliveryInput): Promise<void>;
  downloadPdf?(input: PublicDeliveryInput): Promise<void>;
  downloadHtml?(input: PublicDeliveryInput): Promise<void>;
}

export type PublicPngCapture = {
  blob: Blob;
  height: number;
  scale: 2;
  width: number;
};

export type PublicDeliveryErrorCode =
  | 'capture-not-ready'
  | 'capture-too-large'
  | 'capture-failed'
  | 'clipboard-unavailable'
  | 'download-unavailable'
  | 'invalid-png';

export class PublicDeliveryError extends Error {
  readonly code: PublicDeliveryErrorCode;

  constructor(code: PublicDeliveryErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'PublicDeliveryError';
    this.code = code;
  }
}
