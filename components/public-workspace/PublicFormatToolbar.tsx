import React, { useMemo } from 'react';
import { PreviewFormatToolbar } from '../preview/PreviewFormatToolbar';
import type {
  PreviewFormatToolbarControls,
  PreviewFormatToolbarTranslations,
  PreviewMarkdownBlockFormat,
  PreviewMarkdownTextFormat,
} from '../preview/PreviewFormatToolbarTypes';
import type { PublicTextSelection, PublicWorkspaceLocale } from './types';

const SUPPORTED_PUBLIC_TEXT_FORMATS = new Set<PreviewMarkdownTextFormat>(['bold', 'italic']);

const EMPTY_PUBLIC_TEXT_FORMATS: Record<PreviewMarkdownTextFormat, boolean> = {
  bold: false,
  highlight: false,
  inlineCode: false,
  italic: false,
  strikethrough: false,
  subscript: false,
  superscript: false,
  underline: false,
};

const getFormatLabels = (locale: PublicWorkspaceLocale): PreviewFormatToolbarTranslations => locale === 'zh' ? {
  previewBlockFormat: '段落格式',
  previewBoldSelection: '加粗选区',
  previewBulletList: '项目列表',
  previewEditSelectionRequired: '请先在最终效果中选择文字',
  previewEditUnavailable: '当前公开版暂不支持此格式',
  previewEditUpgradeRequired: '当前不可用',
  previewFontFamily: '字体',
  previewFontSize: '字号',
  previewFormatToolbar: '交付编辑工具',
  previewHeading1: '标题 1',
  previewHeading2: '标题 2',
  previewHeading3: '标题 3',
  previewHeading4: '标题 4',
  previewHeading5: '标题 5',
  previewHeading6: '标题 6',
  previewHighlightSelection: '高亮选区',
  previewItalicSelection: '斜体选区',
  previewLetterSpacing: '字间距',
  previewLetterSpacingDefault: '默认',
  previewLetterSpacingLoose: '宽松',
  previewLetterSpacingSoft: '轻微',
  previewLetterSpacingTitle: '标题',
  previewLineHeight: '行间距',
  previewLineHeightBalanced: '均衡',
  previewLineHeightCompact: '紧凑',
  previewLineHeightDefault: '正文默认',
  previewLineHeightLoose: '宽松',
  previewMixedBlockFormat: '混合',
  previewNumberList: '编号列表',
  previewParagraph: '正文',
  previewQuoteBlock: '引用',
  previewTextColor: '文字颜色',
  previewUnderlineSelection: '下划线选区',
} : {
  previewBlockFormat: 'Block format',
  previewBoldSelection: 'Bold selection',
  previewBulletList: 'Bullet list',
  previewEditSelectionRequired: 'Select text in Final first',
  previewEditUnavailable: 'This format is not available in the public edition',
  previewEditUpgradeRequired: 'Unavailable',
  previewFontFamily: 'Font',
  previewFontSize: 'Size',
  previewFormatToolbar: 'Final view editing tools',
  previewHeading1: 'Heading 1',
  previewHeading2: 'Heading 2',
  previewHeading3: 'Heading 3',
  previewHeading4: 'Heading 4',
  previewHeading5: 'Heading 5',
  previewHeading6: 'Heading 6',
  previewHighlightSelection: 'Highlight selection',
  previewItalicSelection: 'Italic selection',
  previewLetterSpacing: 'Letter spacing',
  previewLetterSpacingDefault: 'Default',
  previewLetterSpacingLoose: 'Loose',
  previewLetterSpacingSoft: 'Soft',
  previewLetterSpacingTitle: 'Title',
  previewLineHeight: 'Line height',
  previewLineHeightBalanced: 'Balanced',
  previewLineHeightCompact: 'Compact',
  previewLineHeightDefault: 'Body default',
  previewLineHeightLoose: 'Loose',
  previewMixedBlockFormat: 'Mixed',
  previewNumberList: 'Numbered list',
  previewParagraph: 'Body',
  previewQuoteBlock: 'Quote',
  previewTextColor: 'Text color',
  previewUnderlineSelection: 'Underline selection',
};

const getSelectedLineRange = (source: string, selection: PublicTextSelection) => {
  const start = Math.max(0, Math.min(selection.start, source.length));
  const end = Math.max(start, Math.min(selection.end, source.length));
  const lineStart = source.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const nextLineBreak = source.indexOf('\n', end);
  return {
    start: lineStart,
    end: nextLineBreak < 0 ? source.length : nextLineBreak,
  };
};

const getSelectedBlockFormat = (
  source: string,
  selection: PublicTextSelection | null,
): PreviewMarkdownBlockFormat => {
  if (!selection) return 'paragraph';
  const range = getSelectedLineRange(source, selection);
  const line = source.slice(range.start, range.end);
  const heading = /^ {0,3}(#{1,6})[ \t]+/u.exec(line);
  if (heading) return `h${heading[1].length}` as PreviewMarkdownBlockFormat;
  if (/^ {0,3}>[ \t]?/u.test(line)) return 'quote';
  if (/^ {0,3}[-+*][ \t]+/u.test(line)) return 'bulletList';
  if (/^ {0,3}\d+[.)][ \t]+/u.test(line)) return 'numberList';
  return 'paragraph';
};

const stripPublicBlockPrefix = (line: string) => line
  .replace(/^ {0,3}#{1,6}[ \t]+/u, '')
  .replace(/^ {0,3}>[ \t]?/u, '')
  .replace(/^ {0,3}(?:[-+*]|\d+[.)])[ \t]+/u, '');

const applyPublicBlockFormat = (
  source: string,
  selection: PublicTextSelection,
  format: PreviewMarkdownBlockFormat,
) => {
  const range = getSelectedLineRange(source, selection);
  const lines = source.slice(range.start, range.end).split('\n');
  const nextLines = lines.map((line, index) => {
    const content = stripPublicBlockPrefix(line);
    if (format === 'paragraph' || format === 'mixed') return content;
    if (/^h[1-6]$/u.test(format)) return `${'#'.repeat(Number(format.slice(1)))} ${content}`;
    if (format === 'quote') return `> ${content}`;
    if (format === 'bulletList') return `- ${content}`;
    return `${index + 1}. ${content}`;
  });
  return `${source.slice(0, range.start)}${nextLines.join('\n')}${source.slice(range.end)}`;
};

const applyPublicTextFormat = (
  source: string,
  selection: PublicTextSelection,
  format: PreviewMarkdownTextFormat,
) => {
  const delimiter = format === 'bold' ? '**' : format === 'italic' ? '_' : null;
  if (!delimiter) return source;
  const start = Math.max(0, Math.min(selection.start, source.length));
  const end = Math.max(start, Math.min(selection.end, source.length));
  if (start === end) return source;
  const hasWrapper = source.slice(Math.max(0, start - delimiter.length), start) === delimiter
    && source.slice(end, end + delimiter.length) === delimiter;
  if (hasWrapper) {
    return `${source.slice(0, start - delimiter.length)}${source.slice(start, end)}${source.slice(end + delimiter.length)}`;
  }
  return `${source.slice(0, start)}${delimiter}${source.slice(start, end)}${delimiter}${source.slice(end)}`;
};

export const PublicFormatToolbar: React.FC<{
  canFormat: boolean;
  documentKind: 'html' | 'json' | 'markdown' | 'mermaid';
  includeA4Pagination: boolean;
  isEditing: boolean;
  locale: PublicWorkspaceLocale;
  selection: PublicTextSelection | null;
  showCode: boolean;
  source: string;
  onEditingChange(next: boolean): void;
  onIncludeA4PaginationChange(next: boolean): void;
  onShowCodeChange(next: boolean): void;
  onSourceChange(next: string): void;
}> = ({
  canFormat,
  documentKind,
  includeA4Pagination,
  isEditing,
  locale,
  selection,
  showCode,
  source,
  onEditingChange,
  onIncludeA4PaginationChange,
  onShowCodeChange,
  onSourceChange,
}) => {
  const activeTextFormats = useMemo(() => {
    if (!selection || selection.source !== source) return EMPTY_PUBLIC_TEXT_FORMATS;
    const { start, end } = selection;
    return {
      ...EMPTY_PUBLIC_TEXT_FORMATS,
      bold: source.slice(Math.max(0, start - 2), start) === '**' && source.slice(end, end + 2) === '**',
      italic: source.slice(Math.max(0, start - 1), start) === '_' && source.slice(end, end + 1) === '_',
    };
  }, [selection, source]);
  const controls = useMemo<PreviewFormatToolbarControls>(() => ({
    activeTextFormats,
    canApplyBlockFormat: canFormat,
    canApplyColor: false,
    canApplyFontFamily: false,
    canApplyFontSize: false,
    canApplyLetterSpacing: false,
    canApplyLineHeight: false,
    canFormat,
    disabledReason: canFormat ? undefined : 'selection-required',
    selectedBlockFormat: getSelectedBlockFormat(source, selection),
    selectedColor: '#000000',
    selectedFontFamily: '"MornDraft Sans SC", "Noto Sans SC", "Source Han Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
    selectedFontSize: '16px',
    selectedLetterSpacing: '',
    selectedLineHeight: '',
    supportedTextFormats: SUPPORTED_PUBLIC_TEXT_FORMATS,
    onApplyBlockFormat: (format) => {
      if (selection) onSourceChange(applyPublicBlockFormat(source, selection, format));
    },
    onApplyColor: () => undefined,
    onApplyFontFamily: () => undefined,
    onApplyFontSize: () => undefined,
    onApplyLetterSpacing: () => undefined,
    onApplyLineHeight: () => undefined,
    onToggleFormat: (format) => {
      if (selection) onSourceChange(applyPublicTextFormat(source, selection, format));
    },
  }), [activeTextFormats, canFormat, onSourceChange, selection, source]);

  return (
    <>
      <PreviewFormatToolbar controls={controls} t={getFormatLabels(locale)} />
      <div className="md-public-display-controls" aria-label={locale === 'zh' ? '交付显示选项' : 'Final display options'}>
        {documentKind !== 'markdown' && documentKind !== 'mermaid' && (
          <button
            type="button"
            className="aad-action-button md-public-final-edit-toggle"
            aria-pressed={isEditing}
            onClick={() => onEditingChange(!isEditing)}
          >
            {isEditing
              ? (locale === 'zh' ? '预览' : 'Preview')
              : (locale === 'zh' ? '编辑' : 'Edit')}
          </button>
        )}
        <button
          type="button"
          className="md-public-switch"
          role="switch"
          aria-checked={includeA4Pagination}
          onClick={() => onIncludeA4PaginationChange(!includeA4Pagination)}
        >
          <span>{locale === 'zh' ? '分页' : 'Pages'}</span>
          <i aria-hidden="true" />
        </button>
        <button
          type="button"
          className="md-public-switch"
          role="switch"
          aria-checked={showCode}
          onClick={() => onShowCodeChange(!showCode)}
        >
          <span>{locale === 'zh' ? '代码' : 'Code'}</span>
          <i aria-hidden="true" />
        </button>
      </div>
    </>
  );
};

export default PublicFormatToolbar;
