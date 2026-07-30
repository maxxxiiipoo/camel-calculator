import {
  CATEGORY_META,
  DEFAULT_WEIGHTS,
  QUESTIONS,
  TIER_CONFIG,
  type CategoryId,
  type PreferenceKey,
} from "./config.ts";

export type Answers = Record<string, number>;
export type Preferences = Partial<Record<PreferenceKey, number | null>>;

export function preferenceFit(answer: number, preference: number | null | undefined, optionCount = 4) {
  if (preference == null) return 1;
  const distance = Math.abs(answer - preference);
  const sigma = Math.max(0.8, optionCount / 3.5);
  return Math.exp(-(distance * distance) / (2 * sigma * sigma));
}

export function normalizeWeights(
  weights: Record<CategoryId, number>,
  skipAppearance: boolean,
) {
  const output = { ...weights };
  if (!skipAppearance) return output;
  const removed = output.physique + output.face;
  output.physique = 0;
  output.face = 0;
  const remaining = 100 - removed;
  (["life", "relationship", "nurturing", "personality"] as CategoryId[]).forEach((key) => {
    output[key] += (output[key] / remaining) * removed;
  });
  return output;
}

export function calculateScore(
  answers: Answers,
  preferences: Preferences,
  weights = DEFAULT_WEIGHTS,
  skipAppearance = false,
) {
  const normalizedWeights = normalizeWeights(weights, skipAppearance);
  const categoryScores = {} as Record<CategoryId, number>;
  (Object.keys(CATEGORY_META) as CategoryId[]).forEach((category) => {
    const questions = QUESTIONS.filter((q) => q.category === category);
    let earned = 0;
    let possible = 0;
    questions.forEach((question) => {
      const value = answers[question.id] ?? 2;
      const fit = question.preference
        ? preferenceFit(value, preferences[question.preference], question.options?.length ?? 4)
        : value / 4;
      earned += fit;
      possible += 1;
    });
    categoryScores[category] = possible ? (earned / possible) * 100 : 0;
  });

  let internalScore = (Object.keys(categoryScores) as CategoryId[]).reduce(
    (sum, key) => sum + categoryScores[key] * (normalizedWeights[key] / 100),
    0,
  );
  const bodyQuestions = QUESTIONS.filter(
    (q) => q.category === "physique" && q.preference,
  );
  const harmony =
    bodyQuestions.reduce(
      (sum, q) =>
        sum + preferenceFit(answers[q.id] ?? 2, preferences[q.preference!], q.options?.length ?? 4),
      0,
    ) / bodyQuestions.length;
  const proportionHarmonyBonus = skipAppearance ? 0 : Math.min(5, harmony * 5);
  const activeScores = (Object.keys(categoryScores) as CategoryId[])
    .filter((key) => normalizedWeights[key] > 0)
    .map((key) => categoryScores[key]);
  const spread = Math.max(...activeScores) - Math.min(...activeScores);
  const wellRoundedBonus = Math.max(0, Math.min(3, (25 - spread) / 8));
  internalScore = Math.min(100, internalScore + proportionHarmonyBonus + wellRoundedBonus);
  const camelCount = Math.max(12, Math.min(220, Math.round(12 + internalScore * 2.08)));
  const hash = Object.keys(answers)
    .sort()
    .reduce((acc, key) => (acc * 31 + answers[key] * key.length) >>> 0, 7);
  const tier = TIER_CONFIG.find((item) => camelCount >= item.min && camelCount <= item.max)!;

  return {
    internalScore,
    camelCount,
    categoryScores,
    proportionHarmonyBonus,
    wellRoundedBonus,
    tier,
    message: tier.messages[hash % tier.messages.length],
  };
}

export function validWeightTotal(weights: Record<CategoryId, number>) {
  return Math.abs(Object.values(weights).reduce((a, b) => a + b, 0) - 100) < 0.001;
}
