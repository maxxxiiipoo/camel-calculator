/// <reference lib="webworker" />
import { ModelRegistry, env, pipeline } from "@huggingface/transformers";
import { LOCAL_MODEL, isVisualObservation, type Level, type TraitObservation, type VisualObservation } from "../lib/config";
import { reconcileObservations } from "../lib/reconcile";

declare const self: DedicatedWorkerGlobalScope;
env.useBrowserCache = true;
env.useWasmCache = true;
env.allowLocalModels = false;
env.allowRemoteModels = true;
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
(env.backends.onnx.wasm!).wasmPaths = isSafari
  ? {
      mjs: "/vendor/wasm/ort-wasm-simd-threaded.mjs",
      wasm: "/vendor/wasm/ort-wasm-simd-threaded.wasm",
    }
  : {
      mjs: "/vendor/wasm/ort-wasm-simd-threaded.asyncify.mjs",
      wasm: "/vendor/wasm/ort-wasm-simd-threaded.asyncify.wasm",
    };

type Backend = "webgpu" | "wasm";
type Candidate = { group: string; value: string; label: string };
type RankedLabel = { label: string; score: number };
type Choice = { value: string; confidence: number };
type Observer = (image: string, labels: string[]) => Promise<RankedLabel[]>;

let observer: Observer | null = null;
let backend: Backend = "wasm";

const candidates: Candidate[] = [
  { group: "adult", value: "adult", label: "a clearly adult person" },
  { group: "adult", value: "unclear", label: "a person whose adulthood is unclear" },
  { group: "adult", value: "minor", label: "a child or teenager" },
  { group: "adult", value: "none", label: "no person is visible" },
  { group: "safety", value: "appropriate", label: "an ordinary appropriate clothed photograph" },
  { group: "safety", value: "explicit", label: "nudity or sexually explicit content" },
  { group: "faceVisibility", value: "not_visible", label: "the face is not visible" },
  { group: "faceVisibility", value: "low", label: "the face is barely visible or heavily obstructed" },
  { group: "faceVisibility", value: "moderate", label: "the face is partly visible" },
  { group: "faceVisibility", value: "prominent", label: "the face is clearly visible" },
  { group: "faceVisibility", value: "very_prominent", label: "the face is clear and close-up" },
  { group: "bodyVisibility", value: "not_visible", label: "the body is not visible" },
  { group: "bodyVisibility", value: "low", label: "only the shoulders are visible" },
  { group: "bodyVisibility", value: "moderate", label: "the upper body is visible" },
  { group: "bodyVisibility", value: "prominent", label: "most of the body is visible" },
  { group: "bodyVisibility", value: "very_prominent", label: "a clear full-body view" },
  { group: "expression", value: "low", label: "a neutral facial expression" },
  { group: "expression", value: "moderate", label: "a slight smile" },
  { group: "expression", value: "prominent", label: "a clear warm smile" },
  { group: "expression", value: "very_prominent", label: "a very expressive joyful smile" },
  { group: "eyeVisibility", value: "not_visible", label: "the eyes are not visible" },
  { group: "eyeVisibility", value: "low", label: "the eyes are obscured" },
  { group: "eyeVisibility", value: "moderate", label: "the eyes are partly visible" },
  { group: "eyeVisibility", value: "prominent", label: "the eyes are clearly visible" },
  { group: "eyeAppearance", value: "low", label: "subtle eye presentation" },
  { group: "eyeAppearance", value: "moderate", label: "balanced eye presentation" },
  { group: "eyeAppearance", value: "prominent", label: "defined eye presentation" },
  { group: "symmetry", value: "low", label: "low apparent facial symmetry in this view" },
  { group: "symmetry", value: "moderate", label: "moderate apparent facial symmetry in this view" },
  { group: "symmetry", value: "prominent", label: "strong apparent facial symmetry in this view" },
  { group: "featureBalance", value: "low", label: "low visible facial feature balance in this view" },
  { group: "featureBalance", value: "moderate", label: "moderate visible facial feature balance in this view" },
  { group: "featureBalance", value: "prominent", label: "strong visible facial feature balance in this view" },
  ...["black", "brown", "light_brown", "blonde", "red", "gray", "other"].map((value) => ({
    group: "hairColor", value, label: `${value.replace("_", " ")} hair`,
  })),
  ...["short", "medium", "long", "very_long"].map((value) => ({
    group: "hairLength", value, label: `${value.replace("_", " ")} hair length`,
  })),
  ...["straight", "wavy", "curly", "coily", "styled"].map((value) => ({
    group: "hairStyle", value, label: `${value} hair`,
  })),
  { group: "hairPresentation", value: "low", label: "casual hair presentation" },
  { group: "hairPresentation", value: "moderate", label: "neat hair presentation" },
  { group: "hairPresentation", value: "prominent", label: "highly styled hair presentation" },
  ...["low", "moderate", "prominent", "very_prominent"].map((value) => ({
    group: "build", value, label: `${value.replace("_", " ")} overall body build`,
  })),
  ...["waistDefinition", "chestProminence", "hipProminence", "gluteProminence", "proportionalBalance", "posture"].flatMap(
    (group) => ["low", "moderate", "prominent", "very_prominent"].map((value) => ({
      group,
      value,
      label: `${value.replace("_", " ")} ${group.replace(/([A-Z])/g, " $1").toLowerCase()} in this clothed view`,
    })),
  ),
  ...["clothingPresentation", "grooming", "visualCoordination"].flatMap((group) =>
    ["low", "moderate", "prominent", "very_prominent"].map((value) => ({
      group,
      value,
      label: `${value.replace("_", " ")} ${group.replace(/([A-Z])/g, " $1").toLowerCase()}`,
    })),
  ),
  { group: "lighting", value: "low", label: "poor dark lighting" },
  { group: "lighting", value: "moderate", label: "adequate lighting" },
  { group: "lighting", value: "prominent", label: "clear balanced lighting" },
  { group: "blur", value: "low", label: "a sharp photograph" },
  { group: "blur", value: "moderate", label: "a slightly blurry photograph" },
  { group: "blur", value: "prominent", label: "a very blurry photograph" },
  { group: "obstruction", value: "low", label: "an unobstructed person" },
  { group: "obstruction", value: "moderate", label: "a partly obstructed person" },
  { group: "obstruction", value: "prominent", label: "a heavily obstructed person" },
];

const labels = candidates.map(({ label }) => label);
const note = "coarse local CLIP observation";
const ordinal = new Set(["not_visible", "low", "moderate", "prominent", "very_prominent"]);

function choose(results: RankedLabel[], group: string, force = false): Choice {
  const groupCandidates = candidates.filter((candidate) => candidate.group === group);
  const scores = new Map(results.map((result) => [result.label, result.score]));
  const ranked = groupCandidates
    .map((candidate) => ({ ...candidate, score: scores.get(candidate.label) ?? 0 }))
    .sort((a, b) => b.score - a.score);
  const total = ranked.reduce((sum, item) => sum + item.score, 0) || 1;
  const top = ranked[0];
  const normalized = top.score / total;
  const runnerUp = (ranked[1]?.score ?? 0) / total;
  const confidence = Math.max(0, Math.min(1, normalized));
  if (!force && (confidence < 0.31 || confidence - runnerUp < 0.045)) {
    return { value: "not_visible", confidence };
  }
  return { value: top.value, confidence };
}

function trait(choice: Choice, visible = true): TraitObservation {
  if (!visible || choice.value === "not_visible") {
    return { value: "not_visible", confidence: choice.confidence, note: "not reliably visible" };
  }
  return { value: choice.value, confidence: choice.confidence, note };
}

function coverage(value: string) {
  return ({ not_visible: 0, low: 0.2, moderate: 0.55, prominent: 0.82, very_prominent: 1 } as Record<string, number>)[value] ?? 0;
}

function buildObservation(results: RankedLabel[]): VisualObservation {
  const pick = (group: string, force = false) => choose(results, group, force);
  const adult = pick("adult", true);
  const safety = pick("safety", true);
  const faceVisibility = pick("faceVisibility", true);
  const bodyVisibility = pick("bodyVisibility", true);
  const faceVisible = coverage(faceVisibility.value) >= 0.5;
  const bodyVisible = coverage(bodyVisibility.value) >= 0.5;
  const missingTraits: string[] = [];
  const tracked = (path: string, choice: Choice, visible = true) => {
    const result = trait(choice, visible);
    if (result.value === "not_visible") missingTraits.push(path);
    return result;
  };
  const lighting = pick("lighting", true);
  const blur = pick("blur", true);
  const obstruction = pick("obstruction", true);
  const allConfidence = results.length
    ? ["faceVisibility", "bodyVisibility", "lighting", "blur", "obstruction"].map((group) => pick(group, true).confidence)
    : [0];
  const overallConfidence = allConfidence.reduce((sum, value) => sum + value, 0) / allConfidence.length;
  const strongMinorEvidence = adult.value === "minor" && adult.confidence >= 0.55;
  const noPersonEvidence = adult.value === "none" && adult.confidence >= 0.55;
  const explicitEvidence = safety.value === "explicit" && safety.confidence >= 0.62;
  // The user's explicit 18+ attestation is the primary age confirmation.
  // CLIP is not an age estimator; it is used only to veto strong minor/no-person evidence.
  const adultConfidence = strongMinorEvidence || noPersonEvidence
    ? Math.max(0, 1 - adult.confidence)
    : adult.value === "adult"
      ? 0.95
      : 0.82;

  const observation: VisualObservation = {
    face: {
      visibility: tracked("face.visibility", faceVisibility),
      apparentSymmetry: tracked("face.apparentSymmetry", pick("symmetry"), faceVisible),
      featureBalance: tracked("face.featureBalance", pick("featureBalance"), faceVisible),
      expression: tracked("face.expression", pick("expression"), faceVisible),
      eyeVisibility: tracked("face.eyeVisibility", pick("eyeVisibility"), faceVisible),
      eyeAppearance: tracked("face.eyeAppearance", pick("eyeAppearance"), faceVisible),
    },
    hair: {
      color: tracked("hair.color", pick("hairColor"), faceVisible),
      length: tracked("hair.length", pick("hairLength"), faceVisible),
      texture: tracked("hair.texture", pick("hairStyle"), faceVisible),
      style: tracked("hair.style", pick("hairStyle"), faceVisible),
      presentation: tracked("hair.presentation", pick("hairPresentation"), faceVisible),
    },
    physique: {
      visibility: tracked("physique.visibility", bodyVisibility),
      build: tracked("physique.build", pick("build"), bodyVisible),
      waistDefinition: tracked("physique.waistDefinition", pick("waistDefinition"), bodyVisible),
      chestProminence: tracked("physique.chestProminence", pick("chestProminence"), bodyVisible),
      hipProminence: tracked("physique.hipProminence", pick("hipProminence"), bodyVisible),
      gluteProminence: tracked("physique.gluteProminence", pick("gluteProminence"), bodyVisible),
      proportionalBalance: tracked("physique.proportionalBalance", pick("proportionalBalance"), bodyVisible),
      posture: tracked("physique.posture", pick("posture"), bodyVisible),
    },
    style: {
      clothingPresentation: tracked("style.clothingPresentation", pick("clothingPresentation"), bodyVisible),
      grooming: tracked("style.grooming", pick("grooming"), faceVisible),
      visualCoordination: tracked("style.visualCoordination", pick("visualCoordination"), bodyVisible),
    },
    evidence: {
      faceCoverage: coverage(faceVisibility.value),
      bodyCoverage: coverage(bodyVisibility.value),
      obstruction: (ordinal.has(obstruction.value) ? obstruction.value : "not_visible") as Level,
      lightingAdequacy: (ordinal.has(lighting.value) ? lighting.value : "not_visible") as Level,
      blur: (ordinal.has(blur.value) ? blur.value : "not_visible") as Level,
      usableViews: 1,
      overallConfidence,
      missingTraits,
      adultConfidence,
      appropriate: !strongMinorEvidence && !noPersonEvidence && !explicitEvidence,
    },
  };
  if (!isVisualObservation(observation)) throw new Error("Local observer produced invalid structured output");
  return observation;
}

async function load(device: Backend) {
  backend = device;
  self.postMessage({ type: "phase", phase: "downloading" });
  observer = await pipeline("zero-shot-image-classification", LOCAL_MODEL.id, {
    revision: LOCAL_MODEL.revision,
    device,
    dtype: LOCAL_MODEL.quantization,
    progress_callback: (event: Record<string, unknown>) => self.postMessage({ type: "progress", event }),
  }) as unknown as Observer;
  self.postMessage({ type: "phase", phase: "loading" });
  self.postMessage({ type: "ready", backend });
}

async function analyze(images: string[]) {
  if (!observer) throw new Error("Local observer has not finished loading");
  self.postMessage({ type: "phase", phase: "analyzing" });
  const started = performance.now();
  const observations: VisualObservation[] = [];
  for (let index = 0; index < images.length; index += 1) {
    self.postMessage({ type: "photo", index, total: images.length });
    const output = await observer(images[index], labels);
    if (!Array.isArray(output) || output.some((item) => typeof item.label !== "string" || !Number.isFinite(item.score))) {
      self.postMessage({ type: "retry", index });
      const retry = await observer(images[index], labels);
      if (!Array.isArray(retry)) throw new Error("The local observer returned invalid output twice");
      observations.push(buildObservation(retry));
    } else {
      observations.push(buildObservation(output));
    }
  }
  self.postMessage({
    type: "complete",
    observation: reconcileObservations(observations),
    metrics: { backend, analysisMs: Math.round(performance.now() - started) },
  });
}

self.addEventListener("message", async ({ data }) => {
  try {
    if (data.type === "load") await load(data.device);
    if (data.type === "analyze") await analyze(data.images);
    if (data.type === "cache-status") {
      self.postMessage({
        type: "cache-status",
        cached: await ModelRegistry.is_cached(LOCAL_MODEL.id, { revision: LOCAL_MODEL.revision }),
      });
    }
    if (data.type === "clear-cache") {
      await ModelRegistry.clear_cache(LOCAL_MODEL.id, { revision: LOCAL_MODEL.revision });
      self.postMessage({ type: "cache-cleared" });
    }
  } catch (error) {
    self.postMessage({ type: "error", message: error instanceof Error ? error.message : "Local analysis failed" });
  }
});
