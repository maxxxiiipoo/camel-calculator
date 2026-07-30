import { pipeline } from "@huggingface/transformers";

const modelId = "Xenova/clip-vit-base-patch32";
const revision = "d15189d7028b43f1d3e65039190477f6af591c2a";
const imagePath = process.argv[2];

if (!imagePath) {
  throw new Error("Usage: node scripts/verify-local-model.mjs /path/to/test-image");
}

const observer = await pipeline("zero-shot-image-classification", modelId, {
  revision,
  dtype: "q4",
});
const output = await observer(imagePath, [
  "the face is clearly visible",
  "the face is not visible",
  "a smiling person",
  "a neutral expression",
  "brown hair",
  "blonde hair",
]);

console.log(JSON.stringify(output, null, 2));
