import React from 'react';
import {
  ICP_FILING_NUMBER,
  ICP_FILING_URL,
  PUBLIC_SECURITY_FILING_ICON_SRC,
  PUBLIC_SECURITY_FILING_NUMBER,
} from './publicCompliance';

export const PublicComplianceFooter: React.FC = () => (
  <footer className="aad-preview-icp-footer" aria-label="网站备案信息">
    <span className="aad-preview-filing-item aad-preview-public-security-filing">
      <img
        className="aad-preview-public-security-icon"
        src={PUBLIC_SECURITY_FILING_ICON_SRC}
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
      />
      <span>{PUBLIC_SECURITY_FILING_NUMBER}</span>
    </span>
    <a
      className="aad-preview-filing-item"
      href={ICP_FILING_URL}
      target="_blank"
      rel="noreferrer"
    >
      {ICP_FILING_NUMBER}
    </a>
  </footer>
);
