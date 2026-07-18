import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deferPreviewBlockingExternalScripts,
  relocateTailwindCdnScriptsToBodyEnd,
  stabilizeMobileHtmlPreviewSource,
} from './htmlPreviewSourceTransforms';

test('deferPreviewBlockingExternalScripts preserves Tailwind CDN semantics and defers non-style scripts', () => {
  const tailwindConfigScript = '<script>tailwind.config = { theme: { extend: { colors: { paper: "#f2efe9" } } } }</script>';
  const html = [
    '<!doctype html><html><head>',
    '<script src="https://cdn.tailwindcss.com"></script>',
    '<link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">',
    '<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>',
    '<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@700&display=swap" rel="stylesheet">',
    tailwindConfigScript,
    '</head><body><main style="width:1280px">Slide</main></body></html>',
  ].join('');

  const transformed = deferPreviewBlockingExternalScripts(html);
  const head = transformed.match(/<head[\s\S]*?<\/head>/i)?.[0] ?? '';

  assert.doesNotMatch(head, /<script[^>]+cdn\.tailwindcss\.com/);
  assert.doesNotMatch(head, /tailwind\.config/);
  assert.ok(
    transformed.includes(
      `Slide</main><script src="https://cdn.tailwindcss.com"></script>${tailwindConfigScript}</body>`,
    ),
  );
  assert.match(
    transformed,
    /<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/html2canvas\/1\.4\.1\/html2canvas\.min\.js" async defer><\/script>/,
  );
  assert.match(
    transformed,
    /<link href="https:\/\/fonts\.googleapis\.com\/css2\?family=Noto\+Serif\+SC:wght@700&display=swap" rel="stylesheet" media="print" onload="this\.media='all'">/,
  );
});

test('relocateTailwindCdnScriptsToBodyEnd removes async/defer attributes before reinserting', () => {
  const transformed = relocateTailwindCdnScriptsToBodyEnd(
    '<!doctype html><html><head><script async defer src="https://cdn.tailwindcss.com"></script></head><body><main>Deck</main></body></html>',
  );

  assert.doesNotMatch(transformed.match(/<head[\s\S]*?<\/head>/i)?.[0] ?? '', /cdn\.tailwindcss\.com/);
  assert.match(transformed, /Deck<\/main><script src="https:\/\/cdn\.tailwindcss\.com"><\/script><\/body>/);
});

test('relocateTailwindCdnScriptsToBodyEnd leaves non-adjacent Tailwind config scripts in place', () => {
  const transformed = relocateTailwindCdnScriptsToBodyEnd(
    [
      '<!doctype html><html><head>',
      '<script src="https://cdn.tailwindcss.com"></script>',
      '<script>window.boot = true;</script>',
      '<script>tailwind.config = { theme: { extend: { colors: { paper: "#f2efe9" } } } }</script>',
      '</head><body><main>Deck</main></body></html>',
    ].join(''),
  );
  const head = transformed.match(/<head[\s\S]*?<\/head>/i)?.[0] ?? '';

  assert.doesNotMatch(head, /cdn\.tailwindcss\.com/);
  assert.match(head, /window\.boot = true/);
  assert.match(head, /tailwind\.config/);
  assert.match(transformed, /Deck<\/main><script src="https:\/\/cdn\.tailwindcss\.com"><\/script><\/body>/);
});

test('stabilizeMobileHtmlPreviewSource removes meta refresh and obvious navigation scripts', () => {
  const html = [
    '<!doctype html><html><head>',
    '<meta http-equiv="refresh" content="0;url=/loop">',
    '<script src="https://cdn.tailwindcss.com"></script>',
    '<script>window.location.reload()</script>',
    '</head><body>',
    '<a href="javascript:location.reload()">Reload</a>',
    '<a href="vbscript:msgbox(1)">VB</a>',
    '<a href="data:text/html,<script>alert(1)</script>">Data</a>',
    '<img src="javascript:location.href=\'/loop\'" onerror="location.replace(\'/loop\')">',
    '<iframe src="data:text/html,<script>parent.location.reload()</script>"></iframe>',
    '<script>const safe = true; document.body.dataset.safe = String(safe);</script>',
    '<main>Preview</main>',
    '</body></html>',
  ].join('');

  const transformed = stabilizeMobileHtmlPreviewSource(html);

  assert.doesNotMatch(transformed, /http-equiv="refresh"/);
  assert.doesNotMatch(transformed, /window\.location\.reload/);
  assert.doesNotMatch(transformed, /javascript:location/);
  assert.doesNotMatch(transformed, /vbscript:msgbox/);
  assert.doesNotMatch(transformed, /data:text\/html/);
  assert.doesNotMatch(transformed, /onerror=/);
  assert.equal([...transformed.matchAll(/href="#"/g)].length, 3);
  assert.equal([...transformed.matchAll(/src="#"/g)].length, 2);
  assert.match(transformed, /<script src="https:\/\/cdn\.tailwindcss\.com"><\/script>/);
  assert.match(transformed, /document\.body\.dataset\.safe/);
});
