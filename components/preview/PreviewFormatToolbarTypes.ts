export type PreviewMarkdownTextFormat =
  | 'bold'
  | 'highlight'
  | 'inlineCode'
  | 'italic'
  | 'strikethrough'
  | 'subscript'
  | 'superscript'
  | 'underline';

export type PreviewMarkdownBlockFormat =
  | 'bulletList'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'h6'
  | 'mixed'
  | 'numberList'
  | 'paragraph'
  | 'quote';

export type PreviewFormatToolbarDisabledReason =
  | 'selection-required'
  | 'upgrade-required'
  | 'unavailable';

export type PreviewFormatToolbarControls = {
  activeTextFormats: Record<PreviewMarkdownTextFormat, boolean>;
  canApplyBlockFormat?: boolean;
  canApplyColor?: boolean;
  canApplyFontFamily?: boolean;
  canApplyFontSize?: boolean;
  canApplyLetterSpacing?: boolean;
  canApplyLineHeight?: boolean;
  canFormat: boolean;
  disabledReason?: PreviewFormatToolbarDisabledReason;
  selectedBlockFormat: PreviewMarkdownBlockFormat;
  selectedColor: string;
  selectedFontFamily: string;
  selectedFontSize: string;
  selectedLetterSpacing: string;
  selectedLineHeight: string;
  supportedTextFormats?: ReadonlySet<PreviewMarkdownTextFormat>;
  onBeforeFormatCommand?: () => void;
  onApplyBlockFormat: (value: PreviewMarkdownBlockFormat) => void;
  onApplyColor: (value: string) => void;
  onApplyFontFamily: (value: string) => void;
  onApplyFontSize: (value: string) => void;
  onApplyLetterSpacing: (value: string) => void;
  onApplyLineHeight: (value: string) => void;
  onToggleFormat: (value: PreviewMarkdownTextFormat) => void;
};

export type PreviewFormatToolbarTranslations = {
  previewBlockFormat: string;
  previewBoldSelection: string;
  previewBulletList: string;
  previewEditSelectionRequired: string;
  previewEditUnavailable: string;
  previewEditUpgradeRequired: string;
  previewFontFamily: string;
  previewFontSize: string;
  previewFormatToolbar: string;
  previewHeading1: string;
  previewHeading2: string;
  previewHeading3: string;
  previewHeading4: string;
  previewHeading5: string;
  previewHeading6: string;
  previewHighlightSelection: string;
  previewItalicSelection: string;
  previewLetterSpacing: string;
  previewLetterSpacingDefault: string;
  previewLetterSpacingLoose: string;
  previewLetterSpacingSoft: string;
  previewLetterSpacingTitle: string;
  previewLineHeight: string;
  previewLineHeightBalanced: string;
  previewLineHeightCompact: string;
  previewLineHeightDefault: string;
  previewLineHeightLoose: string;
  previewMixedBlockFormat: string;
  previewNumberList: string;
  previewParagraph: string;
  previewQuoteBlock: string;
  previewTextColor: string;
  previewUnderlineSelection: string;
};
