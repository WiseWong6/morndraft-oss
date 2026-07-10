import assert from 'node:assert/strict';
import test from 'node:test';

import { createPortableArtifactMapSidecarHtml } from './portable-artifact-map.js';

const entries = [
  {
    id: 'artifact-1-1-heading-plan',
    kind: 'heading',
    kindLabel: 'Heading',
    level: 1,
    line: 1,
    title: 'Plan <script>alert(1)</script>',
  },
  {
    id: 'artifact-2-4-mermaid-flow',
    kind: 'mermaid',
    kindLabel: 'Mermaid',
    level: 2,
    line: 4,
    title: 'Mermaid & flow',
  },
];

test('createPortableArtifactMapSidecarHtml emits a sidecar map with escaped entries', () => {
  const html = createPortableArtifactMapSidecarHtml(entries, {
    theme: 'light',
    title: '目录',
  });

  assert.match(html, /^<aside\b/);
  assert.match(html, /data-morndraft-portable-artifact-map="sidecar"/);
  assert.match(html, /Plan &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /Mermaid &amp; flow/);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /onmouseover|onmouseout/);
  assert.match(html, /--morndraft-portable-artifact-map-hover:rgba\(29,29,24,0\.06\)/);
  assert.match(html, /data-morndraft-portable-artifact-map-link="true"/);
  assert.match(html, /href="#artifact-1-1-heading-plan"/);
  assert.match(html, /href="#artifact-2-4-mermaid-flow"/);
  assert.match(html, /position:sticky/);
  assert.match(html, /top:0/);
  assert.match(html, /height:100vh/);
  assert.match(html, /overflow-y:auto/);
});

test('createPortableArtifactMapSidecarHtml returns empty string without display entries', () => {
  assert.equal(createPortableArtifactMapSidecarHtml([], { theme: 'dark', title: 'Map' }), '');
  assert.equal(createPortableArtifactMapSidecarHtml(null, { theme: 'dark', title: 'Map' }), '');
});
