import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { sb } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/rnd-flow";

// GET /api/rnd/source?product=<id> — team bấm "Lấy source": ghi nhận ai (team nào) lấy rồi chuyển tới kho source của sản phẩm.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  if (user.role !== "admin" && user.role !== "rnd" && user.role !== "media") return NextResponse.json({ error: "Không có quyền" }, { status: 403 });

  const id = new URL(req.url).searchParams.get("product") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Mã sản phẩm không hợp lệ" }, { status: 400 });
  const { data: p } = await sb.rnd().from("products").select("id, source_url").eq("id", id).maybeSingle();
  const url = (p?.source_url as string | null)?.trim();
  // Chỉ chuyển tới http(s) — không chuyển hướng tới scheme lạ (javascript:, data:…)
  if (!url || !/^https?:\/\//i.test(url)) return NextResponse.json({ error: "Sản phẩm này chưa có link source" }, { status: 404 });

  await logEvent(id, user.id, "source_taken", { team: [null, user.team_id] });
  return NextResponse.redirect(url);
}
