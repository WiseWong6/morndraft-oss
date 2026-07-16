import React, { useId } from 'react';
import type { PublicWorkspaceLocale } from './types';

export type PublicFormatCommand =
  | { kind: 'block'; format: 'paragraph' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'quote' | 'bulletList' | 'numberList' }
  | { kind: 'inline'; format: 'bold' | 'italic' | 'underline' | 'highlight' }
  | { kind: 'style'; style: Partial<Record<'color' | 'fontFamily' | 'fontSize' | 'letterSpacing' | 'lineHeight', string>> };

type PublicBlockFormat = Extract<PublicFormatCommand, { kind: 'block' }>['format'];

const FONT_FAMILIES = [
  { labelEn: 'Sans', labelZh: '黑体', value: '"MornDraft Sans SC", "Noto Sans SC", "Source Han Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif' },
  { labelEn: 'Serif', labelZh: '宋体', value: '"MornDraft Serif SC", "Noto Serif SC", "Source Han Serif SC", "Songti SC", "SimSun", serif' },
];

const FONT_SIZES = ['12px', '14px', '15px', '16px', '18px', '20px', '24px'];
const COLORS = [
  '#000000', '#434343', '#666666', '#999999', '#CCCCCC', '#FFFFFF',
  '#FF0000', '#FF9900', '#FFFF00', '#00B050', '#00B0F0', '#0070C0',
  '#7030A0', '#C0007A', '#C00000', '#7F6000', '#008000', '#008080',
  '#000080', '#351C75', '#F4CCCC', '#FCE5CD', '#FFF2CC', '#D9EAD3',
  '#D0E0E3', '#CFE2F3', '#D9D2E9', '#EAD1DC', '#1D1D18', '#244E3A',
];

const BLOCK_OPTIONS = [
  ['paragraph', '段落', 'Paragraph'],
  ['h1', '标题 1', 'Heading 1'],
  ['h2', '标题 2', 'Heading 2'],
  ['h3', '标题 3', 'Heading 3'],
  ['h4', '标题 4', 'Heading 4'],
  ['h5', '标题 5', 'Heading 5'],
  ['h6', '标题 6', 'Heading 6'],
  ['quote', '引用', 'Quote'],
  ['bulletList', '项目列表', 'Bullet list'],
  ['numberList', '编号列表', 'Numbered list'],
] as const;

const keepSelectionOnPointerDown = (event: React.MouseEvent<HTMLButtonElement>) => event.preventDefault();

export const PublicFormatToolbar: React.FC<{
  canApplyBlockFormat: boolean;
  canFormat: boolean;
  locale: PublicWorkspaceLocale;
  onCommand(command: PublicFormatCommand): void;
}> = ({ canApplyBlockFormat, canFormat, locale, onCommand }) => {
  const labelId = useId();
  const labels = locale === 'zh' ? {
    toolbar: '格式工具条',
    selection: '请先在最终效果中选择可逆 Markdown 文本',
    block: '段落格式',
    bold: '粗体',
    italic: '斜体',
    underline: '下划线',
    highlight: '高亮',
    font: '字体',
    size: '字号',
    color: '文字颜色',
    lineHeight: '行高',
    letterSpacing: '字间距',
    default: '默认',
  } : {
    toolbar: 'Format toolbar',
    selection: 'Select reversible Markdown text in Final first',
    block: 'Block format',
    bold: 'Bold',
    italic: 'Italic',
    underline: 'Underline',
    highlight: 'Highlight',
    font: 'Font',
    size: 'Size',
    color: 'Text color',
    lineHeight: 'Line height',
    letterSpacing: 'Letter spacing',
    default: 'Default',
  };
  const title = canFormat ? labels.toolbar : labels.selection;

  return (
    <div className="md-public-format-toolbar" role="toolbar" aria-labelledby={labelId} title={title} data-public-format-toolbar="true">
      <span id={labelId} className="md-public-sr-only">{labels.toolbar}</span>
      <label>
        <span>{labels.block}</span>
        <select
          aria-label={labels.block}
          disabled={!canApplyBlockFormat}
          defaultValue="__choose__"
          onChange={(event) => {
            const value = event.currentTarget.value;
            if (value !== '__choose__') onCommand({ kind: 'block', format: value as PublicBlockFormat });
            event.currentTarget.value = '__choose__';
          }}
        >
          <option value="__choose__">{labels.block}</option>
          {BLOCK_OPTIONS.map(([value, zh, en]) => <option key={value} value={value}>{locale === 'zh' ? zh : en}</option>)}
        </select>
      </label>
      {([
        ['bold', 'B', labels.bold],
        ['italic', 'I', labels.italic],
        ['underline', 'U', labels.underline],
        ['highlight', 'H', labels.highlight],
      ] as const).map(([format, glyph, label]) => (
        <button
          key={format}
          type="button"
          disabled={!canFormat}
          aria-label={label}
          title={canFormat ? label : labels.selection}
          onMouseDown={keepSelectionOnPointerDown}
          onClick={() => onCommand({ kind: 'inline', format })}
        >{glyph}</button>
      ))}
      <label>
        <span>{labels.font}</span>
        <select aria-label={labels.font} disabled={!canFormat} defaultValue="__choose__" onChange={(event) => {
          const value = event.currentTarget.value;
          if (value !== '__choose__') onCommand({ kind: 'style', style: { fontFamily: value } });
          event.currentTarget.value = '__choose__';
        }}>
          <option value="__choose__">{labels.font}</option>
          <option value="">{labels.default}</option>
          {FONT_FAMILIES.map((option) => <option key={option.value} value={option.value}>{locale === 'zh' ? option.labelZh : option.labelEn}</option>)}
        </select>
      </label>
      <label>
        <span>{labels.size}</span>
        <select aria-label={labels.size} disabled={!canFormat} defaultValue="__choose__" onChange={(event) => {
          const value = event.currentTarget.value;
          if (value !== '__choose__') onCommand({ kind: 'style', style: { fontSize: value } });
          event.currentTarget.value = '__choose__';
        }}>
          <option value="__choose__">{labels.size}</option>
          <option value="">{labels.default}</option>
          {FONT_SIZES.map((value) => <option key={value} value={value}>{value.replace('px', '')}</option>)}
        </select>
      </label>
      <label>
        <span>{labels.color}</span>
        <select aria-label={labels.color} disabled={!canFormat} defaultValue="__choose__" onChange={(event) => {
          const value = event.currentTarget.value;
          if (value !== '__choose__') onCommand({ kind: 'style', style: { color: value } });
          event.currentTarget.value = '__choose__';
        }}>
          <option value="__choose__">{labels.color}</option>
          <option value="">{labels.default}</option>
          {COLORS.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      <label>
        <span>{labels.lineHeight}</span>
        <select aria-label={labels.lineHeight} disabled={!canFormat} defaultValue="__choose__" onChange={(event) => {
          const value = event.currentTarget.value;
          if (value !== '__choose__') onCommand({ kind: 'style', style: { lineHeight: value } });
          event.currentTarget.value = '__choose__';
        }}>
          <option value="__choose__">{labels.lineHeight}</option>
          <option value="">{labels.default}</option>
          {['1.35', '1.5', '2'].map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      <label>
        <span>{labels.letterSpacing}</span>
        <select aria-label={labels.letterSpacing} disabled={!canFormat} defaultValue="__choose__" onChange={(event) => {
          const value = event.currentTarget.value;
          if (value !== '__choose__') onCommand({ kind: 'style', style: { letterSpacing: value } });
          event.currentTarget.value = '__choose__';
        }}>
          <option value="__choose__">{labels.letterSpacing}</option>
          <option value="">{labels.default}</option>
          {['0.02em', '0.05em', '0.08em'].map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
    </div>
  );
};
