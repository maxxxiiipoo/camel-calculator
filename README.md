# Camel Calculator

A deliberately overproduced, adults-only visual attraction game. Users upload one to three appropriate photographs of a consenting adult; a local open-source model records only visible, non-sensitive traits, then an independent deterministic rubric produces a fictional ordinary-working-camel count.

People are not property. The result is entertainment—not science, identification, a price, a medical assessment, or an inference about protected or sensitive characteristics.

## Local setup

Requires Node.js 22.13+.

```bash
npm install
npm run dev
```

No API key, paid vision service, or server inference is required. Hosted leaderboard deployments use platform-managed D1 and R2 bindings; local image analysis and card generation continue to work without them.

## Local observer

- Model: `Xenova/clip-vit-base-patch32`
- Revision: `d15189d7028b43f1d3e65039190477f6af591c2a`
- License: MIT (upstream OpenAI CLIP)
- Runtime: Transformers.js 4, inside a Web Worker
- Quantization: q4
- Measured q4 ONNX model: 189,403,477 bytes; UI budget including tokenizer/config: approximately 193 MB
- Acceleration: WebGPU when available on a device with adequate reported memory; WebAssembly fallback otherwise
- Cache: browser Cache Storage, managed by Transformers.js

`HuggingFaceTB/SmolVLM-256M-Instruct` and `HuggingFaceTB/SmolVLM2-256M-Video-Instruct` were evaluated with real local inference first. They understood the test image, but repeatedly emitted prose, malformed JSON, copied defaults, or truncated output under constrained schemas. They were rejected rather than masking failures.

CLIP is smaller, has a mature Transformers.js zero-shot image-classification path, and returns numeric label scores instead of unconstrained prose. The worker submits one fixed set of neutral candidate labels, groups the returned scores by trait, applies confidence and ambiguity thresholds, constructs the typed observation schema, and validates it before scoring. Invalid output is retried locally once, then becomes a recoverable error—never a mock result.

Limitations: CLIP can miss subtle, obstructed, or out-of-distribution details and may be slow under WASM, especially on mobile Safari. It is not a face-recognition, age-estimation, medical, or measurement system. Ambiguous traits become `not_visible`.

## Architecture

- `app/CamelCalculator.tsx`: consent, capability detection, image preparation, worker orchestration, real progress, cache controls, cinematic UI, and local share cards
- `app/local-observer.worker.ts`: model loading, WebGPU/WASM inference, constrained zero-shot labels, schema construction/validation, retry, and multi-photo observation
- `lib/config.ts`: typed observation schema, runtime/model metadata, private rubric, weights, tiers, and limits
- `lib/reconcile.ts`: multi-photo evidence reconciliation
- `lib/scoring.ts`: pure deterministic camel scoring; the model never awards camels
- `lib/image.ts`: upload magic-byte validation
- `app/api/leaderboard`: consent-checked leaderboard metadata and processed-photo routes
- `db/schema.ts`: minimal public leaderboard metadata stored in D1
- `public/vendor/wasm`: same-origin ONNX Runtime files so the fallback does not fetch runtime code from a third-party CDN

There is no analysis API route. D1 stores leaderboard metadata and R2 stores only opted-in, downsized leaderboard JPEGs.

## Privacy

- Images are decoded, oriented by the browser image decoder, re-encoded through canvas, cropped, and resized before inference.
- Original filenames and EXIF are discarded.
- Prepared image data is transferred only to an in-origin Web Worker.
- Normal analysis never uploads an image. An image leaves the device only after the user separately checks the public-leaderboard consent box and submits.
- Leaderboard submission stores a 480×600 re-encoded JPEG, display name, camel count, sortable score, consent timestamp, and submission time. The original upload is never stored.
- The only cross-origin inference traffic is the first model download from its public Hugging Face repository.
- Model/runtime files are cached for repeat and offline visits, subject to browser eviction policy.
- “Delete my photos” clears image and prepared-buffer state; “Remove downloaded model” clears the model cache where supported.
- Share cards include the selected photo but are generated locally and never create a leaderboard entry.

## Scoring

The visual index is Face 45%, Body proportions 30%, Hair 10%, Style 10%, and Visual coherence 5%. Unknown traits are removed and weights are redistributed among visible traits in the category. Image quality affects confidence only.

Ordinal traits use nonlinear proximity curves. A capped harmony bonus rewards combined alignment. The deterministic 0–100 result maps through a deflationary nonlinear curve to 12–220 fictional working camels, reserving large herds for high scores.

Market assumptions remain USD 2,000 / 6,000 / 10,000 per ordinary working camel, 1 USD = 3.75 SAR, with Saudi Arabia context.

## Quality checks

```bash
npm run format
npm run lint
npm run typecheck
npm test
npm run build
npx next build --webpack
```

Tests cover upload signatures, unsupported files, nonlinear scoring, unknown redistribution, low confidence, multi-photo reconciliation, determinism, score bounds, economics, consent, local share-card privacy, leaderboard opt-in and processing limits, deletion, reduced motion, output validation, local retry, progress, cancellation, cache removal, and the absence of server inference.

## Performance instrumentation

The app reports the selected backend and measured local analysis time. Transformers.js progress events power byte-level download progress. Browser developer tools can measure first/repeat load, peak memory, and main-thread responsiveness; inference stays in a Worker to keep controls responsive. Hardware and browser storage policies make these values device-specific.
