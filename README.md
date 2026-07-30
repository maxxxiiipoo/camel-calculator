# Camel Calculator

A ludicrously overproduced, adults-only desert game show that converts a subjective attraction and compatibility profile into a fictional count of ordinary working dromedary camels.

People are not property. The score is entertainment, not science, a price, a medical assessment, or a claim about fertility or childbirth ability.

## Local setup

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

## Architecture and privacy

- Next.js 16, React 19, TypeScript, and Tailwind CSS 4
- `app/CamelCalculator.tsx`: browser-only game flow, animation, sharing, and result card
- `lib/config.ts`: typed questions, category weights, tiers, preferences, and market assumptions
- `lib/scoring.ts`: pure deterministic scoring engine
- No database, accounts, analytics, image uploads, or tracking

Quiz state lives only in React memory and refresh clears it. No response is sent to a server. Sharing and the downloaded canvas card happen only after an explicit user action.

## Scoring rules

Default weighting: 35% physique and proportions, 30% face/hair/style, 15% cooking and life skills, 8% relationship qualities, 7% nurturing/family qualities, and 5% personality.

Preference-based traits use a bell-shaped proximity curve. The selected ideal earns the maximum, nearby options remain strong, and distant options taper off. “No preference” is neutral. Skipping appearance redistributes its 65% proportionally among non-appearance categories. Proportion harmony adds up to five points and a well-rounded profile adds up to three. The capped 0–100 score maps deterministically to 12–220 camels.

“Imaginary Herd Economics” assumptions live in `lib/config.ts`: USD 2,000 / 6,000 / 10,000 per ordinary working camel, a 3.75 USD-to-SAR conversion, and Saudi Arabia context. They are illustrative entertainment figures only.

## Testing

```bash
npm run format
npm run lint
npm run typecheck
npm test
npm run build
```

Tests cover weights, score bounds, nonlinear matching, no-preference behavior, appearance redistribution, determinism, bonus caps, tier boundaries, the age gate, and quiz completion.

## Accessibility

Controls use semantic browser elements, keyboard focus indicators, and visible labels. The app honors system reduced-motion preferences and offers Full, Reduced, and Off motion settings. Sound is off by default and never autoplays.

## Deployment

Deploy to Vercel with `vercel --prod`. The project also contains the workspace Sites manifest required by this build environment. No secrets or dependency folders are committed.
