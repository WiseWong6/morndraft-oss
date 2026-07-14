import test from 'node:test';
import assert from 'node:assert/strict';
import { hasPublicDynamicCaptureMarkup } from '@morndraft/public-delivery';
import {
  createPublicMermaidSandboxDocument,
  extractPublicMermaidSandboxSvg,
  getPublicMermaidConfig,
  PUBLIC_MERMAID_MAX_SVG_LENGTH,
  sanitizePublicMermaidSvg,
  staticizePublicMermaidCss,
} from './publicMermaidSecurity';
import {
  assertPublicMermaidSourceBudget,
  createLatestOnlyPublicMermaidRenderer,
  PUBLIC_MERMAID_MAX_SOURCE_LENGTH,
} from './publicMermaidQueue';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test('Mermaid output is sanitized and wrapped in a scriptless sandbox document', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path id="safe" d="M0 0L10 10"/></svg>';
  assert.equal(sanitizePublicMermaidSvg(svg), svg);
  const document = createPublicMermaidSandboxDocument(svg, 'dark');
  assert.match(document, /default-src 'none'/u);
  assert.match(document, /img-src data: blob:/u);
  assert.match(document, /color-scheme:dark/u);
  assert.doesNotMatch(document, /<script/u);
  assert.doesNotMatch(document, /allow-same-origin/u);
  assert.throws(() => sanitizePublicMermaidSvg('<svg><script>alert(1)</script></svg>'), /forbidden script/u);
  assert.throws(() => sanitizePublicMermaidSvg('<svg onload="alert(1)"></svg>'), /forbidden onload/u);
  assert.equal(extractPublicMermaidSandboxSvg(svg), svg);
  assert.equal(getPublicMermaidConfig('light').securityLevel, 'strict');
});

test('Mermaid resource references reuse the escape-aware capture scanner and allow fragments only', () => {
  assert.doesNotThrow(() => sanitizePublicMermaidSvg(
    '<svg><defs><clipPath id="safe"><path d="M0 0"/></clipPath></defs><path clip-path="u\\72l(#safe)"/></svg>',
  ));
  assert.throws(
    () => sanitizePublicMermaidSvg('<svg><path fill="u\\72l(https://evil.example/pixel.png)"/></svg>'),
    /forbidden fill|unsafe CSS/u,
  );
  assert.throws(
    () => sanitizePublicMermaidSvg('<svg><path style="fill:image\\2d set(\'https://evil.example/a.png\' 1x)"/></svg>'),
    /forbidden style|unsafe CSS/u,
  );
  assert.throws(
    () => sanitizePublicMermaidSvg('<svg><path filter="url(\'#safe\') url(https://evil.example/a.svg)"/></svg>'),
    /forbidden filter|unsafe CSS/u,
  );
  for (const escapedImport of [
    '@\\69mport "https://evil.example/import.css";',
    '@\\69 mport/**/url(https://evil.example/import.css);',
    '@im/**/port "https://evil.example/import.css";',
  ]) {
    assert.throws(
      () => sanitizePublicMermaidSvg(`<svg><style>${escapedImport}</style></svg>`),
      /forbidden style|unsafe CSS/u,
    );
  }
});

test('Mermaid CSS staticization removes default and user-activated animation without touching inert text', () => {
  const staticCss = staticizePublicMermaidCss([
    '@keyframes edge-animation-frame{from{stroke-dashoffset:0}}',
    '@\\6b eyframes dash{to{stroke-dashoffset:0}}',
    '.edge-animation-slow{stroke-dasharray:9,5;animation:dash 50s linear infinite;stroke-linecap:round}',
    '.user-animated{\\61nimation-name:dash;color:red}',
    '.label::after{content:"animation:fake; @keyframes fake{}"}',
    '/* animation:fake; @keyframes fake{} */',
  ].join(''));

  assert.doesNotMatch(staticCss, /edge-animation-frame|@\\6b eyframes|animation:dash|\\61nimation-name/u);
  assert.match(staticCss, /\.edge-animation-slow\{stroke-dasharray:9,5;stroke-linecap:round\}/u);
  assert.match(staticCss, /\.user-animated\{color:red\}/u);
  assert.match(staticCss, /content:"animation:fake; @keyframes fake\{\}"/u);
  assert.match(staticCss, /\/\* animation:fake; @keyframes fake\{\} \*\//u);
  assert.equal(staticizePublicMermaidCss('animation:dash 1s;fill:red', true), 'fill:red');
  assert.throws(
    () => sanitizePublicMermaidSvg('<svg><rect style="animation:dash 1s"/></svg>'),
    /dynamic CSS/u,
  );
});

test('Mermaid CSS staticization and delivery detection agree across deterministic escape fuzz', async () => {
  const encodedProperties = [
    'animation',
    'ani/**/mation',
    'ani\\\nmation',
    'ani\\\r\nmation',
    'ani\\\fmation',
    '\\61nimation',
    '\\61\nnimation',
    '\\61\r\nnimation',
    '\\61\fnimation',
    '\\000061nimation',
    '\\000061\r\nnimation',
    '-webkit-\\61nimation-name',
    '-moz-animation',
    '-o-\\61nimation-name',
    '-acme-animation-delay',
  ];
  const keyframeRules = [
    '@keyframes pulse{to{opacity:.5}}',
    '@\\6b eyframes pulse{to{opacity:.5}}',
    '@-webkit-keyframes pulse{to{opacity:.5}}',
    '@-moz-keyframes pulse{to{opacity:.5}}',
    '@-o-\\6b eyframes pulse{to{opacity:.5}}',
    '@-acme-keyframes pulse{to{opacity:.5}}',
  ];
  for (const [propertyIndex, property] of encodedProperties.entries()) {
    for (const [valueIndex, value] of ['pulse 1s linear infinite', '"pulse" 2s', 'none'].entries()) {
      const css = `.fuzz-${propertyIndex}-${valueIndex}{color:red;${property}:${value};opacity:.8}`;
      assert.equal(await hasPublicDynamicCaptureMarkup(`<style>${css}</style>`), true, `detector missed ${JSON.stringify(property)}`);
      const staticCss = staticizePublicMermaidCss(css);
      assert.match(staticCss, /color:red/u);
      assert.match(staticCss, /opacity:\.8/u);
      assert.equal(
        await hasPublicDynamicCaptureMarkup(`<style>${staticCss}</style>`),
        false,
        `staticized CSS remained dynamic for ${JSON.stringify(property)}`,
      );
    }
  }
  for (const rule of keyframeRules) {
    assert.equal(await hasPublicDynamicCaptureMarkup(`<style>${rule}</style>`), true);
    assert.equal(staticizePublicMermaidCss(rule), '');
  }
  const inert = [
    '.label::after{content:"animation:pulse; -moz-animation:pulse; @-moz-keyframes pulse{}"}',
    '/* -o-animation:pulse; @-o-keyframes pulse{} */',
    '.custom{--animation:pulse;--vendor-animation-name:pulse}',
  ].join('');
  assert.equal(staticizePublicMermaidCss(inert), inert);
  assert.equal(await hasPublicDynamicCaptureMarkup(`<style>${inert}</style>`), false);
});

test('Mermaid source and SVG budgets fail closed', () => {
  assert.doesNotThrow(() => assertPublicMermaidSourceBudget('x'.repeat(PUBLIC_MERMAID_MAX_SOURCE_LENGTH)));
  assert.throws(() => assertPublicMermaidSourceBudget('x'.repeat(PUBLIC_MERMAID_MAX_SOURCE_LENGTH + 1)), /50000/u);
  assert.throws(() => sanitizePublicMermaidSvg(`<svg>${'x'.repeat(PUBLIC_MERMAID_MAX_SVG_LENGTH)}</svg>`), /render budget/u);
});

test('Mermaid render queue publishes only the latest scheduled result', async () => {
  const started: number[] = [];
  const completed: number[] = [];
  const renderer = createLatestOnlyPublicMermaidRenderer({
    debounceMs: 5,
    render: async (input: number) => { started.push(input); return input; },
    onResult: (result) => completed.push(result),
    onError: (error) => { throw error; },
  });
  for (let value = 0; value < 12; value += 1) renderer.schedule(value);
  await wait(30);
  renderer.dispose();
  assert.deepEqual(started, [11]);
  assert.deepEqual(completed, [11]);
});
