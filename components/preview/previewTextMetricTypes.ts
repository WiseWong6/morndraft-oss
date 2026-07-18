export type PreviewTextMetricValue = {
  characters: number;
  estimatedTokens: number;
  compactCharacters: string;
  compactTokens: string;
};

export type PreviewVisibleTextMetrics = PreviewTextMetricValue;
export type PreviewStandaloneHtmlTextMetricsStatus = 'idle' | 'building' | 'ready' | 'error';
export type PreviewStandaloneHtmlTextMetrics = PreviewTextMetricValue & {
  status: PreviewStandaloneHtmlTextMetricsStatus;
  isStale?: boolean;
};
