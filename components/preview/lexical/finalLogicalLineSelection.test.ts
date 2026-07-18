import assert from 'node:assert/strict';
import test from 'node:test';
import {
  $createLineBreakNode,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  createEditor,
} from 'lexical';
import {
  $createListItemNode,
  $createListNode,
  ListItemNode,
  ListNode,
} from '@lexical/list';
import {
  $createHeadingNode,
  $createQuoteNode,
  HeadingNode,
  QuoteNode,
} from '@lexical/rich-text';
import {
  $createTableCellNode,
  $createTableNode,
  $createTableRowNode,
  TableCellNode,
  TableNode,
  TableRowNode,
} from '@lexical/table';
import {
  $selectFinalLogicalLine,
  shouldHandleFinalLogicalLineDoubleClick,
} from './finalLogicalLineSelection';

const createSelectionTestEditor = () => createEditor({
  namespace: 'final-logical-line-selection-test',
  nodes: [
    HeadingNode,
    ListItemNode,
    ListNode,
    QuoteNode,
    TableCellNode,
    TableNode,
    TableRowNode,
  ],
  onError: (error) => {
    throw error;
  },
});

const getSelectedText = () => {
  const selection = $getSelection();
  assert.ok($isRangeSelection(selection));
  assert.equal(selection.isCollapsed(), false);
  return selection.getTextContent();
};

test('Final logical line selection covers paragraphs across inline formatting and hard line breaks', () => {
  const editor = createSelectionTestEditor();
  let selectedText = '';
  editor.update(() => {
    const paragraph = $createParagraphNode();
    const first = $createTextNode('A long ').toggleFormat('bold');
    const last = $createTextNode('logical line').toggleFormat('italic');
    paragraph.append(first, $createLineBreakNode(), last);
    $getRoot().append(paragraph);
    assert.equal($selectFinalLogicalLine(last), true);
    selectedText = getSelectedText();
  }, { discrete: true });
  assert.equal(selectedText, 'A long \nlogical line');
});

test('Final logical line selection supports headings and quotes', () => {
  const editor = createSelectionTestEditor();
  const selectedTexts: string[] = [];
  editor.update(() => {
    const headingText = $createTextNode('Heading');
    const heading = $createHeadingNode('h2').append(headingText);
    const quoteText = $createTextNode('Quote');
    const quote = $createQuoteNode().append(quoteText);
    $getRoot().append(heading, quote);
    assert.equal($selectFinalLogicalLine(headingText), true);
    selectedTexts.push(getSelectedText());
    assert.equal($selectFinalLogicalLine(quoteText), true);
    selectedTexts.push(getSelectedText());
  }, { discrete: true });
  assert.deepEqual(selectedTexts, ['Heading', 'Quote']);
});

test('Final logical line selection keeps parent and nested list items isolated', () => {
  const editor = createSelectionTestEditor();
  const selectedTexts: string[] = [];
  editor.update(() => {
    const parentFirst = $createTextNode('parent ');
    const parentLast = $createTextNode('formatted').toggleFormat('bold');
    const childText = $createTextNode('child');
    const childItem = $createListItemNode().append(childText);
    const nestedList = $createListNode('bullet').append(childItem);
    const parentItem = $createListItemNode().append(parentFirst, parentLast, nestedList);
    $getRoot().append($createListNode('bullet').append(parentItem));

    assert.equal($selectFinalLogicalLine(parentLast), true);
    selectedTexts.push(getSelectedText());
    assert.equal($selectFinalLogicalLine(childText), true);
    selectedTexts.push(getSelectedText());
  }, { discrete: true });
  assert.deepEqual(selectedTexts, ['parent formatted', 'child']);
});

test('Final logical line selection ignores empty paragraphs and table cell text', () => {
  const editor = createSelectionTestEditor();
  editor.update(() => {
    const emptyParagraph = $createParagraphNode();
    const tableText = $createTextNode('table cell');
    const tableParagraph = $createParagraphNode().append(tableText);
    const tableCell = $createTableCellNode().append(tableParagraph);
    const tableRow = $createTableRowNode().append(tableCell);
    $getRoot().append(emptyParagraph, $createTableNode().append(tableRow));

    assert.equal($selectFinalLogicalLine(emptyParagraph), false);
    assert.equal($selectFinalLogicalLine(tableText), false);
  }, { discrete: true });
});

test('Final logical line double click only handles plain primary-button mouse gestures', () => {
  const input = {
    altKey: false,
    button: 0,
    ctrlKey: false,
    detail: 2,
    isProtectedTarget: false,
    metaKey: false,
    pointerType: 'mouse',
    shiftKey: false,
  } as const;
  assert.equal(shouldHandleFinalLogicalLineDoubleClick(input), true);
  assert.equal(shouldHandleFinalLogicalLineDoubleClick({ ...input, button: 1 }), false);
  assert.equal(shouldHandleFinalLogicalLineDoubleClick({ ...input, ctrlKey: true }), false);
  assert.equal(shouldHandleFinalLogicalLineDoubleClick({ ...input, detail: 1 }), false);
  assert.equal(shouldHandleFinalLogicalLineDoubleClick({ ...input, isProtectedTarget: true }), false);
  assert.equal(shouldHandleFinalLogicalLineDoubleClick({ ...input, pointerType: 'touch' }), false);
});
