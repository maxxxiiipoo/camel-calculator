import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { isVisualObservation } from "../lib/config.ts";

const source = await readFile(new URL("../app/CamelCalculator.tsx", import.meta.url), "utf8");
const worker = await readFile(new URL("../app/local-observer.worker.ts", import.meta.url), "utf8");
const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
test("Vercel Analytics requires explicit consent and excludes private inputs", () => {
  assert.doesNotMatch(layout, /@vercel\/analytics/);
  assert.match(source, /analyticsConsent && <Analytics \/>/);
  assert.match(source, /I agree to anonymous usage and result-band analytics/);
  assert.match(source, /track\("camel_result"/);
  assert.doesNotMatch(source.slice(source.indexOf('track("camel_result"'), source.indexOf("}, [analyticsConsent")), /name|dataUrl|observation/);
});
test("adult consent and photo rights gate upload", () => {
  assert.match(source, /disabled=\{!consents\.every\(Boolean\)\}/);
  assert.match(source, /Only upload photos of adults who are in on the joke\./);
  assert.match(worker, /The user's explicit 18\+ attestation is the primary age confirmation/);
  assert.doesNotMatch(worker, /strongMinorEvidence/);
  assert.match(worker, /apparent-age label never blocks a result/);
});
test("default share card omits photographs and is local", () => {
  assert.match(source, /PHOTO NOT INCLUDED/);
  assert.doesNotMatch(source.slice(source.indexOf("function downloadCard"), source.indexOf("return <main>")), /drawImage/);
});
test("restart and delete clear all local image state", () => {
  assert.match(source, /preparedRef\.current = \[\]/);
  assert.match(source, /function restart\(\)[\s\S]*?preparedRef\.current = \[\];[\s\S]*?setPhotos\(\[\]\)/);
});
test("reduced motion setting and system preference are supported", () => {
  assert.match(source, /prefers-reduced-motion/); assert.match(source, /Reduced motion/);
});
test("client worker uses WebGPU with WASM fallback and no API route", async () => {
  assert.match(source, /canWebGpu \? "webgpu" : "wasm"/);
  assert.match(worker, /zero-shot-image-classification/);
  assert.match(worker, /device/);
  await assert.rejects(access(new URL("../app/api/analyze/route.ts", import.meta.url)));
});
test("model output is validated and locally retried", () => {
  assert.match(worker, /if \(!Array\.isArray\(output\)/);
  assert.match(worker, /const retry = await observer/);
  assert.match(worker, /isVisualObservation\(observation\)/);
  assert.equal(isVisualObservation({ random: true }), false);
});
test("low photo coverage does not block a result", () => {
  assert.doesNotMatch(source, /not enough visible information|defensible result|minimumAnalysisConfidence/i);
  assert.match(source, /setObservation\(value\)/);
});
test("face visibility is flexible while body scoring requires real framing evidence", () => {
  assert.match(worker, /visibleSignalCount/);
  assert.match(worker, /faceVisible = coverage\(faceVisibility\.value\) >= 0\.2/);
  assert.match(worker, /bodyVisible = coverage\(bodyVisibility\.value\) >= 0\.55/);
  assert.match(worker, /bodyVisibility\.confidence >= 0\.2/);
  assert.match(source, /Strong preference match/);
  assert.match(source, /Chest prominence/);
  assert.match(source, /Hip prominence/);
  assert.match(source, /Glute prominence/);
});
test("model cache has real progress, cancellation, and removal", () => {
  assert.match(source, /item\.status === "progress"/);
  assert.match(source, /Cancel/); assert.match(source, /Remove downloaded model/);
  assert.match(worker, /clear_cache/);
  assert.match(source, /workerRef\.current\?\.terminate/);
});
test("photos are never sent through fetch to an analysis service", () => {
  assert.doesNotMatch(source, /fetch\("\/api\/analyze"/);
  assert.doesNotMatch(source, /fetch\(photo\.dataUrl\)/);
  assert.match(source, /sanitizedDataUrlToFile/);
  assert.doesNotMatch(worker, /api\.openai|inference-api|console\.log/);
});
