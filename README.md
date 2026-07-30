# Camel Calculator

A deliberately overproduced, adults-only visual attraction game. Users upload one to three appropriate photographs of a consenting adult; an AI observation layer records only visible, non-sensitive traits, then an independent deterministic rubric produces a fictional ordinary-working-camel count.

People are not property. The result is entertainment—not science, a price, identification, a medical assessment, or an inference about health, fertility, ethnicity, personality, intelligence, maternal ability, or childbirth.

## Local setup

Requires Node.js 22.13+ and an OpenAI API key.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set `OPENAI_API_KEY` only in the server environment. Never expose it through a `NEXT_PUBLIC_` variable.

## Architecture

- Next.js 16, React 19, TypeScript, Tailwind CSS 4
- `app/CamelCalculator.tsx`: consent, image preparation, local review/crop/rotation, cinematic states, and local share-card generation
- `app/api/analyze/route.ts`: upload revalidation, rate limiting, image moderation, temporary model calls, adult/appropriateness/confidence gates
- `lib/config.ts`: typed observation schema, private owner rubric, weights, tiers, limits, and camel-market assumptions
- `lib/reconcile.ts`: multi-photo evidence reconciliation
- `lib/scoring.ts`: pure deterministic custom scoring; the model never awards camels
- `lib/image.ts`: magic-byte and upload validation

The private rubric is repository configuration, not public UI. It can later sit behind an authenticated editor without changing observation code.

## Privacy and security

- Selected images are immediately previewed locally and re-encoded through canvas before analysis, stripping EXIF and original filenames.
- Images are sent as request-scoped data URLs, never placed in object storage, URLs, analytics, logs, or a database.
- The API requests `store: false`; Camel Calculator does not retain temporary image state after the request.
- Restart and “Delete my photos” clear browser image state.
- The default downloadable card is generated locally and never contains the photograph.
- JPEG, PNG, and WebP are accepted after magic-byte validation. SVG/executable uploads are rejected.
- Limits: three images, 8 MB input each, 4096 px source dimensions, 1440 px re-encoded output.
- Moderation, conservative adulthood confidence, general analysis confidence, and per-IP rate limits run before scoring.

Uploaded content is not used for training by this application. Review the configured model provider’s current API data controls before production policy changes.

## Scoring

The 100-point index is Face 35%, Body proportions 40%, Hair 10%, Style 10%, and Overall visual coherence 5%. Unknown traits are removed, with their weight redistributed among visible traits in that category. Image quality affects confidence only.

Ordinal traits use nonlinear proximity curves, so the configured preferred level peaks while adjacent and distant values decline. A capped harmony bonus rewards combined alignment. The deterministic 0–100 result maps to 12–220 fictional working camels.

Market assumptions remain centralized: USD 2,000 / 6,000 / 10,000 per ordinary working camel, 1 USD = 3.75 SAR, Saudi Arabia context.

## Quality checks

```bash
npm run format
npm run lint
npm run typecheck
npm test
npm run build
npx next build --webpack
```

Tests cover real-content upload validation, unsupported files, nonlinear curves, unknown redistribution, low confidence, multi-photo reconciliation, determinism, bounds, herd economics, consent gating, default share-card privacy, deletion/restart, reduced motion, and server data handling.

## Deployment

Vercel requires a server-side `OPENAI_API_KEY` environment variable. Deploy with `vercel --prod`. The Sites manifest supports the parallel private workspace deployment.
