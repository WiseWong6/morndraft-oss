import {
  buildOpaqueSandboxIframe,
  buildPortableDocument,
} from '@morndraft/public-delivery';
import { buildHtmlPreviewBridgeScript, HTML_PREVIEW_BRIDGE_SOURCE } from './htmlPreviewBridge';

export type PreviewTheme = 'dark' | 'light';

const buildStaticHtmlDeliveryCspDirectives = (scriptSrc: string) => [
  "default-src 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  scriptSrc,
  "connect-src 'none'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: data:",
  "font-src 'self' data:",
  "frame-src 'self' about:",
  "child-src 'self' about:",
  "form-action 'none'",
].join('; ');

const isSafeScriptNonce = (nonce: string | null | undefined): nonce is string =>
  typeof nonce === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(nonce);

export const USER_HTML_PREVIEW_CSP = [
  "default-src 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  "script-src 'none'",
  "connect-src 'none'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: data:",
  "font-src 'self' data:",
  "frame-src 'none'",
  "child-src 'none'",
  "form-action 'none'",
].join('; ');

export const buildStaticHtmlDeliveryCsp = (scriptNonce?: string | null) =>
  buildStaticHtmlDeliveryCspDirectives(
    isSafeScriptNonce(scriptNonce) ? `script-src 'nonce-${scriptNonce}'` : "script-src 'none'",
  );

export const STATIC_HTML_DELIVERY_CSP = buildStaticHtmlDeliveryCsp();

/**
 * Relaxed CSP for live/shared preview iframes — allows CDN scripts, stylesheets, and
 * fonts so that user HTML relying on Tailwind CDN, Google Fonts, Font Awesome,
 * etc. can render correctly.  User HTML still runs inside a sandboxed inner
 * iframe without same-origin access to the MornDraft-controlled viewer.
 */
export const USER_HTML_PREVIEW_COMPAT_CSP = [
  "default-src 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  "script-src 'unsafe-inline' https://cdn.tailwindcss.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com",
  "connect-src https://cdn.tailwindcss.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com https://fonts.googleapis.com https://fonts.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com https://fonts.googleapis.com",
  "img-src 'self' https: data:",
  "font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com",
  "frame-src 'none'",
  "child-src 'none'",
  "form-action 'none'",
].join('; ');

export const USER_HTML_PREVIEW_LIVE_CSP = USER_HTML_PREVIEW_COMPAT_CSP;

export const STATIC_HTML_VIEWER_CSP = [
  "default-src 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  "script-src 'unsafe-inline' https://cdn.tailwindcss.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com",
  "connect-src https://cdn.tailwindcss.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com https://fonts.googleapis.com https://fonts.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com https://fonts.googleapis.com",
  "img-src 'self' https: data:",
  "font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com",
  "frame-src 'self' about:",
  "child-src 'self' about:",
  "form-action 'none'",
].join('; ');

export const escapeHtmlAttribute = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const escapeHtmlScriptText = (value: string) =>
  value.replace(/<\/script/gi, '<\\/script');

export const buildCspMetaTag = (policy: string) =>
  `<meta http-equiv="Content-Security-Policy" content="${escapeHtmlAttribute(policy)}">`;

export const STANDALONE_MERMAID_ZOOM_RUNTIME_ATTR = 'data-morndraft-standalone-mermaid-runtime';
export const STANDALONE_UI_RUNTIME_ATTR = 'data-morndraft-standalone-ui-runtime';

export const STANDALONE_UI_RUNTIME_SOURCE = String.raw`(function(){
  function closestElement(target,selector){
    return target instanceof Element?target.closest(selector):null;
  }
  function setBlockCollapsed(block,collapsed){
    block.setAttribute("data-collapsed",collapsed?"true":"false");
    var toggle=block.querySelector(":scope > .aad-block-header .aad-collapsible-toggle");
    var body=block.querySelector(":scope > .aad-collapsible-body");
    if(toggle)toggle.setAttribute("aria-expanded",collapsed?"false":"true");
    if(body)body.setAttribute("aria-hidden",collapsed?"true":"false");
  }
  function readDepth(line){
    var raw=line&&line.getAttribute("data-json-depth");
    var depth=Number(raw);
    if(!isFinite(depth)){
      var value=line&&line.style&&line.style.getPropertyValue("--aad-json-depth");
      depth=Number(value);
    }
    return isFinite(depth)?depth:0;
  }
  function setHidden(line,hidden){
    if(!line)return;
    line.hidden=hidden;
    if(hidden)line.style.display="none";
    else line.style.removeProperty("display");
  }
  function getJsonControlledLines(line){
    var depth=readDepth(line);
    var lines=[];
    var next=line.nextElementSibling;
    while(next&&next.classList&&next.classList.contains("aad-json-tree-line")){
      var nextDepth=readDepth(next);
      if(nextDepth<depth)break;
      lines.push(next);
      if(nextDepth===depth&&next.getAttribute("data-json-tree-line")==="close")break;
      next=next.nextElementSibling;
    }
    return lines;
  }
  function setJsonCollapsed(button,collapsed){
    var line=button.closest(".aad-json-tree-line");
    if(!line)return;
    button.setAttribute("aria-expanded",collapsed?"false":"true");
    var opening=line.querySelector(".aad-json-opening");
    var summary=line.querySelector(".aad-json-collapsed-summary");
    if(opening)opening.hidden=collapsed;
    if(summary)summary.hidden=!collapsed;
    var lines=getJsonControlledLines(line);
    for(var i=0;i<lines.length;i+=1)setHidden(lines[i],collapsed);
    if(!collapsed){
      var nested=line.parentElement?line.parentElement.querySelectorAll(".aad-json-tree-toggle[aria-expanded='false']"):[];
      for(var j=0;j<nested.length;j+=1){
        if(nested[j]!==button)setJsonCollapsed(nested[j],true);
      }
    }
  }
  function init(){
    var blocks=document.querySelectorAll(".aad-collapsible-block");
    for(var i=0;i<blocks.length;i+=1){
      setBlockCollapsed(blocks[i],blocks[i].getAttribute("data-collapsed")==="true");
    }
    var collapsedJson=document.querySelectorAll(".aad-json-tree-toggle[aria-expanded='false']");
    for(var j=0;j<collapsedJson.length;j+=1)setJsonCollapsed(collapsedJson[j],true);
  }
  document.addEventListener("click",function(event){
    var jsonToggle=closestElement(event.target,".aad-json-tree-toggle");
    if(jsonToggle){
      event.preventDefault();
      event.stopPropagation();
      setJsonCollapsed(jsonToggle,jsonToggle.getAttribute("aria-expanded")!=="false");
      return;
    }
    var blockToggle=closestElement(event.target,".aad-collapsible-toggle");
    if(blockToggle){
      var block=blockToggle.closest(".aad-collapsible-block");
      if(!block)return;
      event.preventDefault();
      setBlockCollapsed(block,block.getAttribute("data-collapsed")!=="true");
    }
  });
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();`;

export const STANDALONE_MERMAID_ZOOM_RUNTIME_SOURCE = String.raw`(function(){
  var MIN_SCALE=0.5;
  var MAX_SCALE=3;
  var STEP=0.1;
  function clamp(value){
    var n=Number(value);
    if(!isFinite(n))return 1;
    return Math.max(MIN_SCALE,Math.min(MAX_SCALE,Math.round(n*10)/10));
  }
  function percent(scale){return Math.round(scale*100)+"%";}
  function readNumber(value,fallback){
    var n=Number(value);
    return isFinite(n)&&n>0?n:fallback;
  }
  function readNodes(block){
    return {
      viewport:block.querySelector("[data-morndraft-standalone-mermaid-viewport]"),
      spacer:block.querySelector("[data-morndraft-standalone-mermaid-spacer]"),
      stage:block.querySelector("[data-morndraft-standalone-mermaid-stage]"),
      value:block.querySelector("[data-morndraft-standalone-mermaid-zoom-value]")
    };
  }
  function updateControls(block,scale){
    var buttons=block.querySelectorAll("[data-morndraft-standalone-mermaid-zoom-action]");
    for(var i=0;i<buttons.length;i+=1){
      var button=buttons[i];
      var action=button.getAttribute("data-morndraft-standalone-mermaid-zoom-action");
      if(action==="in")button.disabled=scale>=MAX_SCALE;
      if(action==="out")button.disabled=scale<=MIN_SCALE;
    }
  }
  function layout(block){
    var nodes=readNodes(block);
    if(!nodes.viewport||!nodes.spacer||!nodes.stage)return;
    var scale=clamp(block.getAttribute("data-morndraft-standalone-mermaid-scale")||"1");
    block.setAttribute("data-morndraft-standalone-mermaid-scale",String(scale));
    var naturalWidth=readNumber(block.getAttribute("data-morndraft-standalone-mermaid-width"),nodes.stage.scrollWidth||nodes.stage.getBoundingClientRect().width||1);
    var naturalHeight=readNumber(block.getAttribute("data-morndraft-standalone-mermaid-height"),nodes.stage.scrollHeight||nodes.stage.getBoundingClientRect().height||1);
    var viewportWidth=Math.max(1,nodes.viewport.clientWidth);
    var baseWidth=Math.max(1,Math.min(naturalWidth,viewportWidth));
    var baseHeight=Math.max(1,naturalHeight*(baseWidth/naturalWidth));
    var scaledWidth=Math.ceil(baseWidth*scale);
    var scaledHeight=Math.ceil(baseHeight*scale);
    var left=scaledWidth<viewportWidth?Math.floor((viewportWidth-scaledWidth)/2):0;
    nodes.spacer.style.width=Math.max(viewportWidth,scaledWidth)+"px";
    nodes.spacer.style.height=scaledHeight+"px";
    nodes.stage.style.width=baseWidth+"px";
    nodes.stage.style.height=baseHeight+"px";
    nodes.stage.style.left=left+"px";
    nodes.stage.style.transform="scale("+scale+")";
    nodes.viewport.setAttribute("data-morndraft-standalone-mermaid-pannable",scale>1?"true":"false");
    if(nodes.value)nodes.value.textContent=percent(scale);
    updateControls(block,scale);
  }
  function setScale(block,nextScale){
    var previous=clamp(block.getAttribute("data-morndraft-standalone-mermaid-scale")||"1");
    var nodes=readNodes(block);
    var viewport=nodes.viewport;
    var centerX=viewport?(viewport.scrollLeft+viewport.clientWidth/2):0;
    var centerY=viewport?(viewport.scrollTop+viewport.clientHeight/2):0;
    var next=clamp(nextScale);
    var ratio=previous>0?next/previous:1;
    block.setAttribute("data-morndraft-standalone-mermaid-scale",String(next));
    layout(block);
    if(viewport&&next!==1){
      viewport.scrollLeft=Math.max(0,centerX*ratio-viewport.clientWidth/2);
      viewport.scrollTop=Math.max(0,centerY*ratio-viewport.clientHeight/2);
    }else if(viewport){
      viewport.scrollLeft=0;
      viewport.scrollTop=0;
    }
  }
  function bindBlock(block){
    if(block.getAttribute("data-morndraft-standalone-mermaid-bound")==="true")return;
    block.setAttribute("data-morndraft-standalone-mermaid-bound","true");
    block.addEventListener("click",function(event){
      var target=event.target instanceof Element?event.target.closest("[data-morndraft-standalone-mermaid-zoom-action]"):null;
      if(!target)return;
      event.preventDefault();
      var action=target.getAttribute("data-morndraft-standalone-mermaid-zoom-action");
      var scale=clamp(block.getAttribute("data-morndraft-standalone-mermaid-scale")||"1");
      if(action==="in")setScale(block,scale+STEP);
      if(action==="out")setScale(block,scale-STEP);
      if(action==="reset")setScale(block,1);
    });
    var nodes=readNodes(block);
    var viewport=nodes.viewport;
    if(viewport){
      var dragging=false,startX=0,startY=0,startLeft=0,startTop=0;
      viewport.addEventListener("pointerdown",function(event){
        if(event.button!==0||clamp(block.getAttribute("data-morndraft-standalone-mermaid-scale")||"1")===1)return;
        dragging=true;
        startX=event.clientX;
        startY=event.clientY;
        startLeft=viewport.scrollLeft;
        startTop=viewport.scrollTop;
        viewport.setPointerCapture(event.pointerId);
        viewport.setAttribute("data-morndraft-standalone-mermaid-dragging","true");
        event.preventDefault();
      });
      viewport.addEventListener("pointermove",function(event){
        if(!dragging)return;
        viewport.scrollLeft=startLeft+(startX-event.clientX);
        viewport.scrollTop=startTop+(startY-event.clientY);
      });
      function stopDrag(event){
        if(!dragging)return;
        dragging=false;
        viewport.removeAttribute("data-morndraft-standalone-mermaid-dragging");
        try{viewport.releasePointerCapture(event.pointerId);}catch(_err){}
      }
      viewport.addEventListener("pointerup",stopDrag);
      viewport.addEventListener("pointercancel",stopDrag);
      viewport.addEventListener("lostpointercapture",function(){
        dragging=false;
        viewport.removeAttribute("data-morndraft-standalone-mermaid-dragging");
      });
    }
    layout(block);
  }
  function init(){
    var blocks=document.querySelectorAll("[data-morndraft-standalone-mermaid-zoom]");
    for(var i=0;i<blocks.length;i+=1)bindBlock(blocks[i]);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
  window.addEventListener("resize",function(){
    var blocks=document.querySelectorAll("[data-morndraft-standalone-mermaid-zoom]");
    for(var i=0;i<blocks.length;i+=1)layout(blocks[i]);
  });
})();`;

export const buildStandaloneMermaidZoomRuntimeScript = (nonce: string) =>
  `<script ${STANDALONE_MERMAID_ZOOM_RUNTIME_ATTR}="true" nonce="${escapeHtmlAttribute(nonce)}">${STANDALONE_MERMAID_ZOOM_RUNTIME_SOURCE}</script>`;

export const buildStandaloneUiRuntimeScript = (nonce: string) =>
  `<script ${STANDALONE_UI_RUNTIME_ATTR}="true" nonce="${escapeHtmlAttribute(nonce)}">${STANDALONE_UI_RUNTIME_SOURCE}</script>`;

const SCRIPT_TAG_PATTERN = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

export const getStandaloneMermaidZoomRuntimeNonce = (html: string): string | null => {
  const scripts = Array.from(String(html ?? '').matchAll(SCRIPT_TAG_PATTERN));
  if (scripts.length !== 1) return null;
  const [, attrs, body] = scripts[0];
  if (!new RegExp(`\\b${STANDALONE_MERMAID_ZOOM_RUNTIME_ATTR}(?:\\s*=|\\b)`, 'i').test(attrs)) return null;
  if (/\bsrc\s*=/i.test(attrs)) return null;
  if (body.trim() !== STANDALONE_MERMAID_ZOOM_RUNTIME_SOURCE.trim()) return null;
  const nonce = attrs.match(/\bnonce\s*=\s*(["'])([^"']+)\1/i)?.[2] ?? null;
  return isSafeScriptNonce(nonce) ? nonce : null;
};

const STANDALONE_RUNTIME_SOURCES = [
  {
    attr: STANDALONE_UI_RUNTIME_ATTR,
    source: STANDALONE_UI_RUNTIME_SOURCE,
  },
  {
    attr: STANDALONE_MERMAID_ZOOM_RUNTIME_ATTR,
    source: STANDALONE_MERMAID_ZOOM_RUNTIME_SOURCE,
  },
] as const;

export const getStandaloneRuntimeNonce = (html: string): string | null => {
  const scripts = Array.from(String(html ?? '').matchAll(SCRIPT_TAG_PATTERN));
  if (scripts.length === 0) return null;
  let runtimeNonce: string | null = null;
  for (const [, attrs, body] of scripts) {
    if (/\bdata-morndraft-hosted-link-frame-resize\b/i.test(attrs)) continue;
    if (/\bsrc\s*=/i.test(attrs)) return null;
    const runtime = STANDALONE_RUNTIME_SOURCES.find(({ attr }) =>
      new RegExp(`\\b${attr}(?:\\s*=|\\b)`, 'i').test(attrs),
    );
    if (!runtime || body.trim() !== runtime.source.trim()) return null;
    const nonce = attrs.match(/\bnonce\s*=\s*(["'])([^"']+)\1/i)?.[2] ?? null;
    if (!isSafeScriptNonce(nonce)) return null;
    if (runtimeNonce && runtimeNonce !== nonce) return null;
    runtimeNonce = nonce;
  }
  return runtimeNonce;
};

export const HOSTED_LINK_FRAME_RESIZE_SOURCE = 'morndraft-hosted-link-frame-resize';

const buildHostedLinkFrameResizeScript = (nonce: string | null) => {
  const nonceAttribute = nonce ? ` nonce="${escapeHtmlAttribute(nonce)}"` : '';
  return `<script data-morndraft-hosted-link-frame-resize${nonceAttribute}>${escapeHtmlScriptText(`(function(){
var SOURCE=${JSON.stringify(HOSTED_LINK_FRAME_RESIZE_SOURCE)};
var raf=0;
var lastHeight=0;
function num(value){var n=Number(value);return isFinite(n)&&n>0?Math.ceil(n):0;}
function readHeight(){
  var body=document.body;
  var root=document.documentElement;
  var rect=body&&body.getBoundingClientRect?body.getBoundingClientRect():null;
  return Math.max(
    1,
    num(root&&root.scrollHeight),
    num(root&&root.offsetHeight),
    num(root&&root.clientHeight),
    num(body&&body.scrollHeight),
    num(body&&body.offsetHeight),
    num(rect&&rect.bottom),
    num(window.innerHeight)
  );
}
function post(){
  raf=0;
  var height=readHeight();
  if(Math.abs(height-lastHeight)<=1)return;
  lastHeight=height;
  try{window.parent.postMessage({source:SOURCE,kind:'resize',height:height},'*');}catch(error){}
}
function schedule(){
  if(raf)return;
  raf=window.requestAnimationFrame?window.requestAnimationFrame(post):setTimeout(post,16);
}
window.addEventListener('load',schedule);
window.addEventListener('resize',schedule);
if('ResizeObserver' in window){
  var observer=new ResizeObserver(schedule);
  if(document.documentElement)observer.observe(document.documentElement);
  if(document.body)observer.observe(document.body);
}
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(schedule).catch(function(){});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});
else schedule();
setTimeout(schedule,120);
setTimeout(schedule,520);
})();`)}</script>`;
};

export const injectHostedLinkFrameResizeBridge = (html: string) => {
  const source = String(html ?? '');
  if (!source.trim() || /data-morndraft-hosted-link-frame-resize\b/i.test(source)) return source;
  const bridge = buildHostedLinkFrameResizeScript(getStandaloneRuntimeNonce(source));
  if (/<\/body\s*>/i.test(source)) {
    return source.replace(/<\/body\s*>/i, `${bridge}</body>`);
  }
  if (/<\/html\s*>/i.test(source)) {
    return source.replace(/<\/html\s*>/i, `${bridge}</html>`);
  }
  return `${source}${bridge}`;
};

export const injectCspMetaIntoHtml = (html: string, policy: string) => {
  const meta = buildCspMetaTag(policy);
  return injectHeadMarkupIntoHtml(html, meta);
};

const HTML_VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

const HTML_RAW_TEXT_ELEMENTS = new Set([
  'iframe',
  'noembed',
  'noframes',
  'plaintext',
  'script',
  'style',
  'textarea',
  'title',
  'xmp',
]);

type HtmlDocumentInsertionPoints = {
  doctypeEnd: number | null;
  headStartTagEnd: number | null;
  htmlStartTagEnd: number | null;
};

// HTML tokenization only treats U+0009, U+000A, U+000C, U+000D, and U+0020
// as whitespace. JavaScript's `\s`/`trim()` also consume characters such as
// NBSP, which browsers parse as author text and can therefore start the body.
const HTML_ASCII_WHITESPACE_ONLY_PATTERN = /^[\t\n\f\r ]*$/u;
const HTML_ASCII_TAG_BOUNDARY_PATTERN = /[\t\n\f\r />]/u;

export const trimHtmlAsciiWhitespace = (value: string) => String(value ?? '')
  .replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/gu, '');

const findHtmlTagEnd = (html: string, start: number) => {
  let quote: '"' | "'" | null = null;
  for (let index = start; index < html.length; index += 1) {
    const character = html[index];
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '>') return index + 1;
  }
  return html.length;
};

const findRawTextElementEnd = (html: string, tagName: string, start: number) => {
  const lowerHtml = html.toLowerCase();
  const closingPrefix = `</${tagName}`;
  let cursor = start;
  while (cursor < html.length) {
    const closingStart = lowerHtml.indexOf(closingPrefix, cursor);
    if (closingStart < 0) return html.length;
    const boundary = html[closingStart + closingPrefix.length] ?? '';
    if (!boundary || HTML_ASCII_TAG_BOUNDARY_PATTERN.test(boundary)) {
      return findHtmlTagEnd(html, closingStart + closingPrefix.length);
    }
    cursor = closingStart + closingPrefix.length;
  }
  return html.length;
};

/**
 * Locates document-level `<html>` / `<head>` start tags without treating HTML-like
 * text inside comments, raw-text elements, or template contents as document tags.
 * This keeps the original source byte-for-byte apart from the injected markup,
 * while following the structural distinction a DOM parser makes for those nodes.
 */
const findHtmlDocumentInsertionPoints = (html: string): HtmlDocumentInsertionPoints => {
  const points: HtmlDocumentInsertionPoints = {
    doctypeEnd: null,
    headStartTagEnd: null,
    htmlStartTagEnd: null,
  };
  const openElements: string[] = [];
  let cursor = 0;
  let templateDepth = 0;
  let bodyStarted = false;
  let headOpportunityClosed = false;

  while (cursor < html.length) {
    const tagStart = html.indexOf('<', cursor);
    if (tagStart < 0) break;

    const hasDocumentOnlyAncestors = openElements.every((element) => element === 'html');
    if (
      templateDepth === 0
      && hasDocumentOnlyAncestors
      && !HTML_ASCII_WHITESPACE_ONLY_PATTERN.test(html.slice(cursor, tagStart))
    ) {
      headOpportunityClosed = true;
    }

    if (html.startsWith('<!--', tagStart)) {
      const commentEnd = html.indexOf('-->', tagStart + 4);
      cursor = commentEnd < 0 ? html.length : commentEnd + 3;
      continue;
    }

    if (/^<!doctype(?:[\t\n\f\r ]|>)/iu.test(html.slice(tagStart, tagStart + 16))) {
      const tagEnd = findHtmlTagEnd(html, tagStart + 2);
      if (!headOpportunityClosed && points.doctypeEnd === null) points.doctypeEnd = tagEnd;
      cursor = tagEnd;
      continue;
    }

    if (html.startsWith('<![CDATA[', tagStart)) {
      const cdataEnd = html.indexOf(']]>', tagStart + 9);
      cursor = cdataEnd < 0 ? html.length : cdataEnd + 3;
      continue;
    }

    if (html[tagStart + 1] === '!' || html[tagStart + 1] === '?') {
      cursor = findHtmlTagEnd(html, tagStart + 2);
      continue;
    }

    const tagMatch = html
      .slice(tagStart)
      .match(/^<(\/?)([A-Za-z][A-Za-z0-9:-]*)(?=[\t\n\f\r ]|\/?>)/u);
    if (!tagMatch) {
      cursor = tagStart + 1;
      continue;
    }

    const isClosingTag = tagMatch[1] === '/';
    const tagName = (tagMatch[2] ?? '').toLowerCase();
    const tagEnd = findHtmlTagEnd(html, tagStart + tagMatch[0].length);

    if (isClosingTag) {
      if (templateDepth === 0 && hasDocumentOnlyAncestors && points.headStartTagEnd === null) {
        headOpportunityClosed = true;
      }
      const matchingIndex = openElements.lastIndexOf(tagName);
      if (matchingIndex >= 0) openElements.splice(matchingIndex);
      if (tagName === 'template' && templateDepth > 0) templateDepth -= 1;
      cursor = tagEnd;
      continue;
    }

    if (templateDepth === 0 && hasDocumentOnlyAncestors) {
      if (tagName === 'html' && !headOpportunityClosed && points.htmlStartTagEnd === null) {
        points.htmlStartTagEnd = tagEnd;
      } else if (
        tagName === 'head'
        && !bodyStarted
        && !headOpportunityClosed
        && points.headStartTagEnd === null
      ) {
        points.headStartTagEnd = tagEnd;
      } else if (tagName === 'body') {
        bodyStarted = true;
        headOpportunityClosed = true;
      } else if (tagName !== 'html' && tagName !== 'head' && points.headStartTagEnd === null) {
        // Any author-level element before an explicit head makes the browser
        // create an implicit head (or start the body). A later <head> token is
        // therefore not a safe CSP insertion point: scripts, base URLs, and
        // stylesheets encountered here may already have taken effect.
        headOpportunityClosed = true;
      }
    }

    const isSelfClosing = /\/[\t\n\f\r ]*>$/u.test(html.slice(tagStart, tagEnd));
    if (tagName === 'template') {
      templateDepth += 1;
      openElements.push(tagName);
    } else if (HTML_RAW_TEXT_ELEMENTS.has(tagName)) {
      cursor = tagName === 'plaintext' ? html.length : findRawTextElementEnd(html, tagName, tagEnd);
      continue;
    } else if (!HTML_VOID_ELEMENTS.has(tagName) && !isSelfClosing) {
      openElements.push(tagName);
    }

    cursor = tagEnd;
  }

  return points;
};

export const injectHeadMarkupIntoHtml = (html: string, headMarkup: string) => {
  const trimmed = trimHtmlAsciiWhitespace(html);
  if (!trimmed) {
    return `<!doctype html><html><head>${headMarkup}</head><body></body></html>`;
  }
  const points = findHtmlDocumentInsertionPoints(trimmed);
  if (points.headStartTagEnd !== null) {
    return `${trimmed.slice(0, points.headStartTagEnd)}${headMarkup}${trimmed.slice(points.headStartTagEnd)}`;
  }
  if (points.htmlStartTagEnd !== null) {
    return `${trimmed.slice(0, points.htmlStartTagEnd)}<head>${headMarkup}</head>${trimmed.slice(points.htmlStartTagEnd)}`;
  }
  if (points.doctypeEnd !== null) {
    return `${trimmed.slice(0, points.doctypeEnd)}<html><head>${headMarkup}</head>${trimmed.slice(points.doctypeEnd)}`;
  }
  return `<!doctype html><html><head>${headMarkup}</head><body>${html}</body></html>`;
};

const buildViewerThemeCss = (theme: PreviewTheme) => {
  const isDark = theme === 'dark';
  return `
    :root {
      color-scheme: ${isDark ? 'dark' : 'light'};
    }
    * { box-sizing: border-box; }
    html, body {
      width: 100%;
      height: auto;
      min-height: 100%;
      margin: 0;
      padding: 0;
      overflow-x: hidden;
      overflow-y: auto;
      background: transparent;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .morndraft-html-viewer {
      display: block;
      width: 100vw;
      height: auto;
      min-height: 100vh;
      margin: 0;
      padding: 0;
      overflow: visible;
      background: transparent;
    }
    .morndraft-html-viewer__viewport {
      width: 100%;
      min-height: 100vh;
      margin: 0 auto;
      overflow: hidden;
    }
    iframe {
      display: block;
      width: 100%;
      height: 100%;
      min-height: 100vh;
      border: 0;
      background: white;
      transform-origin: 0 0;
    }
  `;
};

const buildViewerResizeScript = (id: string) => `
  (function(){
    var SOURCE=${JSON.stringify(HTML_PREVIEW_BRIDGE_SOURCE)};
    var FRAME_ID=${JSON.stringify(id)};
    var iframe=null;
    var viewport=null;
    var lastContentWidth=0;
    var stableHeight=0;
    var WHEEL_LINE_HEIGHT_PX=16;
    function readNodes(){
      iframe=iframe||document.querySelector('iframe[data-morndraft-shared-html-frame="true"]');
      viewport=viewport||document.querySelector('.morndraft-html-viewer__viewport');
      return !!iframe&&!!viewport;
    }
    function num(value){var n=Number(value);return isFinite(n)&&n>0?Math.ceil(n):0;}
    function clamp(value,min,max){return Math.min(max,Math.max(min,value));}
    function normalizeWheelDeltaY(deltaY,deltaMode,pageHeight){
      var value=Number(deltaY);
      if(!isFinite(value))return 0;
      if(deltaMode===1)return value*WHEEL_LINE_HEIGHT_PX;
      if(deltaMode===2)return value*Math.max(1,pageHeight);
      return value;
    }
    function isMostlyHorizontalWheel(deltaX,deltaY){
      return Math.abs(Number(deltaX)||0)>Math.abs(Number(deltaY)||0);
    }
    function handoffWheel(data){
      if(data.ctrlKey||data.metaKey||isMostlyHorizontalWheel(data.deltaX,data.deltaY))return;
      var scrolling=document.scrollingElement||document.documentElement||document.body;
      if(!scrolling)return;
      var deltaY=normalizeWheelDeltaY(data.deltaY,data.deltaMode,scrolling.clientHeight||window.innerHeight||0);
      if(!deltaY)return;
      var maxScrollTop=Math.max(0,(scrolling.scrollHeight||0)-(scrolling.clientHeight||window.innerHeight||0));
      if(maxScrollTop<=0)return;
      var currentScrollTop=window.scrollY||window.pageYOffset||scrolling.scrollTop||0;
      var nextScrollTop=clamp(currentScrollTop+deltaY,0,maxScrollTop);
      if(nextScrollTop===currentScrollTop)return;
      if(scrolling===document.body||scrolling===document.documentElement)window.scrollTo(window.scrollX||window.pageXOffset||0,nextScrollTop);
      else scrolling.scrollTop=nextScrollTop;
    }
    function resize(data){
      if(!readNodes())return;
      var available=Math.max(1,num(window.innerWidth),num(document.documentElement.clientWidth));
      var naturalWidth=num(data.width)||available;
      var naturalHeight=num(data.height)||Math.max(1,num(window.innerHeight));
      var widthKind=data.widthKind==='viewport-feedback'?'viewport-feedback':'content';
      var heightKind=data.heightKind==='viewport-feedback'?'viewport-feedback':'content';
      if(widthKind==='viewport-feedback'&&lastContentWidth>0){naturalWidth=lastContentWidth;widthKind='content';}
      else if(widthKind==='content'){lastContentWidth=naturalWidth;}
      if(heightKind==='viewport-feedback'&&stableHeight>0)naturalHeight=stableHeight;
      else stableHeight=naturalHeight;
      var iframeWidth=widthKind==='viewport-feedback'?available:naturalWidth;
      var scale=naturalWidth>available?available/naturalWidth:1;
      var renderedWidth=Math.min(available,Math.ceil(iframeWidth*scale));
      var renderedHeight=Math.max(1,Math.ceil(naturalHeight*scale));
      viewport.style.width=renderedWidth+'px';
      viewport.style.height=renderedHeight+'px';
      iframe.style.width=iframeWidth+'px';
      iframe.style.height=naturalHeight+'px';
      iframe.style.transform='scale('+scale.toFixed(6)+')';
    }
    window.addEventListener('message',function(event){
      if(!readNodes()||event.source!==iframe.contentWindow)return;
      var data=event.data||{};
      if(data.source!==SOURCE||data.id!==FRAME_ID)return;
      if(data.kind==='wheel'){handoffWheel(data);return;}
      if(data.kind!=='ready'&&data.kind!=='size')return;
      resize(data);
    });
    window.addEventListener('resize',function(){
      if(!readNodes())return;
      try{iframe.contentWindow.postMessage({source:SOURCE,id:FRAME_ID,kind:'measure'},'*');}catch(error){}
    });
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',readNodes,{once:true});
    else readNodes();
  })();
`;

const buildStandaloneViewerWheelBridgeScript = (id: string) => `
<script data-morndraft-inject data-morndraft-standalone-wheel-bridge>(function(){
var SOURCE=${JSON.stringify(HTML_PREVIEW_BRIDGE_SOURCE)};
var FRAME_ID=${JSON.stringify(id)};
var SCROLL_BOUNDARY_EPSILON=1;
function num(value){var n=Number(value);return isFinite(n)?n:0;}
function getElement(target){
  if(!target)return null;
  if(target.nodeType===1)return target;
  return target.parentElement||null;
}
function isMostlyHorizontalWheel(deltaX,deltaY){
  return Math.abs(num(deltaX))>Math.abs(num(deltaY));
}
function isScrollable(element){
  if(!element||!element.style)return false;
  var style=window.getComputedStyle?window.getComputedStyle(element):null;
  if(!style||!/^(auto|scroll)$/.test(style.overflowY))return false;
  return element.scrollHeight-element.clientHeight>SCROLL_BOUNDARY_EPSILON;
}
function findScrollableAncestor(target){
  var body=document.body;
  var html=document.documentElement;
  var current=getElement(target);
  while(current&&current!==body&&current!==html){
    if(isScrollable(current))return current;
    current=current.parentElement;
  }
  return null;
}
function canScroll(element,deltaY){
  var maxScrollTop=Math.max(0,element.scrollHeight-element.clientHeight);
  if(deltaY<0)return element.scrollTop>SCROLL_BOUNDARY_EPSILON;
  if(deltaY>0)return element.scrollTop<maxScrollTop-SCROLL_BOUNDARY_EPSILON;
  return false;
}
function handleWheel(event){
  if(!event||event.defaultPrevented||event.ctrlKey||event.metaKey)return;
  if(isMostlyHorizontalWheel(event.deltaX,event.deltaY))return;
  var deltaY=num(event.deltaY);
  if(!deltaY)return;
  var innerScrollable=findScrollableAncestor(event.target);
  if(innerScrollable&&canScroll(innerScrollable,deltaY))return;
  var documentScroller=document.scrollingElement||document.documentElement;
  if(documentScroller&&canScroll(documentScroller,deltaY))return;
  try{
    window.parent.postMessage({
      source:SOURCE,
      id:FRAME_ID,
      kind:'wheel',
      deltaX:num(event.deltaX),
      deltaY:deltaY,
      deltaMode:num(event.deltaMode),
      ctrlKey:!!event.ctrlKey,
      metaKey:!!event.metaKey
    },'*');
    event.preventDefault();
  }catch(error){}
}
document.addEventListener('wheel',handleWheel,{passive:false});
})();</script>`;

const createStableHtmlPreviewFrameId = (html: string, title: string) => {
  const source = `${title}\n${html}`;
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = ((hash << 5) - hash + source.charCodeAt(index)) | 0;
  }
  return `morndraft-html-${Math.abs(hash).toString(36)}`;
};

export const buildSandboxedHtmlPreviewViewer = ({
  html,
  theme,
  title,
}: {
  html: string;
  theme: PreviewTheme;
  title: string;
}) => {
  const frameId = createStableHtmlPreviewFrameId(html, title);
  const headMarkup = `${buildCspMetaTag(USER_HTML_PREVIEW_COMPAT_CSP)}${buildHtmlPreviewBridgeScript(frameId)}${buildStandaloneViewerWheelBridgeScript(frameId)}`;
  const sandboxedHtml = injectHeadMarkupIntoHtml(html, headMarkup);
  const frame = buildOpaqueSandboxIframe({
    attributes: {
      'data-morndraft-shared-html-frame': 'true',
      referrerpolicy: 'no-referrer',
    },
    srcdoc: sandboxedHtml,
    title,
  });
  return buildPortableDocument({
    body: `<main class="morndraft-html-viewer">
  <div class="morndraft-html-viewer__viewport">
  ${frame}
  </div>
</main>`,
    headBeforeTitle: `<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
${buildCspMetaTag(STATIC_HTML_VIEWER_CSP)}
`,
    headAfterTitle: `<style>${buildViewerThemeCss(theme)}</style>
<script>${buildViewerResizeScript(frameId)}</script>
`,
    language: 'zh-CN',
    title,
  });
};
