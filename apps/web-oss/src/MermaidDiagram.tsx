import React, { useEffect, useState } from 'react';
import {
  assertOssMermaidSourceBudget,
  createLatestOnlyMermaidRenderer,
} from './mermaidRenderQueue';
import {
  createOssMermaidSandboxDocument,
  extractOssMermaidSandboxSvg,
  getOssMermaidConfig,
} from './mermaidSecurity';

let renderSequence = 0;

export const MermaidDiagram: React.FC<{ source: string; theme: 'light' | 'dark' }> = ({ source, theme }) => {
  const [state, setState] = useState<{ srcDoc: string; error: string }>({ srcDoc: '', error: '' });

  useEffect(() => {
    setState({ srcDoc: '', error: '' });
    try {
      assertOssMermaidSourceBudget(source);
    } catch (error: unknown) {
      setState({ srcDoc: '', error: error instanceof Error ? error.message : 'Mermaid source is too large.' });
      return undefined;
    }

    const renderer = createLatestOnlyMermaidRenderer({
      render: async (input: { source: string; theme: 'light' | 'dark' }) => {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize(getOssMermaidConfig(input.theme));
        const renderId = `oss-mermaid-${renderSequence += 1}`;
        const result = await mermaid.render(renderId, input.source);
        const svg = extractOssMermaidSandboxSvg(result.svg);
        return createOssMermaidSandboxDocument(svg, input.theme);
      },
      onResult: (srcDoc) => setState({ srcDoc, error: '' }),
      onError: (error) => {
        setState({ srcDoc: '', error: error instanceof Error ? error.message : 'Mermaid render failed.' });
      },
    });
    renderer.schedule({ source, theme });
    return renderer.dispose;
  }, [source, theme]);

  if (state.error) return <pre className="oss-inline-error" role="status">{state.error}</pre>;
  if (!state.srcDoc) return <p className="oss-rendering" role="status">Rendering Mermaid…</p>;
  return (
    <iframe
      className="oss-mermaid oss-mermaid-frame"
      data-mermaid-security="strict-isolated"
      referrerPolicy="no-referrer"
      sandbox=""
      srcDoc={state.srcDoc}
      title="Mermaid diagram"
    />
  );
};
