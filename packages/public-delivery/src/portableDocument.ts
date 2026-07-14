import {
  escapePortableHtmlAttribute,
  serializePortableHtmlAttributes,
  type PortableHtmlAttributeValue,
} from './sandboxViewer';

export const buildPortableDocument = ({
  body,
  bodyAttributes,
  doctype = '<!doctype html>',
  headAfterTitle = '',
  headBeforeTitle = '',
  htmlAttributes,
  language,
  title,
}: {
  body: string;
  bodyAttributes?: Readonly<Record<string, PortableHtmlAttributeValue>>;
  doctype?: '<!DOCTYPE html>' | '<!doctype html>';
  headAfterTitle?: string;
  headBeforeTitle?: string;
  htmlAttributes?: Readonly<Record<string, PortableHtmlAttributeValue>>;
  language: string;
  title: string;
}) => {
  if (Object.keys(htmlAttributes ?? {}).some(name => name.toLowerCase() === 'lang')) {
    throw new Error('portable document 不允许覆盖 lang 属性。');
  }
  return `${doctype}
<html lang="${escapePortableHtmlAttribute(language)}"${serializePortableHtmlAttributes(htmlAttributes)}>
<head>
${headBeforeTitle}<title>${escapePortableHtmlAttribute(title)}</title>
${headAfterTitle}</head>
<body${serializePortableHtmlAttributes(bodyAttributes)}>
${body}
</body>
</html>`;
};
