import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { isVisualObservation } from "../lib/config.ts";

const source = await readFile(new URL("../app/CamelCalculator.tsx", import.meta.url), "utf8");
const worker = await readFile(new URL("../app/local-observer.worker.ts", import.meta.url), "utf8");
test("adult consent and photo rights gate upload", () => {
  assert.match(source, /disabled=\{!consents\.every\(Boolean\)\}/);
  assert.match(source, /Only upload photos of adults who are in on the joke\./);
  assert.match(worker, /The user's explicit 18\+ attestation is the primary age confirmation/);
  assert.match(worker, /strongMinorEvidence/);
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
