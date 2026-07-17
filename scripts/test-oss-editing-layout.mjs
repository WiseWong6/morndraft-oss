/* global Blob, console, DataTransfer, document, DOMParser, Event, fetch, File, HTMLCanvasElement, HTMLElement, HTMLIFrameElement, HTMLInputElement, KeyboardEvent, MouseEvent, Node, performance, process, setTimeout, TextEncoder, window */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, '..');
const outputDir = path.join(projectDir, 'output', 'playwright', 'oss-editing-layout');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const allocatePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.unref();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    server.close(error => error ? reject(error) : resolve(port));
  });
});

const waitForPreview = async (url, child) => {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`OSS preview exited early with code ${child.exitCode}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The preview port is not accepting connections yet.
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for the OSS preview.');
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
  const killTree = signal => {
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

const enterFinalEditing = async (page) => {
  const final = page.locator('[data-public-final="true"]');
  await final.waitFor({ state: 'visible' });
  if (await final.getAttribute('data-document-kind') === 'markdown') return;
  const toggle = page.locator('.md-public-final-edit-toggle');
  await toggle.waitFor({ state: 'visible' });
  if (await toggle.getAttribute('aria-pressed') !== 'true') await toggle.click();
};

const leaveFinalEditing = async (page) => {
  const final = page.locator('[data-public-final="true"]');
  await final.waitFor({ state: 'visible' });
  if (await final.getAttribute('data-document-kind') === 'markdown') return;
  const toggle = page.locator('.md-public-final-edit-toggle');
  await toggle.waitFor({ state: 'visible' });
  if (await toggle.getAttribute('aria-pressed') === 'true') await toggle.click();
};

await rm(outputDir, { force: true, recursive: true });
const port = await allocatePort();
const appUrl = `http://127.0.0.1:${port}`;
const preview = spawn(npmCommand, [
  'run', 'preview', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort',
], {
  cwd: projectDir,
  detached: process.platform !== 'win32',
  env: { ...process.env, MORNDRAFT_BUILD_PRESET: 'oss-full' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let previewLog = '';
for (const stream of [preview.stdout, preview.stderr]) {
  stream?.on('data', chunk => {
    previewLog = `${previewLog}${String(chunk)}`.slice(-12_000);
  });
}

let browser;
let context;
let page;
let tracing = false;
const providerRequests = [];
try {
  await waitForPreview(appUrl, preview);
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  tracing = true;
  page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error)));
  await page.addInitScript(() => {
    if (window.top !== window) return;
    window.sessionStorage.setItem('morndraft.oss.aiConfig.session.v1', JSON.stringify({
      apiKey: 'browser-test-key',
      baseUrl: 'https://provider.example.test/v1',
      models: {
        generate: 'browser-generate-model',
        modify: 'browser-modify-model',
        summarize: 'browser-summarize-model',
      },
      persistApiKey: false,
    }));
  });
  await page.route('https://provider.example.test/**', async (route) => {
    const request = route.request();
    const corsHeaders = {
      'access-control-allow-headers': 'accept, authorization, content-type',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-origin': appUrl,
    };
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    assert.equal(request.method(), 'POST');
    providerRequests.push(JSON.parse(request.postData() ?? '{}'));
    await route.fulfill({
      status: 200,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({
        choices: [{ finish_reason: 'stop', message: { content: 'AI_BROWSER_RESULT' } }],
      }),
    });
  });
  await page.goto(appUrl, { waitUntil: 'networkidle' });
  const htmlTreeBuilderSemantics = await page.evaluate(() => {
    const parse = source => new DOMParser().parseFromString(source, 'text/html');
    const htmlImage = parse('<image src="hero.png">').querySelector('img');
    const mathGlyph = parse('<math><mglyph src="hero.png"></mglyph></math>').querySelector('mglyph');
    const svgDescriptionImage = parse('<svg><desc><img src="hero.png"></desc></svg>').querySelector('img');
    const breakoutVideo = parse('<svg><p><video poster="hero.png"></video></p></svg>').querySelector('video');
    const foreignEndBreakout = parse('<div><svg></p><image src=hero.png></svg></div>').querySelector('img');
    const foreignTableImage = parse('<tbody><svg></tbody><image href=hero.png></svg></tbody>').querySelector('image');
    const malformedAttribute = parse('<img foo<bar="1" src="hero.png">').querySelector('img');
    const cdata = parse('<svg><![CDATA[ > <image href="hero.png"> ]]></svg>');
    const discardedSelect = parse('<select><img src="hero.png"></select>');
    const unclosedSelect = parse('<select><img src="hero.png">');
    const unclosedTemplateSelect = parse('<template><select><img src="hero.png">').querySelector('template');
    const discardedFrameset = parse('<frameset><img src="hero.png"></frameset>');
    const template = parse('<template><img src="hero.png"></template>').querySelector('template');
    return {
      breakoutVideoNamespace: breakoutVideo?.namespaceURI,
      cdataImageCount: cdata.querySelectorAll('image, img').length,
      discardedFramesetImageCount: discardedFrameset.querySelectorAll('image, img').length,
      discardedSelectImageCount: discardedSelect.querySelectorAll('image, img').length,
      unclosedSelectImageCount: unclosedSelect.querySelectorAll('image, img').length,
      unclosedTemplateSelectImageCount: unclosedTemplateSelect?.content.querySelectorAll('image, img').length,
      foreignEndBreakoutNamespace: foreignEndBreakout?.namespaceURI,
      foreignTableImageNamespace: foreignTableImage?.namespaceURI,
      htmlImageLocalName: htmlImage?.localName,
      htmlImageNamespace: htmlImage?.namespaceURI,
      malformedAttributeSrc: malformedAttribute?.getAttribute('src'),
      mathGlyphNamespace: mathGlyph?.namespaceURI,
      svgDescriptionImageNamespace: svgDescriptionImage?.namespaceURI,
      templateImageCount: template?.content.querySelectorAll('img').length,
    };
  });
  assert.equal(htmlTreeBuilderSemantics.htmlImageLocalName, 'img');
  assert.equal(htmlTreeBuilderSemantics.htmlImageNamespace, 'http://www.w3.org/1999/xhtml');
  assert.equal(htmlTreeBuilderSemantics.mathGlyphNamespace, 'http://www.w3.org/1998/Math/MathML');
  assert.equal(htmlTreeBuilderSemantics.svgDescriptionImageNamespace, 'http://www.w3.org/1999/xhtml');
  assert.equal(htmlTreeBuilderSemantics.breakoutVideoNamespace, 'http://www.w3.org/1999/xhtml');
  assert.equal(htmlTreeBuilderSemantics.foreignEndBreakoutNamespace, 'http://www.w3.org/1999/xhtml');
  assert.equal(htmlTreeBuilderSemantics.foreignTableImageNamespace, 'http://www.w3.org/2000/svg');
  assert.equal(htmlTreeBuilderSemantics.malformedAttributeSrc, 'hero.png');
  assert.equal(htmlTreeBuilderSemantics.cdataImageCount, 0);
  assert.equal(htmlTreeBuilderSemantics.discardedSelectImageCount, 1);
  assert.equal(htmlTreeBuilderSemantics.unclosedSelectImageCount, 1);
  assert.equal(htmlTreeBuilderSemantics.unclosedTemplateSelectImageCount, 1);
  assert.equal(htmlTreeBuilderSemantics.discardedFramesetImageCount, 0);
  assert.equal(htmlTreeBuilderSemantics.templateImageCount, 1);
  await page.getByRole('button', { name: /^(Source|源码)$/u }).click();

  const sourceEditor = page.locator('.md-public-source-editor textarea').first();
  await sourceEditor.waitFor({ state: 'visible' });
  const layout = await page.evaluate(() => {
    const rect = selector => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) throw new Error(`Missing ${selector}`);
      const value = element.getBoundingClientRect();
      return { bottom: value.bottom, height: value.height, top: value.top };
    };
    return {
      app: rect('.oss-app'),
      editor: rect('.md-public-source-editor'),
      main: rect('.md-public-main'),
      textarea: rect('.md-public-source-editor textarea'),
      viewportHeight: window.innerHeight,
      workspace: rect('[data-public-workspace="true"]'),
    };
  });
  assert.equal(layout.viewportHeight, 720);
  assert.ok(layout.app.height >= 719, `OSS app collapsed to ${layout.app.height}px.`);
  assert.ok(layout.workspace.height >= 719, `Public workspace collapsed to ${layout.workspace.height}px.`);
  assert.ok(layout.main.height >= 650, `Public main area collapsed to ${layout.main.height}px.`);
  assert.ok(layout.editor.height >= 650, `Source editor collapsed to ${layout.editor.height}px.`);
  assert.ok(layout.textarea.height >= 650, `Source textarea collapsed to ${layout.textarea.height}px.`);

  await sourceEditor.fill('# Source heading\n- Source middle\nlast line');
  const sourceMiddleLinePoint = await sourceEditor.evaluate((element) => {
    const style = element.ownerDocument.defaultView?.getComputedStyle(element);
    if (!style) throw new Error('Source editor has no computed style.');
    const fontSize = Number.parseFloat(style.fontSize);
    const lineHeight = Number.parseFloat(style.lineHeight);
    return {
      x: Number.parseFloat(style.paddingLeft) + 72,
      y: Number.parseFloat(style.paddingTop) + (Number.isFinite(lineHeight) ? lineHeight : fontSize * 1.5) * 1.5,
    };
  });
  await sourceEditor.dblclick({ position: sourceMiddleLinePoint });
  assert.deepEqual(
    await sourceEditor.evaluate(element => ({
      end: element.selectionEnd,
      selected: element.value.slice(element.selectionStart, element.selectionEnd),
      start: element.selectionStart,
    })),
    { end: 32, selected: '- Source middle', start: 17 },
    'A plain mouse double click must select the complete Source physical line without its LF.',
  );

  const publicLineSelectionSource = [
    '# Final heading',
    '',
    'A long logical line with **bold** text',
    '',
    '> Quoted line',
    '',
    '- Parent line',
    '  - Child line',
  ].join('\n');
  await sourceEditor.fill(publicLineSelectionSource);
  await page.getByRole('button', { name: /^(Final|最终效果)$/u }).click();
  const readBrowserSelection = () => page.evaluate(() => window.getSelection()?.toString() ?? '');
  const finalHeading = page.getByRole('heading', { name: 'Final heading' });
  await finalHeading.dblclick();
  assert.equal(
    await readBrowserSelection(),
    'Final heading',
    'Final heading double click must select the complete logical line.',
  );
  const finalParagraph = page.locator('.md-public-markdown-preview > p').filter({
    hasText: 'A long logical line with bold text',
  });
  await finalParagraph.dblclick({ position: { x: 80, y: 12 } });
  assert.equal(
    await readBrowserSelection(),
    'A long logical line with bold text',
    'Final paragraph double click must span inline formatting without stopping at a visual word.',
  );
  const finalQuote = page.locator('.md-public-markdown-preview blockquote > p');
  await finalQuote.dblclick();
  assert.equal(
    await readBrowserSelection(),
    'Quoted line',
    'Final quote double click must select its complete logical line.',
  );
  const finalParentListItem = page.locator('.md-public-markdown-preview > ul > li').first();
  const parentLinePoint = await finalParentListItem.evaluate((element) => {
    const text = Array.from(element.childNodes).find(node => (
      node.nodeType === Node.TEXT_NODE && (node.nodeValue ?? '').includes('Parent line')
    ));
    if (!text) throw new Error('Parent list item has no direct logical-line text node.');
    const range = element.ownerDocument.createRange();
    range.selectNodeContents(text);
    const textRect = range.getBoundingClientRect();
    const itemRect = element.getBoundingClientRect();
    return {
      x: textRect.left - itemRect.left + Math.min(24, textRect.width / 2),
      y: textRect.top - itemRect.top + textRect.height / 2,
    };
  });
  await finalParentListItem.dblclick({ position: parentLinePoint });
  assert.equal(
    await readBrowserSelection(),
    'Parent line',
    'A parent list item double click must not absorb text from its nested child item.',
  );
  await page.getByRole('button', { name: /^(Source|源码)$/u }).click();
  assert.equal(
    await sourceEditor.inputValue(),
    publicLineSelectionSource,
    'Double-click line selection must not create a Source edit or history entry.',
  );

  await sourceEditor.fill('Toolbar formatting target');
  await page.getByRole('button', { name: /^(Final|最终效果)$/u }).click();
  const formattingTarget = page.locator(
    '[data-public-preview-root="true"] p[data-public-final-block="true"]',
  ).filter({ hasText: 'Toolbar formatting target' });
  await formattingTarget.waitFor({ state: 'visible' });
  await formattingTarget.dblclick();
  assert.equal(
    await readBrowserSelection(),
    'Toolbar formatting target',
    'The shared format toolbar fixture must start from the public Final double-click range.',
  );
  const boldButton = page.getByRole('button', { name: /^(Bold selection|加粗选区)$/u });
  await boldButton.waitFor({ state: 'visible' });
  assert.equal(await boldButton.isEnabled(), true, 'A valid Final text selection did not enable the shared format toolbar.');
  await boldButton.click();
  await page.getByRole('button', { name: /^(Source|源码)$/u }).click();
  assert.equal(
    await sourceEditor.inputValue(),
    '**Toolbar formatting target**',
    'The shared commercial format toolbar did not write the public Final selection back to Source.',
  );

  await sourceEditor.fill('/');
  const insertMenu = page.getByRole('menu', { name: /^(Insert content|插入内容)$/u });
  await insertMenu.waitFor({ state: 'visible' });
  const items = insertMenu.getByRole('menuitem');
  assert.equal(await items.count(), 32, 'The AI-enabled OSS slash menu must expose AI, 30 flat entries, and Markdown table.');
  assert.match((await items.nth(0).textContent()) ?? '', /AI/u, 'AI generate must remain the first slash action.');
  assert.equal((await items.nth(1).textContent())?.trim(), 'Markdown table');
  await items.last().scrollIntoViewIfNeeded();
  const menuLayout = await page.evaluate(() => {
    const menu = document.querySelector('.md-public-insert-menu');
    const main = document.querySelector('.md-public-main');
    const lastItem = menu?.querySelector('[role="menuitem"]:last-of-type');
    if (!(menu instanceof HTMLElement) || !(main instanceof HTMLElement) || !(lastItem instanceof HTMLElement)) {
      throw new Error('Slash menu layout fixture is incomplete.');
    }
    const menuRect = menu.getBoundingClientRect();
    const mainRect = main.getBoundingClientRect();
    const itemRect = lastItem.getBoundingClientRect();
    return {
      itemBottom: itemRect.bottom,
      itemTop: itemRect.top,
      mainBottom: mainRect.bottom,
      mainTop: mainRect.top,
      menuBottom: menuRect.bottom,
      menuClientHeight: menu.clientHeight,
      menuScrollHeight: menu.scrollHeight,
      menuTop: menuRect.top,
    };
  });
  assert.ok(menuLayout.menuTop >= menuLayout.mainTop - 1, 'Slash menu is clipped above the workspace main area.');
  assert.ok(menuLayout.menuBottom <= menuLayout.mainBottom + 1, 'Slash menu is clipped below the workspace main area.');
  assert.ok(menuLayout.itemTop >= menuLayout.menuTop - 1, 'Scrolled slash item is above the visible menu.');
  assert.ok(menuLayout.itemBottom <= menuLayout.menuBottom + 1, 'Scrolled slash item is below the visible menu.');
  assert.ok(menuLayout.menuScrollHeight > menuLayout.menuClientHeight, 'Slash menu fixture did not exercise scrolling.');

  const exercisedFlatLabels = [];
  for (let flatIndex = 1; flatIndex <= 30; flatIndex += 1) {
    if (flatIndex > 1) {
      await sourceEditor.fill('/');
      await insertMenu.waitFor({ state: 'visible' });
    }
    const currentItems = insertMenu.getByRole('menuitem');
    assert.equal(await currentItems.count(), 32, `Slash menu changed before flat item ${flatIndex}.`);
    const item = currentItems.nth(flatIndex + 1);
    const label = (await item.textContent())?.trim() ?? '';
    assert.ok(label, `Flat item ${flatIndex} has no accessible label.`);
    exercisedFlatLabels.push(label);
    await item.click();
    await page.getByRole('button', { name: /^(Final|最终效果)$/u }).click();
    const flatFrame = page.locator('[data-public-flat="true"] iframe.md-public-html-frame').first();
    await flatFrame.waitFor({ state: 'attached' });
    assert.match(
      await flatFrame.getAttribute('srcdoc') ?? '',
      /data-morndraft-source="morndraft-flat"/u,
      `Canonical flat item ${flatIndex} (${label}) must render through the public sandbox.`,
    );
    await page.getByRole('button', { name: /^(Source|源码)$/u }).click();
    assert.match(
      await sourceEditor.inputValue(),
      /data-morndraft-source="morndraft-flat"/u,
      `Canonical flat item ${flatIndex} (${label}) must keep its portable Source.`,
    );
  }
  assert.equal(new Set(exercisedFlatLabels).size, 30, 'The browser gate must exercise 30 distinct canonical flat entries.');

  await sourceEditor.fill("{title:'raw before', items:[1,],}");
  await page.getByRole('button', { name: /^(Final|最终效果)$/u }).click();
  await enterFinalEditing(page);
  const rawJsonEditor = page.getByRole('textbox', { name: /^(Final content editor|最终内容编辑器)$/u });
  await rawJsonEditor.fill("{title:'raw after', items:[2,],}");
  await page.getByRole('button', { name: /^(Source|源码)$/u }).click();
  assert.equal(
    await sourceEditor.inputValue(),
    "{title:'raw after', items:[2,],}",
    'Raw JSON5 Final editing must write the exact source without JSON normalization.',
  );

  await sourceEditor.fill("```json5\n{title:'fenced before', items:[1,],}\n```");
  await page.getByRole('button', { name: /^(Final|最终效果)$/u }).click();
  await enterFinalEditing(page);
  const fencedJsonEditor = page.getByRole('textbox', { name: /^(Final content editor|最终内容编辑器)$/u });
  await fencedJsonEditor.fill("{title:'fenced after', items:[2,],}");
  await page.getByRole('button', { name: /^(Source|源码)$/u }).click();
  assert.equal(
    await sourceEditor.inputValue(),
    "```json5\n{title:'fenced after', items:[2,],}\n```",
    'Fenced JSON5 Final editing must preserve the exact fence while replacing only its body.',
  );

  const rawHtmlAfter = '<!doctype html><html><body><main>Raw after</main></body></html>';
  await sourceEditor.fill('<!doctype html><html><body><main>Raw before</main></body></html>');
  await page.getByRole('button', { name: /^(Final|最终效果)$/u }).click();
  await enterFinalEditing(page);
  const rawHtmlEditor = page.getByRole('textbox', { name: /^(Final content editor|最终内容编辑器)$/u });
  await rawHtmlEditor.fill(rawHtmlAfter);
  await page.getByRole('button', { name: /^(Source|源码)$/u }).click();
  assert.equal(
    await sourceEditor.inputValue(),
    rawHtmlAfter,
    'Raw HTML Final editing must atomically replace only the raw document Source.',
  );

  await sourceEditor.fill('~~~HTML preview linenums\n<main>Fenced before</main>\n~~~');
  await page.getByRole('button', { name: /^(Final|最终效果)$/u }).click();
  await enterFinalEditing(page);
  const standaloneHtmlEditor = page.getByRole('textbox', { name: /^(Final content editor|最终内容编辑器)$/u });
  await standaloneHtmlEditor.fill('<main>Fenced after</main>\n~~~\n<footer>Still HTML</footer>');
  await page.getByRole('button', { name: /^(Source|源码)$/u }).click();
  assert.equal(
    await sourceEditor.inputValue(),
    '~~~~HTML preview linenums\n<main>Fenced after</main>\n~~~\n<footer>Still HTML</footer>\n~~~~',
    'Standalone fenced HTML Final editing must preserve its info string and expand only its own marker.',
  );

  const repeatedHtml = '<section data-copy="same">Repeated</section>';
  const updatedHtml = '<section data-copy="second">Updated second</section>';
  const buildLongMixedHtmlSource = (secondHtml) => [
    '# Long mixed document',
    ...Array.from({ length: 160 }, (_, index) => `Before paragraph ${index}`),
    '```html',
    repeatedHtml,
    '```',
    ...Array.from({ length: 160 }, (_, index) => `Middle paragraph ${index}`),
    '```html',
    secondHtml,
    '```',
    ...Array.from({ length: 160 }, (_, index) => `After paragraph ${index}`),
    '```html',
    '<section data-copy="third">Third</section>',
    '```',
    ...Array.from({ length: 160 }, (_, index) => `Tail paragraph ${index}`),
  ].join('\n');
  await sourceEditor.fill(buildLongMixedHtmlSource(repeatedHtml));
  await page.getByRole('button', { name: /^(Final|最终效果)$/u }).click();
  await enterFinalEditing(page);
  const mixedHtmlFrames = page.locator('.md-public-html-fence-block > iframe.md-public-html-frame');
  const mixedHtmlEditors = page.getByRole('textbox', { name: /^(Final HTML editor|Final HTML 编辑器)$/u });
  assert.equal(await mixedHtmlFrames.count(), 3, 'Long mixed fixture must render all three HTML fences.');
  assert.equal(await mixedHtmlEditors.count(), 3, 'Final editing must expose one scoped editor per HTML fence.');
  await page.waitForFunction(() => (
    [...document.querySelectorAll('.md-public-html-fence-block > iframe.md-public-html-frame')]
      .every(frame => frame instanceof HTMLIFrameElement && frame.contentWindow !== null)
  ));
  await page.evaluate(() => {
    const frames = [...document.querySelectorAll('.md-public-html-fence-block > iframe.md-public-html-frame')];
    window.__ossHtmlAtomicEditing = {
      frames,
      windows: frames.map(frame => frame.contentWindow),
    };
  });
  await mixedHtmlEditors.nth(1).fill('<section>Uncommitted draft');
  assert.equal(
    await mixedHtmlFrames.nth(1).getAttribute('srcdoc'),
    repeatedHtml,
    'An in-progress HTML draft must not replace the stable preview before commit.',
  );
  assert.equal(
    await page.locator('.md-public-final-surface').isVisible(),
    true,
    'An incomplete HTML draft must not blank the Final surface.',
  );
  await mixedHtmlEditors.nth(1).fill(updatedHtml);
  await mixedHtmlEditors.nth(1).evaluate(element => element.blur());
  await page.waitForFunction((expected) => (
    document.querySelectorAll('.md-public-html-fence-block > iframe.md-public-html-frame')[1]
      ?.getAttribute('srcdoc') === expected
  ), updatedHtml);
  const htmlFrameIdentity = await page.evaluate(() => {
    const snapshot = window.__ossHtmlAtomicEditing;
    const current = [...document.querySelectorAll('.md-public-html-fence-block > iframe.md-public-html-frame')];
    return {
      count: current.length,
      firstSameFrame: current[0] === snapshot.frames[0],
      firstSameWindow: current[0]?.contentWindow === snapshot.windows[0],
      secondSameFrame: current[1] === snapshot.frames[1],
      thirdSameFrame: current[2] === snapshot.frames[2],
      thirdSameWindow: current[2]?.contentWindow === snapshot.windows[2],
    };
  });
  assert.deepEqual(
    htmlFrameIdentity,
    {
      count: 3,
      firstSameFrame: true,
      firstSameWindow: true,
      secondSameFrame: true,
      thirdSameFrame: true,
      thirdSameWindow: true,
    },
    'Editing one HTML fence in a long document must preserve unrelated iframe identity and avoid their reload.',
  );
  await page.getByRole('button', { name: /^(Source|源码)$/u }).click();
  assert.equal(
    await sourceEditor.inputValue(),
    buildLongMixedHtmlSource(updatedHtml),
    'Repeated HTML bodies must patch only the selected fence in the complete long-document Source.',
  );

  const repeatedMixedJson = [
    '# Repeated JSON5',
    '',
    '```json5',
    "{slot:'same',}",
    '```',
    '',
    '```json5',
    "{slot:'same',}",
    '```',
  ].join('\n');
  await sourceEditor.fill(repeatedMixedJson);
  await page.getByRole('button', { name: /^(Final|最终效果)$/u }).click();
  await enterFinalEditing(page);
  const mixedJsonEditors = page.getByRole('textbox', { name: /^(Final JSON5 editor|Final JSON5 编辑器)$/u });
  assert.equal(await mixedJsonEditors.count(), 2, 'Final editing must expose one scoped editor per JSON5 fence.');
  await mixedJsonEditors.nth(1).fill("{slot:'second',}");
  await mixedJsonEditors.nth(1).evaluate(element => element.blur());
  await page.getByRole('button', { name: /^(Source|源码)$/u }).click();
  assert.equal(
    await sourceEditor.inputValue(),
    [
      '# Repeated JSON5',
      '',
      '```json5',
      "{slot:'same',}",
      '```',
      '',
      '```json5',
      "{slot:'second',}",
      '```',
    ].join('\n'),
    'Repeated JSON5 bodies must patch only the selected fence in the complete Source.',
  );

  const cancellableJsonRepairSource = [
    '```json5',
    '{items: [1, 2] // keep',
    '```',
  ].join('\n');
  await sourceEditor.fill(cancellableJsonRepairSource);
  const jsonRepairPanel = page.getByTestId('oss-json-repair-panel');
  await jsonRepairPanel.waitFor({ state: 'visible' });
  await jsonRepairPanel.getByRole('button', { name: /^(Preview repair|预览修复)$/u }).first().click();
  await page.getByTestId('oss-json-repair-candidate').waitFor({ state: 'visible' });
  await page.waitForTimeout(1_000);
  assert.equal(
    await sourceEditor.inputValue(),
    cancellableJsonRepairSource,
    'Opening a JSON5 repair candidate must never mutate Source silently.',
  );
  await page.getByTestId('oss-json-repair-cancel').click();
  await page.getByTestId('oss-json-repair-candidate').waitFor({ state: 'hidden' });
  assert.equal(
    await sourceEditor.inputValue(),
    cancellableJsonRepairSource,
    'Cancelling a JSON5 repair candidate must preserve Source exactly.',
  );

  const redundantJsonFirst = [
    '````json',
    '```json',
    '{"slot":"first"}',
    '```',
    '````',
  ].join('\n');
  const redundantJsonSecond = [
    '````json5',
    '~~~json5',
    '{slot:"second",}',
    '~~~',
    '````',
  ].join('\n');
  const redundantJsonRepairSource = [
    redundantJsonFirst,
    '',
    'Keep this note.',
    '',
    redundantJsonSecond,
  ].join('\n');
  const expectedAdoptedJsonSource = [
    '````json',
    '{"slot":"first"}',
    '````',
    '',
    'Keep this note.',
    '',
    redundantJsonSecond,
  ].join('\n');
  await sourceEditor.fill(redundantJsonRepairSource);
  await jsonRepairPanel.waitFor({ state: 'visible' });
  await jsonRepairPanel.getByRole('button', { name: /^(Preview repair|预览修复)$/u }).first().click();
  await page.getByTestId('oss-json-repair-candidate').waitFor({ state: 'visible' });
  assert.equal(
    await sourceEditor.inputValue(),
    redundantJsonRepairSource,
    'A targeted duplicate-fence candidate must stay review-only until Adopt.',
  );
  await page.getByTestId('oss-json-repair-adopt').click();
  await page.getByTestId('oss-json-repair-applied').waitFor({ state: 'visible' });
  assert.equal(
    await sourceEditor.inputValue(),
    expectedAdoptedJsonSource,
    'Adopt must remove only the selected redundant JSON fence and preserve later fences.',
  );
  await page.getByTestId('oss-json-repair-undo').click();
  assert.equal(
    await sourceEditor.inputValue(),
    redundantJsonRepairSource,
    'Undo must restore the exact pre-repair Source once.',
  );

  const unsafeJsonRepairSource = [
    '```json',
    '{"a":1 "b":2',
    '```',
  ].join('\n');
  await sourceEditor.fill(unsafeJsonRepairSource);
  await jsonRepairPanel.waitFor({ state: 'visible' });
  assert.equal(
    await jsonRepairPanel.getByRole('button', { name: /^(Preview repair|预览修复)$/u }).count(),
    0,
    'Ambiguous JSON errors must not expose a guessed repair action.',
  );
  await jsonRepairPanel.getByText(
    /^(This issue cannot be changed safely and needs a manual Source edit\.|这个问题不能安全地自动修改，请在 Source 中手动修复。)$/u,
  ).waitFor({ state: 'visible' });

  const blankInsertionSource = [
    'Before paragraph',
    '',
    '- protected list',
    '',
    '![pixel](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+AvcX8QAAAABJRU5ErkJggg==)',
    '',
    '| A | B |',
    '| - | - |',
    '| 1 | 2 |',
    '',
    '```js',
    'const safe = true;',
    '```',
    '',
    '```html',
    '<button type="button">Sandbox content</button>',
    '```',
    '',
    'After paragraph',
  ].join('\n');
  await sourceEditor.fill(blankInsertionSource);
  await page.getByRole('button', { name: /^(Final|最终效果)$/u }).click();
  await enterFinalEditing(page);
  const blankLineEditor = page.getByRole('textbox', {
    name: /^(Final blank line editor|Final 空白行编辑器)$/u,
  });
  const blankPreview = page.locator('.md-public-markdown-preview');
  const protectedList = blankPreview.locator(':scope > ul');
  const protectedImage = blankPreview.locator(':scope > p').filter({ has: page.locator('img') });
  const protectedTable = blankPreview.locator(':scope > table');
  const protectedCode = blankPreview.locator(':scope > pre');
  const protectedHtml = blankPreview.locator(':scope > .md-public-html-fence-block');
  const protectedParagraph = blankPreview.locator(':scope > p').filter({ hasText: 'Before paragraph' });
  for (const protectedBlock of [
    protectedParagraph,
    protectedList,
    protectedImage,
    protectedTable,
    protectedCode,
    protectedHtml,
  ]) {
    await protectedBlock.click();
    assert.equal(
      await blankLineEditor.count(),
      0,
      'Clicking rendered content must never create a Final blank-line editor.',
    );
  }
  await protectedImage.scrollIntoViewIfNeeded();
  const listImageGap = await page.evaluate(() => {
    const previewRoot = document.querySelector('.md-public-markdown-preview');
    const list = previewRoot?.querySelector(':scope > ul');
    const image = [...(previewRoot?.querySelectorAll(':scope > p') ?? [])]
      .find(element => element.querySelector('img'));
    if (!(previewRoot instanceof HTMLElement) || !(list instanceof HTMLElement) || !(image instanceof HTMLElement)) {
      throw new Error('Final blank-line insertion fixture is incomplete.');
    }
    const rootRect = previewRoot.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    const imageRect = image.getBoundingClientRect();
    if (imageRect.top <= listRect.bottom) throw new Error('Final blank-line fixture has no list/image gap.');
    return {
      x: rootRect.left + Math.min(96, rootRect.width / 3),
      y: (listRect.bottom + imageRect.top) / 2,
    };
  });
  await page.keyboard.down('Shift');
  await page.mouse.click(listImageGap.x, listImageGap.y);
  await page.keyboard.up('Shift');
  assert.equal(
    await blankLineEditor.count(),
    0,
    'A modified mouse action must remain owned by normal Final selection behavior.',
  );
  await page.mouse.click(listImageGap.x, listImageGap.y);
  await blankLineEditor.waitFor({ state: 'visible' });
  await blankLineEditor.fill('Cancelled blank paragraph');
  await blankLineEditor.press('Escape');
  assert.equal(await blankLineEditor.count(), 0, 'Escape must cancel the transient Final blank-line editor.');
  await page.mouse.click(listImageGap.x, listImageGap.y);
  await blankLineEditor.fill('Inserted from blank area');
  await blankLineEditor.press('Enter');
  await page.getByRole('button', { name: /^(Source|源码)$/u }).click();
  const blankInsertionExpected = blankInsertionSource.replace(
    '\n\n![pixel]',
    '\n\nInserted from blank area\n\n![pixel]',
  );
  assert.equal(
    await sourceEditor.inputValue(),
    blankInsertionExpected,
    'Final gap insertion must add one paragraph at the adjacent exact Source boundary.',
  );

  await page.getByRole('button', { name: /^(Final|最终效果)$/u }).click();
  await enterFinalEditing(page);
  const finalParagraphAfterInsertion = page.locator('.md-public-markdown-preview > p').filter({
    hasText: 'After paragraph',
  });
  await finalParagraphAfterInsertion.evaluate(element => element.scrollIntoView({ block: 'center' }));
  const finalBottomGap = await finalParagraphAfterInsertion.evaluate((element) => {
    const root = element.closest('.md-public-markdown-preview');
    const surface = element.closest('[data-public-preview-root="true"]');
    if (!(root instanceof HTMLElement) || !(surface instanceof HTMLElement)) {
      throw new Error('Final bottom insertion root is missing.');
    }
    const rootRect = root.getBoundingClientRect();
    const paragraphRect = element.getBoundingClientRect();
    const surfaceRect = surface.getBoundingClientRect();
    if (paragraphRect.bottom + 8 >= surfaceRect.bottom) {
      throw new Error('Final bottom insertion fixture has no surface whitespace.');
    }
    return {
      x: rootRect.left + Math.min(96, rootRect.width / 3),
      y: paragraphRect.bottom + 8,
    };
  });
  await page.mouse.click(finalBottomGap.x, finalBottomGap.y);
  await blankLineEditor.fill('Bottom paragraph');
  await blankLineEditor.evaluate(element => element.blur());
  await page.getByRole('button', { name: /^(Source|源码)$/u }).click();
  const blankInsertionWithBottom = `${blankInsertionExpected}\n\nBottom paragraph`;
  assert.equal(
    await sourceEditor.inputValue(),
    blankInsertionWithBottom,
    'Final trailing whitespace insertion must append one Source paragraph.',
  );
  await page.getByRole('button', { name: /^(Final|最终效果)$/u }).click();
  await enterFinalEditing(page);
  const bottomParagraph = page.locator('.md-public-markdown-preview > p').filter({
    hasText: 'Bottom paragraph',
  });
  await bottomParagraph.evaluate(element => element.scrollIntoView({ block: 'center' }));
  const whitespaceBottomGap = await bottomParagraph.evaluate((element) => {
    const root = element.closest('.md-public-markdown-preview');
    const surface = element.closest('[data-public-preview-root="true"]');
    if (!(root instanceof HTMLElement) || !(surface instanceof HTMLElement)) {
      throw new Error('Final whitespace no-op root is missing.');
    }
    const rootRect = root.getBoundingClientRect();
    const paragraphRect = element.getBoundingClientRect();
    const surfaceRect = surface.getBoundingClientRect();
    if (paragraphRect.bottom + 8 >= surfaceRect.bottom) {
      throw new Error('Final whitespace no-op fixture has no surface whitespace.');
    }
    return {
      x: rootRect.left + Math.min(96, rootRect.width / 3),
      y: paragraphRect.bottom + 8,
    };
  });
  await page.mouse.click(whitespaceBottomGap.x, whitespaceBottomGap.y);
  await blankLineEditor.fill('   ');
  await blankLineEditor.evaluate(element => element.blur());
  await page.getByRole('button', { name: /^(Source|源码)$/u }).click();
  assert.equal(
    await sourceEditor.inputValue(),
    blankInsertionWithBottom,
    'Whitespace-only Final blank-line input must not mutate Source.',
  );

  await sourceEditor.fill('First **bold** block\n\nsecond');
  await page.getByRole('button', { name: /^(Final|最终效果)$/u }).click();
  await enterFinalEditing(page);
  const paragraphs = page.locator('.md-public-markdown-preview > p');
  await paragraphs.nth(0).fill('Changed');
  await paragraphs.nth(1).click();
  assert.equal(
    await paragraphs.nth(1).evaluate(element => element.ownerDocument.activeElement === element),
    true,
    'One click must move focus to the next paragraph after the previous block writes back.',
  );
  await paragraphs.nth(1).fill('changed second');
  const composingEnter = await paragraphs.nth(1).evaluate((element) => {
    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      isComposing: true,
      key: 'Enter',
    });
    element.dispatchEvent(event);
    return {
      defaultPrevented: event.defaultPrevented,
      focused: element.ownerDocument.activeElement === element,
    };
  });
  assert.deepEqual(
    composingEnter,
    { defaultPrevented: false, focused: true },
    'IME confirmation Enter must stay inside the active composition session.',
  );
  await paragraphs.nth(1).press('Enter');
  assert.equal(
    await paragraphs.nth(1).evaluate(element => element.ownerDocument.activeElement === element),
    false,
    'Enter must commit the current reversible block instead of creating unrepresentable nested DOM.',
  );
  await leaveFinalEditing(page);
  await page.getByRole('button', { name: /^(Source|源码)$/u }).click();
  assert.equal(
    await sourceEditor.inputValue(),
    'Changed\n\nchanged second',
    'Sequential Final edits must reconcile a changed Markdown AST and write both blocks back to Source.',
  );

  await sourceEditor.fill('Before **bold** after');
  await page.getByRole('button', { name: /^(Final|最终效果)$/u }).click();
  await enterFinalEditing(page);
  await page.locator('.md-public-markdown-preview > p').fill('Before  after');
  await leaveFinalEditing(page);
  await page.getByRole('button', { name: /^(Source|源码)$/u }).click();
  assert.equal(
    await sourceEditor.inputValue(),
    'Before  after',
    'Deleting formatted content must remove empty delimiters instead of writing invalid Markdown.',
  );

  await sourceEditor.fill('Before &copy; &NotEqualTilde; &#0; &#128; &#x0B; &#xFDD0; after');
  await page.getByRole('button', { name: /^(Final|最终效果)$/u }).click();
  await enterFinalEditing(page);
  const entityParagraph = page.locator('.md-public-markdown-preview > p');
  assert.equal(
    await entityParagraph.textContent(),
    'Before © ≂̸ � � � � after',
    'Chromium must expose the same named, multi-code-point, and invalid numeric entity text as micromark.',
  );
  await entityParagraph.fill('Before decoded after');
  await leaveFinalEditing(page);
  await page.getByRole('button', { name: /^(Source|源码)$/u }).click();
  assert.equal(
    await sourceEditor.inputValue(),
    'Before decoded after',
    'Final editing must map complete named and invalid numeric character references back to Source.',
  );

  for (const fixture of [
    {
      label: 'raw ordinary fence',
      source: '```js\nfirst\n```',
      expected: '```js\nfirst\nsecond\nthird\n```',
    },
    {
      label: 'mixed Markdown ordinary fence',
      source: 'Intro\n\n```js\nfirst\n```\n\nAfter',
      expected: 'Intro\n\n```js\nfirst\nsecond\nthird\n```\n\nAfter',
    },
  ]) {
    await sourceEditor.fill(fixture.source);
    await page.getByRole('button', { name: /^(Final|最终效果)$/u }).click();
    await enterFinalEditing(page);
    const fencedCode = page.locator('.md-public-markdown-preview pre > code').first();
    await fencedCode.waitFor({ state: 'visible' });
    await fencedCode.evaluate((element) => {
      const text = element.firstChild;
      if (!text || text.nodeType !== Node.TEXT_NODE) throw new Error('Fenced-code fixture has no text node.');
      const range = element.ownerDocument.createRange();
      range.setStart(text, 'first'.length);
      range.collapse(true);
      const selection = element.ownerDocument.defaultView?.getSelection();
      element.focus();
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
    await fencedCode.press('Enter');
    await fencedCode.type('second');
    await fencedCode.press('Shift+Enter');
    await fencedCode.type('third');
    await leaveFinalEditing(page);
    await page.getByRole('button', { name: /^(Source|源码)$/u }).click();
    assert.equal(
      await sourceEditor.inputValue(),
      fixture.expected,
      `${fixture.label} must preserve its wrapper and Enter / Shift+Enter multiline Source edits.`,
    );
  }

  await page.evaluate(() => {
    const originalCreateObjectURL = window.URL.createObjectURL;
    const originalRevokeObjectURL = window.URL.revokeObjectURL;
    const activeObjectUrls = new Set();
    window.URL.createObjectURL = function trackedCreateObjectURL(blob) {
      const value = originalCreateObjectURL.call(this, blob);
      activeObjectUrls.add(value);
      return value;
    };
    window.URL.revokeObjectURL = function trackedRevokeObjectURL(value) {
      activeObjectUrls.delete(value);
      return originalRevokeObjectURL.call(this, value);
    };
    window.__ossImportResources = { activeObjectUrls, originalCreateObjectURL, originalRevokeObjectURL };
  });
  const sourceBeforeInvalidGif = await sourceEditor.inputValue();
  await page.evaluate(() => {
    const input = document.querySelector('.md-public-file-input');
    if (!(input instanceof HTMLInputElement)) throw new Error('Missing public import file input.');
    const transfer = new DataTransfer();
    const bytes = new Uint8Array(26);
    const view = new DataView(bytes.buffer);
    bytes.set(new TextEncoder().encode('GIF89a'), 0);
    view.setUint16(6, 1, true);
    view.setUint16(8, 1, true);
    bytes[13] = 0x2c;
    view.setUint16(18, 16_385, true);
    view.setUint16(20, 1, true);
    bytes[23] = 2;
    bytes[25] = 0x3b;
    transfer.items.add(new File([bytes], 'descriptor-bomb.gif', { type: 'image/gif' }));
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.locator('.md-public-status--error').waitFor({ state: 'visible' });
  assert.equal(
    await sourceEditor.inputValue(),
    sourceBeforeInvalidGif,
    'A GIF frame outside its logical screen must fail before decoding and without replacing Source.',
  );
  assert.equal(
    await page.evaluate(() => window.__ossImportResources.activeObjectUrls.size),
    0,
    'A rejected image decode must revoke its fallback object URL.',
  );

  await sourceEditor.fill('- one\n\n- two\n\n> quoted');
  await page.getByRole('button', { name: /^(Final|最终效果)$/u }).click();
  await enterFinalEditing(page);
  const looseListParagraph = page.locator('.md-public-markdown-preview li > p').first();
  const blockquoteParagraph = page.locator('.md-public-markdown-preview blockquote > p').first();
  await looseListParagraph.click();
  assert.equal(
    await looseListParagraph.evaluate(element => element.ownerDocument.activeElement === element),
    true,
    'Loose-list editing must focus the paragraph instead of a nested contentEditable list item.',
  );
  await looseListParagraph.fill('changed list');
  await blockquoteParagraph.click();
  assert.equal(
    await blockquoteParagraph.evaluate(element => element.ownerDocument.activeElement === element),
    true,
    'Blockquote editing must focus the paragraph instead of a nested contentEditable container.',
  );
  await blockquoteParagraph.fill('changed quote');
  await leaveFinalEditing(page);
  await page.getByRole('button', { name: /^(Source|源码)$/u }).click();
  assert.equal(
    await sourceEditor.inputValue(),
    '- changed list\n\n- two\n\n> changed quote',
    'Loose-list and blockquote Final edits must write back to the canonical Source.',
  );

  const largeImage = await page.evaluate(async () => {
    const size = 2048;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Large-image fixture could not allocate a canvas context.');
    const pixels = context.createImageData(size, size);
    let random = 0x12345678;
    for (let index = 0; index < pixels.data.length; index += 4) {
      random ^= random << 13;
      random ^= random >>> 17;
      random ^= random << 5;
      pixels.data[index] = random & 0xff;
      pixels.data[index + 1] = (random >>> 8) & 0xff;
      pixels.data[index + 2] = (random >>> 16) & 0xff;
      pixels.data[index + 3] = 0xff;
    }
    context.putImageData(pixels, 0, 0);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    canvas.width = 0;
    canvas.height = 0;
    if (!(blob instanceof Blob)) throw new Error('Large-image fixture could not encode JPEG.');
    const input = document.querySelector('.md-public-file-input');
    if (!(input instanceof HTMLInputElement)) throw new Error('Missing public import file input.');
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], 'noise.jpg', { type: 'image/jpeg' }));
    input.files = transfer.files;
    const start = performance.now();
    const originalToBlob = HTMLCanvasElement.prototype.toBlob;
    const originalCreateElement = document.createElement;
    const canvases = [];
    document.createElement = function publicImportTrackedCreateElement(tagName, options) {
      const element = originalCreateElement.call(this, tagName, options);
      if (String(tagName).toLowerCase() === 'canvas') canvases.push(element);
      return element;
    };
    window.__ossImageHeartbeat = {
      canvases,
      encodeCalls: 0,
      last: start,
      maxEncodePixels: 0,
      maxGap: 0,
      originalCreateElement,
      originalToBlob,
      ticks: 0,
    };
    HTMLCanvasElement.prototype.toBlob = function publicImportMeasuredToBlob(callback, type, quality) {
      window.__ossImageHeartbeat.encodeCalls += 1;
      window.__ossImageHeartbeat.maxEncodePixels = Math.max(
        window.__ossImageHeartbeat.maxEncodePixels,
        this.width * this.height,
      );
      return originalToBlob.call(this, callback, type, quality);
    };
    const heartbeatId = window.setInterval(() => {
      const now = performance.now();
      const heartbeat = window.__ossImageHeartbeat;
      heartbeat.maxGap = Math.max(heartbeat.maxGap, now - heartbeat.last);
      heartbeat.last = now;
      heartbeat.ticks += 1;
    }, 25);
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return { bytes: blob.size, heartbeatId, start };
  });
  assert.ok(largeImage.bytes > 2 * 1024 * 1024, 'Large-image fixture must exercise browser compression.');
  await page.locator('.md-public-status--done').waitFor({ state: 'visible', timeout: 15_000 });
  const largeImagePerformance = await page.evaluate(({ heartbeatId, start }) => {
    const now = performance.now();
    const heartbeat = window.__ossImageHeartbeat;
    window.clearInterval(heartbeatId);
    HTMLCanvasElement.prototype.toBlob = heartbeat.originalToBlob;
    document.createElement = heartbeat.originalCreateElement;
    const activeCanvasCount = heartbeat.canvases.filter(canvas => canvas.width !== 0 || canvas.height !== 0).length;
    delete window.__ossImageHeartbeat;
    return {
      activeCanvasCount,
      encodeCalls: heartbeat.encodeCalls,
      elapsed: now - start,
      maxEncodePixels: heartbeat.maxEncodePixels,
      maxHeartbeatGap: Math.max(heartbeat.maxGap, now - heartbeat.last),
      ticks: heartbeat.ticks,
    };
  }, largeImage);
  // The encode-call bound is invariant across runner speed and catches the
  // former 25-call unsupported-AVIF loop. Time is only a generous watchdog;
  // the relative heartbeat bound proves the event loop kept making progress.
  assert.ok(largeImagePerformance.encodeCalls <= 14, `Large-image import encoded ${largeImagePerformance.encodeCalls} times.`);
  assert.ok(largeImagePerformance.maxEncodePixels <= 8 * 1024 * 1024, `Large-image import allocated a ${largeImagePerformance.maxEncodePixels}-pixel encoding canvas.`);
  assert.equal(largeImagePerformance.activeCanvasCount, 0, 'Image capability and encode canvases must be released after import.');
  assert.ok(largeImagePerformance.elapsed < 12_000, `Large-image import exceeded the 12s watchdog (${largeImagePerformance.elapsed.toFixed(0)}ms).`);
  assert.ok(largeImagePerformance.ticks >= 2, 'Large-image import never yielded to the browser heartbeat.');
  assert.ok(
    largeImagePerformance.maxHeartbeatGap < Math.max(1_500, largeImagePerformance.elapsed * 0.8),
    `Large-image import blocked the browser heartbeat for ${largeImagePerformance.maxHeartbeatGap.toFixed(0)}ms.`,
  );
  await page.getByRole('button', { name: /^(Source|源码)$/u }).click();
  const importedImageSource = await sourceEditor.inputValue();
  assert.match(importedImageSource, /^!\[noise\.jpg\]\(data:image\/(?:avif|webp);base64,/u);
  assert.ok(importedImageSource.length < 3_000_000, 'Compressed local image exceeded the Source data-URL budget.');
  const activeObjectUrlCount = await page.evaluate(() => {
    const resources = window.__ossImportResources;
    window.URL.createObjectURL = resources.originalCreateObjectURL;
    window.URL.revokeObjectURL = resources.originalRevokeObjectURL;
    const count = resources.activeObjectUrls.size;
    delete window.__ossImportResources;
    return count;
  });
  assert.equal(activeObjectUrlCount, 0, 'Successful and rejected imports must leave no object URLs active.');
  assert.deepEqual(pageErrors, [], `Final editing raised browser errors: ${pageErrors.join(' | ')}`);

  const selectAcrossPreviewParagraphs = async (
    selector = '[data-public-preview-root="true"] p[data-public-final-block="true"]',
  ) => page.evaluate((candidateSelector) => {
    const paragraphs = [...document.querySelectorAll(candidateSelector)];
    const first = paragraphs.at(0);
    const last = paragraphs.at(-1);
    const firstText = first?.firstChild;
    const lastText = last?.lastChild;
    if (!(first instanceof HTMLElement) || !(last instanceof HTMLElement) || !firstText || !lastText) {
      throw new Error('Cross-block selection fixture did not render boundary paragraphs.');
    }
    const editability = paragraphs.map(paragraph => paragraph.getAttribute('contenteditable'));
    for (const paragraph of paragraphs) paragraph.setAttribute('contenteditable', 'false');
    const range = document.createRange();
    range.setStart(firstText, 0);
    range.setEnd(lastText, lastText.textContent?.length ?? 0);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    const text = (selection?.toString() ?? '').trim();
    last.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    paragraphs.forEach((paragraph, index) => {
      const value = editability[index];
      if (value === null) paragraph.removeAttribute('contenteditable');
      else paragraph.setAttribute('contenteditable', value);
    });
    return { blockCount: paragraphs.length, text };
  }, selector);

  const selectPreviewParagraph = async expectedText => page.evaluate((text) => {
    const paragraph = [...document.querySelectorAll(
      '[data-public-preview-root="true"] p[data-public-final-block="true"]',
    )].find(candidate => candidate.textContent?.trim() === text);
    if (!(paragraph instanceof HTMLElement)) {
      throw new Error(`Missing preview paragraph: ${text}`);
    }
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    paragraph.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    return selection?.toString() ?? '';
  }, expectedText);

  const finalButton = page.getByRole('button', { name: /^(Final|最终效果)$/u });
  const sourceButton = page.getByRole('button', { name: /^(Source|源码)$/u });
  const aiModify = page.getByTestId('oss-ai-modify');
  const nestedListSource = '- First nested paragraph\n\n- Second nested paragraph';
  await sourceEditor.fill(nestedListSource);
  await finalButton.click();
  const nestedSelection = await selectAcrossPreviewParagraphs(
    '[data-public-preview-root="true"] li > p[data-public-final-block="true"]',
  );
  assert.equal(nestedSelection.blockCount, 2);
  assert.match(nestedSelection.text, /^First nested paragraph\s+Second nested paragraph$/u);
  await aiModify.waitFor({ state: 'visible' });
  await aiModify.click();
  await page.getByTestId('oss-ai-instruction').fill('Combine these list paragraphs safely.');
  await page.getByRole('button', { name: /^(Send|发送)$/u }).click();
  await page.getByTestId('oss-ai-result').waitFor({ state: 'visible' });
  assert.equal(providerRequests.length, 1, 'A reversible nested cross-block selection must issue one provider request.');
  const nestedProviderContent = providerRequests[0]?.messages
    ?.map(message => String(message?.content ?? ''))
    .join('\n') ?? '';
  assert.match(
    nestedProviderContent,
    /Selected text:\nFirst nested paragraph\n\n- Second nested paragraph/u,
    'Nested cross-block selection must preserve the exact canonical Source range.',
  );
  await page.getByRole('button', { name: /^(Close|关闭)$/u }).click();
  providerRequests.length = 0;
  await sourceButton.click();
  await sourceEditor.fill('First paragraph\n\nSecond paragraph');
  await finalButton.click();
  const reversibleSelection = await selectAcrossPreviewParagraphs();
  assert.equal(reversibleSelection.blockCount, 2);
  assert.match(reversibleSelection.text, /^First paragraph\s+Second paragraph$/u);
  await aiModify.waitFor({ state: 'visible' });

  const onePixelBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const onePixelGifBase64 = 'R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
  const percentEncodedPixel = `${onePixelBase64.slice(0, 24)}%0A${onePixelBase64.slice(24)}`;
  const imageSource = [
    'First paragraph',
    '',
    `![pixel](data:image/png;base64,${onePixelBase64})`,
    '',
    `![upper-pixel](DATA:IMAGE/PNG;BASE64,${onePixelBase64})`,
    '',
    `![gif-pixel](data:image/gif;base64,${onePixelGifBase64})`,
    '',
    `![percent-pixel](data:image/png;base64,${percentEncodedPixel})`,
    '',
    'Second paragraph',
  ].join('\n');
  await sourceButton.click();
  await sourceEditor.fill(imageSource);
  await aiModify.waitFor({ state: 'hidden' });
  await finalButton.click();
  for (const alt of ['pixel', 'upper-pixel', 'gif-pixel', 'percent-pixel']) {
    const image = page.locator(`[data-public-preview-root="true"] img[alt="${alt}"]`);
    await image.waitFor({ state: 'visible' });
    await image.evaluate(element => new Promise((resolve, reject) => {
      if (element.complete) {
        if (element.naturalWidth > 0) resolve();
        else reject(new Error(`Markdown image ${element.alt} completed without decoded pixels.`));
        return;
      }
      element.addEventListener('load', resolve, { once: true });
      element.addEventListener('error', () => reject(new Error(`Markdown image ${element.alt} failed to load.`)), { once: true });
    }));
    assert.deepEqual(
      await image.evaluate(element => [element.naturalWidth, element.naturalHeight]),
      [1, 1],
      `Chromium did not decode the Markdown ${alt} 1x1 data resource.`,
    );
  }
  const blockedSelection = await selectAcrossPreviewParagraphs();
  assert.equal(blockedSelection.blockCount, 6);
  assert.match(blockedSelection.text, /First paragraph[\s\S]*Second paragraph/u);
  await page.waitForTimeout(100);
  assert.equal(await aiModify.count(), 0, 'A selection crossing an image must not expose an adoptable AI action.');
  assert.equal(providerRequests.length, 0, 'A cross-resource selection must not issue a provider request.');
  await sourceButton.click();
  assert.equal(await sourceEditor.inputValue(), imageSource, 'Fail-closed cross-image selection must preserve Source exactly.');

  const adjacentDataTail = 'QURKQUNFTlRCUk9XU0VSU0VDUkVU';
  const nonBase64Tail = 'NON_BASE64_BROWSER_SECRET';
  const privacySource = [
    'First privacy paragraph',
    '',
    `![pixel](data:image/png;base64,${onePixelBase64})`,
    '',
    `![upper-pixel](DATA:IMAGE/PNG;BASE64,${onePixelBase64})`,
    '',
    `![percent-pixel](data:image/png;base64,${percentEncodedPixel})`,
    '',
    '```text',
    `${'İ'.repeat(256)}data:text/plain;base64,QUJD${adjacentDataTail}`,
    `DATA:APPLICATION/OCTET-STREAM;BASE64,REVG\r\ndata:text/plain;base64,R0hJ\tDATA:text/plain;base64,SktM`,
    '```',
    '',
    'Encoded resource: d&#97;t&bsol;61&colon;text&sol;plain&semi;base64&comma;QUJD&plus;&sol;&equals;&percnt;41)',
    '',
    `Opaque non-base64 resource: data:image/svg+xml;charset=utf-8,%3Csvg%3E${nonBase64Tail}`,
    '',
    'This tail must never reach the provider: AFTER_NON_BASE64_BROWSER_SECRET',
  ].join('\n');
  await sourceEditor.fill(privacySource);
  await finalButton.click();
  const pixel = page.locator('[data-public-preview-root="true"] img[alt="pixel"]');
  await pixel.waitFor({ state: 'visible' });
  assert.equal(await pixel.evaluate(image => image.complete && image.naturalWidth > 0), true,
    'The valid local PNG fixture must still load in the browser preview.');
  for (const alt of ['upper-pixel']) {
    const image = page.locator(`[data-public-preview-root="true"] img[alt="${alt}"]`);
    await image.waitFor({ state: 'visible' });
    assert.deepEqual(
      await image.evaluate(element => [element.naturalWidth, element.naturalHeight]),
      [1, 1],
      `The ${alt} data URL fixture must still load in the browser preview.`,
    );
  }
  assert.equal(await selectPreviewParagraph('First privacy paragraph'), 'First privacy paragraph');
  await aiModify.waitFor({ state: 'visible' });
  await aiModify.click();
  await page.getByTestId('oss-ai-instruction').fill('Rewrite this paragraph clearly.');
  await page.getByRole('button', { name: /^(Send|发送)$/u }).click();
  await page.getByTestId('oss-ai-result').waitFor({ state: 'visible' });
  assert.equal(await page.getByTestId('oss-ai-result').textContent(), 'AI_BROWSER_RESULT');
  assert.equal(providerRequests.length, 1, 'Modify must issue exactly one provider request.');
  const modifyProviderBody = JSON.stringify(providerRequests[0]);
  const modifyProviderContent = providerRequests[0]?.messages
    ?.map(message => String(message?.content ?? ''))
    .join('\n') ?? '';
  assert.doesNotMatch(modifyProviderBody, /data:/iu);
  assert.doesNotMatch(modifyProviderBody, /image\/(?:png|gif|svg\+xml)|application\/octet-stream|text\/plain/iu);
  assert.doesNotMatch(modifyProviderBody, /iVBORw0KGgo|R0lGODlh/iu);
  assert.doesNotMatch(modifyProviderBody, /QUJD/iu);
  assert.doesNotMatch(modifyProviderBody, /QURKQUNFTlRCUk9XU0VSU0VDUkVU|NON_BASE64_BROWSER_SECRET|AFTER_NON_BASE64_BROWSER_SECRET/u);
  assert.doesNotMatch(modifyProviderBody, /REVG|R0hJ|SktM/u);
  assert.match(modifyProviderContent, /İ{8}/u, 'Ordinary Unicode before the resource must retain its original offsets.');
  assert.doesNotMatch(
    modifyProviderContent,
    /&#97;|&(?:bsol|colon|sol|semi|comma|plus|equals|percnt);/iu,
  );
  assert.match(modifyProviderContent, /\[local image data omitted\]/u);
  await page.getByRole('button', { name: /^(Close|关闭)$/u }).click();
  assert.deepEqual(pageErrors, [], `OSS editing and local AI raised browser errors: ${pageErrors.join(' | ')}`);

  await context.tracing.stop();
  tracing = false;
  await rm(outputDir, { force: true, recursive: true });
  console.log(`[oss-editing-e2e] 720px layout, shared Final format writeback, scrollable 32-item Slash menu, 30 flat previews, Markdown/code Final editing, raw/fenced/multi-fence HTML atomic editing, long-document local iframe rerender, JSON/JSON5 review-only repair cancel/adopt/undo, zero-request cross-resource selection, browser-loaded Markdown data resources, provider-body redaction, and ${largeImagePerformance.elapsed.toFixed(0)}ms large-image import (${largeImagePerformance.encodeCalls} encodes, ${largeImagePerformance.maxHeartbeatGap.toFixed(0)}ms max heartbeat gap) passed: ${JSON.stringify(layout)}`);
} catch (error) {
  await mkdir(outputDir, { recursive: true });
  if (page) await page.screenshot({ fullPage: true, path: path.join(outputDir, 'failure.png') }).catch(() => undefined);
  if (context && tracing) {
    await context.tracing.stop({ path: path.join(outputDir, 'trace.zip') }).catch(() => undefined);
    tracing = false;
  }
  await writeFile(path.join(outputDir, 'preview.log'), previewLog);
  throw error;
} finally {
  if (context && tracing) await context.tracing.stop().catch(() => undefined);
  await context?.close().catch(() => undefined);
  await browser?.close().catch(() => undefined);
  await stopChild(preview);
}
