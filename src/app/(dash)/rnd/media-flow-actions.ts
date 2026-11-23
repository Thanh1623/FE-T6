"use server";

import { attempt } from "@/lib/action-result";
import { revalidatePath } from "next/cache";
import { isRndEditor, requireActionUser } from "@/lib/session";
import { isTestCode } from "@/lib/tags";
import { sb } from "@/lib/supabase/admin";
import { afterApproved, logEvent, revalidateRnd } from "@/lib/rnd-flow";

// Luồng Media → luồng R&D: team xem xét mẫu Media tự test đạt WIN.
//   accept: mẫu vào quy trình R&D (từ đây mới tính vào số liệu luồng R&D), chọn điểm vào:
//     "win"  → bảng Duyệt SP Win (P4, đã có video + số liệu) — chỉ khi xác nhận đã có hàng + nguồn nhập
//     "3d"   → làm lại từ Thiết kế 3D (P0) — vd cần chỉnh mẫu trước khi sản xuất
//   dismiss: bỏ qua, mẫu chỉ ở luồng Media
async function reviewMediaWinImpl(productId: string, decision: "accept" | "dismiss", entry: "win" | "3d", teamId: string | null, note: string, hasStock: boolean) {
  const user = await requireActionUser();
  if (!isRndEditor(user) && !user.is_team_lead) throw new Error("Chỉ Quản lý / R&D / trưởng team xem xét mẫu Media WIN");
  const { data: p } = await sb.rnd().from("products").select("id, code, stage, media_review, team_id").eq("id", productId).maybeSingle();
  if (!p) throw new Error("Không tìm thấy mẫu");
  if (decision === "accept" && !isTestCode(p.code ?? "")) throw new Error("Chỉ mã SPU test của Media (T1…, T2…) mới đưa vào quy trình R&D được");
  if (decision === "accept" && entry === "win" && !hasStock) throw new Error("Vào thẳng bảng Win chỉ khi đã có hàng và nguồn nhập — chưa có thì chọn làm lại từ P1");
  if (p.stage) throw new Error("Mẫu đã ở trong quy trình R&D");
  const at = new Date().toISOString();
  const review = { media_review: decision === "accept" ? "accepted" : "dismissed", media_review_by: user.id, media_review_at: at, media_review_note: note.trim() || null };

  if (decision === "dismiss") {
    const { error } = await sb.rnd().from("products").update(review).eq("id", productId);
    if (error) throw new Error(error.message);
    await logEvent(productId, user.id, "media_win_dismissed", note.trim() ? { note: [null, note.trim()] } : null);
  } else {
    const team = teamId || p.team_id || user.team_id;
    const { error } = await sb.rnd().from("products").update({
      ...review, entry_source: "media", stage: entry === "win" ? "p4" : "p1", stage_at: at,
      approval: "approved", approved_by: user.id, approved_at: at, team_id: team, created_by: user.id, updated_by: user.id,
    }).eq("id", productId);   // trigger tự cấp Mã ST (VST…)
    if (error) throw new Error(error.message);
    await logEvent(productId, user.id, "media_win_accepted", { stage: [null, entry === "win" ? "p4" : "p1"], ...(note.trim() ? { note: [null, note.trim()] } : {}) });
    if (entry === "3d") await afterApproved(productId, user.id);   // tạo việc ở bảng Thiết kế 3D
  }
  revalidateRnd(productId);
  revalidatePath("/rnd/dashboard");
}

// ---------- Hàm gọi từ trình duyệt: trả lỗi thay vì ném (xem lib/action-result) ----------

export async function reviewMediaWin(productId: string, decision: "accept" | "dismiss", entry: "win" | "3d", teamId: string | null, note: string, hasStock = false) {
  return attempt(() => reviewMediaWinImpl(productId, decision, entry, teamId, note, hasStock));
}
