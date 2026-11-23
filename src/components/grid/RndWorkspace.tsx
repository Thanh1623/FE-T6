"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import DataGrid from "./DataGrid";
import { age, hasAll, refresh, refreshSoon, seed, useRndError, useRndStore } from "./rnd-store";
import { RND_CHANNEL, wsKeyOf, type WsData, type WsKey } from "@/lib/rnd-workspace-types";
import { addRow, deleteRows, restoreRows, saveCell } from "@/app/(dash)/rnd/grid-actions";

// Cấu hình hiển thị từng bảng (dữ liệu + quyền thêm do máy chủ gửi kèm)
const META: Record<WsKey, { flow: string; scope: string; tabsKey?: string; tabsKey2?: string; addForm?: string; monthKey?: string; defaultHidden?: string[]; cardShow?: string[]; defaultCover?: string; defaultGroup?: string; groupRev?: number; defaultView?: "table" | "gallery"; remove?: boolean; addKeys?: string[] }> = {
  collection: {
    scope: "MỖI DÒNG = một mẫu. Gồm TOÀN BỘ mẫu đã sưu tầm, kể cả mẫu đã đi hết quy trình (chủ ý: đây là kho tra cứu đầy đủ) — dùng ô Nhóm / bộ lọc để xem riêng mẫu đang chờ duyệt.",
    tabsKey: "approval", addForm: "Thêm mẫu sưu tầm", monthKey: "created_at", remove: true, defaultHidden: ["expected_price", "sample_received", "sample_days", "code", "kill_reason", "images_3d"],   // ẩn sẵn: thông tin của bước sau (ra mẫu, SPU) và lý do kill
    cardShow: ["phase", "approval", "ref_url", "images", "name", "line", "product_group", "material", "stone", "created_by", "code", "score"],
    defaultGroup: "approval",   // gom theo Duyệt mẫu ST (Chờ duyệt / Đã duyệt / Từ chối)
    addKeys: ["images", "ref_url", "name", "ref_platform", "ref_metrics", "price_ref", "source_status", "line", "product_group", "material", "stone", "expected_cost", "expected_price", "approval"],
    flow: "P0: ai cũng thêm được mẫu sưu tầm. Mẫu do Media / người ngoài R&D thêm ở lại P0 (Bản nháp), không tự vào luồng; R&D thấy mẫu đẹp thì chọn “Đã duyệt” → P1. Mẫu của R&D: Gửi duyệt (Chờ duyệt) → Quản lý / trưởng team chọn “Đã duyệt” → P1. Bấm “Bắt đầu sản xuất” ở trang mẫu → P2 (bảng Sản xuất mẫu).",
  },
  approved: {
    scope: "MỖI DÒNG = một mẫu. Gồm mọi mẫu ĐÃ QUA bước duyệt (P1 trở đi); mẫu đã đi tiếp vẫn hiện để tra cứu nhưng không sửa được cột Trạng thái.",
    monthKey: "approved_at", defaultHidden: ["images_3d"],   // Ảnh 3D chỉ làm nguồn ảnh thứ hai trên thẻ (nút Ảnh SP ↔ Ảnh 3D)
    cardShow: ["phase", "start", "images", "name", "product_group", "material", "stone", "created_by"],
    flow: "P1: mẫu đã duyệt chờ sản xuất. R&D chọn mẫu nào đi làm trước: đổi Trạng thái → “Bắt đầu sản xuất” → mẫu sang P2 (bảng Sản xuất mẫu, công đoạn đầu Vẽ 3D).",
  },
  design: {
    scope: "MỖI DÒNG = một bản vẽ 3D của một mẫu. Gồm mẫu từ P2 trở đi (mẫu còn chờ sản xuất nằm ở bảng Đã duyệt).",
    tabsKey: "draw_status", monthKey: "received", defaultView: "table", remove: true, defaultHidden: ["review_note", "days", "team", "creator"],   // Team / Người ST: thông tin của bước sưu tầm
    groupRev: 1,   // đổi cách nhóm mặc định (Duyệt 3D → Trạng thái vẽ 3D): nhóm đã lưu trước đây bị bỏ qua một lần
    defaultGroup: "draw_status",   // thẻ / dòng gom theo Chưa vẽ → Đang vẽ → Đã vẽ → Hoàn thành (thứ tự của danh sách trạng thái); ai muốn bỏ nhóm bấm Nhóm
    defaultCover: "images_3d",   // bảng Vẽ 3D: bìa thẻ là Ảnh 3D (chưa có thì Ảnh SP); bấm nút trên ảnh để đối chiếu
    cardShow: ["phase", "received", "name", "images", "ref_url", "images_3d", "file_url", "draw_status", "review"],
    flow: "P2 · công đoạn ①. Mẫu bắt đầu sản xuất → giao Người vẽ → người vẽ thêm Ảnh 3D / File 3D, chọn “Hoàn thành” → Duyệt 3D “Đạt” → tự tạo đơn ở công đoạn ② Đặt hàng (“Sửa lại” → người vẽ làm tiếp).",
  },
  orders: {
    scope: "MỖI DÒNG = một ĐƠN ĐẶT MẪU, không phải một mẫu — một mẫu đặt nhiều đơn sẽ có nhiều dòng (cùng Mã ST). Tổng ở chân bảng là tổng của các ĐƠN.",
    tabsKey: "status", monthKey: "ordered_at", defaultView: "table", remove: true, defaultHidden: ["collector", "team_id", "updated_at", "images_3d"],
    cardShow: ["phase", "code", "name", "status", "ordered_at", "qty", "unit", "images", "material", "stone", "color", "cost"],   // thẻ gọn: đơn giá, ngày đặt, số lượng; xưởng / ghi chú / giá khác xem ở trang chi tiết
    defaultGroup: "status",   // gom theo trạng thái đơn: Chưa đặt → Đã đặt hàng → Hoàn thành mẫu
    addKeys: ["st_code", "status", "supplier", "qty", "unit", "color", "ordered_at", "expected_at", "cost", "cost_other", "price", "weight_chi", "size", "note"],
    flow: "P2 · công đoạn ②. 3D đạt → tự tạo đơn. Một mẫu có thể đặt nhiều đơn. Trạng thái: Đặt hàng → Chốt đúc → Hoàn thành; “Hoàn thành” → ghi ngày nhận, mẫu sang P3 (bảng Hoàn thành mẫu). Thời gian từng bước tự tính.",
  },
  media: {
    scope: "MỖI DÒNG = một YÊU CẦU QUAY, không phải một mẫu — một mẫu có thể có nhiều yêu cầu (cùng Mã ST). Yêu cầu tự tạo khi đơn đặt mẫu chuyển Hoàn thành.",
    tabsKey: "status", monthKey: "received_at", remove: true, defaultHidden: ["review_note", "created_by", "images_3d", "team_id", "collector"],   // Media quay sản phẩm thật — không cần ảnh 3D
    cardShow: ["phase", "code", "received_at", "deadline", "name", "photos", "images", "images_3d", "assignee_id", "status", "drive_url", "done_at"],
    defaultGroup: "phase",   // gom theo Giai đoạn hiện tại
    addKeys: ["st_code", "received_at", "deadline", "assignee_id", "lead_id", "drive_url", "note"],
    flow: "P3 · Hoàn thành mẫu: yêu cầu “Quay sản phẩm” tự tạo khi đơn Hoàn thành mẫu. Người phụ trách (team PT Sản Phẩm) nhập link drive, chọn “Hoàn thành” → mẫu sang P4. Mẫu Win (P5) chọn tay “Quay chế tác” ở trang mẫu. Gắn SPU (hashtag) ở cột SPU trước khi đăng video.",
  },
  traffic: {
    scope: "MỖI DÒNG = một mẫu. CHỈ mẫu đã có mã SPU VÀ đã có video gắn mã (hoặc hệ thống đã chấm). Mẫu chưa gắn mã SPU sẽ không hiện ở đây dù đã tới P3/P4.",
    tabsKey: "suggested", monthKey: "first_post", defaultHidden: ["expected_cost", "received", "kpi_detail", "decided_at", "decided_by", "drift", "images_3d"],   // ngày tiếp nhận (P3), chi tiết KPI, quyết định duyệt + cảnh báo (bảng Win)
    cardShow: ["code", "images", "name", "suggested", "phase", "all_views", "all_videos", "views", "videos", "sold", "forecast", "test_day", "first_post", "expected_price", "group", "video_url", "traffic_review"],
    flow: "Chỉ mẫu ĐÃ LÊN VIDEO (bài gắn hashtag mã SPU). Views, số video, tương tác, SL bán / hoàn tự cập nhật mỗi lần đồng bộ; hệ thống chấm KPI và cập nhật đề xuất WIN / WIN TRAFFIC / FAIL, tiến độ test, dự báo cuối kỳ → P5 do hệ thống tự lên khi đánh giá WIN / WIN TRAFFIC. Mẫu chưa đăng video nằm ở bảng Hoàn thành mẫu.",
  },
  win: {
    scope: "MỖI DÒNG = một mẫu. Gồm mẫu đã Win (P5) và đã thương mại hoá (P6); mẫu còn ở P4 chỉ hiện khi là mẫu Media hoặc hệ thống đã đề xuất WIN — số còn lại nằm ở bảng Đăng video.",
    tabsKey: "suggested", monthKey: "first_post", defaultHidden: ["images_3d"],
    flow: "P5 · Win: trạng thái WIN / WIN TRAFFIC do hệ thống tự chấm. Quản lý / trưởng team duyệt tay ở cột “Duyệt thương mại hoá”: Thương mại hoá → sang P6 (tự tạo phiếu đẩy mẫu ĐVKD nếu có kho Source); Không thương mại hoá → dừng mẫu. Chọn khác đề xuất → ghi lý do ở cột Ghi chú duyệt trước.",
  },
  effect: {
    scope: "MỖI DÒNG = một mẫu. Chỉ mẫu đã được duyệt thương mại hoá (P6).",
    tabsKey: "lifecycle_review", monthKey: "launch_date", defaultHidden: ["images_3d"],
    flow: "Mẫu Win thương mại hoá. SL bán / hoàn / doanh thu tính 30 ngày từ Ngày mở bán (sửa được), views và tương tác từ video gắn mã.",
  },
};

// Kênh realtime dùng chung (1 kết nối / tab). Chỉ nhận tín hiệu "có thay đổi" — dữ liệu luôn lấy qua API có kiểm tra quyền.
let channelUsers = 0;
let unsubscribe: (() => void) | null = null;
// Đang nhận được tín hiệu realtime → người khác sửa là biết ngay, nên làm mới dự phòng theo giờ chỉ cần thưa (mỗi lượt dựng lại cả 8 bảng ở máy chủ).
// Mất kết nối / chưa kết nối được → quay về 1 phút như cũ. Quay lại tab (dữ liệu > 20 giây) vẫn làm mới ngay.
let realtimeLive = false;
const FALLBACK_LIVE_MS = 5 * 60_000, FALLBACK_DOWN_MS = 55_000;
function subscribeChanges() {
  channelUsers += 1;
  if (!unsubscribe) {
    try {
      const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const ch = client.channel(RND_CHANNEL).on("broadcast", { event: "changed" }, () => refreshSoon()).subscribe((status) => { realtimeLive = status === "SUBSCRIBED"; });
      unsubscribe = () => { realtimeLive = false; void client.removeChannel(ch); };
    } catch { /* realtime không dùng được → còn làm mới khi quay lại tab + mỗi 60 giây */ }
  }
  return () => {
    channelUsers -= 1;
    if (!channelUsers && unsubscribe) { unsubscribe(); unsubscribe = null; }
  };
}

export default function RndWorkspace({ initial }: { initial: WsData }) {
  const path = usePathname();
  const key = wsKeyOf(path) ?? (Object.keys(initial.tables)[0] as WsKey);
  const store = useRndStore();
  const err = useRndError();

  // Nhận dữ liệu máy chủ dựng sẵn → tải ngầm các bảng còn lại
  useEffect(() => {
    seed(initial);
    if (hasAll() && age() < 20_000) return;
    const t = setTimeout(() => { void refresh(); }, 300);
    return () => clearTimeout(t);
  }, [initial]);

  // Làm mới: tín hiệu realtime · quay lại tab (nếu dữ liệu > 20 giây) · dự phòng khi tab đang mở: 5 phút nếu realtime đang chạy, 1 phút nếu không
  useEffect(() => {
    const off = subscribeChanges();
    const onFocus = () => { if (document.visibilityState === "visible" && age() > 20_000) refreshSoon(0); };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    const iv = setInterval(() => { if (document.visibilityState === "visible" && age() > (realtimeLive ? FALLBACK_LIVE_MS : FALLBACK_DOWN_MS)) void refresh(); }, 60_000);
    return () => { off(); document.removeEventListener("visibilitychange", onFocus); window.removeEventListener("focus", onFocus); clearInterval(iv); };
  }, []);

  // Bản mới nhất giữa kho và dữ liệu trang
  const table = store && store.at >= initial.at ? store.tables[key] ?? initial.tables[key] : initial.tables[key] ?? store?.tables[key];
  const meta = META[key];

  if (!table) {
    return <div className="rounded-md border border-line bg-surface p-6 text-sm text-ink-muted">Đang tải bảng…</div>;
  }
  return (
    <>
      {/* P2 có 2 công đoạn: thanh bước ① Vẽ 3D ── ② Đặt hàng (số = số bản ghi của bảng đó) */}
      {(key === "design" || key === "orders") && (
        <nav className="grid max-w-3xl grid-cols-2 gap-0.5 rounded-md bg-grid p-1 text-sm" aria-label="Công đoạn sản xuất mẫu">
          {([["design", "/rnd/design-3d", "1", "Vẽ 3D", "giao người vẽ → duyệt 3D"], ["orders", "/rnd/orders", "2", "Đặt hàng", "đặt xưởng → hoàn thành mẫu"]] as const).map(([k, href, no, label, sub]) => {
            const on = key === k;
            const n = (store && store.at >= initial.at ? store.tables[k] ?? initial.tables[k] : initial.tables[k] ?? store?.tables[k])?.rows.length;
            return (
              <Link key={k} href={href} prefetch={false} aria-current={on ? "step" : undefined}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0 || !store?.tables[k]) return;
                  e.preventDefault();
                  if (href !== path) window.history.pushState(null, "", href);
                }}
                className={`flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 transition ${on ? "bg-accent text-white shadow-sm" : "hover:bg-surface/70"}`}>
                <span className={`flex h-5 min-w-6 flex-none items-center justify-center rounded-md px-1 text-2xs font-bold ${on ? "bg-white text-accent" : "bg-surface text-ink-muted"}`}>{no}</span>
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="flex items-baseline gap-1.5">
                    <span className={`truncate ${on ? "font-bold" : "text-ink-2"}`}>{label}</span>
                    {n !== undefined && <span className={`tabular flex-none text-xs ${on ? "font-bold text-white/90" : "text-ink-muted"}`}>{n}</span>}
                  </span>
                  <span className={`truncate text-2xs ${on ? "text-white/85" : "text-ink-muted"}`}>{sub}</span>
                </span>
              </Link>
            );
          })}
        </nav>
      )}
      {err && <p className="rounded-md bg-warn-bg px-3 py-1.5 text-xs text-warn-ink">⚠ Chưa làm mới được dữ liệu: {err} — đang hiện bản gần nhất.</p>}
      <DataGrid
        key={key} tableKey={key} columns={table.cols} rows={table.rows} tabsKey={meta.tabsKey} tabsKey2={meta.tabsKey2} addForm={meta.addForm} monthKey={meta.monthKey} defaultHidden={meta.defaultHidden} cardShow={meta.cardShow} defaultCover={meta.defaultCover} defaultGroup={meta.defaultGroup} groupRev={meta.groupRev} defaultView={meta.defaultView} info={`${meta.scope}

${meta.flow}`}
        save={(id, k, v) => saveCell(key, id, k, v)}
        remove={meta.remove ? (ids) => deleteRows(key, ids) : undefined}
        restore={meta.remove ? (token) => restoreRows(key, token) : undefined}
        add={table.add && (table.add.keys ?? meta.addKeys) ? { keys: (table.add.keys ?? meta.addKeys)!, action: (v) => addRow(key, v), defaults: table.add.defaults, cols: table.add.cols, required: table.add.required } : undefined}
        onChanged={() => refreshSoon(0)}
      />
    </>
  );
}

