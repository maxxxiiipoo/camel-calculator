import { env } from "cloudflare:workers";

export const runtime = "edge";

type Bindings = { DB: D1Database; LEADERBOARD_PHOTOS: R2Bucket };

const bindings = () => env as unknown as Bindings;

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const storage = await bindings();
  const row = await storage.DB.prepare("SELECT photo_key AS photoKey FROM leaderboard_entries WHERE id = ?").bind(id).first<{ photoKey: string }>();
  if (!row) return new Response("Not found", { status: 404 });
  const object = await storage.LEADERBOARD_PHOTOS.get(row.photoKey);
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body, {
    headers: {
      "content-type": "image/jpeg",
      "cache-control": "public, max-age=86400",
      "x-content-type-options": "nosniff",
    },
  });
}
