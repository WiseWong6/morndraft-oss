import React from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import {
  MARKDOWN_CODE_BLOCK_CUSTOM_STYLE,
  MORNDRAFT_PRISM_SYNTAX_STYLE,
} from './syntaxHighlighting';

export const PrismCodeHighlighter: React.FC<{
  code: string;
  language: string;
  codeProps?: Record<string, any>;
}> = ({ code, language, codeProps }) => (
  <SyntaxHighlighter
    style={MORNDRAFT_PRISM_SYNTAX_STYLE as any}
    language={language}
    PreTag="div"
    className="aad-code-block"
    customStyle={MARKDOWN_CODE_BLOCK_CUSTOM_STYLE}
    {...codeProps}
  >
    {code}
  </SyntaxHighlighter>
);
