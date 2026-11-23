"use server";

import { attempt } from "@/lib/action-result";
import { requireActionUser } from "@/lib/session";
import { sb } from "@/lib/supabase/admin";

// Tuỳ chọn hiển thị của bảng (bộ lọc, cột ẩn, chiều cao hàng…) lưu THEO TÀI KHOẢN trong core.settings
// (khoá "grid:<mã người dùng>:<tên bảng>") → đăng nhập máy khác vẫn còn. Trình duyệt giữ thêm 1 bản đệm trong localStorage.
const MAX_BYTES = 20_000;
const keyOf = (userId: string, table: string) => `grid:${userId}:${table.slice(0, 40).replace(/[^\w-]/g, "_")}`;

export async function getGridPrefs(table: string) {
  return attempt(async () => {
    const user = await requireActionUser();
    const { data } = await sb.core().from("settings").select("value").eq("key", keyOf(user.id, table)).maybeSingle();
    return (data?.value as Record<string, unknown> | undefined) ?? null;
  });
}

export async function saveGridPrefs(table: string, prefs: Record<string, unknown>) {
  return attempt(async () => {
    const user = await requireActionUser();
    if (!prefs || typeof prefs !== "object" || Array.isArray(prefs)) throw new Error("Tuỳ chọn không hợp lệ");
    if (JSON.stringify(prefs).length > MAX_BYTES) throw new Error("Tuỳ chọn quá lớn");
    const { error } = await sb.core().from("settings").upsert({ key: keyOf(user.id, table), value: prefs, updated_by: user.id, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
  });
}
