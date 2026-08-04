import assert from "node:assert/strict";
import test from "node:test";
import { isSafeUpload, validateImageHeader } from "../lib/image.ts";
import { reconcileObservations } from "../lib/reconcile.ts";
import { herdEconomics, nonlinearFit, scoreObservation } from "../lib/scoring.ts";
import type { TraitObservation, VisualObservation } from "../lib/config.ts";

const trait = (value: string, confidence = 0.9): TraitObservation => ({ value, confidence, note: "visible" });
const observation = (confidence = 0.86): VisualObservation => ({
  face: { visibility: trait("prominent"), apparentSymmetry: trait("prominent"), featureBalance: trait("prominent"), expression: trait("prominent"), eyeVisibility: trait("prominent"), eyeAppearance: trait("prominent") },
  hair: { color: trait("blonde"), length: trait("long"), texture: trait("wavy"), style: trait("wavy"), presentation: trait("prominent") },
  physique: { visibility: trait("prominent"), build: trait("moderate"), waistDefinition: trait("prominent"), chestProminence: trait("prominent"), hipProminence: trait("prominent"), gluteProminence: trait("prominent"), proportionalBalance: trait("prominent"), posture: trait("prominent") },
  style: { clothingPresentation: trait("prominent"), grooming: trait("prominent"), visualCoordination: trait("prominent") },
  evidence: { faceCoverage: .95, bodyCoverage: .9, obstruction: "low", lightingAdequacy: "prominent", blur: "low", usableViews: 1, overallConfidence: confidence, missingTraits: [], adultConfidence: .98, appropriate: true },
});

test("validates actual JPEG content and rejects unsupported content", () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0]);
  assert.equal(validateImageHeader(jpeg, "image/jpeg"), true);
  assert.equal(validateImageHeader(new Uint8Array([60, 115, 118, 103]), "image/jpeg"), false);
  assert.equal(isSafeUpload({ size: 100, type: "image/jpeg" }, jpeg), true);
  assert.equal(isSafeUpload({ size: 100, type: "image/svg+xml" }, jpeg), false);
});
test("nonlinear curves peak at preference and decline past it", () => {
  assert.equal(nonlinearFit("prominent", "prominent"), 1);
  assert.ok(nonlinearFit("moderate", "prominent") > nonlinearFit("low", "prominent"));
  assert.ok(nonlinearFit("very_prominent", "prominent") < 1);
});
test("unknown traits redistribute rather than score negatively", () => {
  const a = observation(); a.physique.chestProminence = trait("not_visible", .2);
  const b = observation(); b.physique.chestProminence = trait("low", .9);
  assert.ok(scoreObservation(a).categoryScores.body! > scoreObservation(b).categoryScores.body!);
});
test("low confidence is preserved for gating and confidence display", () => {
  assert.equal(scoreObservation(observation(.4)).confidence, .4);
});
test("multiple photos prefer higher-confidence compatible observations", () => {
  const a = observation(); a.hair.color = trait("blonde", .55);
  const b = observation(); b.hair.color = trait("blonde", .95);
  assert.equal(reconcileObservations([a, b]).hair.color.confidence, .95);
  assert.equal(reconcileObservations([a, b]).evidence.usableViews, 2);
});
test("scoring is deterministic and bounded", () => {
  assert.deepEqual(scoreObservation(observation()), scoreObservation(observation()));
  const result = scoreObservation(observation());
  assert.ok(result.camels >= 12 && result.camels <= 220);
  assert.ok(result.faceCamels! >= 12 && result.faceCamels! <= 220);
  assert.ok(result.bodyCamels! >= 12 && result.bodyCamels! <= 220);
});
test("confidence calibration stays bounded and body can be absent", () => {
  const high = observation(.2);
  const calibrated = scoreObservation(high);
  assert.ok(calibrated.score >= 0 && calibrated.score <= 100);
  high.physique = Object.fromEntries(Object.keys(high.physique).map((key) => [key, trait("not_visible", .1)])) as VisualObservation["physique"];
  assert.equal(scoreObservation(high).bodyCamels, null);
  assert.notEqual(scoreObservation(high).faceCamels, null);
});
test("face-only framing cannot receive a body score from hallucinated body traits", () => {
  const portrait = observation();
  portrait.evidence.bodyCoverage = 0.2;
  portrait.physique.visibility = trait("low", .9);
  assert.equal(scoreObservation(portrait).categoryScores.body, null);
  assert.equal(scoreObservation(portrait).bodyCamels, null);
  assert.notEqual(scoreObservation(portrait).faceCamels, null);
});
test("trait evidence strength creates meaningful camel separation", () => {
  const strong = observation(.9);
  const uncertain = observation(.9);
  for (const group of [uncertain.face, uncertain.hair, uncertain.physique, uncertain.style]) {
    for (const item of Object.values(group)) item.confidence = .3;
  }
  assert.ok(scoreObservation(strong).camels - scoreObservation(uncertain).camels >= 20);
});
test("hair color is descriptive only and cannot change the camel score", () => {
  const blonde = observation();
  const brunette = observation();
  brunette.hair.color = trait("brown");
  assert.equal(scoreObservation(blonde).camels, scoreObservation(brunette).camels);
  assert.equal(scoreObservation(blonde).categoryScores.hair, scoreObservation(brunette).categoryScores.hair);
});
test("camel economics use configured USD and SAR conversion", () => {
  const result = herdEconomics(84);
  assert.equal(result.low, 168000); assert.equal(result.reference, 504000);
  assert.equal(result.high, 840000); assert.equal(result.referenceSar, 1890000);
});
