import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/sync/auth";
import { setupChannels } from "@/lib/sync";
import { metaTokens } from "@/lib/meta/token";

// POST /api/setup: đọc FB_USER_TOKEN / FB_SYSTEM_TOKEN, lưu các Trang + Page Token vào DB.
// Chạy lại khi thêm Trang mới, liên kết Instagram, hoặc token bị thu hồi.
export async function POST(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tokens = metaTokens();
  if (!tokens.length) return NextResponse.json({ error: "Thiếu FB_USER_TOKEN / FB_SYSTEM_TOKEN" }, { status: 500 });

  try {
    const accounts = [];
    for (const t of tokens) accounts.push(...(await setupChannels(t.token, t.source)));
    return NextResponse.json({ accounts });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
