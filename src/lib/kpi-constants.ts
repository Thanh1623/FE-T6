// Chỉ số dùng trong KPI (dùng chung server + client). Thêm chỉ số mới: khai báo ở đây + tính ở bộ máy đánh giá.
// group: 'traffic' | 'sales' — dùng để chấm tín hiệu phụ.

export const KPI_METRICS = {
  views:           { label: "Lượt xem",           unit: "",  group: "traffic", hint: "Tổng lượt xem các bài gắn mã" },
  viewers:         { label: "Người xem",          unit: "",  group: "traffic", hint: "Cộng dồn người xem các bài" },
  reactions:       { label: "Cảm xúc",            unit: "",  group: "traffic", hint: "Like, love... trên các bài" },
  clicks:          { label: "Lượt nhấp",          unit: "",  group: "traffic", hint: "Nhấp vào bài/link" },
  engagement_rate: { label: "Tỉ lệ tương tác",    unit: "%", group: "traffic", hint: "(Cảm xúc + lượt nhấp) ÷ người xem" },
  ctr:             { label: "CTR",                unit: "%", group: "traffic", hint: "Lượt nhấp ÷ lượt xem" },
  qty_net:         { label: "SL bán thuần",       unit: "",  group: "sales",   hint: "Số lượng bán trừ hoàn, theo phạm vi của phiên" },
  conversion:      { label: "Chuyển đổi",         unit: "%", group: "sales",   hint: "SL bán thuần ÷ người xem" },
} as const;
export type KpiMetric = keyof typeof KPI_METRICS;

export const KPI_OPS = { ">=": "≥", "<=": "≤" } as const;
export type KpiOp = keyof typeof KPI_OPS;

export type KpiRule = { metric: KpiMetric; op: KpiOp; value: number };

export const RESULT_LABELS = { win: "WIN", win_traffic: "WIN TRAFFIC", win_sp: "WIN SP", fail: "FAIL" } as const;
export type TestResult = keyof typeof RESULT_LABELS;

export const SALES_SCOPES = { all: "Toàn hệ thống", pages: "Chỉ đơn từ Trang test", channels: "Chỉ các kênh" } as const;
export type SalesScope = keyof typeof SALES_SCOPES;

export function fmtRule(r: KpiRule) {
  const m = KPI_METRICS[r.metric];
  const v = `${r.value.toLocaleString("vi-VN")}${m.unit}`;
  return `${m.label} ${KPI_OPS[r.op]} ${v}`;
}

// Kiểm tra rules nhập từ form / JSON
export function parseRules(raw: unknown): KpiRule[] | string {
  if (!Array.isArray(raw) || raw.length === 0) return "Cần ít nhất 1 điều kiện KPI";
  const out: KpiRule[] = [];
  for (const r of raw) {
    const metric = r?.metric, op = r?.op, value = Number(r?.value);
    if (!(metric in KPI_METRICS)) return `Chỉ số không hợp lệ: ${metric}`;
    if (!(op in KPI_OPS)) return `Phép so sánh không hợp lệ: ${op}`;
    if (!Number.isFinite(value) || value < 0) return `Ngưỡng của "${KPI_METRICS[metric as KpiMetric].label}" phải là số ≥ 0`;
    out.push({ metric, op, value });
  }
  return out;
}

type TemplateLike = { goal_code: string; line: string | null; campaign: string | null; is_default: boolean; is_active: boolean };

// Mẫu KPI phù hợp nhất: cùng mục tiêu, ưu tiên khớp line + chiến dịch > line > chiến dịch > mặc định
export function suggestTemplate<T extends TemplateLike>(templates: T[], goal: string, line?: string | null, campaign?: string | null): T | null {
  const norm = (s?: string | null) => (s ?? "").trim().toLowerCase();
  const score = (t: T) => {
    if (t.goal_code !== goal || !t.is_active) return -1;
    if (t.line && norm(t.line) !== norm(line)) return -1;
    if (t.campaign && norm(t.campaign) !== norm(campaign)) return -1;
    return (t.line ? 4 : 0) + (t.campaign ? 2 : 0) + (t.is_default ? 1 : 0);
  };
  return templates.map((t) => [t, score(t)] as const).filter(([, s]) => s >= 0).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}
