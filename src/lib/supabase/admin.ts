import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Client dùng secret key: bỏ qua RLS, chỉ được import ở server. Dùng chung 1 client cho mỗi tiến trình.
let admin: SupabaseClient | null = null;
export function supabaseAdmin() {
  admin ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false },
  });
  return admin;
}

// Truy cập theo schema nghiệp vụ (DB v2 — xem supabase/migrations/011_v2_schema.sql):
//   sb.core()   profiles, settings, sync_runs
//   sb.social() channels, channel_daily, posts   (+ rpc channel_tokens, save_channel_token, channel_totals)
//   sb.sales()  catalog, daily_sales             (+ rpc code_sales, code_sales_by_channel, page_sales, product_report)
//   sb.rnd()    products, product_events, goals, kpi_templates, test_sessions, evaluations, decisions,
//               current_decisions (view), handoffs, handoff_events
export const sb = {
  core: () => supabaseAdmin().schema("core"),
  social: () => supabaseAdmin().schema("social"),
  sales: () => supabaseAdmin().schema("sales"),
  rnd: () => supabaseAdmin().schema("rnd"),
};

// Client đọc hệ thống đơn hàng Qlydonhang (project Supabase khác), chỉ gọi RPC đọc.
export function supabaseOrders() {
  return createClient(process.env.ORDERS_SUPABASE_URL!, process.env.ORDERS_SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false },
  });
}

// Phân trang: xem lib/paging.ts (fetchAll = OFFSET song song cho bảng nhỏ; fetchAllByKey = theo khoá cho bảng lớn)
export { fetchAll, fetchAllByKey } from "@/lib/paging";
