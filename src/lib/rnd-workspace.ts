import "server-only";
import { isRndEditor, type CurrentUser } from "@/lib/session";
import { RND_TEAM_NAME, stageIndex, type Stage } from "@/lib/pipeline-constants";
import {
  approvedTable, collectionTable, designTable, effectTable, loadContext, mediaTable, ordersTable, trafficTable, winTable,
} from "@/lib/rnd-tables";
import { WS_KEYS, wsKeysFor, type WsData, type WsKey, type WsTable } from "@/lib/rnd-workspace-types";
import type { Col } from "@/components/grid/types";

// Không gian R&D kiểu Lark: dựng dữ liệu nhiều bảng trong 1 lượt (dùng chung loadContext).
// Trình duyệt giữ dữ liệu cả 7 bảng → chuyển bảng không cần gọi máy chủ; làm mới ở nền sau khi sửa / khi có tín hiệu.

// Cột tiền / giá vốn / lợi nhuận: Media không thấy (bỏ khỏi cột + dữ liệu từng dòng, không chỉ ẩn trên giao diện)
const MONEY_COLS = new Set(["price_ref", "expected_cost", "expected_price", "cost", "cost_other", "cost_total", "price", "ads_cost", "margin", "test_cost", "sample_cost", "capital"]);
function hideMoney(t: WsTable, keepAdd = false): WsTable {
  return {
    ...t,
    cols: t.cols.filter((c) => !MONEY_COLS.has(c.key) && c.type !== "money"),
    rows: t.rows.map((r) => ({
      ...r,
      cells: Object.fromEntries(Object.entries(r.cells).filter(([k]) => !MONEY_COLS.has(k))),
      edit: undefined, del: false,
    })),
    add: keepAdd ? t.add : null,   // bảng Sưu tầm: Media vẫn thêm được mẫu (form rút gọn), nhưng không sửa / xoá bản ghi
  };
}

export async function buildWorkspace(user: CurrentUser, keys: readonly WsKey[] = WS_KEYS): Promise<WsData> {
  const ctx = await loadContext(user);
  const pick: Col = { key: "st_code", label: "Mã ST", type: "person", people: ctx.productPick };
  const rndTeamId = ctx.teams.find((t) => t.name === RND_TEAM_NAME)?.id ?? null;
  const build: Record<WsKey, () => Promise<WsTable>> = {
    collection: async () => ({
      ...collectionTable(ctx),
      // Ai cũng thêm được mẫu sưu tầm. R&D / Quản lý: form đầy đủ. Vai trò khác (Media…): form rút gọn — ảnh, link, tên, nguồn, chỉ số, dòng SP, nhóm SP
      // (không giá, không chất liệu / loại đá); Media mặc định "Đã có source". Team và Ngày ST tự động (theo tài khoản / ngày tạo).
      add: isRndEditor(user) ? {
        defaults: { approval: "Bản nháp", team_id: rndTeamId ?? user.team_id, source_status: "Chưa có" },   // mẫu R&D thuộc team PT Sản Phẩm
        required: ["ref_url", "name", "source_status", "line", "product_group", "material", "stone"],
      } : {
        keys: ["images", "ref_url", "name", "ref_platform", "ref_metrics", "line", "product_group"],
        defaults: { approval: "Bản nháp", team_id: null, source_status: user.role === "media" ? "Đã có source" : "Chưa có" },
        required: ["ref_url", "name", "line", "product_group"],
      },
    }),
    approved: async () => ({ ...approvedTable(ctx), add: null }),
    design: async () => ({ ...designTable(ctx), add: null }),
    orders: async () => ({ ...(await ordersTable(ctx)), add: isRndEditor(user) ? { cols: { st_code: pick } } : null }),
    media: async () => ({
      ...mediaTable(ctx),
      add: isRndEditor(user) || user.role === "media" || user.is_team_lead ? { cols: { st_code: pick } } : null,
    }),
    traffic: async () => ({ ...(await trafficTable(ctx)), add: null }),
    win: async () => ({ ...(await winTable(ctx)), add: null }),
    effect: async () => ({ ...(await effectTable(ctx)), add: null }),
  };
  const allowed = wsKeysFor(user.role);
  const valid = keys.filter((k) => k in build && allowed.includes(k));
  const built = (await Promise.all(valid.map((k) => build[k]()))).map((t, i) => (user.role === "media" ? hideMoney(t, valid[i] === "collection") : t));

  // Số trên thanh bảng = SỐ MẪU ĐÃ ĐI QUA bước đó (P1 gồm cả mẫu đã sang P2…), không phải chỉ mẫu đang đứng ở bước — khớp số dòng của từng bảng (cùng quy tắc với rnd/layout.tsx)
  const reached = (min: Stage) => ctx.products.filter((p) => p.stage && stageIndex(p.stage as Stage) >= stageIndex(min)).length;
  const counts: Record<string, number> = {
    "/rnd": reached("p0"), "/rnd/approved": reached("p1"), "/rnd/design-3d": ctx.design.size, "/rnd/orders": 0,   // P2 = số mẫu đã vào sản xuất (Vẽ 3D + Đặt hàng gộp 1 tab)
    "/rnd/media": reached("p3"), "/rnd/traffic": reached("p4"), "/rnd/win": reached("p5"), "/rnd/commercial": reached("p6"),
  };
  const tables = Object.fromEntries(valid.map((k, i) => [k, built[i]])) as WsData["tables"];
  // Đã dựng bảng nào thì số = số dòng của bảng đó (khớp danh sách đang hiện)
  if (tables.collection) counts["/rnd"] = tables.collection.rows.length;
  if (tables.approved) counts["/rnd/approved"] = tables.approved.rows.length;
  if (tables.traffic) counts["/rnd/traffic"] = tables.traffic.rows.length;
  if (tables.win) counts["/rnd/win"] = tables.win.rows.length;
  if (tables.effect) counts["/rnd/commercial"] = tables.effect.rows.length;
  return { tables, counts, at: Date.now(), allowed };
}
