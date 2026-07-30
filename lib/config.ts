export type CategoryId =
  | "physique"
  | "face"
  | "life"
  | "relationship"
  | "nurturing"
  | "personality";

export type PreferenceKey =
  | "build"
  | "chest"
  | "hips"
  | "glutes"
  | "waist"
  | "hair"
  | "hairLength"
  | "eyes"
  | "style";

export type Question = {
  id: string;
  category: CategoryId;
  label: string;
  hint: string;
  icon: string;
  preference?: PreferenceKey;
  options?: string[];
};

export const DEFAULT_WEIGHTS: Record<CategoryId, number> = {
  physique: 35,
  face: 30,
  life: 15,
  relationship: 8,
  nurturing: 7,
  personality: 5,
};

export const CATEGORY_META: Record<
  CategoryId,
  { label: string; short: string; icon: string }
> = {
  physique: { label: "Physique & proportions", short: "Physique", icon: "◒" },
  face: { label: "Face, hair & style", short: "Style", icon: "✦" },
  life: { label: "Cooking & life skills", short: "Life skills", icon: "♨" },
  relationship: { label: "Relationship qualities", short: "Relationship", icon: "♡" },
  nurturing: { label: "Nurturing & family", short: "Nurturing", icon: "♧" },
  personality: { label: "Personality", short: "Personality", icon: "☀" },
};

export const ORDINAL_OPTIONS = ["Low", "Moderate", "Prominent", "Very prominent"];

export const PREFERENCE_OPTIONS: Record<PreferenceKey, string[]> = {
  build: ["Slender", "Athletic", "Soft", "Strong"],
  chest: ORDINAL_OPTIONS,
  hips: ORDINAL_OPTIONS,
  glutes: ORDINAL_OPTIONS,
  waist: ORDINAL_OPTIONS,
  hair: ["Black", "Brunette", "Blonde", "Red", "Other"],
  hairLength: ["Short", "Medium", "Long", "Very long"],
  eyes: ["Brown", "Hazel", "Green", "Blue", "Other"],
  style: ["Minimal", "Classic", "Bold", "Bohemian"],
};

export const QUESTIONS: Question[] = [
  { id: "build", category: "physique", label: "General build", hint: "How closely does their build match the configured ideal?", icon: "◒", preference: "build", options: PREFERENCE_OPTIONS.build },
  { id: "chest", category: "physique", label: "Chest prominence", hint: "Tasteful, subjective, and judged only against your preference.", icon: "◐", preference: "chest", options: ORDINAL_OPTIONS },
  { id: "hips", category: "physique", label: "Hip prominence", hint: "Aesthetic preference only—never a health or fertility signal.", icon: "◓", preference: "hips", options: ORDINAL_OPTIONS },
  { id: "glutes", category: "physique", label: "Glute prominence", hint: "Select the closest illustrated-scale description.", icon: "◑", preference: "glutes", options: ORDINAL_OPTIONS },
  { id: "waist", category: "physique", label: "Waist definition", hint: "The curve rewards proximity, not extremes.", icon: "⌁", preference: "waist", options: ORDINAL_OPTIONS },
  { id: "presence", category: "physique", label: "Fitness & physical presence", hint: "Energy, posture, and how they carry themselves.", icon: "↟" },
  { id: "hair", category: "face", label: "Hair color", hint: "No color is universally ranked above another.", icon: "≈", preference: "hair", options: PREFERENCE_OPTIONS.hair },
  { id: "hairLength", category: "face", label: "Hair length & style", hint: "Match it to the desert preference profile.", icon: "≋", preference: "hairLength", options: PREFERENCE_OPTIONS.hairLength },
  { id: "eyes", category: "face", label: "Eyes", hint: "Color, expression, and the spark behind them.", icon: "◉", preference: "eyes", options: PREFERENCE_OPTIONS.eyes },
  { id: "style", category: "face", label: "Personal style", hint: "From quiet polish to main-character entrance.", icon: "✦", preference: "style", options: PREFERENCE_OPTIONS.style },
  { id: "smile", category: "face", label: "Smile & facial presentation", hint: "How quickly does it turn a room into an oasis?", icon: "☼" },
  { id: "cooking", category: "life", label: "Cooking ability", hint: "Toast survivor to legendary feast architect.", icon: "♨" },
  { id: "practical", category: "life", label: "Practical problem-solving", hint: "Can they fix the tent before the sandstorm arrives?", icon: "⚒" },
  { id: "responsibility", category: "life", label: "Organization & responsibility", hint: "Plans, contributes, and remembers the important bits.", icon: "✓" },
  { id: "communication", category: "relationship", label: "Communication & affection", hint: "Clear words, warm signals, no desert riddles.", icon: "♡" },
  { id: "reliability", category: "relationship", label: "Loyalty & reliability", hint: "Shows up when the caravan wheel comes off.", icon: "⚑" },
  { id: "patience", category: "nurturing", label: "Patience & caregiving nature", hint: "Kind under pressure and generous with care.", icon: "♧" },
  { id: "family", category: "nurturing", label: "Family orientation", hint: "How well it aligns with the configured future.", icon: "⌂" },
  { id: "humor", category: "personality", label: "Humor & curiosity", hint: "Can they make a three-day crossing feel short?", icon: "☀" },
  { id: "kindness", category: "personality", label: "Kindness & emotional steadiness", hint: "The rarest luxury in any desert.", icon: "✺" },
];

export const MARKET_CONFIG = {
  market: "Saudi Arabia",
  currency: "USD and SAR",
  usdToSar: 3.75,
  lowUsd: 2000,
  referenceUsd: 6000,
  highUsd: 10000,
  assumptionVersion: "Illustrative assumption v1 · July 2026",
} as const;

export const TIER_CONFIG = [
  { min: 12, max: 39, title: "Wandering Dromedary", messages: ["A charming start. The caravan has noticed.", "Small herd, excellent vibes, no notes."] },
  { min: 40, max: 69, title: "Oasis Favorite", messages: ["The palms are rustling approvingly.", "A reliable crowd-pleaser at every watering hole."] },
  { min: 70, max: 99, title: "Caravan Head-Turner", messages: ["Several camels have forgotten where they were going.", "Traffic on the spice road has become complicated."] },
  { min: 100, max: 139, title: "Desert Royalty", messages: ["The tent has upgraded itself to a palace.", "Even the sunset is trying harder now."] },
  { min: 140, max: 179, title: "Legendary Herd", messages: ["Caravan accountants are requesting overtime.", "The dunes will be discussing this for generations."] },
  { min: 180, max: 220, title: "Sultan-Level Mirage", messages: ["A gold camel has entered the chat.", "Frankly, the desert was not prepared."] },
] as const;
