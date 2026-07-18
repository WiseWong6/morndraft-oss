export type DeliveryRequestContext = {
  draftId?: string | null;
  disableAiAssistUi?: boolean;
  enableOssAiProvider?: boolean;
  isDevMode: boolean;
  publicAllOpen?: boolean;
  refresh?: () => void | Promise<void>;
  scenarioId?: string;
};
