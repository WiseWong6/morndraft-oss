import assert from 'node:assert/strict';
import test from 'node:test';

import { absolutizePortableElementUrls } from './portableHtml';

class FakeFragment {
  constructor(readonly children: FakeElement[]) {}

  querySelectorAll() {
    return collectRegularDescendants(this.children);
  }

  serialize() {
    return this.children.map(child => child.outerHTML).join('');
  }
}

class FakeElement {
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[];
  readonly content?: FakeFragment;
  textContent: string | null;

  constructor(
    readonly tagName: string,
    options: {
      attributes?: Readonly<Record<string, string>>;
      children?: FakeElement[];
      content?: FakeFragment;
      textContent?: string;
    } = {},
  ) {
    Object.entries(options.attributes ?? {}).forEach(([name, value]) => this.attributes.set(name, value));
    this.children = options.children ?? [];
    this.content = options.content;
    this.textContent = options.textContent ?? null;
  }

  get outerHTML() {
    const attributes = Array.from(this.attributes, ([name, value]) => ` ${name}="${value}"`).join('');
    const body = this.tagName.toLowerCase() === 'template'
      ? this.content?.serialize() ?? ''
      : this.textContent ?? this.children.map(child => child.outerHTML).join('');
    return `<${this.tagName.toLowerCase()}${attributes}>${body}</${this.tagName.toLowerCase()}>`;
  }

  getAttribute(name: string) {
    return this.attributes.get(name) ?? null;
  }

  querySelectorAll() {
    return collectRegularDescendants(this.children);
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }
}

const collectRegularDescendants = (children: readonly FakeElement[]): FakeElement[] => children.flatMap(child => [
  child,
  ...collectRegularDescendants(child.children),
]);

const asElement = (element: FakeElement) => element as unknown as Element;

const makeOwnerDocument = () => {
  class FixtureDomParser {
    parseFromString(html: string) {
      assert.equal(html, '<img src="./frame.png">');
      const frameImage = new FakeElement('img', { attributes: { src: './frame.png' } });
      const documentElement = new FakeElement('html', {
        children: [new FakeElement('body', { children: [frameImage] })],
      });
      return {
        doctype: null,
        documentElement,
        querySelector: () => null,
        querySelectorAll: () => [] as FakeElement[],
      };
    }
  }

  return {
    defaultView: { DOMParser: FixtureDomParser },
  } as unknown as Document;
};

test('portable URL rewriting descends through nested template content', () => {
  const image = new FakeElement('img', {
    attributes: {
      src: './image.png',
      srcset: './image-small.png 1x, ./image-large.png 2x',
      style: 'background-image:url(./background.png)',
    },
  });
  const style = new FakeElement('style', {
    textContent: '@import "./theme.css"; .card{mask-image:url(./mask.svg)}',
  });
  const frame = new FakeElement('iframe', {
    attributes: { srcdoc: '<img src="./frame.png">' },
  });
  const nestedImage = new FakeElement('img', {
    attributes: { src: '../nested.png' },
  });
  const nestedTemplate = new FakeElement('template', {
    content: new FakeFragment([nestedImage]),
  });
  const template = new FakeElement('template', {
    content: new FakeFragment([image, style, frame, nestedTemplate]),
  });
  const root = new FakeElement('main', { children: [template] });
  const ownerDocument = makeOwnerDocument();

  absolutizePortableElementUrls(
    asElement(root),
    'https://example.test/articles/current/',
    ownerDocument,
  );

  assert.equal(image.getAttribute('src'), 'https://example.test/articles/current/image.png');
  assert.equal(
    image.getAttribute('srcset'),
    'https://example.test/articles/current/image-small.png 1x, https://example.test/articles/current/image-large.png 2x',
  );
  assert.equal(
    image.getAttribute('style'),
    'background-image:url("https://example.test/articles/current/background.png")',
  );
  assert.equal(
    style.textContent,
    '@import url("https://example.test/articles/current/theme.css"); .card{mask-image:url("https://example.test/articles/current/mask.svg")}',
  );
  assert.match(
    frame.getAttribute('srcdoc') ?? '',
    /src="https:\/\/example\.test\/articles\/current\/frame\.png"/u,
  );
  assert.equal(nestedImage.getAttribute('src'), 'https://example.test/articles/nested.png');
});
