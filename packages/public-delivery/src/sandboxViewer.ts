export type PortableHtmlAttributeValue = boolean | number | string | null | undefined;

export const OPAQUE_SANDBOX_IFRAME_POLICY = 'allow-scripts';

export const escapePortableHtmlAttribute = (value: string) => value
  .replace(/&/gu, '&amp;')
  .replace(/</gu, '&lt;')
  .replace(/>/gu, '&gt;')
  .replace(/"/gu, '&quot;')
  .replace(/'/gu, '&#39;');

const assertPortableAttributeName = (name: string) => {
  if (!/^[a-z][a-z0-9_.:-]*$/iu.test(name) || /^on/iu.test(name)) {
    throw new Error(`不安全的 HTML 属性名：${name}`);
  }
};

const isOpaqueIframeMechanicalAttribute = (name: string) => (
  /^(?:aria-|data-)[a-z0-9_.:-]+$/iu.test(name)
  || /^(?:height|id|loading|referrerpolicy|tabindex|width)$/iu.test(name)
);

export const serializePortableHtmlAttributes = (
  attributes: Readonly<Record<string, PortableHtmlAttributeValue>> = {},
) => Object.entries(attributes).map(([name, value]) => {
  assertPortableAttributeName(name);
  if (value === false || value === null || value === undefined) return '';
  if (value === true) return ` ${name}`;
  return ` ${name}="${escapePortableHtmlAttribute(String(value))}"`;
}).join('');

type OpaqueSandboxIframeOptions = {
  attributes?: Readonly<Record<string, PortableHtmlAttributeValue>>;
  className?: string;
  sandbox?: never;
  srcdoc: string;
  title: string;
};

export const buildOpaqueSandboxIframe = (options: OpaqueSandboxIframeOptions) => {
  const unsafeSandbox = (options as { sandbox?: unknown }).sandbox;
  if (unsafeSandbox !== undefined) {
    throw new Error('opaque iframe 的 sandbox 策略不可覆盖。');
  }
  const attributes = options.attributes ?? {};
  for (const name of Object.keys(attributes)) {
    if (!isOpaqueIframeMechanicalAttribute(name)) {
      throw new Error(`opaque iframe 不允许使用 ${name} 属性。`);
    }
  }
  const classAttribute = options.className
    ? ` class="${escapePortableHtmlAttribute(options.className)}"`
    : '';
  return `<iframe${classAttribute} title="${escapePortableHtmlAttribute(options.title)}"${serializePortableHtmlAttributes(attributes)} sandbox="${OPAQUE_SANDBOX_IFRAME_POLICY}" srcdoc="${escapePortableHtmlAttribute(options.srcdoc)}"></iframe>`;
};
