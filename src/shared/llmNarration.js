/**
 * Labelling for text a language model wrote.
 *
 * /api/rank-candidates optionally asks a language model to narrate why a
 * compound ranked where it did, and attaches the result as `reasoning` on each
 * row. Four components rendered that text with nothing to distinguish it from
 * the measured scores beside it, which is the pattern the hypothesis module and
 * the adversarial critique were both removed for: fluent prose about a specific
 * molecule, presented as analysis.
 *
 * rank-candidates was not removed, because the numbers it returns come from the
 * local target-aware model rather than from the language model — only the
 * narration is generated. So the rule here is narrower: wherever that narration
 * is rendered, it must be labelled, and src/methodologyProvenance.test.js fails
 * if a component renders `reasoning` without one.
 *
 * The label deliberately does not say the text is wrong or unreliable. It says
 * who wrote it, which is the thing a reader cannot otherwise tell.
 */

/** Shown wherever model-written narration appears. */
export const LLM_NARRATION_LABEL = "Written by a language model, not measured";

/** Longer form, for places with room for a sentence. */
export const LLM_NARRATION_NOTE =
  "These notes were written by a language model from the scores on this row. " +
  "They are not a measurement and were not checked against any source.";

/**
 * True when a row's displayed reasons came from the model rather than from the
 * locally computed strengths and concerns.
 *
 * The distinction matters: labelling locally computed text as model-written
 * would be its own inaccuracy.
 */
export function isModelNarration(row) {
  return Boolean(row && Array.isArray(row.reasoning) && row.reasoning.length > 0);
}
