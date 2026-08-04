// Vercel serves the UI only; leaderboard requests target the Sites origin.
// This build-time stub prevents Vercel from bundling Cloudflare's runtime module.
export const env: Record<string, unknown> = {};
