import type { Opt } from "@/lib/rnd-options";
// Quy trình R&D — hằng số dùng chung server + client (không "server-only")
// stage = MỐC ĐÃ ĐẠT (P0–P6 theo sheet quy trình R&D); mẫu bị dừng giữ nguyên mốc, đánh dấu killed_at.

export const STAGES = ["p0", "p1", "p2", "p3", "p4", "p5", "p6"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  p0: "P0 · Sưu tầm",
  p1: "P1 · Đã duyệt",
  p2: "P2 · Sản xuất mẫu",
  p3: "P3 · Hoàn thành mẫu",
  p4: "P4 · Đăng video",
  p5: "P5 · Win",
  p6: "P6 · Thương mại hoá",
};

// Việc cần làm tiếp theo ở mỗi mốc (hiện trên thẻ Kanban)
export const STAGE_NEXT: Record<Stage, string> = {
  p0: "Chờ duyệt mẫu",
  p1: "Bắt đầu sản xuất",
  p2: "Vẽ 3D → đặt hàng → hoàn thành mẫu",
  p3: "Quay video trên tay (chưa quay → đã quay)",
  p4: "Đăng video gắn mã SPU lên các kênh",
  p5: "Chọn quay source chế tác · duyệt thương mại hoá",
  p6: "Theo dõi hiệu quả",
};

// Công đoạn trong P2: Vẽ 3D đứng trước, sau đó theo trạng thái bảng Theo dõi đặt hàng (Cấu hình)
export const P2_3D_STEP = "Vẽ 3D";
// Yêu cầu media của P3 (video trên tay) và quay chế tác chọn tay ở P5
export const RND_TEAM_NAME = "PT Sản Phẩm";   // team phát triển sản phẩm (R&D): mọi mẫu R&D thuộc team này; người phụ trách source chọn trong team này
export const HAND_VIDEO_TYPE = "Quay sản phẩm";   // yêu cầu source mặc định ở P3 (đã bỏ cột Yêu cầu nội dung: mọi yêu cầu là quay sản phẩm)
export const CRAFT_VIDEO_TYPE = "Quay chế tác";
// Yêu cầu nội dung có thể chọn nhiều loại ("Quay chế tác, Quay sản phẩm"): chỉ coi là quay chế tác khi KHÔNG có loại nào khác
export const isCraftOnly = (t: string | null | undefined) => !!t && t.split(/\s*,\s*/).every((x) => x === CRAFT_VIDEO_TYPE);

export const stageIndex = (s: Stage) => STAGES.indexOf(s);

// Mẫu thuộc quy trình chỉ tính bài đăng từ ngày sưu tầm (giờ VN): SPU dùng lại (mẫu cũ test lại)
// không kéo video cũ vào cửa sổ test. Mẫu tự động (stage null) → null = mọi bài.
export const trafficFrom = (p: { stage?: string | null; created_at?: string | null }) =>
  p.stage && p.created_at ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(p.created_at)) : null;

export const APPROVAL_LABELS = { draft: "Nháp", pending: "Chờ duyệt", approved: "Đã duyệt", rejected: "Không duyệt" } as const;
export type Approval = keyof typeof APPROVAL_LABELS;

// Nhóm SP (vai trò chiến lược) — theo sheet Nghiên cứu SP
export const PRODUCT_GROUPS = { gmv: "GMV", traffic: "Traffic", profit: "Profit", return: "Return" } as const;
export type ProductGroup = keyof typeof PRODUCT_GROUPS;

export const TASK_STATUS = { todo: "Chưa làm", doing: "Đang làm", review: "Chờ duyệt", redo: "Sửa lại", done: "Đạt" } as const;
export type TaskStatus = keyof typeof TASK_STATUS;


export const REF_PLATFORMS = ["TikTok", "Instagram", "Facebook", "Shopee", "Pinterest", "Xiaohongshu", "Website", "Khác"];

// Trường thông tin sưu tầm nhập tay (form + ghi lịch sử)
export const COLLECTION_FIELDS = [
  "name", "line", "category", "material", "stone", "size", "description",
  "ref_url", "ref_platform", "ref_metrics", "price_ref", "product_group", "expected_cost", "expected_price", "team_id",
] as const;
export type CollectionField = (typeof COLLECTION_FIELDS)[number];
export const MONEY_FIELDS: CollectionField[] = ["price_ref", "expected_cost", "expected_price"];

export const COLLECTION_LABELS: Record<CollectionField, string> = {
  name: "Tên SP", line: "Dòng SP", category: "Loại", material: "Chất liệu", stone: "Loại đá", size: "Size",
  description: "Ghi chú", ref_url: "Link tham khảo", ref_platform: "Nguồn", ref_metrics: "Chỉ số tham khảo",
  price_ref: "Giá tham khảo", product_group: "Nhóm SP", expected_cost: "Giá vốn dự kiến", expected_price: "Giá bán dự kiến",
  team_id: "Team",
};

// ---------- Nhãn trạng thái hiển thị trong bộ bảng (giống các trường chọn bên Lark) ----------

export const APPROVAL_OPTS: Opt[] = [
  { value: "Bản nháp", color: 18 }, { value: "Chờ duyệt", color: 3 }, { value: "Đã duyệt", color: 2 }, { value: "Từ chối", color: 5 },
];
export const APPROVAL_FROM_LABEL: Record<string, Approval> = { "Bản nháp": "draft", "Chờ duyệt": "pending", "Đã duyệt": "approved", "Từ chối": "rejected" };
export const APPROVAL_TO_LABEL = Object.fromEntries(Object.entries(APPROVAL_FROM_LABEL).map(([k, v]) => [v, k])) as Record<Approval, string>;

// "Giai đoạn hiện tại" theo cách gọi trong Lark
export const PHASE_OPTS: Opt[] = [
  { value: "P0 · Danh sách sưu tầm", color: 18 }, { value: "P1 · Chờ sản xuất", color: 3 }, { value: "P2 · Đang vẽ 3D", color: 11 }, { value: "P2 · Chờ đặt hàng", color: 5 },
  { value: "P2 · Đang sản xuất", color: 4 }, { value: "P3 · Chưa quay source", color: 6 }, { value: "P3 · Đã quay", color: 7 },
  { value: "P4 · Chưa lên video", color: 14 }, { value: "P4 · Đã lên video", color: 1 }, { value: "P5 · Win", color: 2 },
  { value: "P6 · Thương mại hoá", color: 15 }, { value: "Đã hủy", color: 8 },
];

// Trạng thái vẽ 3D: Chưa vẽ → Đang vẽ → Đã vẽ (người vẽ nộp, chờ duyệt) → Hoàn thành (TỰ ĐỘNG khi Duyệt 3D = Đạt, không chọn tay được)
export const DRAW_OPTS: Opt[] = [{ value: "Chưa vẽ", color: 18 }, { value: "Đang vẽ", color: 12 }, { value: "Đã vẽ", color: 4 }, { value: "Hoàn thành", color: 1 }];
export const drawLabel = (status: string) => (status === "todo" ? "Chưa vẽ" : status === "doing" || status === "redo" ? "Đang vẽ" : status === "review" ? "Đã vẽ" : "Hoàn thành");
export const REVIEW_OPTS: Opt[] = [{ value: "Chờ duyệt", color: 3 }, { value: "Đạt", color: 2 }, { value: "Sửa lại", color: 5 }];
export const MEDIA_STATUS_OPTS: Opt[] = [{ value: "Chờ xử lý", color: 18 }, { value: "Đang quay", color: 12 }, { value: "Hoàn thành", color: 1 }];
export const MEDIA_STATUS_FROM: Record<string, "todo" | "doing" | "done"> = { "Chờ xử lý": "todo", "Đang quay": "doing", "Hoàn thành": "done" };
export const REVIEW_FROM: Record<string, "pending" | "pass" | "redo"> = { "Chờ duyệt": "pending", "Đạt": "pass", "Sửa lại": "redo" };
export const RESULT_OPTS: Opt[] = [
  { value: "WIN", color: 2 }, { value: "WIN TRAFFIC", color: 1 }, { value: "FAIL", color: 5 }, { value: "Đang test", color: 17 },
];
export const RESULT_FROM: Record<string, "win" | "win_traffic" | "win_sp" | "fail"> = { WIN: "win", "WIN TRAFFIC": "win_traffic", "WIN SP": "win_sp", FAIL: "fail" };
export const RESULT_TO: Record<string, string> = { win: "WIN", win_traffic: "WIN TRAFFIC", win_sp: "WIN SP", fail: "FAIL", testing: "Đang test" };
// P5 Win: trạng thái WIN do hệ thống tự chấm; việc DUYỆT THƯƠNG MẠI HOÁ hay không là bước làm tay
export const COMMERCIAL_YES = "Thương mại hoá";
export const COMMERCIAL_NO = "Không thương mại hoá";
export const COMMERCIAL_OPTS: Opt[] = [{ value: COMMERCIAL_YES, color: 2 }, { value: COMMERCIAL_NO, color: 5 }];
export const GROUP_OPTS: Opt[] = (Object.entries(PRODUCT_GROUPS) as [ProductGroup, string][]).map(([, v], i) => ({ value: v, color: i + 1 }));

// Quyền xoá mẫu (dùng chung bảng Sưu tầm + server): Quản lý xoá mọi mẫu; R&D / người sưu tầm chỉ xoá mẫu CHƯA DUYỆT
// (mẫu đã duyệt → dùng Lý do kill để giữ lịch sử)
export const canDeleteProduct = (u: { id: string; role: string }, p: { stage: string | null; created_by: string | null }) =>
  u.role === "admin" || (p.stage === "p0" && (u.role === "rnd" || p.created_by === u.id));
