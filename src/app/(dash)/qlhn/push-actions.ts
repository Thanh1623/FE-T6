"use server";

import { revalidatePath } from "next/cache";
import { requireActionUser } from "@/lib/session";
import { sb } from "@/lib/supabase/admin";
import { getTeams } from "@/lib/pipeline";
import { loadPushRequests } from "@/lib/team-push";

// Yêu cầu đẩy hàng (bảng 3 của QLHH, migration 085): Quản lý giao cho team; team cập nhật trạng thái. Hoàn thành chỉ được xác nhận khi số video THỰC TẾ team đã đăng cho SPU từ ngày tạo yêu cầu đạt mục tiêu.
export type PushResult = { ok: true } | { ok: false; error: string };
const fail = (error: string): PushResult => ({ ok: false, error });
const missing = (e: { code?: string; message?: string } | null) => e?.code === "PGRST205" || e?.code === "42P01" || /push_requests/.test(e?.message ?? "");

export async function createPushRequest(input: { code: string; team: string; priority: string; target: number; due: string | null; note: string }): Promise<PushResult> {
  const user = await requireActionUser(["admin"]);
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,20}$/.test(code)) return fail("Mã SPU không hợp lệ");
  const teams = await getTeams(true);
  if (!teams.some((t) => t.name === input.team)) return fail("Chọn team được giao");
  const target = Math.floor(Number(input.target));
  if (!Number.isFinite(target) || target < 1 || target > 200) return fail("Số video mục tiêu từ 1 đến 200");
  const priority = ["high", "mid", "low"].includes(input.priority) ? input.priority : "mid";
  if (input.due && !/^\d{4}-\d{2}-\d{2}$/.test(input.due)) return fail("Hạn hoàn thành không hợp lệ");
  const { error } = await sb.sales().from("push_requests").insert({
    code, team: input.team, priority, target_videos: target, due_on: input.due || null, note: input.note.trim().slice(0, 500) || null,
    created_by: user.id, created_by_name: user.full_name ?? null,
  });
  if (error) return fail(missing(error) ? "Chưa chạy migration 085 trong Supabase" : error.message);
  revalidatePath("/qlhn");
  return { ok: true };
}

export async function setPushStatus(id: number, status: "todo" | "doing" | "done"): Promise<PushResult> {
  const user = await requireActionUser();   // Quản lý, hoặc trưởng team của team được giao
  if (!["todo", "doing", "done"].includes(status)) return fail("Trạng thái không hợp lệ");
  const all = await loadPushRequests(null).catch(() => []);
  const r = all.find((x) => x.id === id);
  if (!r) return fail("Không tìm thấy yêu cầu");
  const myTeam = user.is_team_lead && user.team_id ? (await getTeams(true)).find((t) => t.id === user.team_id)?.name ?? null : null;
  if (user.role !== "admin" && !(myTeam && myTeam === r.team)) return fail("Chỉ Quản lý hoặc trưởng team được giao mới cập nhật yêu cầu này");
  if (status === "done" && r.done_videos < r.target) return fail(`Chưa đủ video thực tế: team mới đăng ${r.done_videos}/${r.target} video cho ${r.code} từ ngày giao việc`);
  const now = new Date().toISOString();
  const patch = status === "doing" ? { status, started_at: r.started ?? now, done_at: null } : status === "done" ? { status, started_at: r.started ?? now, done_at: now } : { status, started_at: null, done_at: null };
  const { error } = await sb.sales().from("push_requests").update(patch).eq("id", id);
  if (error) return fail(error.message);
  revalidatePath("/qlhn");
  return { ok: true };
}

export async function deletePushRequest(id: number): Promise<PushResult> {
  await requireActionUser(["admin"]);
  const { error } = await sb.sales().from("push_requests").delete().eq("id", id);
  if (error) return fail(error.message);
  revalidatePath("/qlhn");
  return { ok: true };
}
