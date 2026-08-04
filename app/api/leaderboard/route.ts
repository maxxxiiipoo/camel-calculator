import { env } from "cloudflare:workers";

export const runtime = "edge";

type Bindings = {
  DB: D1Database;
  LEADERBOARD_PHOTOS: R2Bucket;
};

const bindings = () => env as unknown as Bindings;

const allowedOrigin = (origin: string) =>
  origin === "https://camel-calculator.mghockey61858841.chatgpt.site" ||
  origin === "https://camel-calculator-blond.vercel.app" ||
  /^https:\/\/camel-calculator-[a-z0-9-]+-max-fb1e\.vercel\.app$/.test(origin);

function cors(request: Request) {
  const origin = request.headers.get("origin") ?? "";
  return {
    "access-control-allow-origin": allowedOrigin(origin) ? origin : "https://camel-calculator-blond.vercel.app",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    vary: "Origin",
  };
}

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: cors(request) });
}

export async function GET(request: Request) {
  const storage = await bindings();
  const result = await storage.DB.prepare(`
    SELECT id, display_name AS displayName, camel_count AS camelCount, submitted_at AS submittedAt,
           RANK() OVER (ORDER BY sortable_score DESC, submitted_at ASC) AS rank
    FROM leaderboard_entries
    ORDER BY sortable_score DESC, submitted_at ASC
    LIMIT 100
  `).all<{ id: string; displayName: string; camelCount: number; submittedAt: string; rank: number }>();
  const origin = new URL(request.url).origin;
  const entries = result.results.map((entry) => ({
    ...entry,
    photoUrl: `${origin}/api/leaderboard/photo/${entry.id}`,
  }));
  return Response.json({ entries }, { headers: { ...cors(request), "cache-control": "public, max-age=30" } });
}

export async function POST(request: Request) {
  const headers = cors(request);
  const origin = request.headers.get("origin") ?? "";
  if (!allowedOrigin(origin)) return Response.json({ error: "Submission origin is not allowed." }, { status: 403, headers });
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 700_000) return Response.json({ error: "Leaderboard image is too large." }, { status: 413, headers });

  const form = await request.formData();
  const displayName = String(form.get("displayName") ?? "Desert Traveler").trim().slice(0, 24) || "Desert Traveler";
  const camelCount = Number(form.get("camelCount"));
  const consent = form.get("consent") === "true";
  const photo = form.get("photo");
  if (!consent || !Number.isInteger(camelCount) || camelCount < 12 || camelCount > 220 || !(photo instanceof File)) {
    return Response.json({ error: "Invalid leaderboard submission." }, { status: 400, headers });
  }
  if (photo.type !== "image/jpeg" || photo.size < 100 || photo.size > 500_000) {
    return Response.json({ error: "Use the processed JPEG leaderboard preview." }, { status: 400, headers });
  }
  const bytes = new Uint8Array(await photo.arrayBuffer());
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    return Response.json({ error: "Invalid leaderboard image." }, { status: 400, headers });
  }

  const storage = await bindings();
  const id = crypto.randomUUID();
  const photoKey = `leaderboard/${id}.jpg`;
  const now = new Date().toISOString();
  await storage.LEADERBOARD_PHOTOS.put(photoKey, bytes, {
    httpMetadata: { contentType: "image/jpeg", cacheControl: "public, max-age=86400" },
  });
  try {
    await storage.DB.prepare(`
      INSERT INTO leaderboard_entries
        (id, display_name, camel_count, sortable_score, photo_key, consented_at, submitted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(id, displayName, camelCount, camelCount, photoKey, now, now).run();
  } catch {
    await storage.LEADERBOARD_PHOTOS.delete(photoKey);
    return Response.json({ error: "The caravan could not save this entry." }, { status: 500, headers });
  }
  return Response.json({ id }, { status: 201, headers });
}
