import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { buildWorkspace } from "@/lib/rnd-workspace";
import { wsKeysFor, type WsKey } from "@/lib/rnd-workspace-types";

// Dữ liệu các bảng R&D cho không gian làm việc phía trình duyệt (tải ngầm / làm mới ở nền).
// Dùng route GET thay vì server action: Next xếp hàng server action nối tiếp nhau → tải nền sẽ chặn thao tác sửa ô.
// Quyền giống hệt trang: dữ liệu dựng theo người đang đăng nhập (giá vốn / lợi nhuận đã lọc ở máy chủ).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const asked = req.nextUrl.searchParams.get("keys")?.split(",") ?? [];
  const allowed = wsKeysFor(user.role);
  const keys = asked.length ? allowed.filter((k) => asked.includes(k)) : [...allowed];
  try {
    const data = await buildWorkspace(user, keys as WsKey[]);
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("[rnd/workspace]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Lỗi tải dữ liệu" }, { status: 500 });
  }
}
