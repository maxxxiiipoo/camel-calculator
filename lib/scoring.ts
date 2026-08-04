import { MARKET_CONFIG, VISUAL_RUBRIC, type Level, type TraitObservation, type VisualCategory, type VisualObservation } from "./config.ts";

const levels: Level[] = ["low", "moderate", "prominent", "very_prominent"];
const known = (trait: TraitObservation) => trait.value !== "not_visible" && trait.value !== "unknown" && trait.confidence >= 0.27;

export function nonlinearFit(value: string, preferred: string) {
  const a = levels.indexOf(value as Level);
  const b = levels.indexOf(preferred as Level);
  if (a < 0 || b < 0) return value === preferred ? 1 : 0.45;
  const distance = Math.abs(a - b);
  return [VISUAL_RUBRIC.curves.exact, VISUAL_RUBRIC.curves.adjacent, VISUAL_RUBRIC.curves.twoAway, VISUAL_RUBRIC.curves.threeAway][distance] ?? 0;
}

function weightedVisibleScore(entries: { trait: TraitObservation; preferred: string; weight: number }[]) {
  const visible = entries.filter((entry) => known(entry.trait));
  const totalWeight = visible.reduce((sum, entry) => sum + entry.weight, 0);
  if (!totalWeight) return null;
  return visible.reduce((sum, entry) => sum + nonlinearFit(entry.trait.value, entry.preferred) * (entry.weight / totalWeight), 0) * 100;
}

function calibratedScore(score: number, confidence: number) {
  const confidenceFactor = 0.62 + Math.max(0, Math.min(1, confidence)) * 0.25;
  return Math.max(0, Math.min(100, 50 + (score - 50) * confidenceFactor));
}

function camelsFromScore(score: number) {
  return Math.max(
    VISUAL_RUBRIC.minimumCamelResult,
    Math.min(VISUAL_RUBRIC.maximumCamelResult, Math.round(12 + score * 2.08)),
  );
}

export function scoreObservation(observation: VisualObservation) {
  const p = VISUAL_RUBRIC.preferences;
  const categoryScores: Record<VisualCategory, number | null> = {
    face: weightedVisibleScore([
      { trait: observation.face.apparentSymmetry, preferred: p.apparentSymmetry, weight: 30 },
      { trait: observation.face.featureBalance, preferred: p.featureBalance, weight: 30 },
      { trait: observation.face.expression, preferred: p.expression, weight: 20 },
      { trait: observation.face.eyeAppearance, preferred: p.eyeAppearance, weight: 20 },
    ]),
    body: weightedVisibleScore(Object.entries(VISUAL_RUBRIC.bodyTraitWeights).map(([key, weight]) => ({
      trait: observation.physique[key as keyof typeof observation.physique],
      preferred: p[key as keyof typeof p] as string,
      weight,
    }))),
    hair: weightedVisibleScore([
      { trait: observation.hair.color, preferred: p.hairColors[0], weight: 35 },
      { trait: observation.hair.length, preferred: p.hairLengths[0], weight: 20 },
      { trait: observation.hair.style, preferred: p.hairStyles[0], weight: 25 },
      { trait: observation.hair.presentation, preferred: "prominent", weight: 20 },
    ]),
    style: weightedVisibleScore([
      { trait: observation.style.clothingPresentation, preferred: p.clothingPresentation, weight: 40 },
      { trait: observation.style.grooming, preferred: p.grooming, weight: 30 },
      { trait: observation.style.visualCoordination, preferred: p.visualCoordination, weight: 30 },
    ]),
    coherence: weightedVisibleScore([
      { trait: observation.physique.proportionalBalance, preferred: p.proportionalBalance, weight: 50 },
      { trait: observation.style.visualCoordination, preferred: p.visualCoordination, weight: 50 },
    ]),
  };
  const visibleCategories = (Object.keys(categoryScores) as VisualCategory[]).filter((key) => categoryScores[key] !== null);
  const categoryWeightTotal = visibleCategories.reduce((sum, key) => sum + VISUAL_RUBRIC.categoryWeights[key], 0);
  const rawScore = visibleCategories.reduce((sum, key) => sum + categoryScores[key]! * (VISUAL_RUBRIC.categoryWeights[key] / categoryWeightTotal), 0);
  const harmonyTraits = ["waistDefinition", "hipProminence", "gluteProminence", "chestProminence", "proportionalBalance"] as const;
  const fits = harmonyTraits
    .filter((key) => known(observation.physique[key]))
    .map((key) => nonlinearFit(observation.physique[key].value, p[key]));
  const harmonyBonus = fits.length >= 3 ? Math.min(VISUAL_RUBRIC.proportionHarmonyBonusCap, (fits.reduce((a, b) => a + b, 0) / fits.length) * 5) : 0;
  const score = Math.min(
    VISUAL_RUBRIC.overallScoreCap,
    calibratedScore(rawScore, observation.evidence.overallConfidence) + harmonyBonus * 0.6,
  );
  const camels = camelsFromScore(score);
  const faceCamels = categoryScores.face == null
    ? null
    : camelsFromScore(calibratedScore(categoryScores.face, observation.face.visibility.confidence));
  const bodyCamels = categoryScores.body == null
    ? null
    : camelsFromScore(calibratedScore(categoryScores.body, observation.physique.visibility.confidence));
  const tier = VISUAL_RUBRIC.tiers.find((item) => camels >= item.min && camels <= item.max)!;
  return { score, rawScore, camels, faceCamels, bodyCamels, tier, categoryScores, harmonyBonus, confidence: observation.evidence.overallConfidence, missingTraits: observation.evidence.missingTraits };
}

export function herdEconomics(camels: number) {
  const values = { low: camels * MARKET_CONFIG.lowUsd, reference: camels * MARKET_CONFIG.referenceUsd, high: camels * MARKET_CONFIG.highUsd };
  return { ...values, lowSar: values.low * MARKET_CONFIG.usdToSar, referenceSar: values.reference * MARKET_CONFIG.usdToSar, highSar: values.high * MARKET_CONFIG.usdToSar };
}
