"use server";

import { revalidatePath } from "next/cache";
import { canApprove, isRndEditor, requireActionUser } from "@/lib/session";
import { sb } from "@/lib/supabase/admin";
import type { FormState } from "./actions";

// Số liệu nhập tay cho đánh giá thương mại hoá: chi phí quay mẫu, chi phí vận hành / sp, thời gian sản xuất hàng loạt, SL đặt tối thiểu.
// Ô để trống = xoá (dùng mặc định: vận hành theo % cài đặt, thời gian sản xuất 30 ngày, bội số đặt 1). Quản lý / R&D / trưởng team của mẫu.
export async function saveCommercialInputs(productId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireActionUser();
  const { data: p } = await sb.rnd().from("products").select("id, team_id, stage").eq("id", productId).maybeSingle();
  if (!p || !p.stage) return { error: "Chỉ mẫu trong quy trình R&D mới có đánh giá thương mại hoá" };
  if (!isRndEditor(user) && !canApprove(user, (p.team_id as string | null) ?? null)) return { error: "Chỉ Quản lý / R&D / trưởng team của mẫu nhập số liệu này" };

  const read = (k: string, min: number): number | null | "bad" => {
    const raw = String(form.get(k) ?? "").replace(/[.\s]/g, "").replace(",", ".").trim();
    if (!raw) return null;
    const n = Math.round(Number(raw));
    return Number.isFinite(n) && n >= min ? n : "bad";
  };
  const video = read("video_cost", 0), ops = read("ops_cost", 0), lead = read("lead_days", 0), minQty = read("min_order_qty", 1);
  if ([video, ops, lead, minQty].includes("bad")) return { error: "Mỗi ô phải là số nguyên không âm (SL đặt tối thiểu từ 1)" };

  const { error } = await sb.rnd().from("products").update({ video_cost: video, ops_cost: ops, lead_days: lead, min_order_qty: minQty, updated_by: user.id }).eq("id", productId);
  if (error) return { error: error.code === "42703" || error.code === "PGRST204" ? "Chưa chạy migration 039 trong Supabase" : error.message };
  revalidatePath(`/rnd/${productId}`);
  return { ok: true };
}
