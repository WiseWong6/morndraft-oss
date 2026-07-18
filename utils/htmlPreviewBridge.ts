export const HTML_PREVIEW_BRIDGE_SOURCE = 'morndraft-html-preview';

export type HtmlPreviewBridgeWidthKind = 'content' | 'viewport-feedback';
export type HtmlPreviewBridgeHeightKind = 'content' | 'viewport-feedback';

type HtmlPreviewBridgeSizeMessage = {
  height: number;
  heightKind?: HtmlPreviewBridgeHeightKind;
  id: string;
  kind: 'size' | 'ready';
  source: typeof HTML_PREVIEW_BRIDGE_SOURCE;
  width: number;
  widthKind: HtmlPreviewBridgeWidthKind;
};

export type HtmlPreviewSelectionChange = {
  editPath?: string;
  pathTextOccurrenceIndex?: number;
  text: string;
  textOccurrenceIndex: number;
};

export type HtmlPreviewBridgeSelectionMessage = HtmlPreviewSelectionChange & {
  id: string;
  kind: 'selection-change';
  source: typeof HTML_PREVIEW_BRIDGE_SOURCE;
};

export type HtmlPreviewBridgeActivateMessage = {
  id: string;
  kind: 'activate';
  source: typeof HTML_PREVIEW_BRIDGE_SOURCE;
};

export type HtmlPreviewBridgeMessage =
  | HtmlPreviewBridgeSizeMessage
  | HtmlPreviewBridgeActivateMessage
  | HtmlPreviewBridgeSelectionMessage;

const escapeHtmlScript = (value: string) =>
  value.replace(/<\/script/gi, '<\\/script');

const asRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' ? value as Record<string, unknown> : null
);

const readPositiveNumber = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.ceil(number) : 0;
};

export const isHtmlPreviewBridgeMessage = (
  value: unknown,
  expectedId: string,
): value is HtmlPreviewBridgeMessage => {
  const data = asRecord(value);
  if (!data) return false;
  if (data.source !== HTML_PREVIEW_BRIDGE_SOURCE || data.id !== expectedId) return false;
  if (
    data.kind !== 'size' &&
    data.kind !== 'ready' &&
    data.kind !== 'activate' &&
    data.kind !== 'selection-change'
  ) return false;
  if (data.kind === 'activate') return true;
  if (data.kind === 'selection-change') {
    return typeof data.text === 'string' &&
      typeof data.textOccurrenceIndex === 'number' &&
      (data.editPath === undefined || typeof data.editPath === 'string') &&
      (data.pathTextOccurrenceIndex === undefined || typeof data.pathTextOccurrenceIndex === 'number');
  }
  if (data.widthKind !== 'content' && data.widthKind !== 'viewport-feedback') return false;
  if (
    data.heightKind !== undefined &&
    data.heightKind !== 'content' &&
    data.heightKind !== 'viewport-feedback'
  ) return false;
  return readPositiveNumber(data.width) > 0 && readPositiveNumber(data.height) > 0;
};

export const buildHtmlPreviewBridgeScript = (id: string, nonce?: string) => {
  const source = JSON.stringify(HTML_PREVIEW_BRIDGE_SOURCE);
  const frameId = JSON.stringify(id);
  const nonceAttribute = nonce && /^[A-Za-z0-9_-]{8,128}$/.test(nonce) ? ` nonce="${nonce}"` : '';
  return `<script data-morndraft-inject data-morndraft-html-preview-bridge${nonceAttribute}>(function(){
var SOURCE=${source};
var FRAME_ID=${frameId};
var raf=0;
var last='';
var lastHeight=0;
var lastHeightKind='content';
var lastViewportHeight=0;
var MORNDRAFT_FLAT_EDIT_PATH_ATTR='data-morndraft-edit-path';
var MAX_SELECTION_TEXT_LENGTH=300;
var selectionRaf=0;
var lastSelectionSignature='';
var FULLSCREEN_STYLE_ATTR='data-morndraft-html-preview-fullscreen-style';
function num(value){var n=Number(value);return isFinite(n)&&n>0?Math.ceil(n):0;}
function resolveExtent(contentExtent,scrollExtent,rectExtent,viewportExtent,minExtent){
  var tolerance=160;
  var content=num(contentExtent);
  var scroll=num(scrollExtent);
  var rect=num(rectExtent);
  var viewport=num(viewportExtent);
  var result=Math.max(1,num(minExtent)||1,content);
  function isViewportFeedback(extent){
    if(viewport<=0||content<=0||content>=extent)return false;
    var viewportDelta=Math.abs(extent-viewport);
    return viewportDelta<=1||(content<=viewport&&viewportDelta<=tolerance);
  }
  if(scroll>0&&!isViewportFeedback(scroll))result=Math.max(result,scroll);
  if(rect>0&&!isViewportFeedback(rect))result=Math.max(result,rect);
  return result;
}
	function post(kind,payload){try{window.parent.postMessage(Object.assign({},payload||{},{source:SOURCE,kind:kind,id:FRAME_ID}),'*');}catch(error){}}
	function clearSearchHighlight(){
	  Array.prototype.forEach.call(document.querySelectorAll('[data-morndraft-search-overlay]'),function(element){element.remove();});
	}
	function isSearchTextNodeVisible(node){
	  var parent=node&&node.parentElement;
	  if(!parent)return false;
	  if(parent.closest&&parent.closest('[data-morndraft-inject],[data-morndraft-search-overlay],script,style,template,input,textarea,select,option,[hidden],[aria-hidden="true"]'))return false;
	  var style=window.getComputedStyle?window.getComputedStyle(parent):null;
	  return !style||(style.display!=='none'&&style.visibility!=='hidden'&&style.opacity!=='0');
	}
	function normalizeSelectionText(value){return String(value||'').replace(/\\s+/g,' ').trim();}
	function countNormalizedOccurrences(value,needle){
	  var haystack=normalizeSelectionText(value).toLowerCase();
	  var normalizedNeedle=normalizeSelectionText(needle).toLowerCase();
	  if(!normalizedNeedle)return 0;
	  var count=0;
	  var offset=0;
	  while(offset<haystack.length){
	    var found=haystack.indexOf(normalizedNeedle,offset);
	    if(found<0)break;
	    count+=1;
	    offset=found+Math.max(1,normalizedNeedle.length);
	  }
	  return count;
	}
	function countOccurrencesBefore(root,range,text){
	  if(!root||!range||!text||!document.createRange)return 0;
	  try{
	    var beforeRange=document.createRange();
	    beforeRange.selectNodeContents(root);
	    beforeRange.setEnd(range.startContainer,range.startOffset);
	    return countNormalizedOccurrences(beforeRange.toString(),text);
	  }catch(error){return 0;}
	}
	function getElementFromSelectionNode(node){
	  if(!node)return null;
	  return node.nodeType===1?node:node.parentElement;
	}
	function closestMornDraftEditTarget(node){
	  var element=getElementFromSelectionNode(node);
	  return element&&element.closest?element.closest(getMornDraftEditSelector()):null;
	}
	function getSelectionEditTarget(selection,range){
	  var anchorTarget=closestMornDraftEditTarget(selection.anchorNode);
	  var focusTarget=closestMornDraftEditTarget(selection.focusNode);
	  if(anchorTarget&&focusTarget&&anchorTarget===focusTarget)return anchorTarget;
	  return closestMornDraftEditTarget(range.commonAncestorContainer);
	}
	function postSelectionPayload(payload){
	  var signature=[payload.text,payload.textOccurrenceIndex,payload.editPath||'',payload.pathTextOccurrenceIndex||0].join('|');
	  if(signature===lastSelectionSignature)return;
	  lastSelectionSignature=signature;
	  post('selection-change',payload);
	}
	function reportPointerSelectionTarget(event){
	  post('activate');
	  var editTarget=closestMornDraftEditTarget(event&&event.target);
	  var payload={text:'',textOccurrenceIndex:0};
	  if(editTarget&&editTarget.getAttribute){
	    var editPath=editTarget.getAttribute(MORNDRAFT_FLAT_EDIT_PATH_ATTR);
	    if(editPath){
	      payload.editPath=editPath;
	      payload.pathTextOccurrenceIndex=0;
	    }
	  }
	  postSelectionPayload(payload);
	}
	function reportSelectionChange(){
	  selectionRaf=0;
	  var selection=document.getSelection&&document.getSelection();
	  if(!selection||selection.isCollapsed||!selection.rangeCount)return;
	  var text=normalizeSelectionText(selection.toString());
	  if(!text)return;
	  var range=selection.getRangeAt(0);
	  var editTarget=getSelectionEditTarget(selection,range);
	  var editPath=editTarget&&editTarget.getAttribute?editTarget.getAttribute(MORNDRAFT_FLAT_EDIT_PATH_ATTR):'';
	  var visibleText=text.length>MAX_SELECTION_TEXT_LENGTH?'':text;
	  var payload={
	    text:visibleText,
	    textOccurrenceIndex:visibleText?countOccurrencesBefore(document.body||document.documentElement,range,visibleText):0
	  };
	  if(editPath){
	    payload.editPath=editPath;
	    payload.pathTextOccurrenceIndex=visibleText?countOccurrencesBefore(editTarget,range,visibleText):0;
	  }
	  postSelectionPayload(payload);
	}
	function scheduleSelectionChange(){
	  if(selectionRaf)window.cancelAnimationFrame(selectionRaf);
	  selectionRaf=window.requestAnimationFrame(reportSelectionChange);
	}
	function appendSearchRect(overlay,rect,index,activeIndex){
	  if(!rect||rect.width<=0||rect.height<=0)return;
	  var hit=document.createElement('span');
	  hit.setAttribute('data-morndraft-search-hit','true');
	  hit.style.cssText=[
	    'position:absolute',
	    'left:'+(rect.left+window.scrollX)+'px',
	    'top:'+(rect.top+window.scrollY)+'px',
	    'width:'+rect.width+'px',
	    'height:'+rect.height+'px',
	    'border-radius:3px',
	    'background:'+(index===activeIndex?'rgba(234,179,8,.42)':'rgba(234,179,8,.24)'),
	    'box-shadow:'+(index===activeIndex?'0 0 0 1px rgba(202,138,4,.55)':'0 0 0 1px rgba(234,179,8,.26)'),
	    'pointer-events:none'
	  ].join(';');
	  overlay.appendChild(hit);
	}
	function highlightSearch(query,activeIndex){
	  clearSearchHighlight();
	  var needle=String(query||'').trim().toLowerCase();
	  if(!needle||!document.body||!document.createRange||!document.createTreeWalker)return;
	  var overlay=document.createElement('div');
	  overlay.setAttribute('data-morndraft-inject','true');
	  overlay.setAttribute('data-morndraft-search-overlay','true');
	  overlay.setAttribute('aria-hidden','true');
	  overlay.style.cssText='position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;z-index:2147483647;';
	  var index=0;
	  var active=Number(activeIndex);
	  if(!isFinite(active)||active<0)active=0;
	  var activeElement=null;
	  var walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,{
	    acceptNode:function(node){return isSearchTextNodeVisible(node)&&String(node.textContent||'').trim()?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT;}
	  });
	  var node=walker.nextNode();
	  while(node&&index<100){
	    var text=String(node.textContent||'');
	    var haystack=text.toLowerCase();
	    var offset=0;
	    while(index<100){
	      var found=haystack.indexOf(needle,offset);
	      if(found<0)break;
	      var range=document.createRange();
	      range.setStart(node,found);
	      range.setEnd(node,found+needle.length);
	      Array.prototype.forEach.call(range.getClientRects(),function(rect){appendSearchRect(overlay,rect,index,active);});
	      if(index===active)activeElement=node.parentElement||activeElement;
	      index+=1;
	      offset=found+Math.max(1,needle.length);
	    }
	    node=walker.nextNode();
	  }
	  if(overlay.childNodes.length){
	    document.body.appendChild(overlay);
	    if(activeElement&&activeElement.scrollIntoView){
	      try{activeElement.scrollIntoView({block:'center',inline:'nearest'});}catch(error){activeElement.scrollIntoView();}
	    }
	  }
	}
function isContentElement(element){
  if(!element||element.nodeType!==1)return false;
  var tag=String(element.tagName||'').toLowerCase();
  if(/^(script|style|link|meta|title|base)$/.test(tag))return false;
  if(element.hasAttribute&&element.hasAttribute('data-morndraft-inject'))return false;
  if(element.closest&&element.closest('.no-print,[hidden],[aria-hidden="true"]'))return false;
  var rect=element.getBoundingClientRect();
  return !!rect&&(rect.width>0||rect.height>0);
}
function hasClippingOverflow(style){
  if(!style)return false;
  return /^(auto|clip|hidden|scroll)$/.test(style.overflow)||/^(auto|clip|hidden|scroll)$/.test(style.overflowX)||/^(auto|clip|hidden|scroll)$/.test(style.overflowY);
}
function clipRectToVisibleAncestors(element,rect,body,html){
  if(!rect||(rect.width===0&&rect.height===0))return null;
  var top=rect.top,bottom=rect.bottom,left=rect.left,right=rect.right;
  var current=element&&element.parentElement;
  while(current&&current!==body&&current!==html){
    var style=window.getComputedStyle?window.getComputedStyle(current):null;
    if(hasClippingOverflow(style)){
      var clip=current.getBoundingClientRect();
      top=Math.max(top,clip.top);
      bottom=Math.min(bottom,clip.bottom);
      left=Math.max(left,clip.left);
      right=Math.min(right,clip.right);
      if(bottom<=top||right<=left)return null;
    }
    current=current.parentElement;
  }
  return {top:top,bottom:bottom,left:left,right:right,width:Math.max(0,right-left),height:Math.max(0,bottom-top)};
}
function measure(){
  var body=document.body;
  var html=document.documentElement;
  if(!body||!html)return null;
  var viewportWidth=num(window.innerWidth||html.clientWidth||body.clientWidth);
  var viewportHeight=num(window.innerHeight||html.clientHeight||body.clientHeight);
  var minLeft=0,maxRight=0,minTop=0,maxBottom=0,maxWidth=0,hasRect=false;
  var elements=body.getElementsByTagName('*');
  for(var index=0;index<elements.length;index+=1){
    var element=elements[index];
    if(!isContentElement(element))continue;
    var rect=clipRectToVisibleAncestors(element,element.getBoundingClientRect(),body,html);
    if(!rect)continue;
    if(!hasRect){minLeft=rect.left;maxRight=rect.right;minTop=rect.top;maxBottom=rect.bottom;hasRect=true;}
    else{minLeft=Math.min(minLeft,rect.left);maxRight=Math.max(maxRight,rect.right);minTop=Math.min(minTop,rect.top);maxBottom=Math.max(maxBottom,rect.bottom);}
    maxWidth=Math.max(maxWidth,rect.width);
  }
  var visualWidth=hasRect?maxRight-minLeft:0;
  var visualHeight=hasRect?maxBottom-minTop:0;
  var scrollWidth=Math.max(num(body.scrollWidth),num(html.scrollWidth));
  var scrollHeight=Math.max(num(body.scrollHeight),num(html.scrollHeight));
  var bodyRect=body.getBoundingClientRect?body.getBoundingClientRect():null;
  var htmlRect=html.getBoundingClientRect?html.getBoundingClientRect():null;
  var rectHeight=Math.max(num(bodyRect&&bodyRect.height),num(htmlRect&&htmlRect.height));
  var width=Math.max(1,num(maxWidth),num(visualWidth));
  if(scrollWidth>viewportWidth+1)width=Math.max(width,scrollWidth);
  var height=resolveExtent(visualHeight,scrollHeight,rectHeight,viewportHeight,1);
  var heightKind='content';
  if(lastHeight>0&&lastViewportHeight>0){
    var heightDelta=height-lastHeight;
    var viewportDelta=viewportHeight-lastViewportHeight;
    if(heightDelta>0&&viewportDelta>0&&Math.abs(heightDelta-viewportDelta)<=2)heightKind='viewport-feedback';
    else if(lastHeightKind==='viewport-feedback'&&Math.abs(height-lastHeight)<=2&&Math.abs(viewportHeight-lastViewportHeight)<=2)heightKind='viewport-feedback';
  }
  var widthKind=width<=viewportWidth+1&&maxWidth>=viewportWidth-1?'viewport-feedback':'content';
  lastHeight=height;
  lastHeightKind=heightKind;
  lastViewportHeight=viewportHeight;
  return {width:width,height:height,widthKind:widthKind,heightKind:heightKind};
}
function report(kind){
  var size=measure();
  if(!size)return;
  var signature=size.width+'x'+size.height+':'+size.widthKind+':'+size.heightKind+':'+kind;
  if(signature===last&&kind==='size')return;
  last=signature;
  post(kind,size);
}
function schedule(kind){
  if(raf)return;
  raf=window.requestAnimationFrame(function(){raf=0;report(kind||'size');});
}
function getMornDraftEditSelector(){
  return '['+MORNDRAFT_FLAT_EDIT_PATH_ATTR+']';
}
function ensureFullscreenStyle(){
  if(document.querySelector&&document.querySelector('style['+FULLSCREEN_STYLE_ATTR+']'))return;
  var style=document.createElement('style');
  style.setAttribute('data-morndraft-inject','true');
  style.setAttribute(FULLSCREEN_STYLE_ATTR,'true');
  style.textContent=[
    'html[data-morndraft-preview-fullscreen="true"],html[data-morndraft-preview-fullscreen="true"] body{width:100%!important;height:100%!important;min-height:0!important;overflow-x:hidden!important;overflow-y:auto!important;}',
    'html[data-morndraft-preview-fullscreen="true"] body{max-width:none!important;}',
    'html[data-morndraft-preview-fullscreen="true"] .morndraft-html-fragment-viewport,html[data-morndraft-preview-fullscreen="true"] .morndraft-html-fragment-content{width:100%!important;min-height:100%!important;height:auto!important;max-width:100%!important;overflow:visible!important;box-sizing:border-box!important;}',
    'html[data-morndraft-preview-fullscreen="true"] img,html[data-morndraft-preview-fullscreen="true"] svg,html[data-morndraft-preview-fullscreen="true"] canvas,html[data-morndraft-preview-fullscreen="true"] video,html[data-morndraft-preview-fullscreen="true"] iframe,html[data-morndraft-preview-fullscreen="true"] table{max-width:100%!important;}'
  ].join('');
  (document.head||document.documentElement).appendChild(style);
}
function setFullscreenMode(active){
  var html=document.documentElement;
  if(!html)return;
  ensureFullscreenStyle();
  if(active)html.setAttribute('data-morndraft-preview-fullscreen','true');
  else html.removeAttribute('data-morndraft-preview-fullscreen');
  schedule('size');
}
window.addEventListener('message',function(event){
  var data=event.data||{};
  if(data.source!==SOURCE||data.id!==FRAME_ID)return;
	  if(data.kind==='measure')schedule('size');
	  else if(data.kind==='fullscreen-change')setFullscreenMode(!!data.active);
	  else if(data.kind==='search-highlight-request')highlightSearch(data.query,typeof data.activeIndex==='number'?data.activeIndex:0);
	  else if(data.kind==='search-highlight-clear')clearSearchHighlight();
	});
document.addEventListener('selectionchange',scheduleSelectionChange);
document.addEventListener('pointerdown',reportPointerSelectionTarget,true);
document.addEventListener('pointerup',scheduleSelectionChange,true);
document.addEventListener('keyup',scheduleSelectionChange,true);
function bind(){
  report('ready');
  schedule('size');
  if(typeof ResizeObserver!=='undefined'){
    var resizeObserver=new ResizeObserver(function(){schedule('size');});
    resizeObserver.observe(document.documentElement);
    if(document.body)resizeObserver.observe(document.body);
  }
  if(typeof MutationObserver!=='undefined'){
    var mutationObserver=new MutationObserver(function(){schedule('size');});
    mutationObserver.observe(document.documentElement,{attributes:true,childList:true,subtree:true,attributeFilter:['class','style','height','width','src','href']});
  }
  Array.prototype.forEach.call(document.images||[],function(image){
    image.addEventListener('load',function(){schedule('size');});
    image.addEventListener('error',function(){schedule('size');});
  });
  if(document.fonts&&document.fonts.ready){document.fonts.ready.then(function(){schedule('size');},function(){schedule('size');});}
  [50,150,300,700,1200,2400,3600].forEach(function(ms){window.setTimeout(function(){schedule('size');},ms);});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});
else bind();
window.addEventListener('load',function(){schedule('size');});
window.addEventListener('resize',function(){schedule('size');});
})();</script>`.replace(
    /<script data-morndraft-inject data-morndraft-html-preview-bridge>([\s\S]*)<\/script>/,
    (_match, script) =>
      `<script data-morndraft-inject data-morndraft-html-preview-bridge>${escapeHtmlScript(script)}</script>`,
  );
};
