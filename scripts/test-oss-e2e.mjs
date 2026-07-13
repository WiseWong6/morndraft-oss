#!/usr/bin/env node
/* global Buffer, HTMLButtonElement, Navigator, URL, clearTimeout, console, document, fetch, localStorage, navigator, process, sessionStorage, setTimeout, window */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { PDFDocument, PDFName } from 'pdf-lib';
import { chromium } from 'playwright';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, '..');
const outputDir = path.join(projectDir, 'output', 'playwright', 'oss-e2e');
const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const readCandidateArg = () => {
  const index = process.argv.indexOf('--candidate');
  if (index < 0 || !process.argv[index + 1]) return '.';
  return process.argv[index + 1];
};

const candidateDir = path.resolve(projectDir, readCandidateArg());

export const findUnexpectedMornDraftApiRequests = (requestUrls, appUrl) => {
  const appOrigin = new URL(appUrl).origin;
  return requestUrls.filter((requestUrl) => {
    const parsed = new URL(requestUrl);
    const isMornDraftFirstParty = parsed.hostname === 'morndraft.com'
      || parsed.hostname.endsWith('.morndraft.com');
    return parsed.pathname.startsWith('/api/') && (
      parsed.origin === appOrigin || isMornDraftFirstParty
    );
  });
};

const run = (command, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {
    cwd: options.cwd ?? candidateDir,
    env: options.env ?? process.env,
    stdio: options.stdio ?? 'inherit',
  });
  child.once('error', reject);
  child.once('exit', (code, signal) => {
    if (code === 0) resolve();
    else reject(new Error(`${command} ${args.join(' ')} exited with ${code ?? signal}`));
  });
});

const listen = (server) => new Promise((resolve, reject) => {
  const failed = (error) => reject(error);
  server.once('error', failed);
  server.listen(0, '127.0.0.1', () => {
    server.removeListener('error', failed);
    const address = server.address();
    if (!address || typeof address === 'string') {
      reject(new Error('Server did not expose a TCP port.'));
      return;
    }
    resolve(address.port);
  });
});

const closeServer = (server) => new Promise((resolve) => {
  if (!server?.listening) {
    resolve();
    return;
  }
  server.close(() => resolve());
  server.closeIdleConnections?.();
});

const waitForUrl = async (url, timeoutMs = 20_000) => {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`, { cause: lastError });
};

const waitForFrameWithSelector = async (page, selector, timeoutMs = 5_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      if (frame === page.mainFrame()) continue;
      if (await frame.locator(selector).count()) return frame;
    }
    await page.waitForTimeout(50);
  }
  throw new Error(`Timed out waiting for portable frame selector: ${selector}`);
};

const decodeHtmlAttribute = (value) => value
  .replaceAll('&quot;', '"')
  .replaceAll('&#39;', "'")
  .replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>')
  .replaceAll('&amp;', '&');

const extractPortableDocumentSrcdoc = (html) => {
  const match = html.match(
    /<iframe\b class="morndraft-public-document-frame"[^>]*\ssrcdoc="([^"]*)"><\/iframe>/u,
  );
  assert.ok(match?.[1], 'Portable HTML is missing the opaque public document frame.');
  return decodeHtmlAttribute(match[1]);
};

const stopChild = async (child) => {
  if (!child) return;
  const treeIsAlive = () => {
    if (process.platform !== 'win32' && child.pid) {
      try {
        process.kill(-child.pid, 0);
        return true;
      } catch {
        return false;
      }
    }
    return child.exitCode === null && child.signalCode === null;
  };
  const waitForTreeExit = async (timeoutMs) => {
    const deadline = Date.now() + timeoutMs;
    while (treeIsAlive() && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return !treeIsAlive();
  };
  const killTree = (signal) => {
    if (process.platform !== 'win32' && child.pid) {
      try {
        process.kill(-child.pid, signal);
        return;
      } catch {
        // The process may not have reached its detached group yet.
      }
    }
    child.kill(signal);
  };
  if (!treeIsAlive()) return;
  killTree('SIGTERM');
  if (await waitForTreeExit(3_000)) return;
  killTree('SIGKILL');
  await waitForTreeExit(3_000);
};

const createAiMock = () => {
  const requests = [];
  const responses = {
    'oss-generate-model': '# Generated from OSS AI',
    'oss-modify-model': 'Modified selection from OSS AI',
    'oss-summarize-model': 'Summary from OSS AI',
  };
  const server = createServer(async (request, response) => {
    response.setHeader('access-control-allow-origin', '*');
    response.setHeader('access-control-allow-headers', 'authorization, content-type');
    response.setHeader('access-control-allow-methods', 'POST, OPTIONS');
    if (request.method === 'OPTIONS') {
      response.writeHead(204).end();
      return;
    }
    if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
      response.writeHead(404, { 'content-type': 'application/json' }).end('{"error":"not found"}');
      return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    requests.push({ authorization: request.headers.authorization, body, url: request.url });
    const serializedBody = JSON.stringify(body);
    const isSlowRaceRequest = serializedBody.includes('OSS race request A');
    const isFastRaceRequest = serializedBody.includes('OSS race request B');
    if (isSlowRaceRequest) await new Promise((resolve) => setTimeout(resolve, 450));
    if (isFastRaceRequest) await new Promise((resolve) => setTimeout(resolve, 20));
    const text = isSlowRaceRequest
      ? 'Stale response from OSS race A'
      : isFastRaceRequest
        ? 'Fresh response from OSS race B'
        : responses[body.model];
    if (!text) {
      response.writeHead(404, { 'content-type': 'application/json' }).end('{"error":{"message":"unknown model"}}');
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({
      choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: text } }],
    }));
  });
  return { requests, server };
};

const createDeliveryFixtureServer = () => {
  const slowCssDelayMs = 850;
  const requests = {
    activeMediaImage: 0,
    mediaContextCss: 0,
    inactivePrintImage: 0,
    noCorsCss: 0,
    noCorsImage: 0,
    slowCss: 0,
  };
  const noCorsPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M/wn4GBgYGJAQoAHgQCAU0OBRsAAAAASUVORK5CYII=',
    'base64',
  );
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (requestUrl.pathname === '/media-context.css') {
      requests.mediaContextCss += 1;
      response.writeHead(200, {
        'access-control-allow-origin': '*',
        'cache-control': 'no-store',
        'content-type': 'text/css; charset=utf-8',
      });
      response.end([
        'html,body{margin:0;min-height:480px;background:#102030}',
        'body{display:grid;place-items:center}',
        '.media-context-card{width:240px;height:140px;background:#cc3366 url("./active-media.svg") center/cover no-repeat}',
        '@media print{.media-context-card{background-image:url("./inactive-print.png?source=linked")}}',
      ].join(''));
      return;
    }
    if (requestUrl.pathname === '/active-media.svg') {
      requests.activeMediaImage += 1;
      response.writeHead(200, {
        'access-control-allow-origin': '*',
        'cache-control': 'no-store',
        'content-type': 'image/svg+xml; charset=utf-8',
      });
      response.end('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="14" viewBox="0 0 24 14"><rect width="24" height="14" fill="#25c768"/></svg>');
      return;
    }
    if (requestUrl.pathname === '/inactive-print.png') {
      requests.inactivePrintImage += 1;
      response.writeHead(200, {
        'cache-control': 'no-store',
        'content-length': noCorsPng.byteLength,
        'content-type': 'image/png',
      });
      response.end(noCorsPng);
      return;
    }
    if (requestUrl.pathname === '/slow-layout.css') {
      requests.slowCss += 1;
      response.setHeader('access-control-allow-origin', '*');
      response.setHeader('cache-control', 'no-store');
      response.setHeader('content-type', 'text/css; charset=utf-8');
      setTimeout(() => {
        if (response.destroyed) return;
        response.end([
          ':root,html{margin:0;min-height:480px;background:#102030}',
          'body{margin:0;min-height:480px;display:grid;place-items:center;background:#102030}',
          '.slow-card{width:240px;height:140px;background:#12a4e6}',
        ].join(''));
      }, slowCssDelayMs);
      return;
    }
    if (requestUrl.pathname === '/no-cors.png') {
      requests.noCorsImage += 1;
      response.writeHead(200, {
        'cache-control': 'no-store',
        'content-length': noCorsPng.byteLength,
        'content-type': 'image/png',
      });
      response.end(noCorsPng);
      return;
    }
    if (requestUrl.pathname === '/no-cors.css') {
      requests.noCorsCss += 1;
      response.writeHead(200, {
        'cache-control': 'no-store',
        'content-type': 'text/css; charset=utf-8',
      });
      response.end('html,body{background:#7a1d4e}.no-cors-card{width:220px;height:120px;background:#efcc44}');
      return;
    }
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
  });
  return { requests, server, slowCssDelayMs };
};

const installDeliveryResourceAudit = async (page) => {
  // Install only in the top-level app document. BrowserContext.addInitScript
  // also targets every sandboxed author iframe; Chromium then reports the test
  // probe itself as blocked script execution in deliberately scriptless frames.
  await page.evaluate(() => {
    if (window.__ossDeliveryResourceAudit) return;
    const activeObjectUrls = new Set();
    const originalCreateObjectUrl = URL.createObjectURL.bind(URL);
    const originalRevokeObjectUrl = URL.revokeObjectURL.bind(URL);
    const audit = {
      activeObjectUrls,
      added: {
        captureHosts: 0,
        html2canvasContainers: 0,
        modernSandboxes: 0,
        staticCaptureFrames: 0,
      },
      createdObjectUrls: 0,
      revokedObjectUrls: 0,
    };
    URL.createObjectURL = (blob) => {
      const value = originalCreateObjectUrl(blob);
      audit.createdObjectUrls += 1;
      activeObjectUrls.add(value);
      return value;
    };
    URL.revokeObjectURL = (value) => {
      audit.revokedObjectUrls += 1;
      activeObjectUrls.delete(value);
      originalRevokeObjectUrl(value);
    };
    window.__ossDeliveryResourceAudit = audit;

    const selectors = [
      ['captureHosts', '[data-morndraft-public-capture-host="true"]'],
      ['html2canvasContainers', '.html2canvas-container'],
      ['modernSandboxes', 'iframe[id^="__SANDBOX__"]'],
      ['staticCaptureFrames', 'iframe[sandbox="allow-same-origin"][aria-hidden="true"]'],
    ];
    const countNode = (node) => {
      if (node.nodeType !== 1) return;
      for (const [key, selector] of selectors) {
        if (node.matches(selector)) audit.added[key] += 1;
        audit.added[key] += node.querySelectorAll(selector).length;
      }
    };
    const startObserver = () => {
      if (!document.documentElement) return;
      const observer = new window.MutationObserver((records) => {
        records.forEach((record) => record.addedNodes.forEach(countNode));
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      audit.observer = observer;
    };
    if (document.documentElement) startObserver();
    else window.addEventListener('DOMContentLoaded', startObserver, { once: true });
  });
};

const readDeliveryResourceAudit = (page) => page.evaluate(() => {
  const audit = window.__ossDeliveryResourceAudit;
  return {
    activeObjectUrls: audit?.activeObjectUrls.size ?? -1,
    captureHosts: document.querySelectorAll('[data-morndraft-public-capture-host="true"]').length,
    createdObjectUrls: audit?.createdObjectUrls ?? -1,
    hiddenDownloadAnchors: document.querySelectorAll('a[download]').length,
    html2canvasContainers: document.querySelectorAll('.html2canvas-container').length,
    html2canvasContainersAdded: audit?.added.html2canvasContainers ?? -1,
    modernSandboxes: document.querySelectorAll('iframe[id^="__SANDBOX__"]').length,
    modernSandboxesAdded: audit?.added.modernSandboxes ?? -1,
    revokedObjectUrls: audit?.revokedObjectUrls ?? -1,
    staticCaptureFrames: document.querySelectorAll('iframe[sandbox="allow-same-origin"][aria-hidden="true"]').length,
  };
});

const ACTIVE_DELIVERY_RESOURCE_KEYS = Object.freeze([
  'activeObjectUrls',
  'captureHosts',
  'hiddenDownloadAnchors',
  'html2canvasContainers',
  'modernSandboxes',
  'staticCaptureFrames',
]);

const readActiveDeliveryResources = (snapshot) => Object.fromEntries(
  ACTIVE_DELIVERY_RESOURCE_KEYS.map((key) => [key, snapshot[key]]),
);

const assertZeroDeliveryResourceBaseline = (baseline, label) => {
  for (const key of ACTIVE_DELIVERY_RESOURCE_KEYS) {
    assert.equal(baseline[key], 0, `${label} started with active ${key}.`);
  }
};

const assertNoActiveDeliveryResources = async (page, baseline, label) => {
  try {
    await page.waitForFunction((expected) => {
      const audit = window.__ossDeliveryResourceAudit;
      return (
        (audit?.activeObjectUrls.size ?? -1) === expected.activeObjectUrls &&
        document.querySelectorAll('[data-morndraft-public-capture-host="true"]').length === expected.captureHosts &&
        document.querySelectorAll('a[download]').length === expected.hiddenDownloadAnchors &&
        document.querySelectorAll('.html2canvas-container').length === expected.html2canvasContainers &&
        document.querySelectorAll('iframe[id^="__SANDBOX__"]').length === expected.modernSandboxes &&
        document.querySelectorAll('iframe[sandbox="allow-same-origin"][aria-hidden="true"]').length === expected.staticCaptureFrames
      );
    }, baseline, { timeout: 5_000 });
  } catch (cause) {
    const current = await readDeliveryResourceAudit(page);
    throw new Error(
      `${label} did not return to its delivery resource baseline: expected=${JSON.stringify(readActiveDeliveryResources(baseline))} current=${JSON.stringify(readActiveDeliveryResources(current))}`,
      { cause },
    );
  }
  const current = await readDeliveryResourceAudit(page);
  for (const key of ACTIVE_DELIVERY_RESOURCE_KEYS) {
    assert.equal(current[key], baseline[key], `${label} leaked ${key}.`);
  }
};

const clickByTestId = async (page, testId) => {
  const target = page.getByTestId(testId);
  await assert.doesNotReject(target.waitFor({ state: 'visible', timeout: 5_000 }), `Missing OSS E2E selector: data-testid=${testId}`);
  await target.click();
};

const setWorkspaceLocale = async (page, locale) => {
  const more = page.locator('details.md-public-menu--more');
  if (!await more.evaluate((element) => element.open)) await more.locator('summary').click();
  await more.locator('select').nth(0).selectOption(locale);
  await page.waitForFunction((expected) => document.documentElement.lang === expected, locale === 'en' ? 'en' : 'zh-CN');
};

const setWorkspaceTheme = async (page, theme) => {
  const more = page.locator('details.md-public-menu--more');
  if (!await more.evaluate((element) => element.open)) await more.locator('summary').click();
  await more.locator('select').nth(1).selectOption(theme);
  await page.waitForFunction((expected) => document.documentElement.dataset.theme === expected, theme);
};

const expectAiResult = async (page, expectedText) => {
  const result = page.getByTestId('oss-ai-result');
  await result.waitFor({ state: 'visible' });
  await assert.doesNotReject(result.getByText(expectedText, { exact: false }).waitFor());
};

const armImportCompletion = async (page) => {
  await page.evaluate(() => {
    window.__ossImportCycle?.observer?.disconnect();
    const cycle = {
      observer: undefined,
      outcome: '',
      sawNoOutcome: !document.querySelector('.md-public-status--done, .md-public-status--error'),
    };
    const inspect = () => {
      const done = document.querySelector('.md-public-status--done');
      const error = document.querySelector('.md-public-status--error');
      if (!done && !error) cycle.sawNoOutcome = true;
      if (!cycle.sawNoOutcome) return;
      if (done) cycle.outcome = 'done';
      if (error) cycle.outcome = `error:${error.textContent ?? ''}`;
      if (cycle.outcome) cycle.observer?.disconnect();
    };
    cycle.observer = new window.MutationObserver(inspect);
    cycle.observer.observe(document.body, { childList: true, subtree: true });
    window.__ossImportCycle = cycle;
  });
};

const waitForImportCompletion = async (page, expected = 'done') => {
  await page.waitForFunction(() => Boolean(window.__ossImportCycle?.outcome));
  const outcome = await page.evaluate(() => window.__ossImportCycle?.outcome ?? '');
  if (expected === 'error') {
    assert.match(outcome, /^error:/u, `Local import unexpectedly succeeded: ${outcome}`);
    return outcome;
  }
  assert.equal(outcome, 'done', `Local import did not complete successfully: ${outcome}`);
  return outcome;
};

const runAboutDialogFlow = async (page) => {
  const workspace = page.locator('[data-public-workspace="true"]');
  const more = page.locator('summary').filter({ hasText: /^(More|更多)$/u });
  if (!await more.getAttribute('aria-expanded') || await more.getAttribute('aria-expanded') === 'false') {
    await more.click();
  }
  const about = page.getByRole('menuitem', { name: /^(About|关于)$/u });
  await about.click();
  const dialog = page.getByRole('dialog', { name: 'MornDraft Open Source' });
  await dialog.waitFor({ state: 'visible' });
  assert.equal(await workspace.getAttribute('aria-hidden'), 'true');
  assert.equal(await workspace.evaluate((element) => element.inert), true);
  assert.equal(
    await dialog.locator('[data-public-dialog-initial-focus]').evaluate((element) => element === document.activeElement),
    true,
    'About dialog did not receive its declared initial focus.',
  );
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await workspace.getAttribute('aria-hidden'), null);
  assert.equal(await workspace.evaluate((element) => element.inert), false);
  assert.equal(await more.evaluate((element) => element === document.activeElement), true, 'Closed More menu did not return focus to its summary.');
};

const runPublicShowcaseSurfaceFlow = async (page) => {
  const syntaxSummary = page.locator('details.md-public-menu > summary').filter({ hasText: /^(Syntax|语法)$/u });
  await syntaxSummary.click();
  const syntaxMenu = page.getByRole('menu', { name: /^(Syntax|语法)$/u });
  await syntaxMenu.waitFor({ state: 'visible' });
  await syntaxMenu.getByRole('menuitem', { name: 'MornDraft', exact: true }).click();

  const flatBlocks = page.locator('[data-public-preview-root="true"] [data-public-flat="true"]');
  await page.waitForFunction((expected) => (
    document.querySelectorAll('[data-public-preview-root="true"] [data-public-flat="true"]').length === expected
  ), 29, { timeout: 15_000 });
  assert.equal(await flatBlocks.count(), 29, 'The real Syntax surface did not render all 29 MornDraft showcases.');
  const syntaxFrames = flatBlocks.locator('iframe.md-public-html-frame');
  assert.equal(await syntaxFrames.count(), 29, 'A MornDraft Syntax showcase was not rendered through the flat HTML frame.');
  assert.match(
    await syntaxFrames.first().getAttribute('srcdoc') ?? '',
    /data-morndraft-source="morndraft-flat"/u,
    'The first MornDraft Syntax showcase lost its public flat marker.',
  );

  const sourceButton = page.getByRole('button', { name: /^(Source|源码)$/u });
  const finalButton = page.getByRole('button', { name: /^(Final|最终效果)$/u });
  await sourceButton.click();
  const sourceEditor = page.locator('.md-public-source-editor textarea').first();
  const syntaxSource = await sourceEditor.inputValue();
  assert.equal(
    syntaxSource.match(/^## \d{2}\. /gmu)?.length ?? 0,
    29,
    'The MornDraft Syntax source did not contain 29 numbered showcases.',
  );
  assert.equal(
    syntaxSource.match(/data-morndraft-source="morndraft-flat"/gu)?.length ?? 0,
    29,
    'The MornDraft Syntax source did not preserve 29 public flat markers.',
  );

  await sourceEditor.fill('/');
  const insertMenu = page.getByRole('menu', { name: /^(Insert content|插入内容)$/u });
  await insertMenu.waitFor({ state: 'visible' });
  const slashItems = insertMenu.getByRole('menuitem');
  await page.waitForFunction(() => (
    document.querySelectorAll('[role="menu"][aria-label="插入内容"] [role="menuitem"], [role="menu"][aria-label="Insert content"] [role="menuitem"]').length >= 31
  ));
  const slashLabels = (await slashItems.allTextContents()).map((label) => label.trim());
  const aiGenerate = insertMenu.getByTestId('oss-ai-generate');
  const aiLabel = await aiGenerate.count() ? (await aiGenerate.innerText()).trim() : '';
  assert.ok(slashLabels.includes('Markdown table'), 'The slash menu lost its Markdown table entry.');
  const flatLabels = slashLabels.filter((label) => label !== 'Markdown table' && label !== aiLabel);
  assert.equal(flatLabels.length, 30, 'The real slash menu did not expose all 30 MornDraft flat entries.');

  const representativeLabel = flatLabels[0];
  assert.ok(representativeLabel, 'The slash menu has no representative MornDraft flat entry.');
  await insertMenu.getByRole('menuitem', { name: representativeLabel, exact: true }).first().click();
  await page.waitForFunction(() => {
    const editor = document.querySelector('.md-public-source-editor textarea');
    return editor instanceof window.HTMLTextAreaElement
      && editor.value.includes('data-morndraft-source="morndraft-flat"')
      && !editor.value.trimStart().startsWith('/');
  });
  const insertedSource = await sourceEditor.inputValue();
  assert.match(insertedSource, /^```html$/mu, 'The slash entry did not insert a fenced HTML block.');
  assert.match(insertedSource, /<!-- morndraft:structure /u, 'The slash entry lost its MornDraft structure metadata.');
  assert.match(insertedSource, /data-morndraft-source="morndraft-flat"/u, 'The slash entry lost its public flat marker.');

  await finalButton.click();
  const insertedFlatBlock = page.locator('[data-public-preview-root="true"] [data-public-flat="true"]');
  await insertedFlatBlock.waitFor({ state: 'visible' });
  assert.equal(await insertedFlatBlock.count(), 1, 'The representative slash entry did not render as one flat block.');
  const insertedFrame = insertedFlatBlock.locator('iframe.md-public-html-frame');
  await insertedFrame.waitFor({ state: 'attached' });
  assert.match(
    await insertedFrame.getAttribute('srcdoc') ?? '',
    /data-morndraft-source="morndraft-flat"/u,
    'The representative slash entry did not reach the Final renderer.',
  );
};

const dispatchNoisyImageDrop = (page, {
  dimension,
  documentName,
  imageName,
  source,
}) => page.evaluate(async (fixture) => {
  const canvas = document.createElement('canvas');
  canvas.width = fixture.dimension;
  canvas.height = fixture.dimension;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable for the import fixture.');
  const pixels = context.createImageData(canvas.width, canvas.height);
  let seed = 0x6d2b79f5;
  for (let index = 0; index < pixels.data.length; index += 4) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    pixels.data[index] = seed & 255;
    pixels.data[index + 1] = (seed >>> 8) & 255;
    pixels.data[index + 2] = (seed >>> 16) & 255;
    pixels.data[index + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  const image = await new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error('Could not encode the import fixture.')),
    'image/png',
  ));
  const transfer = new window.DataTransfer();
  transfer.items.add(new window.File([fixture.source], fixture.documentName, { type: 'text/markdown' }));
  transfer.items.add(new window.File([image], fixture.imageName, { type: 'image/png' }));
  const workspace = document.querySelector('[data-public-workspace="true"]');
  if (!workspace) throw new Error('Public workspace is unavailable for the drop fixture.');
  workspace.dispatchEvent(new window.DragEvent('dragenter', { bubbles: true, dataTransfer: transfer }));
  workspace.dispatchEvent(new window.DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  workspace.dispatchEvent(new window.DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  return image.size;
}, { dimension, documentName, imageName, source });

const selectRenderedOccurrence = async (block, needle, occurrence) => {
  let selectionResult;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    selectionResult = await block.first().evaluate((root, input) => {
      root.focus({ preventScroll: true });
      const walker = root.ownerDocument.createTreeWalker(root, 4);
      const textNodes = [];
      let combined = '';
      let current = walker.nextNode();
      while (current) {
        textNodes.push({ node: current, start: combined.length, text: current.textContent ?? '' });
        combined += current.textContent ?? '';
        current = walker.nextNode();
      }
      let start = -1;
      let cursor = 0;
      for (let index = 0; index <= input.occurrence; index += 1) {
        start = combined.indexOf(input.needle, cursor);
        if (start < 0) return { combined, error: 'needle-not-found', selected: '' };
        cursor = start + input.needle.length;
      }
      const end = start + input.needle.length;
      const startEntry = textNodes.find((entry) => start >= entry.start && start <= entry.start + entry.text.length);
      const endEntry = [...textNodes].reverse().find((entry) => end >= entry.start && end <= entry.start + entry.text.length);
      if (!startEntry || !endEntry) return { combined, error: 'range-node-not-found', selected: '' };
      const range = root.ownerDocument.createRange();
      range.setStart(startEntry.node, start - startEntry.start);
      range.setEnd(endEntry.node, end - endEntry.start);
      const selection = root.ownerDocument.getSelection();
      selection?.removeAllRanges();
      selection?.setBaseAndExtent(
        startEntry.node,
        start - startEntry.start,
        endEntry.node,
        end - endEntry.start,
      );
      const rangeText = range.toString();
      const selected = selection?.toString() ?? '';
      if (selected === input.needle) {
        root.dispatchEvent(new (root.ownerDocument.defaultView).MouseEvent('mouseup', { bubbles: true }));
      }
      // React may synchronously re-render the editable block after mouseup and
      // clear the native Selection. Return what the browser selected before that
      // state update while still dispatching mouseup so the app records it.
      return {
        combined,
        endOffset: end - endEntry.start,
        rangeCount: selection?.rangeCount ?? 0,
        rangeText,
        selected,
        startOffset: start - startEntry.start,
        textNodes: textNodes.map((entry) => entry.text),
      };
    }, { needle, occurrence });
    if (selectionResult.selected === needle) break;
    await block.page().waitForTimeout(50);
  }
  assert.equal(
    selectionResult.selected,
    needle,
    `Could not select rendered occurrence ${occurrence} of ${needle}: ${JSON.stringify(selectionResult)}`,
  );
};

const runImportFlow = async (page, canonicalFlatSource) => {
  const input = page.locator('input.md-public-file-input');
  const sourceButton = page.getByRole('button', { name: /^(Source|源码)$/u });
  const finalButton = page.getByRole('button', { name: /^(Final|最终效果)$/u });
  const fixtures = [
    { name: 'fixture.md', mimeType: 'text/markdown', source: '# Imported Markdown', marker: 'Imported Markdown' },
    {
      name: 'fixture.json5',
      mimeType: 'application/json',
      source: "// top comment\n{kind:'json5', trailing:true,}",
      marker: "kind:'json5'",
      kind: 'json',
      finalEdit: "// edited in Final\n{kind:'json5-edited', trailing:true,}",
      finalMarker: "kind:'json5-edited'",
    },
    { name: 'fixture.mermaid', mimeType: 'text/plain', source: 'flowchart LR\nImport-->Final', marker: 'Import-->Final' },
    {
      name: 'fixture.html',
      mimeType: 'text/html',
      source: '<!doctype html><html><body>Imported HTML</body></html>',
      marker: 'Imported HTML',
      kind: 'html',
      finalEdit: '<!doctype html><html><body>HTML edited in Final</body></html>',
      finalMarker: 'HTML edited in Final',
    },
    {
      name: 'fixture-flat.md',
      mimeType: 'text/markdown',
      source: `# Imported flat\n\n${canonicalFlatSource}`,
      marker: 'data-morndraft-source="morndraft-flat"',
      kind: 'flat',
    },
  ];
  for (const fixture of fixtures) {
    await armImportCompletion(page);
    await input.setInputFiles({
      name: fixture.name,
      mimeType: fixture.mimeType,
      buffer: Buffer.from(fixture.source),
    });
    await waitForImportCompletion(page);
    await sourceButton.click();
    assert.match(await page.locator('.md-public-source-editor textarea').first().inputValue(), new RegExp(fixture.marker.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
    await finalButton.click();
    await page.locator('[data-public-preview-root="true"]').waitFor({ state: 'visible' });
    if (fixture.kind === 'json' || fixture.kind === 'html') {
      assert.equal(await page.locator('[data-public-final="true"]').getAttribute('data-document-kind'), fixture.kind);
    }
    if (fixture.kind === 'flat') {
      const flatFrame = page.locator('[data-public-preview-root="true"] iframe.md-public-html-frame');
      await flatFrame.waitFor({ state: 'attached' });
      assert.match(await flatFrame.getAttribute('srcdoc') ?? '', /data-morndraft-source="morndraft-flat"/u);
      await page.getByRole('button', { name: /^(Edit final content|编辑最终内容)$/u }).click();
      const flatField = page.locator('[data-public-flat="true"] [data-testid="oss-flat-final-field"][data-flat-path="$.items[0].label"]');
      await flatField.waitFor({ state: 'visible' });
      await flatField.fill('OSS flat edited in Final');
      await flatField.blur();
      await page.waitForFunction((expected) => (
        document.querySelector('[data-public-flat="true"] iframe.md-public-html-frame')?.getAttribute('srcdoc')?.includes(expected)
      ), 'OSS flat edited in Final');
      await sourceButton.click();
      const editedFlatSource = await page.locator('.md-public-source-editor textarea').first().inputValue();
      assert.match(editedFlatSource, /OSS flat edited in Final/u);
      assert.match(editedFlatSource, /<!-- morndraft:structure /u);
      assert.match(editedFlatSource, /data-morndraft-source="morndraft-flat"/u);
      await finalButton.click();
    }
    if (fixture.finalEdit) {
      await page.getByRole('button', { name: /^(Edit final content|编辑最终内容)$/u }).click();
      const finalEditor = page.locator('[data-public-final="true"] .md-public-source-editor textarea');
      await finalEditor.fill(fixture.finalEdit);
      await page.getByRole('button', { name: /^(Preview final content|预览最终内容)$/u }).click();
      await sourceButton.click();
      assert.match(await page.locator('.md-public-source-editor textarea').first().inputValue(), new RegExp(fixture.finalMarker.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
      await finalButton.click();
    }
  }

  await sourceButton.click();
  const previousSource = await page.locator('.md-public-source-editor textarea').first().inputValue();
  const onePixelPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgQIAKfRZ8QAAAABJRU5ErkJggg==', 'base64');
  const rejectedAttachments = [
    { name: 'unreferenced.json5', mimeType: 'application/json', source: "{kind:'json5'}" },
    { name: 'unreferenced.mmd', mimeType: 'text/plain', source: 'flowchart LR\nA-->B' },
    { name: 'unreferenced.html', mimeType: 'text/html', source: '<!doctype html><html><body>HTML</body></html>' },
  ];
  for (const fixture of rejectedAttachments) {
    await armImportCompletion(page);
    await input.setInputFiles([
      { name: fixture.name, mimeType: fixture.mimeType, buffer: Buffer.from(fixture.source) },
      { name: 'unreferenced.png', mimeType: 'image/png', buffer: onePixelPng },
    ]);
    await waitForImportCompletion(page, 'error');
    await sourceButton.click();
    assert.equal(
      await page.locator('.md-public-source-editor textarea').first().inputValue(),
      previousSource,
      `${fixture.name} was corrupted by an unreferenced image attachment.`,
    );
  }

  await armImportCompletion(page);
  const originalImageBytes = await dispatchNoisyImageDrop(page, {
    dimension: 900,
    documentName: 'with-image.md',
    imageName: 'noise.png',
    source: '# Imported image\n\n![noise](./noise.png)',
  });
  await waitForImportCompletion(page);
  assert.ok(originalImageBytes > 2 * 1024 * 1024, 'The browser fixture did not exercise real image compression.');
  await sourceButton.click();
  const importedImageSource = await page.locator('.md-public-source-editor textarea').first().inputValue();
  const importedImageMatch = importedImageSource.match(/data:image\/[a-z0-9.+-]+;base64,([a-z0-9+/=]+)/iu);
  assert.ok(importedImageMatch, 'Dropped local image was not embedded as a data URL.');
  const compressedImageBytes = Buffer.from(importedImageMatch[1], 'base64').byteLength;
  assert.ok(compressedImageBytes <= 2 * 1024 * 1024, 'Embedded image exceeds the 2 MiB public import limit.');
  assert.ok(compressedImageBytes < originalImageBytes, 'Dropped image was not actually compressed.');
  assert.doesNotMatch(importedImageSource, /\.\/noise\.png/u);
  await finalButton.click();
  const importedImage = page.locator('[data-public-preview-root="true"] img[alt="noise"]');
  await importedImage.waitFor({ state: 'visible' });
  assert.match(await importedImage.getAttribute('src') ?? '', /^data:image\/[a-z0-9.+-]+;base64,/iu);

  await sourceButton.click();
  await armImportCompletion(page);
  const slowImportBytes = await dispatchNoisyImageDrop(page, {
    dimension: 1200,
    documentName: 'slow-import.md',
    imageName: 'slow-noise.png',
    source: '# Stale slow import\n\n![slow](./slow-noise.png)',
  });
  assert.ok(slowImportBytes > originalImageBytes, 'Import race fixture was not slower than the baseline image.');
  await input.setInputFiles({
    name: 'newer-import.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# Newer import wins'),
  });
  await waitForImportCompletion(page);
  await sourceButton.click();
  const sourceAfterNewerImport = page.locator('.md-public-source-editor textarea').first();
  assert.equal(await sourceAfterNewerImport.inputValue(), '# Newer import wins');
  await page.waitForTimeout(2_500);
  assert.equal(
    await sourceAfterNewerImport.inputValue(),
    '# Newer import wins',
    'A late local import overwrote a newer import result.',
  );
};

const runAiFlow = async (page, mockBaseUrl) => {
  if (!await page.getByTestId('oss-ai-settings-open').isVisible()) {
    await page.locator('summary').filter({ hasText: /^(More|更多)$/u }).click();
  }
  await clickByTestId(page, 'oss-ai-settings-open');
  await page.locator('input[name="baseUrl"]').fill(`${mockBaseUrl}/v1`);
  await page.locator('input[name="apiKey"]').fill('oss-e2e-key');
  await page.locator('input[name="model-generate"]').fill('oss-generate-model');
  await page.locator('input[name="model-modify"]').fill('oss-modify-model');
  await page.locator('input[name="model-summarize"]').fill('oss-summarize-model');
  await page.locator('form.public-ai-settings button[type="submit"]').click();

  const stored = await page.evaluate(() => ({
    local: localStorage.getItem('morndraft.oss.aiConfig.v1'),
    session: sessionStorage.getItem('morndraft.oss.aiConfig.session.v1'),
  }));
  assert.doesNotMatch(stored.local ?? '', /oss-e2e-key/u, 'Default storage must not persist the API Key.');
  assert.match(stored.session ?? '', /oss-e2e-key/u, 'Session storage must keep the API Key for this tab.');

  const sourceMode = page.getByRole('button', { name: /^(Source|源码)$/u });
  if (await sourceMode.count()) await sourceMode.click();
  const sourceEditor = page.locator('.md-public-source-editor textarea').first();
  await sourceEditor.fill('/AI');
  await clickByTestId(page, 'oss-ai-generate');
  await page.getByTestId('oss-ai-instruction').fill('Generate an OSS heading');
  await page.getByRole('dialog').getByRole('button', { name: /^(Send|发送)$/u }).click();
  await expectAiResult(page, 'Generated from OSS AI');
  await clickByTestId(page, 'oss-ai-adopt');

  await sourceEditor.waitFor({ state: 'visible' });
  await sourceEditor.fill('**bold target** repeat repeat');
  await page.getByRole('button', { name: /^(Final|最终效果)$/u }).click();
  let renderedBlock = page.locator('[data-public-final-block="true"]').filter({ hasText: 'bold target repeat repeat' });
  await renderedBlock.waitFor({ state: 'visible' });
  await selectRenderedOccurrence(renderedBlock, 'bold target', 0);
  await clickByTestId(page, 'oss-ai-modify');
  await page.getByTestId('oss-ai-instruction').fill('Make the selection clearer');
  await page.getByRole('dialog').getByRole('button', { name: /^(Send|发送)$/u }).click();
  await expectAiResult(page, 'Modified selection from OSS AI');
  await clickByTestId(page, 'oss-ai-adopt');

  await sourceMode.click();
  assert.equal(await sourceEditor.inputValue(), '**Modified selection from OSS AI** repeat repeat');
  await page.getByRole('button', { name: /^(Final|最终效果)$/u }).click();
  renderedBlock = page.locator('[data-public-final-block="true"]').filter({ hasText: 'Modified selection from OSS AI repeat repeat' });
  await renderedBlock.waitFor({ state: 'visible' });
  await selectRenderedOccurrence(renderedBlock, 'repeat', 1);
  await clickByTestId(page, 'oss-ai-summarize');
  await expectAiResult(page, 'Summary from OSS AI');
  await page.getByRole('dialog').getByRole('button', { name: /^(Close|关闭)$/u }).click();
  await sourceMode.click();
  assert.equal(
    await sourceEditor.inputValue(),
    '**Modified selection from OSS AI** repeat repeat',
    'Summarize must remain read-only and leave Source unchanged.',
  );

  await sourceEditor.fill('/AI');
  await clickByTestId(page, 'oss-ai-generate');
  await page.getByTestId('oss-ai-instruction').fill('OSS race request A');
  await page.getByRole('dialog').getByRole('button', { name: /^(Send|发送)$/u }).click();
  await page.getByRole('dialog').getByRole('status').waitFor({ state: 'visible' });
  await page.waitForTimeout(75);
  await page.getByRole('dialog').getByRole('button', { name: /^(Cancel|取消)$/u }).click();
  await page.getByRole('dialog').getByRole('alert').waitFor({ state: 'visible' });
  await page.getByRole('dialog').getByRole('button', { name: /^(Close|关闭)$/u }).click();

  await sourceEditor.fill('');
  await sourceEditor.fill('/AI');
  await clickByTestId(page, 'oss-ai-generate');
  await page.getByTestId('oss-ai-instruction').fill('OSS race request B');
  await page.getByRole('dialog').getByRole('button', { name: /^(Send|发送)$/u }).click();
  await expectAiResult(page, 'Fresh response from OSS race B');
  await page.waitForTimeout(500);
  const raceResult = page.getByTestId('oss-ai-result');
  assert.match(await raceResult.innerText(), /Fresh response from OSS race B/u);
  assert.doesNotMatch(await raceResult.innerText(), /Stale response from OSS race A/u);
  await page.getByRole('dialog').getByRole('button', { name: /^(Close|关闭)$/u }).click();
};

const runFinalEditingFlow = async (page) => {
  const sourceButton = page.getByRole('button', { name: /^(Source|源码)$/u });
  await sourceButton.click();
  const sourceEditor = page.locator('.md-public-source-editor textarea').first();
  await sourceEditor.fill([
    '# Stable heading',
    '',
    'Editable paragraph before the iframe.',
    '',
    '```html',
    '<!doctype html><html><body>stable iframe</body></html>',
    '```',
    '',
    'Markdown after the iframe.',
  ].join('\n'));
  await page.getByRole('button', { name: /^(Final|最终效果)$/u }).click();
  const previewRoot = page.locator('[data-public-preview-root="true"]');
  await previewRoot.waitFor({ state: 'visible' });
  const frame = previewRoot.locator('iframe.md-public-html-frame');
  await frame.waitFor({ state: 'attached' });
  await frame.evaluate((element) => { window.__ossStableFrame = element.contentWindow; });

  await page.getByRole('button', { name: /^(Edit final content|编辑最终内容)$/u }).click();
  assert.equal(await previewRoot.count(), 1, 'Final editing must keep the rendered preview root mounted.');
  const editable = previewRoot.locator('[data-public-final-editable="true"]').filter({ hasText: 'Editable paragraph' });
  await editable.waitFor({ state: 'visible' });
  assert.equal(await editable.getAttribute('contenteditable'), 'true');
  await editable.fill('Precisely patched paragraph before the iframe.');
  await assertDownload(page, 'oss-delivery-download-html', '.html', (content) => {
    const html = content.toString('utf8');
    assert.doesNotMatch(html, /data-morndraft-delivery-exclude|contenteditable=["']true["']/u);
    assert.doesNotMatch(
      html,
      /class=["'][^"']*md-public-(?:flat-editor|html-fence-editor|final-edit-toolbar)[^"']*["']/u,
    );
    assert.match(html, /Precisely patched paragraph before the iframe\./u);
  });
  await page.getByRole('button', { name: /^(Preview final content|预览最终内容)$/u }).click();
  const identityPreserved = await frame.evaluate((element) => element.contentWindow === window.__ossStableFrame);
  assert.equal(identityPreserved, true, 'An adjacent Markdown patch remounted an unchanged HTML iframe.');

  await sourceButton.click();
  assert.match(await sourceEditor.inputValue(), /Precisely patched paragraph before the iframe\./u);
  await page.getByRole('button', { name: /^(Final|最终效果)$/u }).click();
};

const collectDownloadTimeoutDiagnostics = async (page) => {
  let timeoutId;
  const diagnostics = page.evaluate(() => {
    const safeText = (value, maxLength = 240) => String(value ?? '')
      .replace(/Bearer\s+[^\s]+/giu, 'Bearer [redacted]')
      .replace(/((?:api[-_ ]?)?key\s*[:=]\s*)[^\s]+/giu, '$1[redacted]')
      .trim()
      .slice(0, maxLength);
    const dimensions = (element) => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        client: [element.clientWidth, element.clientHeight],
        offset: [element.offsetWidth, element.offsetHeight],
        rect: [Math.round(rect.width), Math.round(rect.height)],
        scroll: [element.scrollWidth, element.scrollHeight],
      };
    };
    const describeFrame = (frame) => {
      let content = { accessible: false, readyState: 'inaccessible', root: null };
      try {
        const frameDocument = frame.contentDocument;
        content = {
          accessible: Boolean(frameDocument),
          readyState: frameDocument?.readyState ?? 'missing',
          root: dimensions(frameDocument?.documentElement ?? null),
        };
      } catch {
        // An opaque author iframe is expected to be inaccessible here.
      }
      return {
        className: safeText(frame.className, 120),
        connected: frame.isConnected,
        content,
        dimensions: dimensions(frame),
        hidden: frame.hidden,
        id: safeText(frame.id, 120),
        sandbox: safeText(frame.getAttribute('sandbox'), 120),
      };
    };
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = element.ownerDocument.defaultView?.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style?.display !== 'none' && style?.visibility !== 'hidden';
    };
    const captureHosts = Array.from(document.querySelectorAll('[data-morndraft-public-capture-host="true"]'));
    const captureFrames = Array.from(document.querySelectorAll(
      'iframe[sandbox="allow-same-origin"][aria-hidden="true"], iframe[data-morndraft-public-capture-frame]',
    ));
    const modernSandboxes = Array.from(document.querySelectorAll('iframe[id^="__SANDBOX__"]'));
    const alerts = Array.from(document.querySelectorAll('.md-public-delivery [role="alert"]'));
    const statuses = Array.from(document.querySelectorAll('.md-public-delivery [role="status"]'));
    return {
      alerts: alerts.slice(0, 4).map((element) => ({
        text: safeText(element.textContent),
        visible: visible(element),
      })),
      buttons: Array.from(document.querySelectorAll('.md-public-delivery button')).slice(0, 8).map((button) => ({
        ariaBusy: safeText(button.getAttribute('aria-busy'), 24),
        disabled: button.disabled,
        testId: safeText(button.getAttribute('data-testid'), 80),
        text: safeText(button.textContent, 80),
      })),
      captureFrames: captureFrames.slice(0, 8).map(describeFrame),
      captureHosts: captureHosts.slice(0, 8).map((host) => ({
        connected: host.isConnected,
        dimensions: dimensions(host),
        shadowChildCount: host.shadowRoot?.childElementCount ?? 0,
        shadowRoot: dimensions(host.shadowRoot?.querySelector('[data-public-preview-root="true"]') ?? null),
      })),
      document: {
        body: dimensions(document.body),
        readyState: document.readyState,
        root: dimensions(document.documentElement),
        visibilityState: document.visibilityState,
      },
      html2canvasContainers: document.querySelectorAll('.html2canvas-container').length,
      modernSandboxes: {
        count: modernSandboxes.length,
        frames: modernSandboxes.slice(0, 8).map(describeFrame),
      },
      statuses: statuses.slice(0, 4).map((element) => ({
        text: safeText(element.textContent),
        visible: visible(element),
      })),
      topLevelCanvases: Array.from(document.querySelectorAll('body > canvas')).slice(0, 8).map(dimensions),
    };
  });
  try {
    return await Promise.race([
      diagnostics,
      new Promise((resolve) => {
        timeoutId = setTimeout(
          () => resolve({ collection: 'timed out after 2000ms' }),
          2_000,
        );
      }),
    ]);
  } catch (error) {
    return { collection: `failed (${error instanceof Error ? error.name : 'unknown'})` };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const assertDownload = async (page, testId, extension, verify) => {
  const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
  try {
    await clickByTestId(page, testId);
  } catch (error) {
    void downloadPromise.catch(() => undefined);
    throw error;
  }
  const download = await downloadPromise.catch(async (cause) => {
    const diagnostics = await collectDownloadTimeoutDiagnostics(page);
    throw new Error(
      `${testId} did not start a download within 30000ms. Safe delivery diagnostics: ${JSON.stringify(diagnostics)}`,
      { cause },
    );
  });
  assert.equal(path.extname(download.suggestedFilename()).toLowerCase(), extension);
  const filePath = await download.path();
  assert.ok(filePath, `${extension} download did not create a file.`);
  const content = await readFile(filePath);
  assert.ok(content.byteLength > 32, `${extension} download is unexpectedly empty.`);
  await verify(content);
  return { content, download, filePath };
};

const assertA4ImagePdf = async (content, label) => {
  assert.equal(content.subarray(0, 4).toString('ascii'), '%PDF', `${label} is not a PDF file.`);
  const pdf = await PDFDocument.load(content);
  assert.ok(pdf.getPageCount() > 0, `${label} has no pages.`);
  for (const [index, page] of pdf.getPages().entries()) {
    assert.ok(Math.abs(page.getWidth() - 595.28) < 0.05, `${label} page ${index + 1} is not A4 width.`);
    assert.ok(Math.abs(page.getHeight() - 841.89) < 0.05, `${label} page ${index + 1} is not A4 height.`);
    assert.ok(page.node.get(PDFName.of('Contents')), `${label} page ${index + 1} has no content stream.`);
  }
  const embeddedImageCount = pdf.context.enumerateIndirectObjects().filter(([, object]) => {
    const dictionary = object && typeof object === 'object' && 'dict' in object ? object.dict : null;
    return dictionary && typeof dictionary.get === 'function'
      && String(dictionary.get(PDFName.of('Subtype'))) === '/Image';
  }).length;
  assert.ok(embeddedImageCount > 0, `${label} contains no embedded image.`);
  assert.ok(content.byteLength > 512, `${label} has no meaningful PDF payload.`);
};

const inspectPngPixels = (page, content, samples) => page.evaluate(async (input) => {
  const binary = window.atob(input.base64);
  const bytes = new window.Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const bitmap = await window.createImageBitmap(new window.Blob([bytes], { type: 'image/png' }));
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable for PNG inspection.');
  context.drawImage(bitmap, 0, 0);
  const pixels = input.samples.map(({ xRatio, yRatio }) => {
    const x = Math.min(bitmap.width - 1, Math.max(0, Math.floor(bitmap.width * xRatio)));
    const y = Math.min(bitmap.height - 1, Math.max(0, Math.floor(bitmap.height * yRatio)));
    return [...context.getImageData(x, y, 1, 1).data];
  });
  const result = { height: bitmap.height, pixels, width: bitmap.width };
  bitmap.close();
  canvas.width = 0;
  canvas.height = 0;
  return result;
}, { base64: content.toString('base64'), samples });

const assertRgbaNear = (actual, expected, label, tolerance = 8) => {
  assert.equal(actual.length, 4, `${label} did not return an RGBA pixel.`);
  for (let index = 0; index < 4; index += 1) {
    assert.ok(
      Math.abs(actual[index] - expected[index]) <= tolerance,
      `${label} channel ${index} was ${actual[index]}, expected ${expected[index]} +/- ${tolerance}.`,
    );
  }
};

const assertDeliveryFailureWithoutDownload = async (
  page,
  testId,
  messagePattern = /(?:请下载 HTML|download HTML)/iu,
) => {
  const visibleAlert = page.locator('.md-public-delivery [role="alert"]').filter({ visible: true });
  let downloadCount = 0;
  const onDownload = () => { downloadCount += 1; };
  page.on('download', onDownload);
  try {
    await clickByTestId(page, testId);
    await visibleAlert.waitFor({ state: 'visible' });
    assert.match(await visibleAlert.innerText(), messagePattern);
    await page.waitForFunction((id) => {
      const button = document.querySelector(`[data-testid="${id}"]`);
      return button instanceof HTMLButtonElement && !button.disabled;
    }, testId);
    await page.waitForTimeout(150);
    assert.equal(downloadCount, 0, `${testId} generated a dynamic HTML half-product.`);
  } finally {
    page.off('download', onDownload);
  }
};

const replaceSourceAndOpenFinal = async (page, source) => {
  await page.getByRole('button', { name: /^(Source|源码)$/u }).click();
  await page.locator('.md-public-source-editor textarea').first().fill(source);
  await page.getByRole('button', { name: /^(Final|最终效果)$/u }).click();
  await page.locator('[data-public-preview-root="true"]').waitFor({ state: 'visible' });
};

const runDeliveryHardeningFlow = async (
  page,
  fixtureBaseUrl,
  fixtureRequests,
  slowCssDelayMs,
  consoleErrors,
  baseline,
) => {
  const mediaCssRequestsBefore = fixtureRequests.mediaContextCss;
  const activeMediaRequestsBefore = fixtureRequests.activeMediaImage;
  const inactivePrintRequestsBefore = fixtureRequests.inactivePrintImage;
  await replaceSourceAndOpenFinal(page, [
    '<!doctype html>',
    '<html><head>',
    `<link rel="stylesheet" href="${fixtureBaseUrl}/media-context.css?case=screen">`,
    `<style>@media print{body{background-image:url("${fixtureBaseUrl}/inactive-print.png?source=inline")}}</style>`,
    '</head><body><div class="media-context-card"></div></body></html>',
  ].join(''));
  const mediaContextPng = await assertDownload(page, 'oss-delivery-download-png', '.png', (content) => {
    assert.deepEqual([...content.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  });
  assert.ok(
    fixtureRequests.mediaContextCss > mediaCssRequestsBefore,
    'The CORS-readable media-context stylesheet was not requested.',
  );
  assert.ok(
    fixtureRequests.activeMediaImage > activeMediaRequestsBefore,
    'The active screen CSS image was not requested.',
  );
  assert.equal(
    fixtureRequests.inactivePrintImage,
    inactivePrintRequestsBefore,
    'An inactive print-only CSS image was requested or blocked screen capture.',
  );
  const mediaContextPixels = await inspectPngPixels(page, mediaContextPng.content, [
    { xRatio: 0.02, yRatio: 0.02 },
    { xRatio: 0.5, yRatio: 0.5 },
  ]);
  assertRgbaNear(mediaContextPixels.pixels[0], [16, 32, 48, 255], 'media-context page background', 14);
  assertRgbaNear(mediaContextPixels.pixels[1], [37, 199, 104, 255], 'active screen CSS image', 18);
  await assertNoActiveDeliveryResources(page, baseline, 'media-context delivery');

  const slowCssRequestsBefore = fixtureRequests.slowCss;
  await replaceSourceAndOpenFinal(page, [
    '<!doctype html>',
    '<html><head>',
    `<link rel="stylesheet" href="${fixtureBaseUrl}/slow-layout.css?case=complete">`,
    '</head><body><div class="slow-card"></div></body></html>',
  ].join(''));
  const slowStartedAt = Date.now();
  const slowPng = await assertDownload(page, 'oss-delivery-download-png', '.png', (content) => {
    assert.deepEqual([...content.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  });
  assert.ok(
    Date.now() - slowStartedAt >= slowCssDelayMs - 100,
    'PNG delivery completed before the slow author stylesheet could load.',
  );
  assert.ok(fixtureRequests.slowCss > slowCssRequestsBefore, 'Slow author stylesheet was not requested.');
  const slowPixels = await inspectPngPixels(page, slowPng.content, [
    { xRatio: 0.02, yRatio: 0.02 },
    { xRatio: 0.5, yRatio: 0.5 },
  ]);
  assert.ok(slowPixels.width >= 1_354, 'Scale-2 PNG width did not preserve the public capture policy.');
  assertRgbaNear(slowPixels.pixels[0], [16, 32, 48, 255], 'slow stylesheet page background', 14);
  assertRgbaNear(slowPixels.pixels[1], [18, 164, 230, 255], 'slow stylesheet centered card', 18);
  await assertNoActiveDeliveryResources(page, baseline, 'slow stylesheet delivery');

  const noCorsRequestsBefore = fixtureRequests.noCorsImage;
  const noCorsConsoleStart = consoleErrors.length;
  await replaceSourceAndOpenFinal(page, [
    '<!doctype html>',
    '<html><body>',
    `<img alt="unreadable CORS fixture" src="${fixtureBaseUrl}/no-cors.png?case=fail-closed">`,
    '</body></html>',
  ].join(''));
  await assertDeliveryFailureWithoutDownload(
    page,
    'oss-delivery-download-png',
    /CORS|跨域|remote resource/iu,
  );
  assert.ok(fixtureRequests.noCorsImage > noCorsRequestsBefore, 'No-CORS image fixture was not requested.');
  await page.waitForTimeout(100);
  const expectedNoCorsErrors = consoleErrors.splice(noCorsConsoleStart);
  assert.ok(
    expectedNoCorsErrors.some((message) => (
      /^Access to fetch at 'http:\/\/127\.0\.0\.1:\d+\/no-cors\.png\?case=fail-closed'.*blocked by CORS policy:/u
        .test(message)
    )),
    'The no-CORS fixture did not produce Chromium\'s expected CORS rejection.',
  );
  assert.equal(
    expectedNoCorsErrors.every((message) => (
      /^Access to fetch at 'http:\/\/127\.0\.0\.1:\d+\/no-cors\.png\?case=fail-closed'.*blocked by CORS policy:/u
        .test(message) || message === 'Failed to load resource: net::ERR_FAILED'
    )),
    true,
    `Unexpected console error during the no-CORS negative case: ${expectedNoCorsErrors.join('\n')}`,
  );
  await assertNoActiveDeliveryResources(page, baseline, 'CORS failure');

  const noCorsCssRequestsBefore = fixtureRequests.noCorsCss;
  const noCorsCssConsoleStart = consoleErrors.length;
  await replaceSourceAndOpenFinal(page, [
    '<!doctype html>',
    '<html><head>',
    `<link rel="stylesheet" href="${fixtureBaseUrl}/no-cors.css?case=fail-closed">`,
    '</head><body><div class="no-cors-card"></div></body></html>',
  ].join(''));
  await assertDeliveryFailureWithoutDownload(
    page,
    'oss-delivery-download-png',
    /CORS|跨域|remote resource/iu,
  );
  assert.ok(fixtureRequests.noCorsCss > noCorsCssRequestsBefore, 'No-CORS stylesheet fixture was not requested.');
  await page.waitForTimeout(100);
  const expectedNoCorsCssErrors = consoleErrors.splice(noCorsCssConsoleStart);
  assert.ok(
    expectedNoCorsCssErrors.some(message => message.includes('/no-cors.css?case=fail-closed')),
    'The no-CORS stylesheet did not produce Chromium\'s expected CORS rejection.',
  );
  assert.equal(
    expectedNoCorsCssErrors.every(message => (
      message.includes('/no-cors.css?case=fail-closed') || message === 'Failed to load resource: net::ERR_FAILED'
    )),
    true,
    `Unexpected console error during the no-CORS stylesheet case: ${expectedNoCorsCssErrors.join('\n')}`,
  );
  await assertNoActiveDeliveryResources(page, baseline, 'stylesheet CORS failure');

  await replaceSourceAndOpenFinal(page, [
    '<!doctype html>',
    '<html><body><label>Mutable <input value="initial"></label></body></html>',
  ].join(''));
  await assertDeliveryFailureWithoutDownload(
    page,
    'oss-delivery-download-png',
    /请下载 HTML|download HTML/iu,
  );
  await assertNoActiveDeliveryResources(page, baseline, 'mutable form fail-closed');

  const frameHtml = '<!doctype html><html><body style="margin:0;min-height:440px;background:#ddeeff">oversized frame</body></html>';
  const oversizedMixed = [
    '# Operation-wide pixel budget',
    ...Array.from({ length: 6 }, (_, index) => [
      '',
      '```html',
      frameHtml.replace('oversized frame', `oversized frame ${index + 1}`),
      '```',
    ].join('\n')),
  ].join('\n');
  await replaceSourceAndOpenFinal(page, oversizedMixed);
  const allocationAuditBefore = await readDeliveryResourceAudit(page);
  await assertDeliveryFailureWithoutDownload(
    page,
    'oss-delivery-download-png',
    /安全截图上限|safe screenshot limit|browser safe/iu,
  );
  const allocationAuditAfter = await readDeliveryResourceAudit(page);
  assert.equal(
    allocationAuditAfter.modernSandboxesAdded,
    allocationAuditBefore.modernSandboxesAdded,
    'Oversized multi-frame delivery allocated a modern-screenshot sandbox before the operation-wide budget failed.',
  );
  assert.equal(
    allocationAuditAfter.html2canvasContainersAdded,
    allocationAuditBefore.html2canvasContainersAdded,
    'Oversized multi-frame delivery allocated an html2canvas container before the operation-wide budget failed.',
  );
  await assertNoActiveDeliveryResources(page, baseline, 'operation-wide pixel failure');

  await replaceSourceAndOpenFinal(page, [
    '<!doctype html>',
    '<html><head>',
    `<link rel="stylesheet" href="${fixtureBaseUrl}/slow-layout.css?case=cancel-${Date.now()}">`,
    '</head><body><div class="slow-card"></div></body></html>',
  ].join(''));
  let cancelledDownloads = 0;
  const onCancelledDownload = () => { cancelledDownloads += 1; };
  page.on('download', onCancelledDownload);
  try {
    await page.getByTestId('oss-delivery-download-png').click();
    await page.waitForFunction(() => {
      const button = document.querySelector('[data-testid="oss-delivery-download-png"]');
      return button instanceof HTMLButtonElement && button.disabled;
    });
    await page.getByRole('button', { name: /^(Source|源码)$/u }).click();
    await page.locator('.md-public-source-editor textarea').first().fill('# New source cancels old delivery');
    await page.waitForTimeout(slowCssDelayMs + 450);
    assert.equal(cancelledDownloads, 0, 'A stale delivery downloaded after Source changed.');
  } finally {
    page.off('download', onCancelledDownload);
  }
  await assertNoActiveDeliveryResources(page, baseline, 'source-change cancellation');

  await replaceSourceAndOpenFinal(page, [
    '<!doctype html>',
    '<html><head>',
    `<link rel="stylesheet" href="${fixtureBaseUrl}/slow-layout.css?case=theme-cancel-${Date.now()}">`,
    '</head><body><div class="slow-card"></div></body></html>',
  ].join(''));
  let themeCancelledDownloads = 0;
  const onThemeCancelledDownload = () => { themeCancelledDownloads += 1; };
  page.on('download', onThemeCancelledDownload);
  try {
    await page.getByTestId('oss-delivery-download-png').click();
    await page.waitForFunction(() => {
      const button = document.querySelector('[data-testid="oss-delivery-download-png"]');
      return button instanceof HTMLButtonElement && button.disabled;
    });
    await setWorkspaceTheme(page, 'dark');
    await page.waitForTimeout(slowCssDelayMs + 450);
    assert.equal(themeCancelledDownloads, 0, 'A stale delivery downloaded after the theme changed.');
  } finally {
    page.off('download', onThemeCancelledDownload);
  }
  await assertNoActiveDeliveryResources(page, baseline, 'theme-change cancellation');
  await setWorkspaceTheme(page, 'light');

  await replaceSourceAndOpenFinal(page, '# Standalone timeout\n\nA hanging local stylesheet must fail closed.');
  await page.evaluate(() => {
    const originalFetch = window.fetch.bind(window);
    window.__ossOriginalFetch = originalFetch;
    window.fetch = (input, init) => {
      const href = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
      if (!href.includes('/oss-e2e-nested.css')) return originalFetch(input, init);
      return new Promise((_, reject) => {
        const signal = init?.signal;
        const abort = () => reject(signal?.reason ?? new window.DOMException('Aborted', 'AbortError'));
        if (signal?.aborted) abort();
        else signal?.addEventListener('abort', abort, { once: true });
      });
    };
  });
  const standaloneTimeoutStartedAt = Date.now();
  try {
    await assertDeliveryFailureWithoutDownload(
      page,
      'oss-delivery-download-html',
      /超时|timeout|standalone/iu,
    );
    assert.ok(
      Date.now() - standaloneTimeoutStartedAt >= 9_500,
      'Standalone local resource timeout fired before its bounded 10-second window.',
    );
  } finally {
    await page.evaluate(() => {
      if (window.__ossOriginalFetch) window.fetch = window.__ossOriginalFetch;
      delete window.__ossOriginalFetch;
    });
  }
  await assertNoActiveDeliveryResources(page, baseline, 'standalone local resource timeout');

  await replaceSourceAndOpenFinal(page, '# Delivery hardening complete\n\nStable final capture.');
};

const runMermaidImmediateDeliveryFlow = async (page) => {
  const sourceButton = page.getByRole('button', { name: /^(Source|源码)$/u });
  const finalButton = page.getByRole('button', { name: /^(Final|最终效果)$/u });
  const mermaidSource = [
    'flowchart TD',
    ...Array.from({ length: 10 }, (_, index) => `  N${index}[Render ${index}] --> N${index + 1}[Render ${index + 1}]`),
  ].join('\n');
  const deliveries = [
    {
      testId: 'oss-delivery-download-html',
      extension: '.html',
      verify: (content) => {
        const html = extractPortableDocumentSrcdoc(content.toString('utf8'));
        assert.doesNotMatch(
          html,
          /<[^>]+(?:class="[^"]*\bmd-public-preview-loading\b[^"]*"|data-public-render-state="pending")[^>]*>/u,
        );
        assert.match(html, /<[^>]+data-public-render-state="ready"[^>]*>/u);
        assert.match(html, /<[^>]+data-mermaid-security="strict-isolated"[^>]*>/u);
      },
    },
    {
      testId: 'oss-delivery-download-png',
      extension: '.png',
      verify: (content) => assert.deepEqual([...content.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]),
    },
    {
      testId: 'oss-delivery-download-pdf',
      extension: '.pdf',
      verify: (content) => assertA4ImagePdf(content, 'Immediate Mermaid PDF'),
    },
  ];
  for (const [index, delivery] of deliveries.entries()) {
    console.log(`[oss-e2e] immediate Mermaid ${delivery.extension}`);
    await sourceButton.click();
    await page.locator('.md-public-source-editor textarea').first().fill(`${mermaidSource}\n%% immediate-delivery-${index}`);
    await finalButton.click();
    const previewRoot = page.locator('[data-public-preview-root="true"]');
    await assertDownload(page, delivery.testId, delivery.extension, delivery.verify);
    const readyFrame = previewRoot.locator('iframe.md-public-mermaid-frame[data-public-render-state="ready"]');
    await readyFrame.waitFor({ state: 'attached' });
    assert.equal(await previewRoot.locator('[data-public-render-state="pending"], [data-public-render-state="error"]').count(), 0);
  }
};

const runDeliveryFlow = async (page, createNetworkTrackedContext, appUrl, deliveryResourceBaseline) => {
  const sourceButton = page.getByRole('button', { name: /^(Source|源码)$/u });
  if (await sourceButton.count()) await sourceButton.click();
  await page.locator('.md-public-source-editor textarea').first().fill([
    '```html',
    '<!doctype html><html><body><style>h1{color:#123456}</style><h1>Static OSS image delivery</h1><svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="8"/></svg></body></html>',
    '```',
  ].join('\n'));
  const previewButton = page.getByRole('button', { name: /^(Final|最终效果)$/u });
  if (await previewButton.count()) await previewButton.click();
  await page.locator('[data-public-preview-root="true"]').waitFor({ state: 'visible' });

  await assertDownload(page, 'oss-delivery-download-png', '.png', (content) => {
    assert.deepEqual([...content.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  });
  await assertDownload(
    page,
    'oss-delivery-download-pdf',
    '.pdf',
    (content) => assertA4ImagePdf(content, 'OSS delivery PDF'),
  );

  await sourceButton.click();
  await page.evaluate(() => { window.__ossRawPolluted = false; });
  await page.locator('.md-public-source-editor textarea').first().fill([
    '```html',
    '<!doctype html><html><body><h1>Dynamic portable OSS delivery</h1><canvas></canvas><svg onload="try{top.__ossRawPolluted=true}catch(e){}"></svg><script>document.body.dataset.ready="true"</script></body></html>',
    '```',
  ].join('\n'));
  await previewButton.click();
  await page.locator('[data-public-preview-root="true"] iframe.md-public-html-frame').waitFor({ state: 'attached' });
  await assertDownload(page, 'oss-delivery-download-html', '.html', (content) => {
    const html = content.toString('utf8');
    assert.match(html, /<!doctype html>/iu);
    assert.match(html, /sandbox=["']allow-scripts["']/u);
    assert.doesNotMatch(html, /sandbox=["'][^"']*allow-same-origin/iu);
  });
  await assertDeliveryFailureWithoutDownload(page, 'oss-delivery-download-png');
  await assertDeliveryFailureWithoutDownload(page, 'oss-delivery-download-pdf');
  assert.equal(await page.evaluate(() => window.__ossRawPolluted), false, 'Raw HTML capture escaped its opaque iframe.');

  await sourceButton.click();
  await page.locator('.md-public-source-editor textarea').first().fill([
    '```html',
    '<!doctype html><html><body><img id="relative-portable-image" src="/oss-e2e-marker.svg"><a href="./relative-target">relative</a><template id="relative-portable-template"><img id="template-relative-portable-image" src="/oss-e2e-marker.svg"></template><script>document.body.append(document.getElementById("relative-portable-template").content.cloneNode(true))</script></body></html>',
    '```',
  ].join('\n'));
  await previewButton.click();
  const relativePortable = await assertDownload(page, 'oss-delivery-download-html', '.html', (content) => {
    const html = content.toString('utf8');
    assert.match(html, new RegExp(`${appUrl.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}/oss-e2e-marker\\.svg`, 'u'));
    assert.match(html, new RegExp(`${appUrl.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}/relative-target`, 'u'));
  });
  const relativePortablePath = path.join(outputDir, 'portable-relative.html');
  const relativePortableContext = await createNetworkTrackedContext();
  try {
    await relativePortable.download.saveAs(relativePortablePath);
    const relativePortablePage = await relativePortableContext.newPage();
    await relativePortablePage.goto(pathToFileURL(relativePortablePath).href, { waitUntil: 'load' });
    const relativeFrame = relativePortablePage.frames().find(candidate => candidate !== relativePortablePage.mainFrame());
    assert.ok(relativeFrame, 'Relative portable HTML did not preserve its sandboxed child frame.');
    await relativeFrame.locator('#relative-portable-image').waitFor({ state: 'attached' });
    await relativeFrame.locator('#template-relative-portable-image').waitFor({ state: 'attached' });
    assert.ok(
      await relativeFrame.locator('#relative-portable-image').evaluate(element => element.naturalWidth),
      'Relative author image stopped resolving after the portable file moved to file://.',
    );
    assert.ok(
      await relativeFrame.locator('#template-relative-portable-image').evaluate(element => element.naturalWidth),
      'Relative image cloned from template content stopped resolving after the portable file moved to file://.',
    );
  } finally {
    await relativePortableContext.close();
    await rm(relativePortablePath, { force: true });
  }

  await setWorkspaceTheme(page, 'dark');
  await sourceButton.click();
  await page.locator('.md-public-source-editor textarea').first().fill([
    '# Dark mixed capture',
    '',
    'Outer paper must keep the Final theme variables.',
    '',
    '```html',
    '<!doctype html><html><body style="margin:0;min-height:180px;background:#315477;color:#fff">static child</body></html>',
    '```',
  ].join('\n'));
  await previewButton.click();
  await page.locator('[data-public-preview-root="true"] iframe.md-public-html-frame').waitFor({ state: 'attached' });
  const darkMixedPng = await assertDownload(page, 'oss-delivery-download-png', '.png', (content) => {
    assert.deepEqual([...content.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  });
  const darkMixedPixels = await inspectPngPixels(page, darkMixedPng.content, [{ xRatio: 0.08, yRatio: 0.04 }]);
  assertRgbaNear(darkMixedPixels.pixels[0], [34, 34, 29, 255], 'dark mixed Final paper', 12);

  await page.evaluate(async () => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/oss-e2e-root.css';
    link.dataset.ossE2ePortableNestedCss = 'true';
    const loaded = new Promise((resolve, reject) => {
      link.addEventListener('load', resolve, { once: true });
      link.addEventListener('error', () => reject(new Error('nested portable CSS fixture failed to load')), { once: true });
    });
    document.head.append(link);
    await loaded;
  });

  await sourceButton.click();
  await page.locator('.md-public-source-editor textarea').first().fill([
    '# Portable mixed document',
    '',
    '```html',
    '<!doctype html><html><body><script>document.body.dataset.childReady="true";try{top.document.body.dataset.ossPolluted="true"}catch(e){}</script></body></html>',
    '```',
  ].join('\n'));
  await previewButton.click();
  await page.locator('[data-public-preview-root="true"] iframe.md-public-html-frame').waitFor({ state: 'attached' });
  const portablePath = path.join(outputDir, 'portable-mixed.html');
  await assertDownload(page, 'oss-delivery-download-html', '.html', async (content) => {
    // Persist the real browser download before inspecting it so a failed
    // portability assertion leaves the exact artifact in the ignored evidence
    // directory instead of only printing a multi-megabyte assertion value.
    await writeFile(portablePath, content);
    const html = content.toString('utf8');
    assert.match(html, /sandbox=["']allow-scripts["']/u);
    assert.match(html, /data:font\/woff2;base64,/u);
    assert.match(html, /data:text\/css;charset=utf-8;base64,/u);
    const embeddedCssPayloads = Array.from(
      html.matchAll(/data:text\/css;charset=utf-8;base64,([a-z0-9+/=]+)/giu),
      match => Buffer.from(match[1], 'base64').toString('utf8'),
    );
    assert.ok(
      embeddedCssPayloads.some(cssText => /data:image\/svg\+xml;base64,/u.test(cssText)),
      'Portable nested CSS did not embed its same-origin SVG dependency.',
    );
    assert.match(html, /--md-public-paper:#22221d/u);
    assert.equal(html.includes(appUrl), false, 'Portable HTML retained a dependency on the OSS preview server.');
  });
  const portableContext = await createNetworkTrackedContext();
  const blockedPreviewRequests = [];
  await portableContext.route(`${appUrl}/**`, async (route) => {
    blockedPreviewRequests.push(route.request().url());
    await route.abort();
  });
  try {
    const portablePage = await portableContext.newPage();
    await portablePage.goto(pathToFileURL(portablePath).href, { waitUntil: 'load' });
    const portableDocumentFrame = await waitForFrameWithSelector(portablePage, '.md-public-final-surface');
    const childFrame = await waitForFrameWithSelector(portablePage, 'body[data-child-ready="true"]');
    await childFrame.locator('body[data-child-ready="true"]').waitFor({ state: 'attached' });
    assert.notEqual(await portablePage.locator('body').getAttribute('data-oss-polluted'), 'true', 'Portable child script polluted the top-level document.');
    assert.equal(
      await portablePage.locator('iframe.morndraft-public-document-frame').getAttribute('sandbox'),
      'allow-scripts',
      'Portable rendered document must remain in an opaque iframe without same-origin access.',
    );
    const portableSurface = portableDocumentFrame.locator('.md-public-final-surface');
    await portableSurface.waitFor({ state: 'visible' });
    const portableTheme = await portableSurface.evaluate((element) => {
      const style = window.getComputedStyle(element);
      return { backgroundColor: style.backgroundColor, borderColor: style.borderColor, color: style.color };
    });
    assert.equal(portableTheme.backgroundColor, 'rgb(34, 34, 29)', 'Portable dark paper lost the Final theme variable.');
    assert.equal(portableTheme.color, 'rgb(244, 244, 237)', 'Portable dark text lost the Final theme variable.');
    const nestedCssState = await portableSurface.evaluate((element) => ({
      marker: window.getComputedStyle(element, '::after').backgroundImage,
      state: window.getComputedStyle(element).getPropertyValue('--oss-e2e-nested-import').trim(),
    }));
    assert.equal(nestedCssState.state, 'ready', 'Portable nested @import did not execute from its data stylesheet.');
    assert.match(nestedCssState.marker, /^url\("data:image\/svg\+xml;base64,/u);
    const loadedBundledFonts = await portableDocumentFrame.evaluate(async () => (
      await document.fonts.load('16px "MornDraft Sans SC"', '中文')
    ).length);
    assert.ok(loadedBundledFonts > 0, 'Portable HTML could not decode its embedded MornDraft font with preview networking blocked.');
    assert.deepEqual(blockedPreviewRequests, [], 'Portable HTML requested a bundled asset from the stopped/blocked preview origin.');
  } finally {
    await portableContext.close();
  }
  await assertDeliveryFailureWithoutDownload(page, 'oss-delivery-download-png');
  await assertDeliveryFailureWithoutDownload(page, 'oss-delivery-download-pdf');

  await sourceButton.click();
  await page.locator('.md-public-source-editor textarea').first().fill('# Portable mXSS isolation');
  await previewButton.click();
  await page.locator('[data-public-preview-root="true"]').waitFor({ state: 'visible' });
  await page.evaluate(() => {
    window.__ossMxssPolluted = 0;
    document.querySelector('[data-public-preview-root="true"]')?.insertAdjacentHTML(
      'beforeend',
      '<form><math><mtext></form><form><mglyph><style></math><img src=x onerror="top.__ossMxssPolluted=45">',
    );
  });
  assert.equal(await page.evaluate(() => window.__ossMxssPolluted), 0, 'mXSS fixture polluted the live OSS shell.');
  const mxssPortablePath = path.join(outputDir, 'portable-mxss.html');
  const mxssPortable = await assertDownload(page, 'oss-delivery-download-html', '.html', (content) => {
    const html = content.toString('utf8');
    assert.match(html, /<body>\s*<iframe\b/iu);
    assert.match(html, /class="morndraft-public-document-frame"/u);
    assert.match(html, /sandbox="allow-scripts"/u);
    assert.doesNotMatch(html, /sandbox="[^"]*allow-same-origin/iu);
  });
  await mxssPortable.download.saveAs(mxssPortablePath);
  const mxssContext = await createNetworkTrackedContext();
  try {
    const mxssPage = await mxssContext.newPage();
    await mxssPage.goto(pathToFileURL(mxssPortablePath).href, { waitUntil: 'load' });
    await mxssPage.waitForTimeout(250);
    assert.equal(
      await mxssPage.evaluate(() => window.__ossMxssPolluted ?? 0),
      0,
      'Mutation-XSS escaped the portable opaque iframe into the top-level document.',
    );
    assert.equal(await mxssPage.locator('body > img, body > form, body > math').count(), 0);
  } finally {
    await mxssContext.close();
    await rm(mxssPortablePath, { force: true });
  }

  await setWorkspaceTheme(page, 'light');
  await sourceButton.click();
  await page.locator('.md-public-source-editor textarea').first().fill('# Repeated local delivery\n\nStable capture surface.');
  await previewButton.click();
  await page.locator('[data-public-preview-root="true"]').waitFor({ state: 'visible' });
  await page.locator('.md-public-delivery [role="status"]').waitFor({ state: 'hidden' });
  const baselineDomCount = await page.locator('body *').count();
  for (let index = 0; index < 10; index += 1) {
    console.log(`[oss-e2e] repeated PNG delivery ${index + 1}/10`);
    const downloadPromise = page.waitForEvent('download', { timeout: 15_000 });
    await page.getByTestId('oss-delivery-download-png').click();
    const download = await downloadPromise.catch(async (cause) => {
      const alert = page.locator('.md-public-delivery [role="alert"]').filter({ visible: true });
      throw new Error(`Repeated PNG delivery failed: ${await alert.count() ? await alert.innerText() : 'no download and no visible error'}`, { cause });
    });
    await download.path();
  }
  await page.locator('.md-public-delivery [role="status"]').waitFor({ state: 'hidden' });
  // Public download URLs stay alive for 1s so WebKit can consume the synthetic
  // click before revocation; wait past that bounded grace period before the
  // leak assertion.
  await page.waitForTimeout(1_250);
  assert.equal(await page.locator('body *').count(), baselineDomCount, 'Repeated delivery leaked DOM nodes.');
  await assertNoActiveDeliveryResources(page, deliveryResourceBaseline, 'ten repeated deliveries');
};

const main = async () => {
  const candidatePackage = JSON.parse(await readFile(path.join(candidateDir, 'package.json'), 'utf8'));
  assert.equal(candidatePackage.morndraftDistribution, 'oss', 'test:e2e:oss must target an exported OSS candidate.');
  const showcaseModule = await import(pathToFileURL(path.join(candidateDir, 'packages/core/src/public-morndraft-showcase.js')).href);
  const canonicalFlatSource = showcaseModule.getPublicMornDraftInsertEntries('showcase')[0]?.source;
  assert.ok(canonicalFlatSource, 'Exported OSS candidate has no canonical MornDraft flat fixture.');

  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  await run(npmExecutable, ['run', 'build:oss']);
  const ossDistDir = path.join(candidateDir, 'dist', 'oss');
  await writeFile(
    path.join(ossDistDir, 'oss-e2e-root.css'),
    '@import "./oss-e2e-nested.css";\n',
  );
  await writeFile(
    path.join(ossDistDir, 'oss-e2e-nested.css'),
    [
      '.md-public-final-surface{--oss-e2e-nested-import:ready}',
      '.md-public-final-surface::after{content:"";background-image:url("./oss-e2e-marker.svg")}',
    ].join('\n'),
  );
  await writeFile(
    path.join(ossDistDir, 'oss-e2e-marker.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="#0a7"/></svg>',
  );

  const aiMock = createAiMock();
  const deliveryFixture = createDeliveryFixtureServer();
  let browser;
  let preview;
  let activeTraceContext;
  const startTracing = async (context) => {
    // Playwright DOM snapshots inject a recorder into every frame. Chromium
    // reports that recorder as a blocked script in MornDraft's intentionally
    // scriptless sandbox frames, which would make the console gate test the
    // tracing implementation instead of the exported app. Screenshots,
    // sources, actions, console and network events remain in the failure trace.
    await context.tracing.start({ screenshots: true, snapshots: false, sources: true });
    activeTraceContext = context;
  };
  const closeTracedContext = async (context) => {
    try {
      await context.tracing.stop();
    } finally {
      if (activeTraceContext === context) activeTraceContext = undefined;
      await context.close();
    }
  };
  try {
    const aiPort = await listen(aiMock.server);
    const deliveryFixturePort = await listen(deliveryFixture.server);
    const appProbe = createServer();
    let appPort;
    try {
      appPort = await listen(appProbe);
    } finally {
      await closeServer(appProbe);
    }
    preview = spawn(npmExecutable, ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(appPort)], {
      cwd: candidateDir,
      detached: process.platform !== 'win32',
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    preview.stdout?.on('data', (chunk) => process.stdout.write(chunk));
    preview.stderr?.on('data', (chunk) => process.stderr.write(chunk));
    const previewFailure = new Promise((_, reject) => {
      preview.once('error', reject);
      preview.once('exit', (code, signal) => {
        if (code !== 0) reject(new Error(`OSS preview exited before acceptance with ${code ?? signal}.`));
      });
    });
    const appUrl = `http://127.0.0.1:${appPort}`;
    await Promise.race([waitForUrl(appUrl), previewFailure]);
    browser = await chromium.launch({ headless: true });
    const networkUrls = [];
    const createNetworkTrackedContext = async (options = {}) => {
      const trackedContext = await browser.newContext(options);
      trackedContext.on('request', (request) => networkUrls.push(request.url()));
      return trackedContext;
    };
    const context = await createNetworkTrackedContext({ acceptDownloads: true });
    await startTracing(context);
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: appUrl });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await page.goto(appUrl, { waitUntil: 'networkidle' });
    await page.locator('[data-public-workspace="true"]').waitFor({ state: 'visible' });
    await installDeliveryResourceAudit(page);
    const deliveryResourceBaseline = Object.freeze(await readDeliveryResourceAudit(page));
    assertZeroDeliveryResourceBaseline(deliveryResourceBaseline, 'Initial OSS delivery audit');

    await runAboutDialogFlow(page);
    await runPublicShowcaseSurfaceFlow(page);
    await runImportFlow(page, canonicalFlatSource);
    await runAiFlow(page, `http://127.0.0.1:${aiPort}`);
    const sameContextPage = await context.newPage();
    const sameContextErrors = [];
    sameContextPage.on('console', (message) => {
      if (message.type() === 'error') sameContextErrors.push(message.text());
    });
    await sameContextPage.goto(appUrl, { waitUntil: 'networkidle' });
    const sameContextStorage = await sameContextPage.evaluate(() => ({
      local: localStorage.getItem('morndraft.oss.aiConfig.v1'),
      session: sessionStorage.getItem('morndraft.oss.aiConfig.session.v1'),
    }));
    assert.equal(sameContextStorage.session, null, 'A new tab inherited the first tab\'s session-only API Key.');
    assert.match(sameContextStorage.local ?? '', /oss-generate-model/u, 'Non-secret AI settings were not shared through localStorage.');
    assert.doesNotMatch(sameContextStorage.local ?? '', /oss-e2e-key/u, 'A new tab recovered the session-only API Key from localStorage.');
    assert.deepEqual(sameContextErrors, [], `Same-context storage tab console errors: ${sameContextErrors.join('\n')}`);
    await sameContextPage.close();
    await runFinalEditingFlow(page);
    await assertNoActiveDeliveryResources(page, deliveryResourceBaseline, 'Final editing delivery');
    await runMermaidImmediateDeliveryFlow(page);
    await assertNoActiveDeliveryResources(page, deliveryResourceBaseline, 'immediate Mermaid deliveries');
    await runDeliveryFlow(page, createNetworkTrackedContext, appUrl, deliveryResourceBaseline);
    await runDeliveryHardeningFlow(
      page,
      `http://127.0.0.1:${deliveryFixturePort}`,
      deliveryFixture.requests,
      deliveryFixture.slowCssDelayMs,
      consoleErrors,
      deliveryResourceBaseline,
    );
    await clickByTestId(page, 'oss-delivery-copy-image');
    await page.locator('.md-public-delivery [role="status"]').filter({ visible: true }).waitFor({ state: 'visible' });
    await page.waitForFunction(() => {
      const button = document.querySelector('[data-testid="oss-delivery-copy-image"]');
      return button instanceof HTMLButtonElement && !button.disabled;
    });
    const copyAlert = page.locator('.md-public-delivery [role="alert"]');
    assert.equal(await copyAlert.count() > 0 && await copyAlert.first().isVisible(), false, 'Clipboard-enabled context did not complete a real image copy.');
    const clipboardSnapshot = await page.evaluate(async () => {
      if (!navigator.clipboard || typeof navigator.clipboard.read !== 'function') {
        return { supported: false, types: [] };
      }
      const items = await navigator.clipboard.read();
      return {
        supported: true,
        types: [...new Set(items.flatMap(item => item.types))],
      };
    });
    if (clipboardSnapshot.supported) {
      assert.ok(
        clipboardSnapshot.types.includes('image/png'),
        `Clipboard copy did not expose image/png: ${clipboardSnapshot.types.join(', ')}`,
      );
    }
    await assertNoActiveDeliveryResources(page, deliveryResourceBaseline, 'clipboard image delivery');

    const requestedModels = aiMock.requests.map((entry) => entry.body.model);
    assert.deepEqual(requestedModels, [
      'oss-generate-model',
      'oss-modify-model',
      'oss-summarize-model',
      'oss-generate-model',
      'oss-generate-model',
    ]);
    for (const request of aiMock.requests) {
      assert.equal(request.authorization, 'Bearer oss-e2e-key');
      assert.equal(request.body.stream, false);
    }
    const summarizeBody = JSON.stringify(aiMock.requests[2].body);
    assert.doesNotMatch(summarizeBody, /Modified selection from OSS AI/u, 'Summarize must not send the complete Source.');
    assert.deepEqual(consoleErrors, [], `Browser console errors: ${consoleErrors.join('\n')}`);
    await closeTracedContext(context);

    const isolatedStorageContext = await createNetworkTrackedContext();
    await startTracing(isolatedStorageContext);
    const isolatedStoragePage = await isolatedStorageContext.newPage();
    const isolatedStorageErrors = [];
    isolatedStoragePage.on('console', (message) => {
      if (message.type() === 'error') isolatedStorageErrors.push(message.text());
    });
    await isolatedStoragePage.goto(appUrl, { waitUntil: 'networkidle' });
    const isolatedStorage = await isolatedStoragePage.evaluate(() => ({
      local: localStorage.getItem('morndraft.oss.aiConfig.v1'),
      session: sessionStorage.getItem('morndraft.oss.aiConfig.session.v1'),
    }));
    assert.deepEqual(
      isolatedStorage,
      { local: null, session: null },
      'A new BrowserContext inherited AI settings or the session-only API Key.',
    );
    assert.deepEqual(isolatedStorageErrors, [], `Isolated BrowserContext console errors: ${isolatedStorageErrors.join('\n')}`);
    await closeTracedContext(isolatedStorageContext);

    const noClipboard = await createNetworkTrackedContext();
    await startTracing(noClipboard);
    await noClipboard.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'clipboard', { configurable: true, get: () => undefined });
    });
    const noClipboardPage = await noClipboard.newPage();
    await noClipboardPage.goto(appUrl, { waitUntil: 'networkidle' });
    await setWorkspaceLocale(noClipboardPage, 'en');
    await clickByTestId(noClipboardPage, 'oss-delivery-copy-image');
    const clipboardFallback = noClipboardPage.locator('.md-public-delivery [role="alert"]');
    await clipboardFallback.waitFor({ state: 'visible' });
    const clipboardFallbackText = await clipboardFallback.innerText();
    assert.match(clipboardFallbackText, /Download PNG/u);
    assert.doesNotMatch(clipboardFallbackText, /下载 PNG/u);
    await closeTracedContext(noClipboard);

    const rejectedClipboard = await createNetworkTrackedContext();
    await startTracing(rejectedClipboard);
    await rejectedClipboard.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'clipboard', {
        configurable: true,
        get: () => ({
          write: () => Promise.reject(new window.DOMException('Denied by OSS E2E', 'NotAllowedError')),
        }),
      });
    });
    const rejectedClipboardPage = await rejectedClipboard.newPage();
    await rejectedClipboardPage.goto(appUrl, { waitUntil: 'networkidle' });
    await installDeliveryResourceAudit(rejectedClipboardPage);
    const rejectedClipboardBaseline = Object.freeze(await readDeliveryResourceAudit(rejectedClipboardPage));
    assertZeroDeliveryResourceBaseline(rejectedClipboardBaseline, 'Rejected clipboard delivery audit');
    await clickByTestId(rejectedClipboardPage, 'oss-delivery-copy-image');
    const rejectedClipboardFallback = rejectedClipboardPage.locator('.md-public-delivery [role="alert"]');
    await rejectedClipboardFallback.waitFor({ state: 'visible' });
    assert.match(await rejectedClipboardFallback.innerText(), /下载 PNG/u);
    await rejectedClipboardPage.waitForFunction(() => {
      const button = document.querySelector('[data-testid="oss-delivery-copy-image"]');
      return button instanceof HTMLButtonElement && !button.disabled;
    });
    await assertNoActiveDeliveryResources(
      rejectedClipboardPage,
      rejectedClipboardBaseline,
      'clipboard write rejection',
    );
    await closeTracedContext(rejectedClipboard);

    const mobile = await createNetworkTrackedContext({ viewport: { width: 390, height: 844 } });
    await startTracing(mobile);
    const mobilePage = await mobile.newPage();
    const mobileErrors = [];
    mobilePage.on('console', (message) => {
      if (message.type() === 'error') mobileErrors.push(message.text());
    });
    await mobilePage.goto(appUrl, { waitUntil: 'networkidle' });
    await mobilePage.locator('[data-public-workspace="true"]').waitFor({ state: 'visible' });
    assert.deepEqual(mobileErrors, [], `Mobile browser console errors: ${mobileErrors.join('\n')}`);
    await closeTracedContext(mobile);

    // Prove portability against a genuinely stopped app server, not only by
    // inspecting generated markup while Vite is still available.
    await stopChild(preview);
    preview = undefined;
    const offlinePortableContext = await createNetworkTrackedContext();
    const offlinePortableRequests = [];
    offlinePortableContext.on('request', request => offlinePortableRequests.push(request.url()));
    try {
      const offlinePortablePage = await offlinePortableContext.newPage();
      const portablePath = path.join(outputDir, 'portable-mixed.html');
      await offlinePortablePage.goto(pathToFileURL(portablePath).href, { waitUntil: 'load' });
      const offlineDocumentFrame = await waitForFrameWithSelector(offlinePortablePage, '.md-public-final-surface');
      const offlineSurface = offlineDocumentFrame.locator('.md-public-final-surface');
      await offlineSurface.waitFor({ state: 'visible' });
      const offlineFonts = await offlineDocumentFrame.evaluate(async () => (
        await document.fonts.load('16px "MornDraft Sans SC"', '中文')
      ).length);
      assert.ok(offlineFonts > 0, 'Standalone HTML lost its bundled font after the preview server stopped.');
      const offlineNestedCss = await offlineSurface.evaluate((element) => ({
        marker: window.getComputedStyle(element, '::after').backgroundImage,
        state: window.getComputedStyle(element).getPropertyValue('--oss-e2e-nested-import').trim(),
      }));
      assert.equal(offlineNestedCss.state, 'ready', 'Standalone nested @import stopped applying after server shutdown.');
      assert.match(offlineNestedCss.marker, /^url\("data:image\/svg\+xml;base64,/u);
      assert.equal(
        offlinePortableRequests.some(url => /^https?:/u.test(url)),
        false,
        `Standalone HTML requested a server after shutdown: ${offlinePortableRequests.join(', ')}`,
      );
      await rm(portablePath, { force: true });
    } finally {
      await offlinePortableContext.close();
    }
    const unexpectedMornDraftApiRequests = findUnexpectedMornDraftApiRequests(networkUrls, appUrl);
    assert.deepEqual(
      unexpectedMornDraftApiRequests,
      [],
      `OSS candidate made an unexpected MornDraft API request: ${unexpectedMornDraftApiRequests.join(', ')}`,
    );
  } catch (error) {
    await activeTraceContext?.tracing.stop({ path: path.join(outputDir, 'trace.zip') }).catch(() => undefined);
    if (browser) {
      const pages = browser.contexts().flatMap((context) => context.pages());
      if (pages[0]) await pages[0].screenshot({ path: path.join(outputDir, 'failure.png'), fullPage: true }).catch(() => undefined);
    }
    throw error;
  } finally {
    await browser?.close();
    await stopChild(preview);
    await closeServer(aiMock.server);
    await closeServer(deliveryFixture.server);
    await rm(path.join(candidateDir, 'dist'), { recursive: true, force: true });
  }

  console.log('[oss-e2e] Exported OSS candidate passed AI routing, local delivery, storage, network-boundary, and mobile smoke checks.');
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
