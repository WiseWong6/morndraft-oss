import { waitForElementAssets } from './htmlScreenshotCaptureFrame';

export const captureElementInSequentialPages = async <Page>({
  backgroundColor,
  captureHeight,
  capturePage,
  captureWidth,
  element,
  pageCount,
  pageHeight,
}: {
  backgroundColor: string;
  captureHeight: number;
  capturePage: (stage: HTMLElement, pageHeight: number) => Promise<Page>;
  captureWidth: number;
  element: HTMLElement;
  pageCount: number;
  pageHeight: number;
}): Promise<Page[]> => {
  const doc = element.ownerDocument;
  const stage = doc.createElement('section');
  stage.setAttribute('data-morndraft-image-capture-page', 'true');
  stage.style.cssText = [
    'position:fixed',
    'left:-100000px',
    'top:0',
    `width:${captureWidth}px`,
    `height:${pageHeight}px`,
    'min-width:0',
    'min-height:0',
    'overflow:hidden',
    'box-sizing:border-box',
    `background:${backgroundColor}`,
    'pointer-events:none',
  ].join(';');

  const pageContent = doc.createElement('div');
  pageContent.setAttribute('data-morndraft-image-capture-content', 'true');
  pageContent.style.cssText = [
    'position:absolute',
    'left:0',
    'top:0',
    `width:${captureWidth}px`,
    'max-width:none',
    'margin:0',
    'transform:none',
    'transform-origin:0 0',
  ].join(';');
  const contentClone = element.cloneNode(true) as HTMLElement;
  contentClone.style.setProperty('width', `${captureWidth}px`);
  contentClone.style.setProperty('max-width', 'none');
  contentClone.style.setProperty('margin', '0');
  pageContent.appendChild(contentClone);
  stage.appendChild(pageContent);
  doc.body.appendChild(stage);

  const clonedCanvases = contentClone.querySelectorAll('canvas');
  element.querySelectorAll('canvas').forEach((sourceCanvas, index) => {
    const clonedCanvas = clonedCanvases[index];
    if (!clonedCanvas) return;
    clonedCanvas.width = sourceCanvas.width;
    clonedCanvas.height = sourceCanvas.height;
    clonedCanvas.getContext('2d')?.drawImage(sourceCanvas, 0, 0);
  });

  try {
    await waitForElementAssets(stage);
    const pages: Page[] = [];
    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
      const offset = pageIndex * pageHeight;
      const currentPageHeight = Math.min(pageHeight, captureHeight - offset);
      stage.style.height = `${currentPageHeight}px`;
      pageContent.style.top = `${-offset}px`;
      pages.push(await capturePage(stage, currentPageHeight));
    }
    return pages;
  } finally {
    stage.remove();
  }
};
