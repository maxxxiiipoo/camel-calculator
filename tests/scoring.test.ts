import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_WEIGHTS, QUESTIONS, TIER_CONFIG } from "../lib/config.ts";
import { calculateScore, normalizeWeights, preferenceFit, validWeightTotal } from "../lib/scoring.ts";

const lowAnswers = Object.fromEntries(QUESTIONS.map((q) => [q.id, 0]));
const highAnswers = Object.fromEntries(QUESTIONS.map((q) => [q.id, 4]));
const middleAnswers = Object.fromEntries(QUESTIONS.map((q) => [q.id, 2]));

test("default weights total exactly 100", () => assert.equal(validWeightTotal(DEFAULT_WEIGHTS), true));
test("score and camel output stay within bounds", () => {
  for (const answers of [lowAnswers, middleAnswers, highAnswers]) {
    const result = calculateScore(answers, {});
    assert.ok(result.internalScore >= 0 && result.internalScore <= 100);
    assert.ok(result.camelCount >= 12 && result.camelCount <= 220);
  }
});
test("preference matching is nonlinear and peaks at configured preference", () => {
  const exact = preferenceFit(2, 2), adjacent = preferenceFit(3, 2), distant = preferenceFit(0, 2);
  assert.equal(exact, 1); assert.ok(exact > adjacent); assert.ok(adjacent > distant);
  assert.notEqual(exact - adjacent, adjacent - distant);
});
test("no preference makes all options neutral", () => {
  assert.equal(preferenceFit(0, null), 1); assert.equal(preferenceFit(3, null), 1);
});
test("skipping appearance redistributes weight and preserves 100 total", () => {
  const redistributed = normalizeWeights(DEFAULT_WEIGHTS, true);
  assert.equal(redistributed.physique, 0); assert.equal(redistributed.face, 0);
  assert.ok(Math.abs(Object.values(redistributed).reduce((a, b) => a + b, 0) - 100) < 0.001);
});
test("identical inputs produce deterministic results", () => {
  assert.deepEqual(calculateScore(middleAnswers, { hips: 2, hair: 1 }), calculateScore(middleAnswers, { hips: 2, hair: 1 }));
});
test("bonuses are capped and overall result remains capped", () => {
  const result = calculateScore(highAnswers, {});
  assert.ok(result.proportionHarmonyBonus <= 5); assert.ok(result.wellRoundedBonus <= 3); assert.ok(result.camelCount <= 220);
});
test("result tiers cover every camel boundary without gaps", () => {
  assert.equal(TIER_CONFIG[0].min, 12); assert.equal(TIER_CONFIG.at(-1)?.max, 220);
  TIER_CONFIG.slice(1).forEach((tier, i) => assert.equal(tier.min, TIER_CONFIG[i].max + 1));
});
test("complete quiz input yields all six category scores", () => {
  const result = calculateScore(middleAnswers, {});
  assert.equal(Object.keys(result.categoryScores).length, 6); assert.ok(Number.isFinite(result.camelCount));
});
