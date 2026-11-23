import "server-only";
import { sb } from "@/lib/supabase/admin";
import { parseRules, type KpiRule } from "@/lib/kpi-constants";
import { DEFAULT_SPU_RULES, type SpuRules, type WinRules } from "@/lib/spu-tracking";

// Ngưỡng phân loại SPU. Quản lý chỉnh ở trang KPI:
//   • SP Ngôi sao: điều kiện KPI riêng + số ngày thống kê (core.settings 'spu_rules')
//   • SP Win = SPU đạt KPI Bán hàng · Win Traffic = SPU đạt KPI Traffic — lấy thẳng từ 2 bộ KPI mặc định (kpi_templates), tính trong cửa sổ test
//   • Bán chậm / tồn xấu: ngưỡng tồn kho (cùng settings)
// Thiếu hoặc sai kiểu → dùng mặc định trong lib/spu-tracking.
export const SPU_RULES_KEY = "spu_rules";

const num = (v: unknown, d: number, min = 0) => (typeof v === "number" && Number.isFinite(v) && v >= min ? v : d);
type Obj = Record<string, unknown> | undefined;

// Ngưỡng phân loại bán theo SL bán 30 ngày: bán chậm khi dưới slowBelow, bán thường khi dưới normalBelow, bán chạy từ normalBelow trở lên (normalBelow phải lớn hơn slowBelow)
function salesRules(v: Obj) {
  const d = DEFAULT_SPU_RULES.sales;
  const slowBelow = Math.max(1, Math.round(num(v?.slowBelow, d.slowBelow)));
  const normalBelow = Math.round(num(v?.normalBelow, d.normalBelow));
  return normalBelow > slowBelow ? { slowBelow, normalBelow } : d;
}

// Quy tắc Win theo biên bản họp (trang KPI): số nguyên dương; thiếu hoặc sai kiểu → dùng mặc định
function winRules(v: Obj): WinRules {
  const d = DEFAULT_SPU_RULES.win;
  const t = (v?.traffic ?? {}) as Obj, o = (v?.order ?? {}) as Obj;
  const int = (x: unknown, def: number, min: number, max = 1_000_000_000) => Math.min(max, Math.max(min, Math.round(num(x, def, min))));
  return {
    traffic: { days: int(t?.days, d.traffic.days, 1, 30), views: int(t?.views, d.traffic.views, 1), comments: int(t?.comments, d.traffic.comments, 0) },
    order: { days: int(o?.days, d.order.days, 1, 30), qty: int(o?.qty, d.order.qty, 1) },
  };
}

export function mergeSpuRules(saved: unknown): SpuRules {
  const s = (saved ?? {}) as Record<string, Obj>;
  const d = DEFAULT_SPU_RULES;
  const videoRules = parseRules((s.video as Obj)?.rules);
  return {
    ...d,
    sales: salesRules(s.sales),
    win: winRules(s.win),
    video: { rules: typeof videoRules === "string" ? d.video.rules : videoRules, match: (s.video as Obj)?.match === "any" ? "any" : "all" },
  };
}

export async function loadSpuRules(): Promise<SpuRules> {
  const { data } = await sb.core().from("settings").select("value").eq("key", SPU_RULES_KEY).maybeSingle();
  return mergeSpuRules(data?.value);
}

// Tiêu chí Video Win đang dùng (đã chỉnh hoặc mặc định) — chấm từng video ở mọi nơi hiện nhãn "đạt KPI"
export async function loadVideoWinRules(): Promise<{ rules: KpiRule[]; match: "all" | "any" }> {
  const { data } = await sb.core().from("settings").select("value").eq("key", SPU_RULES_KEY).maybeSingle();
  return mergeSpuRules(data?.value).video;
}
