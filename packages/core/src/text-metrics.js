const CJK_OR_KANA_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const EMOJI_RE = /\p{Extended_Pictographic}/u;
const WHITESPACE_RE = /\s/u;

const getGraphemes = (text) => {
  if (!text) return [];

  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    return Array.from(segmenter.segment(text), (segment) => segment.segment);
  }

  return Array.from(text);
};

export const countCharacters = (text) => getGraphemes(text).length;

export const estimateTokenCount = (text) => {
  const graphemes = getGraphemes(text);
  let denseTokenCharacters = 0;
  let looseCharacters = 0;

  for (const grapheme of graphemes) {
    if (WHITESPACE_RE.test(grapheme)) continue;

    if (CJK_OR_KANA_RE.test(grapheme) || EMOJI_RE.test(grapheme)) {
      denseTokenCharacters += 1;
      continue;
    }

    looseCharacters += 1;
  }

  if (denseTokenCharacters === 0 && looseCharacters === 0) return 0;

  return Math.ceil(denseTokenCharacters * 1.5) + Math.ceil(looseCharacters / 4);
};

export const getEditorTextMetrics = (text) => ({
  characters: countCharacters(text),
  estimatedTokens: estimateTokenCount(text),
});

export const formatCompactCount = (count) => {
  const absCount = Math.abs(count);
  const units = [
    { threshold: 1_000_000_000, suffix: 'b' },
    { threshold: 1_000_000, suffix: 'm' },
    { threshold: 1000, suffix: 'k' },
  ];
  const unit = units.find((entry) => absCount >= entry.threshold);
  if (!unit) return `${count}`;

  const compactValue = count / unit.threshold;
  const absCompactValue = Math.abs(compactValue);
  const formatted = absCompactValue >= 10 ? Math.round(compactValue).toString() : compactValue.toFixed(1);
  return `${formatted.replace(/\.0$/, '')}${unit.suffix}`;
};
