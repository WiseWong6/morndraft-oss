/**
 * AI instruction length contract shared by the API validator and the
 * preview editor. Keeping both sides on the same constants avoids the
 * front-end letting a too-long instruction reach the server only to be
 * rejected (a wasted network round-trip and AI quota window).
 *
 * Pure runtime-agnostic constants + predicate, safe for both Node (API)
 * and the browser (preview editor).
 */

export const AI_INSTRUCTION_MIN_TEXT = 2;
export const AI_INSTRUCTION_MAX_TEXT = 2_000;
export const AI_ARTIFACT_INSTRUCTION_MAX_TEXT = 200_000;

export const isValidAiInstructionLength = (length) =>
  Number.isInteger(length) &&
  length >= AI_INSTRUCTION_MIN_TEXT &&
  length <= AI_INSTRUCTION_MAX_TEXT;

export const isValidAiArtifactInstructionLength = (length) =>
  Number.isInteger(length) &&
  length >= AI_INSTRUCTION_MIN_TEXT &&
  length <= AI_ARTIFACT_INSTRUCTION_MAX_TEXT;
