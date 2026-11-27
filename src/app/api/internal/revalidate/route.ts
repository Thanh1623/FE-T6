import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { TAG } from "@/lib/cache-tags";
import { isAuthorized } from "@/lib/sync/auth";

const ALLOWED = new Set<string>(Object.values(TAG));

/** Nest worker gọi sau bust/bustSoft — cùng profile "max" | { expire: 0 }. */
export async function POST(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { tags?: unknown; profile?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const tags = Array.isArray(body.tags)
    ? body.tags.filter((t): t is string => typeof t === "string" && ALLOWED.has(t))
    : [];
  const soft = body.profile === "max";
  for (const t of tags) {
    if (soft) revalidateTag(t, "max");
    else revalidateTag(t, { expire: 0 });
  }
  return NextResponse.json({ revalidated: tags });
}
