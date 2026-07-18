import assert from 'node:assert/strict';
import test from 'node:test';

import { sanitizeMermaidSvg } from './mermaid-svg-sanitizer.js';

test('Mermaid sanitizer preserves allowlisted diagram markup', () => {
  const svg = '<svg viewBox="0 0 10 10" data-theme="light"><defs><marker id="arrow"><path d="M0 0L4 2L0 4Z"/></marker></defs><path d="M0 0L10 10" marker-end="url(#arrow)"/><text x="2" y="5">safe</text></svg>';
  assert.equal(sanitizeMermaidSvg(svg), svg);
});

test('Mermaid sanitizer rejects active or externally referenced SVG markup', () => {
  assert.throws(
    () => sanitizeMermaidSvg('<svg><foreignObject><script>alert(1)</script></foreignObject></svg>'),
    /forbidden element/,
  );
  assert.throws(
    () => sanitizeMermaidSvg('<svg><use href="https://evil.example/payload.svg#x"/></svg>'),
    /forbidden attribute/,
  );
  assert.throws(
    () => sanitizeMermaidSvg('<svg><path style="fill:url(https://evil.example/a.svg)"/></svg>'),
    /forbidden attribute|unsafe CSS/,
  );
  assert.throws(
    () => sanitizeMermaidSvg('<svg onload="alert(1)"><text>x</text></svg>'),
    /forbidden attribute/,
  );
});
