/* global console, DataTransfer, document, DOMParser, DragEvent, fetch, File, HTMLElement, HTMLIFrameElement, MouseEvent, NodeFilter, process, setTimeout, window */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
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
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`OSS preview exited early with code ${child.exitCode}`);
    try {
      const response = await fetch(url);
      if (response.status > 0) return;
    } catch {
      // The preview port is not accepting connections yet.
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for the OSS preview.');
};

const run = (command, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {
    cwd: options.cwd ?? projectDir,
    env: options.env ?? process.env,
    stdio: options.stdio ?? 'inherit',
  });
  child.once('error', reject);
  child.once('exit', (code, signal) => {
    if (code === 0) resolve();
    else reject(new Error(`${command} ${args.join(' ')} exited with ${code ?? signal}`));
  });
});

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
};

const leaveFinalEditing = async (page) => {
  const final = page.locator('[data-public-final="true"]');
  await final.waitFor({ state: 'visible' });
};

const getWorkspaceMode = async (page) => (
  page.locator('[data-public-workspace="true"]').getAttribute('data-commercial-workspace-mode')
);

const ensureSourceMode = async (page) => {
  if (await getWorkspaceMode(page) !== 'source') {
    await page.locator('[data-testid="oss-workspace-mode-toggle"]').click();
  }
  await page.locator('.md-oss-workspace:not(.md-oss-final-workspace) .aad-editor-input').waitFor({ state: 'visible' });
};

const ensureFinalMode = async (page) => {
  if (await getWorkspaceMode(page) !== 'final') {
    await page.getByRole('button', { name: /^(Final|最终效果)$/u }).click();
  }
  await page.locator('[data-public-final="true"]').waitFor({ state: 'visible' });
};

await rm(outputDir, { force: true, recursive: true });
await run(npmCommand, ['run', 'build:oss'], {
  env: { ...process.env, MORNDRAFT_BUILD_PRESET: 'oss-full' },
});
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
  context = await browser.newContext({ acceptDownloads: true, locale: 'zh-CN', viewport: { width: 1280, height: 720 } });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  tracing = true;
  page = await context.newPage();
  const pageErrors = [];
  const debugConsole = [];
  page.on('pageerror', error => pageErrors.push(String(error)));
  page.on('console', message => {
    const text = message.text();
    if (text.includes('[preview-lexical]') || text.includes('[html-preview]')) {
      debugConsole.push(text);
      if (debugConsole.length > 60) debugConsole.shift();
    }
  });
  await page.addInitScript(() => {
    if (window.top !== window) return;
    window.localStorage.setItem('morndraft.debug.preview', '1');
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
  await ensureSourceMode(page);

  const sourceEditor = page.locator('.md-oss-workspace:not(.md-oss-final-workspace) .aad-editor-input').first();
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
      editor: rect('.aad-editor-shell'),
      main: rect('.md-oss-workspace:not(.md-oss-final-workspace)'),
      textarea: rect('.md-oss-workspace:not(.md-oss-final-workspace) .aad-editor-input'),
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
  await ensureFinalMode(page);
  const readBrowserSelection = () => page.evaluate(() => window.getSelection()?.toString() ?? '');
  const finalHeading = page.getByRole('heading', { name: 'Final heading' });
  await finalHeading.dblclick();
  assert.equal(
    await readBrowserSelection(),
    'Final heading',
    'Final heading double click must select the complete logical line.',
  );
  await page.keyboard.press('Escape');
  const finalParagraph = page.locator('.aad-markdown-lexical-island-content > p').filter({
    hasText: 'A long logical line with bold text',
  });
  await finalParagraph.dblclick({ position: { x: 80, y: 12 } });
  assert.equal(
    await readBrowserSelection(),
    'A long logical line with bold text',
    'Final paragraph double click must span inline formatting without stopping at a visual word.',
  );
  await page.keyboard.press('Escape');
  const finalQuote = page.getByText('Quoted line', { exact: true });
  await finalQuote.dblclick();
  assert.equal(
    await readBrowserSelection(),
    'Quoted line',
    'Final quote double click must select its complete logical line.',
  );
  await page.keyboard.press('Escape');
  const finalParentListItem = page.getByText('Parent line', { exact: true });
  await finalParentListItem.dblclick();
  assert.equal(
    await readBrowserSelection(),
    'Parent line',
    'A parent list item double click must not absorb text from its nested child item.',
  );
  await ensureSourceMode(page);
  assert.equal(
    await sourceEditor.inputValue(),
    publicLineSelectionSource,
    'Double-click line selection must not create a Source edit or history entry.',
  );

  await sourceEditor.fill('Toolbar formatting target');
  await ensureFinalMode(page);
  const formattingTarget = page.locator(
    '[data-public-preview-root="true"] .aad-markdown-lexical-island-content > p',
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
  await ensureSourceMode(page);
  assert.equal(
    await sourceEditor.inputValue(),
    '**Toolbar formatting target**',
    'The shared commercial format toolbar did not write the public Final selection back to Source.',
  );

  const openFinalSlashMenu = async () => {
    await ensureSourceMode(page);
    await sourceEditor.fill('');
    await ensureFinalMode(page);
    const lexicalEditor = page.locator('.aad-markdown-lexical-island-content');
    await lexicalEditor.waitFor({ state: 'visible' });
    await lexicalEditor.click({ position: { x: 24, y: 16 } });
    await page.keyboard.type('/');
  };
  await openFinalSlashMenu();
  const insertMenu = page.getByRole('menu', { name: /^(Insert content|插入内容)$/u });
  await insertMenu.waitFor({ state: 'visible' });
  const items = insertMenu.getByRole('menuitem');
  assert.ok(await items.count() >= 7, 'The shared OSS slash menu must expose its portable local insert actions.');
  assert.match((await items.nth(0).textContent()) ?? '', /AI/u, 'AI generate must remain the first slash action.');
  await items.last().scrollIntoViewIfNeeded();
  const menuLayout = await page.evaluate(() => {
    const menu = document.querySelector('.md-public-insert-menu');
    const main = document.querySelector('.md-oss-final-workspace');
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
  await page.keyboard.press('Escape');
  await ensureSourceMode(page);

  const editVisibleJson = async (nextValue, index = 0) => {
    const editButtons = page.getByRole('button', { name: /^(Edit JSON|编辑 JSON)$/u });
    await editButtons.nth(index).click();
    const editor = page.locator('textarea.aad-code-edit-textarea').first();
    await editor.waitFor({ state: 'visible' });
    await editor.fill(nextValue);
    await editor.evaluate(element => element.blur());
  };
  const editHtmlText = async (index, nextText) => {
    const hitarea = page.locator('.aad-html-edit-hitarea').nth(index);
    await hitarea.waitFor({ state: 'visible' });
    await hitarea.dblclick();
    const editFrame = page.locator('iframe[data-html-preview-edit="trusted-scriptless"]');
    await editFrame.waitFor({ state: 'attached' });
    const editable = page.frameLocator('iframe[data-html-preview-edit="trusted-scriptless"]')
      .locator('[contenteditable]')
      .first();
    await editable.waitFor({ state: 'visible' });
    await editable.fill(nextText);
    await page.locator('.md-oss-shared-toolbar').click({ position: { x: 8, y: 8 } });
    await editFrame.waitFor({ state: 'detached' });
  };

  await sourceEditor.fill("```json5\n{title:'fenced before', items:[1,],}\n```");
  await ensureFinalMode(page);
  await editVisibleJson("{title:'fenced after', items:[2,],}");
  await ensureSourceMode(page);
  assert.equal(
    await sourceEditor.inputValue(),
    "```json5\n{title:'fenced after', items:[2,],}\n```",
    'Fenced JSON5 Final editing must preserve the exact fence while replacing only its body.',
  );

  await sourceEditor.fill('<!doctype html><html><body><main>Raw before</main></body></html>');
  await ensureFinalMode(page);
  await editHtmlText(0, 'Raw after');
  await ensureSourceMode(page);
  assert.match(await sourceEditor.inputValue(), /<main>Raw after<\/main>/u);

  await sourceEditor.fill('~~~HTML preview linenums\n<main>Fenced before</main>\n~~~\n\nBlock after');
  await ensureFinalMode(page);
  await editHtmlText(0, 'Fenced after');
  await page.waitForTimeout(150);
  const afterBlock = page.getByText('Block after', { exact: true });
  await afterBlock.evaluate((element) => {
    const range = element.ownerDocument.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = element.ownerDocument.defaultView?.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    element.closest('[contenteditable="true"]')?.focus();
  });
  await page.keyboard.type(' typed');
  await page.getByText('Block after typed', { exact: true }).waitFor({ state: 'visible' });
  await page.waitForTimeout(150);
  await ensureSourceMode(page);
  assert.match(await sourceEditor.inputValue(), /~~~HTML preview linenums\n[\s\S]*<main>Fenced after<\/main>[\s\S]*~~~\n\nBlock after typed/u);

  const repeatedHtml = '<section data-copy="same">Repeated</section>';
  const buildLongMixedHtmlSource = (secondText) => [
    '# Long mixed document',
    ...Array.from({ length: 160 }, (_, index) => `Before paragraph ${index}`),
    '```html',
    repeatedHtml,
    '```',
    '```html',
    `<section data-copy="same">${secondText}</section>`,
    '```',
    ...Array.from({ length: 320 }, (_, index) => `Middle paragraph ${index}`),
    ...Array.from({ length: 160 }, (_, index) => `After paragraph ${index}`),
    '```html',
    '<section data-copy="third">Third</section>',
    '```',
    ...Array.from({ length: 160 }, (_, index) => `Tail paragraph ${index}`),
  ].join('\n');
  await sourceEditor.fill(buildLongMixedHtmlSource('Repeated'));
  await ensureFinalMode(page);
  assert.equal(await page.locator('.aad-html-frame').count(), 3, 'Long mixed fixture must render all three HTML blocks.');
  const mixedHtmlFrames = page.locator('iframe[data-html-preview-live="true"]');
  assert.ok(await mixedHtmlFrames.count() <= 3, 'The OSS scheduler must not mount extra live HTML iframes.');
  await page.waitForFunction(() => (
    [...document.querySelectorAll('iframe[data-html-preview-live="true"]')]
      .every(frame => frame instanceof HTMLIFrameElement && frame.contentWindow !== null)
  ));
  await page.locator('.aad-html-frame').nth(0).scrollIntoViewIfNeeded();
  await page.waitForFunction(() => (
    [...document.querySelectorAll('iframe[data-html-preview-live="true"]')]
      .filter(frame => frame.getAttribute('srcdoc')?.includes('data-copy="same">Repeated')).length === 2
  ));
  await page.evaluate(() => {
    const unchangedSiblingFrame = document.querySelectorAll('.aad-html-frame')[0]
      ?.querySelector('iframe[data-html-preview-live="true"]') ?? null;
    window.__ossHtmlAtomicEditing = {
      unchangedSiblingFrame,
      unchangedSiblingWindow: unchangedSiblingFrame?.contentWindow ?? null,
    };
  });
  await editHtmlText(1, 'Updated second');
  await page.waitForFunction(() => (
    [...document.querySelectorAll('iframe[data-html-preview-live="true"]')]
      .some(frame => frame.getAttribute('srcdoc')?.includes('Updated second'))
  ));
  const htmlFrameIdentity = await page.evaluate(() => {
    const snapshot = window.__ossHtmlAtomicEditing;
    const current = [...document.querySelectorAll('iframe[data-html-preview-live="true"]')];
    const unchangedSiblingFrame = document.querySelectorAll('.aad-html-frame')[0]
      ?.querySelector('iframe[data-html-preview-live="true"]') ?? null;
    return {
      count: current.length,
      currentFrameId: unchangedSiblingFrame?.dataset.htmlPreviewFrameId ?? null,
      currentSrcdocPreview: unchangedSiblingFrame?.getAttribute('srcdoc')?.slice(0, 120) ?? null,
      snapshotFrameId: snapshot.unchangedSiblingFrame?.dataset.htmlPreviewFrameId ?? null,
      unchangedSiblingSameFrame: unchangedSiblingFrame === snapshot.unchangedSiblingFrame,
      unchangedSiblingSameWindow: unchangedSiblingFrame?.contentWindow === snapshot.unchangedSiblingWindow,
    };
  });
  assert.equal(
    htmlFrameIdentity.unchangedSiblingSameFrame,
    true,
    `unchanged sibling iframe DOM node must be retained: ${JSON.stringify(htmlFrameIdentity)} debug=${debugConsole.slice(-20).join(' || ')}`,
  );
  assert.equal(
    htmlFrameIdentity.unchangedSiblingSameWindow,
    true,
    `unchanged sibling iframe contentWindow must be retained: ${JSON.stringify(htmlFrameIdentity)} debug=${debugConsole.slice(-20).join(' || ')}`,
  );
  assert.ok(htmlFrameIdentity.count <= 3, `expected at most 3 live HTML iframes: ${JSON.stringify(htmlFrameIdentity)}`);
  await ensureSourceMode(page);
  const mixedHtmlSourceAfterEdit = await sourceEditor.inputValue();
  assert.match(mixedHtmlSourceAfterEdit, /<section data-copy="same">Repeated<\/section>/u);
  assert.match(mixedHtmlSourceAfterEdit, /<section data-copy="same">Updated second<\/section>/u);
  assert.match(mixedHtmlSourceAfterEdit, /<section data-copy="third">Third<\/section>/u);

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
  await ensureFinalMode(page);
  assert.equal(await page.getByRole('button', { name: /^(Edit JSON|编辑 JSON)$/u }).count(), 2);
  await editVisibleJson("{slot:'second',}", 1);
  await ensureSourceMode(page);
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
  const openDeterministicRepairReview = async () => {
    const consoleButton = page.locator('.aad-editor-diagnostic-console');
    await consoleButton.waitFor({ state: 'visible' });
    if (await consoleButton.getAttribute('aria-pressed') !== 'true') await consoleButton.click();
    await page.locator('.aad-editor-line-fix-button').first().click();
    await page.locator('.aad-editor-fix-review-toast.is-pending').waitFor({ state: 'visible' });
  };
  await sourceEditor.fill(cancellableJsonRepairSource);
  await openDeterministicRepairReview();
  assert.equal(
    await sourceEditor.inputValue(),
    cancellableJsonRepairSource,
    'Opening a JSON5 repair candidate must never mutate Source silently.',
  );
  await page.locator('.aad-editor-fix-review-toast.is-pending')
    .getByRole('button', { name: /^(Cancel|取消)$/u })
    .click();
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
  await openDeterministicRepairReview();
  assert.equal(
    await sourceEditor.inputValue(),
    redundantJsonRepairSource,
    'A targeted duplicate-fence candidate must stay review-only until Adopt.',
  );
  await page.locator('.aad-editor-fix-review-toast.is-pending')
    .getByRole('button', { name: /^(Adopt|采用)$/u })
    .click();
  await page.locator('.aad-editor-fix-review-toast.is-applied').waitFor({ state: 'visible' });
  assert.equal(
    await sourceEditor.inputValue(),
    expectedAdoptedJsonSource,
    'Adopt must remove only the selected redundant JSON fence and preserve later fences.',
  );
  await page.locator('.aad-editor-fix-review-toast.is-applied')
    .getByRole('button', { name: /^(Undo|撤回|撤销)$/u })
    .click();
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
  const unsafeConsole = page.locator('.aad-editor-diagnostic-console');
  await unsafeConsole.waitFor({ state: 'visible' });
  if (await unsafeConsole.getAttribute('aria-pressed') !== 'true') await unsafeConsole.click();
  assert.equal(await page.locator('.aad-editor-diagnostic-fix-button').count(), 0);

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
  await ensureFinalMode(page);
  await enterFinalEditing(page);
  const blankPreview = page.locator('.aad-markdown-lexical-island-content');
  const protectedList = blankPreview.locator(':scope > ul');
  const protectedImage = blankPreview.locator('img[alt="pixel"]');
  const protectedCode = blankPreview.locator('.aad-code-frame');
  const protectedHtml = blankPreview.locator('.aad-html-frame');
  const protectedParagraph = blankPreview.locator(':scope > p').filter({ hasText: 'Before paragraph' });
  for (const protectedBlock of [
    protectedParagraph,
    protectedList,
    protectedImage,
    protectedCode,
    protectedHtml,
  ]) {
    await protectedBlock.click();
  }
  await protectedImage.scrollIntoViewIfNeeded();
  const listImageGap = await page.evaluate(() => {
    const previewRoot = document.querySelector('.aad-markdown-lexical-island-content');
    const list = previewRoot?.querySelector(':scope > ul');
    const imageElement = previewRoot?.querySelector('img[alt="pixel"]');
    const image = imageElement?.closest('p') ?? imageElement;
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
  await page.mouse.click(listImageGap.x, listImageGap.y);
  await page.keyboard.type('Inserted from blank area');
  await ensureSourceMode(page);
  const blankInsertionExpected = blankInsertionSource.replace(
    '\n\n![pixel]',
    '\n\nInserted from blank area\n\n![pixel]',
  );
  assert.equal(
    await sourceEditor.inputValue(),
    blankInsertionExpected,
    'Final gap insertion must add one paragraph at the adjacent exact Source boundary.',
  );

  await sourceEditor.fill('First **bold** block\n\nsecond');
  await ensureFinalMode(page);
  await enterFinalEditing(page);
  const paragraphs = page.locator('.aad-markdown-lexical-island-content > p');
  await paragraphs.nth(0).fill('Changed');
  await paragraphs.nth(1).click();
  await paragraphs.nth(1).fill('changed second');
  await leaveFinalEditing(page);
  await ensureSourceMode(page);
  assert.equal(
    await sourceEditor.inputValue(),
    'Changed\n\nchanged second',
    'Sequential Final edits must reconcile a changed Markdown AST and write both blocks back to Source.',
  );

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
  const invalidGif = Buffer.alloc(26);
  invalidGif.write('GIF89a', 0, 'ascii');
  invalidGif.writeUInt16LE(1, 6);
  invalidGif.writeUInt16LE(1, 8);
  invalidGif[13] = 0x2c;
  invalidGif.writeUInt16LE(16_385, 18);
  invalidGif.writeUInt16LE(1, 20);
  invalidGif[23] = 2;
  invalidGif[25] = 0x3b;
  const dropFile = async (buffer, name, type) => {
    await page.evaluate(({ base64, fileName, mimeType }) => {
      const workspace = document.querySelector('[data-public-workspace="true"]');
      if (!(workspace instanceof HTMLElement)) throw new Error('Missing shared workspace drop target.');
      const binary = window.atob(base64);
      const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
      const transfer = new DataTransfer();
      transfer.items.add(new File([bytes], fileName, { type: mimeType }));
      workspace.dispatchEvent(new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
      }));
    }, { base64: buffer.toString('base64'), fileName: name, mimeType: type });
  };
  await dropFile(invalidGif, 'descriptor-bomb.gif', 'image/gif');
  await page.locator('.aad-editor-import-toast-error').waitFor({ state: 'visible' });
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

  const onePixelPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
  await dropFile(onePixelPng, 'pixel.png', 'image/png');
  await page.waitForFunction(() => (
    document.querySelector('.md-oss-workspace:not(.md-oss-final-workspace) .aad-editor-input')?.value?.startsWith('![pixel.png](data:image/png;base64,')
  ));
  await ensureSourceMode(page);
  assert.match(await sourceEditor.inputValue(), /^!\[pixel\.png\]\(data:image\/png;base64,/u);
  await ensureFinalMode(page);
  // The 7.10 chrome does not show the document title in the toolbar; the
  // derived title is asserted through the exported file name instead.
  const exportMenuButton = page.locator('.aad-preview-share-button');
  await exportMenuButton.click();
  const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
  await page.getByTestId('oss-delivery-download-html').click();
  const pixelDownload = await downloadPromise;
  assert.equal(pixelDownload.suggestedFilename(), 'pixel.png.html');

  const dropText = async (type, value) => {
    await page.evaluate(({ dataType, dataValue }) => {
      const workspace = document.querySelector('[data-public-workspace="true"]');
      if (!(workspace instanceof HTMLElement)) throw new Error('Missing shared workspace drop target.');
      const transfer = new DataTransfer();
      transfer.setData(dataType, dataValue);
      if (dataType === 'text/uri-list') transfer.setData('text/plain', dataValue);
      workspace.dispatchEvent(new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
      }));
    }, { dataType: type, dataValue: value });
    await page.waitForFunction(expected => (
      document.querySelector('.md-oss-workspace:not(.md-oss-final-workspace) .aad-editor-input')?.value === expected
    ), value);
  };
  await dropText('text/plain', '# Dropped local text');
  await ensureSourceMode(page);
  assert.equal(await sourceEditor.inputValue(), '# Dropped local text');
  await ensureFinalMode(page);
  await dropText('text/uri-list', 'https://example.test/local');
  await ensureSourceMode(page);
  assert.equal(await sourceEditor.inputValue(), 'https://example.test/local');

  if (process.env.MORNDRAFT_RUN_LEGACY_PUBLIC_E2E === '1') {
  const selectAcrossPreviewParagraphs = async (
    selector = '[data-public-preview-root="true"] .aad-markdown-lexical-island-content > p',
  ) => page.evaluate((candidateSelector) => {
    const readTextNodes = (root) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const nodes = [];
      let node = walker.nextNode();
      while (node) {
        if ((node.textContent ?? '').trim()) nodes.push(node);
        node = walker.nextNode();
      }
      return nodes;
    };
    const paragraphs = [...document.querySelectorAll(candidateSelector)];
    const first = paragraphs.at(0);
    const last = paragraphs.at(-1);
    const firstText = first ? readTextNodes(first).at(0) : null;
    const lastText = last ? readTextNodes(last).at(-1) : null;
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
      '[data-public-preview-root="true"] .aad-markdown-lexical-island-content > p',
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

  const aiModify = page.getByTestId('oss-ai-modify');

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
  await ensureSourceMode(page);
  await sourceEditor.fill(imageSource);
  await aiModify.waitFor({ state: 'hidden' });
  await ensureFinalMode(page);
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
  await ensureSourceMode(page);
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
  await ensureFinalMode(page);
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
  }
  assert.deepEqual(pageErrors, [], `OSS editing and local AI raised browser errors: ${pageErrors.join(' | ')}`);

  await context.tracing.stop();
  tracing = false;
  await rm(outputDir, { force: true, recursive: true });
  console.log(`[oss-editing-e2e] shared desktop Source/Final, line selection, format writeback, slash insert, HTML/JSON5 block editing, iframe isolation, deterministic repair review, gap insertion, image import, text/URL drop, and security rejection passed: ${JSON.stringify(layout)}`);
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
