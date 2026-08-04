export type Level = "not_visible" | "low" | "moderate" | "prominent" | "very_prominent";
export type VisualCategory = "face" | "body" | "hair" | "style" | "coherence";

export type TraitObservation = {
  value: Level | string;
  confidence: number;
  note?: string;
};

export type VisualObservation = {
  face: {
    visibility: TraitObservation;
    apparentSymmetry: TraitObservation;
    featureBalance: TraitObservation;
    expression: TraitObservation;
    eyeVisibility: TraitObservation;
    eyeAppearance: TraitObservation;
  };
  hair: {
    color: TraitObservation;
    length: TraitObservation;
    texture: TraitObservation;
    style: TraitObservation;
    presentation: TraitObservation;
  };
  physique: {
    visibility: TraitObservation;
    build: TraitObservation;
    waistDefinition: TraitObservation;
    chestProminence: TraitObservation;
    hipProminence: TraitObservation;
    gluteProminence: TraitObservation;
    proportionalBalance: TraitObservation;
    posture: TraitObservation;
  };
  style: {
    clothingPresentation: TraitObservation;
    grooming: TraitObservation;
    visualCoordination: TraitObservation;
  };
  evidence: {
    faceCoverage: number;
    bodyCoverage: number;
    obstruction: Level;
    lightingAdequacy: Level;
    blur: Level;
    usableViews: number;
    overallConfidence: number;
    missingTraits: string[];
    adultConfidence: number;
    appropriate: boolean;
  };
};

export const VISUAL_RUBRIC = {
  version: "visual-rubric-1.0",
  categoryWeights: { face: 35, body: 40, hair: 10, style: 10, coherence: 5 },
  bodyTraitWeights: {
    proportionalBalance: 30,
    waistDefinition: 20,
    hipProminence: 15,
    gluteProminence: 15,
    chestProminence: 10,
    build: 5,
    posture: 5,
  },
  preferences: {
    apparentSymmetry: "prominent",
    featureBalance: "prominent",
    expression: "prominent",
    eyeAppearance: "prominent",
    hairColors: ["blonde", "light_brown"],
    hairLengths: ["long", "very_long"],
    hairStyles: ["wavy", "styled"],
    build: "moderate",
    waistDefinition: "prominent",
    chestProminence: "prominent",
    hipProminence: "prominent",
    gluteProminence: "prominent",
    proportionalBalance: "prominent",
    posture: "prominent",
    clothingPresentation: "prominent",
    grooming: "prominent",
    visualCoordination: "prominent",
  },
  curves: { exact: 1, adjacent: 0.78, twoAway: 0.42, threeAway: 0.16 },
  minimumCamelResult: 12,
  maximumCamelResult: 220,
  minimumAdultConfidence: 0.75,
  proportionHarmonyBonusCap: 5,
  overallScoreCap: 100,
  tiers: [
    { min: 12, max: 39, title: "Wandering Dromedary" },
    { min: 40, max: 69, title: "Oasis Favorite" },
    { min: 70, max: 99, title: "Caravan Head-Turner" },
    { min: 100, max: 139, title: "Desert Royalty" },
    { min: 140, max: 179, title: "Legendary Herd" },
    { min: 180, max: 220, title: "Sultan-Level Mirage" },
  ],
} as const;

export const MARKET_CONFIG = {
  market: "Saudi Arabia",
  usdToSar: 3.75,
  lowUsd: 2000,
  referenceUsd: 6000,
  highUsd: 10000,
  assumptionVersion: "Illustrative assumption v1 · July 2026",
} as const;

export const UPLOAD_LIMITS = {
  maxFiles: 3,
  maxBytes: 8 * 1024 * 1024,
  maxDimension: 4096,
  acceptedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
} as const;

export const LOCAL_MODEL = {
  id: "Xenova/clip-vit-base-patch32",
  revision: "d15189d7028b43f1d3e65039190477f6af591c2a",
  license: "MIT (upstream OpenAI CLIP)",
  quantization: "q4",
  estimatedDownloadBytes: 193 * 1024 * 1024,
  imageResolution: 768,
  limitations:
    "A compact zero-shot CLIP observer can miss subtle, obstructed, or out-of-distribution details. Ambiguous traits are marked unknown instead of guessed.",
} as const;

export function isVisualObservation(value: unknown): value is VisualObservation {
  const v = value as VisualObservation;
  const traits = [
    v?.face?.visibility,
    v?.face?.apparentSymmetry,
    v?.face?.featureBalance,
    v?.face?.expression,
    v?.face?.eyeVisibility,
    v?.face?.eyeAppearance,
    v?.hair?.color,
    v?.hair?.length,
    v?.hair?.texture,
    v?.hair?.style,
    v?.hair?.presentation,
    v?.physique?.visibility,
    v?.physique?.build,
    v?.physique?.waistDefinition,
    v?.physique?.chestProminence,
    v?.physique?.hipProminence,
    v?.physique?.gluteProminence,
    v?.physique?.proportionalBalance,
    v?.physique?.posture,
    v?.style?.clothingPresentation,
    v?.style?.grooming,
    v?.style?.visualCoordination,
  ];
  return Boolean(
    traits.every(
      (trait) =>
        trait &&
        typeof trait.value === "string" &&
        typeof trait.confidence === "number" &&
        trait.confidence >= 0 &&
        trait.confidence <= 1,
    ) &&
      v?.evidence &&
      typeof v.evidence.overallConfidence === "number" &&
      typeof v.evidence.adultConfidence === "number" &&
      typeof v.evidence.appropriate === "boolean" &&
      Array.isArray(v.evidence.missingTraits),
  );
}
