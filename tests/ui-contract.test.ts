import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../app/CamelCalculator.tsx", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/analyze/route.ts", import.meta.url), "utf8");
test("adult consent and photo rights gate upload", () => {
  assert.match(source, /disabled=\{!consents\.every\(Boolean\)\}/);
  assert.match(source, /Only upload photos of adults who are in on the joke\./);
});
test("default share card omits photographs and is local", () => {
  assert.match(source, /PHOTO NOT INCLUDED/);
  assert.doesNotMatch(source.slice(source.indexOf("function downloadCard"), source.indexOf("return <main>")), /drawImage/);
});
test("restart and delete clear local image state", () => {
  assert.match(source, /function deletePhotos\(\) \{ setPhotos\(\[\]\)/);
  assert.match(source, /function restart\(\) \{ setPhotos\(\[\]\)/);
});
test("reduced motion setting and system preference are supported", () => {
  assert.match(source, /prefers-reduced-motion/); assert.match(source, /Reduced motion/);
});
test("server disables model storage and avoids image logging", () => {
  assert.match(route, /store: false/); assert.doesNotMatch(route, /console\.log/);
});
test("server rejects uncertain adulthood and low confidence", () => {
  assert.match(route, /minimumAdultConfidence/); assert.match(route, /minimumAnalysisConfidence/);
});
