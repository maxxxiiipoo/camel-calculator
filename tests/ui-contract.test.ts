import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../app/CamelCalculator.tsx", import.meta.url), "utf8");
test("age gate requires adult and consent confirmations", () => {
  assert.match(source, /disabled=\{!adult \|\| !consent\}/);
  assert.match(source, /Only rate adults who are in on the joke\./);
});
test("core quiz completion reaches reveal and result stages", () => {
  assert.match(source, /setStage\("reveal"\)/); assert.match(source, /setStage\("result"\)/); assert.match(source, /Summon the herd/);
});
