import { getRepo } from "@/lib/repo";

// Serves an output copied into application-controlled storage (see asset-store.ts).
export async function GET(_req: Request, ctx: RouteContext<"/api/asset/[id]">) {
  const { id } = await ctx.params;
  const asset = getRepo().getAsset(id);
  if (!asset) return new Response("Not found", { status: 404 });
  const bytes = Buffer.from(asset.data, "base64");
  return new Response(bytes, {
    headers: { "Content-Type": asset.mime, "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
