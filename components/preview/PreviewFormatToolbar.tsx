import React, { useEffect, useRef, useState } from 'react';
import {
  Bold,
  ChevronDown,
  Heading,
  Highlighter,
  Italic,
  LetterText,
  List,
  ListOrdered,
  Pilcrow,
  Quote,
  Rows3,
  Underline,
} from 'lucide-react';
import type {
  PreviewFormatToolbarControls,
  PreviewFormatToolbarTranslations,
  PreviewMarkdownBlockFormat,
  PreviewMarkdownTextFormat,
} from './PreviewFormatToolbarTypes';

export type {
  PreviewFormatToolbarControls,
  PreviewFormatToolbarDisabledReason,
  PreviewFormatToolbarTranslations,
} from './PreviewFormatToolbarTypes';

const DEFAULT_PREVIEW_FONT_FAMILY =
  '"MornDraft Sans SC", "Noto Sans SC", "Source Han Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';

const PREVIEW_FONT_FAMILY_OPTIONS = [
  { label: '思源黑体', value: DEFAULT_PREVIEW_FONT_FAMILY },
  { label: '思源宋体', value: '"MornDraft Serif SC", "Noto Serif SC", "Source Han Serif SC", "Songti SC", "SimSun", serif' },
];

const DEFAULT_PREVIEW_FONT_SIZE = '16px';

const PREVIEW_FONT_SIZE_OPTIONS = [
  { label: '12', value: '12px' },
  { label: '14', value: '14px' },
  { label: '15', value: '15px' },
  { label: '16', value: '16px' },
  { label: '18', value: '18px' },
  { label: '20', value: '20px' },
  { label: '24', value: '24px' },
];

const PREVIEW_LINE_HEIGHT_OPTIONS = [
  { label: (t: PreviewFormatToolbarTranslations) => t.previewLineHeightDefault, value: '' },
  { label: (t: PreviewFormatToolbarTranslations) => t.previewLineHeightCompact, value: '1.35' },
  { label: (t: PreviewFormatToolbarTranslations) => t.previewLineHeightBalanced, value: '1.5' },
  { label: (t: PreviewFormatToolbarTranslations) => t.previewLineHeightLoose, value: '2' },
];

const PREVIEW_LETTER_SPACING_OPTIONS = [
  { label: (t: PreviewFormatToolbarTranslations) => t.previewLetterSpacingDefault, value: '' },
  { label: (t: PreviewFormatToolbarTranslations) => t.previewLetterSpacingSoft, value: '0.02em' },
  { label: (t: PreviewFormatToolbarTranslations) => t.previewLetterSpacingLoose, value: '0.05em' },
  { label: (t: PreviewFormatToolbarTranslations) => t.previewLetterSpacingTitle, value: '0.08em' },
];

const PREVIEW_TEXT_COLOR_SWATCHES = [
  { label: '黑色', value: '#000000' },
  { label: '深灰', value: '#434343' },
  { label: '灰色', value: '#666666' },
  { label: '浅灰', value: '#999999' },
  { label: '银灰', value: '#CCCCCC' },
  { label: '白色', value: '#FFFFFF' },
  { label: '红色', value: '#FF0000' },
  { label: '橙色', value: '#FF9900' },
  { label: '黄色', value: '#FFFF00' },
  { label: '绿色', value: '#00B050' },
  { label: '青色', value: '#00B0F0' },
  { label: '蓝色', value: '#0070C0' },
  { label: '紫色', value: '#7030A0' },
  { label: '玫红', value: '#C0007A' },
  { label: '深红', value: '#C00000' },
  { label: '棕色', value: '#7F6000' },
  { label: '深绿', value: '#008000' },
  { label: '深青', value: '#008080' },
  { label: '深蓝', value: '#000080' },
  { label: '靛紫', value: '#351C75' },
  { label: '浅红', value: '#F4CCCC' },
  { label: '浅橙', value: '#FCE5CD' },
  { label: '浅黄', value: '#FFF2CC' },
  { label: '浅绿', value: '#D9EAD3' },
  { label: '浅青', value: '#D0E0E3' },
  { label: '浅蓝', value: '#CFE2F3' },
  { label: '浅紫', value: '#D9D2E9' },
  { label: '浅粉', value: '#EAD1DC' },
  { label: '石墨', value: '#1D1D18' },
  { label: '青绿', value: '#244E3A' },
];

const TEXT_FORMAT_BUTTONS = [
  { Icon: Bold, format: 'bold', label: (t: PreviewFormatToolbarTranslations) => t.previewBoldSelection },
  { Icon: Italic, format: 'italic', label: (t: PreviewFormatToolbarTranslations) => t.previewItalicSelection },
  { Icon: Underline, format: 'underline', label: (t: PreviewFormatToolbarTranslations) => t.previewUnderlineSelection },
  { Icon: Highlighter, format: 'highlight', label: (t: PreviewFormatToolbarTranslations) => t.previewHighlightSelection },
] satisfies Array<{
  Icon: typeof Bold;
  format: PreviewMarkdownTextFormat;
  label: (t: PreviewFormatToolbarTranslations) => string;
}>;

const BLOCK_FORMAT_OPTIONS = [
  { Icon: Pilcrow, label: (t: PreviewFormatToolbarTranslations) => t.previewParagraph, value: 'paragraph' },
  { Icon: Heading, label: (t: PreviewFormatToolbarTranslations) => t.previewHeading1, value: 'h1' },
  { Icon: Heading, label: (t: PreviewFormatToolbarTranslations) => t.previewHeading2, value: 'h2' },
  { Icon: Heading, label: (t: PreviewFormatToolbarTranslations) => t.previewHeading3, value: 'h3' },
  { Icon: Heading, label: (t: PreviewFormatToolbarTranslations) => t.previewHeading4, value: 'h4' },
  { Icon: Heading, label: (t: PreviewFormatToolbarTranslations) => t.previewHeading5, value: 'h5' },
  { Icon: Heading, label: (t: PreviewFormatToolbarTranslations) => t.previewHeading6, value: 'h6' },
  { Icon: Quote, label: (t: PreviewFormatToolbarTranslations) => t.previewQuoteBlock, value: 'quote' },
  { Icon: List, label: (t: PreviewFormatToolbarTranslations) => t.previewBulletList, value: 'bulletList' },
  { Icon: ListOrdered, label: (t: PreviewFormatToolbarTranslations) => t.previewNumberList, value: 'numberList' },
] satisfies Array<{
  Icon: typeof Bold;
  label: (t: PreviewFormatToolbarTranslations) => string;
  value: Exclude<PreviewMarkdownBlockFormat, 'mixed'>;
}>;

const getBlockFormatOption = (value: PreviewMarkdownBlockFormat) =>
  BLOCK_FORMAT_OPTIONS.find((option) => option.value === value);

const getBlockFormatLabel = (
  value: PreviewMarkdownBlockFormat,
  t: PreviewFormatToolbarTranslations,
) => (value === 'mixed'
  ? t.previewMixedBlockFormat
  : getBlockFormatOption(value)?.label(t) ?? t.previewParagraph);

const getBlockFormatIcon = (value: PreviewMarkdownBlockFormat) => {
  const Icon = getBlockFormatOption(value)?.Icon ?? Pilcrow;
  return <Icon size={14} />;
};

const isHeadingBlockFormat = (value: PreviewMarkdownBlockFormat) => /^h[1-6]$/.test(value);

const getPrimaryFontFamily = (value: string) =>
  String(value ?? '')
    .split(',')[0]
    ?.replace(/["']/g, '')
    .trim()
    .toLowerCase() ?? '';

const getSelectedFontFamilyOption = (value: string) => {
  const primaryFamily = getPrimaryFontFamily(value || DEFAULT_PREVIEW_FONT_FAMILY);
  return PREVIEW_FONT_FAMILY_OPTIONS.find((option) =>
    getPrimaryFontFamily(option.value) === primaryFamily,
  ) ?? PREVIEW_FONT_FAMILY_OPTIONS[0];
};

export const PreviewFormatToolbar: React.FC<{
  controls?: PreviewFormatToolbarControls;
  t: PreviewFormatToolbarTranslations;
}> = ({ controls, t }) => {
  const [activeMenu, setActiveMenu] =
    useState<'block' | 'color' | 'font' | 'letterSpacing' | 'lineHeight' | 'size' | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const canFormat = Boolean(controls?.canFormat);
  const disabledTitle = controls?.disabledReason === 'upgrade-required'
    ? t.previewEditUpgradeRequired
    : controls?.disabledReason === 'selection-required'
      ? t.previewEditSelectionRequired
      : t.previewEditUnavailable;

  useEffect(() => {
    if (!activeMenu) return undefined;
    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setActiveMenu(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveMenu(null);
    };
    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeMenu]);

  if (!controls) return null;

  const runFormatCommand = (callback: () => void) => {
    controls.onBeforeFormatCommand?.();
    callback();
  };
  const closeThenRun = (callback: () => void) => {
    setActiveMenu(null);
    callback();
  };
  const handleMouseDownCommand = (
    event: React.MouseEvent<HTMLButtonElement>,
    callback: () => void,
  ) => {
    event.preventDefault();
    callback();
  };
  const handleKeyboardClickCommand = (
    event: React.MouseEvent<HTMLButtonElement>,
    callback: () => void,
  ) => {
    if (event.detail === 0) callback();
  };
  const toggleMenu = (nextMenu: Exclude<typeof activeMenu, null>) => {
    controls.onBeforeFormatCommand?.();
    setActiveMenu((menu) => (menu === nextMenu ? null : nextMenu));
  };
  const selectedFontFamilyOption = getSelectedFontFamilyOption(controls.selectedFontFamily);
  const selectedFontFamilyLabel = selectedFontFamilyOption.label;
  const selectedFontSizeLabel = PREVIEW_FONT_SIZE_OPTIONS.find((option) =>
    option.value === controls.selectedFontSize,
  )?.label ?? PREVIEW_FONT_SIZE_OPTIONS.find((option) =>
    option.value === DEFAULT_PREVIEW_FONT_SIZE,
  )?.label ?? '16';
  const selectedLineHeightLabel = PREVIEW_LINE_HEIGHT_OPTIONS.find((option) =>
    option.value === controls.selectedLineHeight,
  )?.label(t) ?? PREVIEW_LINE_HEIGHT_OPTIONS[0].label(t);
  const selectedLetterSpacingLabel = PREVIEW_LETTER_SPACING_OPTIONS.find((option) =>
    option.value === controls.selectedLetterSpacing,
  )?.label(t) ?? PREVIEW_LETTER_SPACING_OPTIONS[0].label(t);
  const selectedColor = controls.selectedColor || PREVIEW_TEXT_COLOR_SWATCHES[0].value;
  const selectedColorLabel = PREVIEW_TEXT_COLOR_SWATCHES.find((swatch) =>
    swatch.value === selectedColor,
  )?.label ?? t.previewTextColor;
  const selectedBlockFormat = controls.selectedBlockFormat || 'paragraph';
  const selectedBlockFormatLabel = getBlockFormatLabel(selectedBlockFormat, t);
  const canApplyFontFamily = canFormat && (controls.canApplyFontFamily ?? true);
  const canApplyFontSize = canFormat && (controls.canApplyFontSize ?? true);
  const canApplyBlockFormat = canFormat && (controls.canApplyBlockFormat ?? true);
  const fontMenuTitle = canApplyFontFamily
    ? `${t.previewFontFamily}: ${selectedFontFamilyLabel}`
    : disabledTitle;

  return (
    <div
      ref={menuRef}
      className="aad-preview-format-toolbar"
      aria-label={t.previewFormatToolbar}
      data-copy-remove="true"
    >
      <div className="aad-toolbar-menu-wrapper aad-preview-format-menu-wrapper aad-preview-format-block-wrapper">
        <button
          type="button"
          className="aad-action-button aad-preview-format-block-button"
          disabled={!canApplyBlockFormat}
          title={canApplyBlockFormat ? `${t.previewBlockFormat}: ${selectedBlockFormatLabel}` : disabledTitle}
          aria-label={canApplyBlockFormat ? `${t.previewBlockFormat}: ${selectedBlockFormatLabel}` : disabledTitle}
          onMouseDown={(event) => handleMouseDownCommand(event, () => toggleMenu('block'))}
          onClick={(event) => handleKeyboardClickCommand(event, () => toggleMenu('block'))}
        >
          {getBlockFormatIcon(selectedBlockFormat)}
          <span>{selectedBlockFormatLabel}</span>
          <ChevronDown size={12} className="aad-action-chevron" />
        </button>
        {activeMenu === 'block' && (
          <div className="aad-toolbar-menu aad-toolbar-menu--block-format" role="menu" aria-label={t.previewBlockFormat}>
            {BLOCK_FORMAT_OPTIONS.map((option) => {
              const Icon = option.Icon;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="menuitem"
                  className="aad-toolbar-menu-item"
                  disabled={!canApplyBlockFormat}
                  aria-pressed={selectedBlockFormat === option.value}
                  onMouseDown={(event) =>
                    handleMouseDownCommand(event, () =>
                      closeThenRun(() => controls.onApplyBlockFormat(option.value)))}
                  onClick={(event) =>
                    handleKeyboardClickCommand(event, () =>
                      closeThenRun(() => controls.onApplyBlockFormat(option.value)))}
                >
                  <Icon size={14} />
                  <span>{option.label(t)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      {TEXT_FORMAT_BUTTONS.map(({ Icon, format, label }) => {
        const buttonLabel = label(t);
        const isActive = Boolean(controls.activeTextFormats[format]);
        const isSupported = controls.supportedTextFormats?.has(format) ?? true;
        const isFormatDisabled = !canFormat || !isSupported || (format === 'bold' && isHeadingBlockFormat(selectedBlockFormat));
        const formatTitle = !canFormat
          ? disabledTitle
          : !isSupported
            ? t.previewEditUnavailable
            : buttonLabel;
        return (
          <button
            key={format}
            type="button"
            className={`aad-action-button aad-action-button--icon ${isActive ? 'is-active' : ''}`.trim()}
            disabled={isFormatDisabled}
            title={formatTitle}
            aria-label={formatTitle}
            aria-pressed={isActive}
            onMouseDown={(event) =>
              handleMouseDownCommand(event, () =>
                runFormatCommand(() => controls.onToggleFormat(format)))}
            onClick={(event) =>
              handleKeyboardClickCommand(event, () =>
                runFormatCommand(() => controls.onToggleFormat(format)))}
          >
            <Icon size={14} />
          </button>
        );
      })}
      <div className="aad-toolbar-menu-wrapper aad-preview-format-menu-wrapper aad-preview-format-font-wrapper">
        <button
          type="button"
          className="aad-action-button aad-preview-format-font-button"
          disabled={!canApplyFontFamily}
          title={fontMenuTitle}
          aria-label={fontMenuTitle}
          onMouseDown={(event) => handleMouseDownCommand(event, () => toggleMenu('font'))}
          onClick={(event) => handleKeyboardClickCommand(event, () => toggleMenu('font'))}
        >
          <span className="aad-preview-font-summary">
            <span className="aad-preview-font-summary-family">{selectedFontFamilyLabel}</span>
          </span>
          <ChevronDown size={12} className="aad-action-chevron" />
        </button>
        {activeMenu === 'font' && (
          <div
            className="aad-toolbar-menu aad-toolbar-menu--font"
            role="menu"
            aria-label={t.previewFontFamily}
          >
            <div className="aad-preview-font-menu-column aad-preview-font-menu-column--family">
              {PREVIEW_FONT_FAMILY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="menuitem"
                  className="aad-toolbar-menu-item"
                  disabled={!canApplyFontFamily}
                  aria-pressed={selectedFontFamilyOption.value === option.value}
                  onMouseDown={(event) =>
                    handleMouseDownCommand(event, () =>
                      closeThenRun(() => controls.onApplyFontFamily(option.value)))}
                  onClick={(event) =>
                    handleKeyboardClickCommand(event, () =>
                      closeThenRun(() => controls.onApplyFontFamily(option.value)))}
                >
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="aad-toolbar-menu-wrapper aad-preview-format-menu-wrapper">
        <button
          type="button"
          className="aad-action-button"
          disabled={!canApplyFontSize}
          title={canApplyFontSize ? t.previewFontSize : disabledTitle}
          aria-label={canApplyFontSize ? t.previewFontSize : disabledTitle}
          onMouseDown={(event) => handleMouseDownCommand(event, () => toggleMenu('size'))}
          onClick={(event) => handleKeyboardClickCommand(event, () => toggleMenu('size'))}
        >
          <span>{selectedFontSizeLabel}</span>
          <ChevronDown size={12} className="aad-action-chevron" />
        </button>
        {activeMenu === 'size' && (
          <div className="aad-toolbar-menu aad-toolbar-menu--size" role="menu">
            {PREVIEW_FONT_SIZE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="menuitem"
                className="aad-toolbar-menu-item"
                disabled={!canApplyFontSize}
                aria-pressed={controls.selectedFontSize === option.value}
                onMouseDown={(event) =>
                  handleMouseDownCommand(event, () =>
                    closeThenRun(() => controls.onApplyFontSize(option.value)))}
                onClick={(event) =>
                  handleKeyboardClickCommand(event, () =>
                    closeThenRun(() => controls.onApplyFontSize(option.value)))}
              >
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="aad-toolbar-menu-wrapper aad-preview-format-menu-wrapper">
        <button
          type="button"
          className="aad-action-button"
          disabled={!canFormat || controls.canApplyLineHeight === false}
          title={canFormat && controls.canApplyLineHeight !== false ? `${t.previewLineHeight}: ${selectedLineHeightLabel}` : disabledTitle}
          aria-label={canFormat && controls.canApplyLineHeight !== false ? `${t.previewLineHeight}: ${selectedLineHeightLabel}` : disabledTitle}
          onMouseDown={(event) => handleMouseDownCommand(event, () => toggleMenu('lineHeight'))}
          onClick={(event) => handleKeyboardClickCommand(event, () => toggleMenu('lineHeight'))}
        >
          <Rows3 size={14} />
          <span>{selectedLineHeightLabel}</span>
          <ChevronDown size={12} className="aad-action-chevron" />
        </button>
        {activeMenu === 'lineHeight' && (
          <div className="aad-toolbar-menu aad-toolbar-menu--line-height" role="menu" aria-label={t.previewLineHeight}>
            {PREVIEW_LINE_HEIGHT_OPTIONS.map((option) => (
              <button
                key={option.value || 'default'}
                type="button"
                role="menuitem"
                className="aad-toolbar-menu-item"
                disabled={!canFormat || controls.canApplyLineHeight === false}
                aria-pressed={controls.selectedLineHeight === option.value}
                onMouseDown={(event) =>
                  handleMouseDownCommand(event, () =>
                    closeThenRun(() => controls.onApplyLineHeight(option.value)))}
                onClick={(event) =>
                  handleKeyboardClickCommand(event, () =>
                    closeThenRun(() => controls.onApplyLineHeight(option.value)))}
              >
                <Rows3 size={14} />
                <span>{option.label(t)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="aad-toolbar-menu-wrapper aad-preview-format-menu-wrapper">
        <button
          type="button"
          className="aad-action-button"
          disabled={!canFormat || controls.canApplyLetterSpacing === false}
          title={canFormat && controls.canApplyLetterSpacing !== false ? `${t.previewLetterSpacing}: ${selectedLetterSpacingLabel}` : disabledTitle}
          aria-label={canFormat && controls.canApplyLetterSpacing !== false ? `${t.previewLetterSpacing}: ${selectedLetterSpacingLabel}` : disabledTitle}
          onMouseDown={(event) => handleMouseDownCommand(event, () => toggleMenu('letterSpacing'))}
          onClick={(event) => handleKeyboardClickCommand(event, () => toggleMenu('letterSpacing'))}
        >
          <LetterText size={14} />
          <span>{selectedLetterSpacingLabel}</span>
          <ChevronDown size={12} className="aad-action-chevron" />
        </button>
        {activeMenu === 'letterSpacing' && (
          <div
            className="aad-toolbar-menu aad-toolbar-menu--letter-spacing"
            role="menu"
            aria-label={t.previewLetterSpacing}
          >
            {PREVIEW_LETTER_SPACING_OPTIONS.map((option) => (
              <button
                key={option.value || 'default'}
                type="button"
                role="menuitem"
                className="aad-toolbar-menu-item"
                disabled={!canFormat || controls.canApplyLetterSpacing === false}
                aria-pressed={controls.selectedLetterSpacing === option.value}
                onMouseDown={(event) =>
                  handleMouseDownCommand(event, () =>
                    closeThenRun(() => controls.onApplyLetterSpacing(option.value)))}
                onClick={(event) =>
                  handleKeyboardClickCommand(event, () =>
                    closeThenRun(() => controls.onApplyLetterSpacing(option.value)))}
              >
                <LetterText size={14} />
                <span>{option.label(t)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="aad-toolbar-menu-wrapper aad-preview-format-menu-wrapper">
        <button
          type="button"
          className="aad-action-button aad-preview-color-button"
          disabled={!canFormat || controls.canApplyColor === false}
          title={canFormat && controls.canApplyColor !== false ? `${t.previewTextColor}: ${selectedColorLabel}` : disabledTitle}
          aria-label={canFormat && controls.canApplyColor !== false ? `${t.previewTextColor}: ${selectedColorLabel}` : disabledTitle}
          onMouseDown={(event) => handleMouseDownCommand(event, () => toggleMenu('color'))}
          onClick={(event) => handleKeyboardClickCommand(event, () => toggleMenu('color'))}
        >
          <span
            className="aad-preview-color-swatch aad-preview-color-current"
            style={{ '--aad-preview-swatch-color': selectedColor } as React.CSSProperties}
            aria-hidden="true"
          />
          <ChevronDown size={12} className="aad-action-chevron" />
        </button>
        {activeMenu === 'color' && (
          <div className="aad-toolbar-menu aad-toolbar-menu--color" role="menu" aria-label={t.previewTextColor}>
            <div className="aad-preview-color-swatches">
              {PREVIEW_TEXT_COLOR_SWATCHES.map((swatch) => (
                <button
                  key={swatch.value}
                  type="button"
                  role="menuitem"
                  className={`aad-preview-color-swatch ${selectedColor === swatch.value ? 'is-selected' : ''}`}
                  style={{ '--aad-preview-swatch-color': swatch.value } as React.CSSProperties}
                  disabled={!canFormat || controls.canApplyColor === false}
                  aria-label={`${t.previewTextColor}: ${swatch.label}`}
                  aria-pressed={selectedColor === swatch.value}
                  title={swatch.label}
                  onMouseDown={(event) =>
                    handleMouseDownCommand(event, () =>
                      closeThenRun(() => controls.onApplyColor(swatch.value)))}
                  onClick={(event) =>
                    handleKeyboardClickCommand(event, () =>
                      closeThenRun(() => controls.onApplyColor(swatch.value)))}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
