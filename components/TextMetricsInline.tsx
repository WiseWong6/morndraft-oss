import React from 'react';

export const TextMetricsInline: React.FC<{
  compactCharacters: string;
  compactTokens: string;
  metricsLabel: string;
  charactersLabel: string;
  tokensLabel: string;
  prefixLabel?: string;
  className?: string;
}> = ({
  compactCharacters,
  compactTokens,
  metricsLabel,
  charactersLabel,
  tokensLabel,
  prefixLabel,
  className = '',
}) => (
  <div
    className={`aad-editor-metrics aad-text-metrics-inline ${className}`.trim()}
    aria-label={metricsLabel}
    title={metricsLabel}
  >
    <span className="aad-editor-metrics-full aad-text-metrics-full hidden md:inline">
      <span className="aad-editor-metrics-line aad-text-metrics-line">
        {prefixLabel ? `${prefixLabel} ` : ''}
        {compactCharacters} {charactersLabel} · ~{compactTokens} {tokensLabel}
      </span>
    </span>
    <span className="aad-editor-metrics-compact aad-text-metrics-compact md:hidden">
      <span className="aad-editor-metrics-line aad-text-metrics-line">
        {prefixLabel ? `${prefixLabel} ` : ''}
        {compactCharacters} {charactersLabel} · ~{compactTokens} {tokensLabel}
      </span>
    </span>
  </div>
);
