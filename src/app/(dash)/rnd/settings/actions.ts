"use server";

import { attempt } from "@/lib/action-result";
import { requireActionUser } from "@/lib/session";
import { sb } from "@/lib/supabase/admin";
import { getRndOptions } from "@/lib/pipeline";
import { OPTION_KEYS, type Opt, type OptionKey } from "@/lib/rnd-options";
import { revalidateRnd } from "@/lib/rnd-flow";
import { TAG, bust } from "@/lib/cache-tags";

// Ô chọn 1 giá trị: đổi tên lựa chọn thì sửa luôn dữ liệu cũ (ô chọn nhiều — dòng SP, loại đá, màu — giữ nguyên chữ cũ)
const CASCADE: Partial<Record<OptionKey, { table: string; cols: string[] }>> = {
  order_status: { table: "sample_orders", cols: ["status"] },
  supplier: { table: "sample_orders", cols: ["supplier"] },
  unit: { table: "sample_orders", cols: ["unit"] },
  media_type: { table: "media_requests", cols: ["request_type"] },
  kill_reason: { table: "products", cols: ["kill_reason"] },
  source_status: { table: "products", cols: ["source_status"] },
  material: { table: "products", cols: ["material"] },
  ref_platform: { table: "products", cols: ["ref_platform"] },
  review: { table: "products", cols: ["traffic_review", "lifecycle_review"] },
};

async function saveOptionListImpl(key: OptionKey, list: Opt[], renames: [string, string][]) {
  await requireActionUser(["admin", "rnd"]);
  if (!(key in OPTION_KEYS)) throw new Error("Danh sách không hợp lệ");
  const clean = list.map((o) => ({ value: o.value.trim(), color: o.color, ...(o.flag ? { flag: o.flag } : {}) })).filter((o) => o.value);
  if (!clean.length) throw new Error("Danh sách phải có ít nhất 1 lựa chọn");
  if (new Set(clean.map((o) => o.value)).size !== clean.length) throw new Error("Có lựa chọn bị trùng tên");
  if (key === "order_status" && !clean.some((o) => o.flag === "done")) throw new Error("Cần 1 trạng thái đánh dấu “Hoàn thành SX”");

  const current = await getRndOptions();
  const { error } = await sb.core().from("settings").upsert({ key: "rnd_options", value: { ...current, [key]: clean } });
  if (error) throw new Error(error.message);
  bust(TAG.rndOptions);

  const c = CASCADE[key];
  if (c) for (const [from, to] of renames) {
    if (!from || !to || from === to) continue;
    for (const col of c.cols) await sb.rnd().from(c.table).update({ [col]: to }).eq(col, from);
  }
  revalidateRnd();
}

// ---------- Hàm gọi từ trình duyệt: trả lỗi thay vì ném (xem lib/action-result) ----------

export async function saveOptionList(key: OptionKey, list: Opt[], renames: [string, string][]) {
  return attempt(() => saveOptionListImpl(key, list, renames));
}
