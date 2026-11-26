"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canDeleteProduct = exports.GROUP_OPTS = exports.COMMERCIAL_OPTS = exports.COMMERCIAL_NO = exports.COMMERCIAL_YES = exports.RESULT_TO = exports.RESULT_FROM = exports.RESULT_OPTS = exports.REVIEW_FROM = exports.MEDIA_STATUS_FROM = exports.MEDIA_STATUS_OPTS = exports.REVIEW_OPTS = exports.drawLabel = exports.DRAW_OPTS = exports.PHASE_OPTS = exports.APPROVAL_TO_LABEL = exports.APPROVAL_FROM_LABEL = exports.APPROVAL_OPTS = exports.COLLECTION_LABELS = exports.MONEY_FIELDS = exports.COLLECTION_FIELDS = exports.REF_PLATFORMS = exports.TASK_STATUS = exports.PRODUCT_GROUPS = exports.APPROVAL_LABELS = exports.trafficFrom = exports.stageIndex = exports.isCraftOnly = exports.CRAFT_VIDEO_TYPE = exports.HAND_VIDEO_TYPE = exports.RND_TEAM_NAME = exports.P2_3D_STEP = exports.STAGE_NEXT = exports.STAGE_LABELS = exports.STAGES = void 0;
// Quy trình R&D — hằng số dùng chung server + client (không "server-only")
// stage = MỐC ĐÃ ĐẠT (P0–P6 theo sheet quy trình R&D); mẫu bị dừng giữ nguyên mốc, đánh dấu killed_at.
exports.STAGES = ["p0", "p1", "p2", "p3", "p4", "p5", "p6"];
exports.STAGE_LABELS = {
    p0: "P0 · Sưu tầm",
    p1: "P1 · Đã duyệt",
    p2: "P2 · Sản xuất mẫu",
    p3: "P3 · Hoàn thành mẫu",
    p4: "P4 · Đăng video",
    p5: "P5 · Win",
    p6: "P6 · Thương mại hoá",
};
// Việc cần làm tiếp theo ở mỗi mốc (hiện trên thẻ Kanban)
exports.STAGE_NEXT = {
    p0: "Chờ duyệt mẫu",
    p1: "Bắt đầu sản xuất",
    p2: "Vẽ 3D → đặt hàng → hoàn thành mẫu",
    p3: "Quay video trên tay (chưa quay → đã quay)",
    p4: "Đăng video gắn mã SPU lên các kênh",
    p5: "Chọn quay source chế tác · duyệt thương mại hoá",
    p6: "Theo dõi hiệu quả",
};
// Công đoạn trong P2: Vẽ 3D đứng trước, sau đó theo trạng thái bảng Theo dõi đặt hàng (Cấu hình)
exports.P2_3D_STEP = "Vẽ 3D";
// Yêu cầu media của P3 (video trên tay) và quay chế tác chọn tay ở P5
exports.RND_TEAM_NAME = "PT Sản Phẩm"; // team phát triển sản phẩm (R&D): mọi mẫu R&D thuộc team này; người phụ trách source chọn trong team này
exports.HAND_VIDEO_TYPE = "Quay sản phẩm"; // yêu cầu source mặc định ở P3 (đã bỏ cột Yêu cầu nội dung: mọi yêu cầu là quay sản phẩm)
exports.CRAFT_VIDEO_TYPE = "Quay chế tác";
// Yêu cầu nội dung có thể chọn nhiều loại ("Quay chế tác, Quay sản phẩm"): chỉ coi là quay chế tác khi KHÔNG có loại nào khác
const isCraftOnly = (t) => !!t && t.split(/\s*,\s*/).every((x) => x === exports.CRAFT_VIDEO_TYPE);
exports.isCraftOnly = isCraftOnly;
const stageIndex = (s) => exports.STAGES.indexOf(s);
exports.stageIndex = stageIndex;
// Mẫu thuộc quy trình chỉ tính bài đăng từ ngày sưu tầm (giờ VN): SPU dùng lại (mẫu cũ test lại)
// không kéo video cũ vào cửa sổ test. Mẫu tự động (stage null) → null = mọi bài.
const trafficFrom = (p) => p.stage && p.created_at ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(p.created_at)) : null;
exports.trafficFrom = trafficFrom;
exports.APPROVAL_LABELS = { draft: "Nháp", pending: "Chờ duyệt", approved: "Đã duyệt", rejected: "Không duyệt" };
// Nhóm SP (vai trò chiến lược) — theo sheet Nghiên cứu SP
exports.PRODUCT_GROUPS = { gmv: "GMV", traffic: "Traffic", profit: "Profit", return: "Return" };
exports.TASK_STATUS = { todo: "Chưa làm", doing: "Đang làm", review: "Chờ duyệt", redo: "Sửa lại", done: "Đạt" };
exports.REF_PLATFORMS = ["TikTok", "Instagram", "Facebook", "Shopee", "Pinterest", "Xiaohongshu", "Website", "Khác"];
// Trường thông tin sưu tầm nhập tay (form + ghi lịch sử)
exports.COLLECTION_FIELDS = [
    "name", "line", "category", "material", "stone", "size", "description",
    "ref_url", "ref_platform", "ref_metrics", "price_ref", "product_group", "expected_cost", "expected_price", "team_id",
];
exports.MONEY_FIELDS = ["price_ref", "expected_cost", "expected_price"];
exports.COLLECTION_LABELS = {
    name: "Tên SP", line: "Dòng SP", category: "Loại", material: "Chất liệu", stone: "Loại đá", size: "Size",
    description: "Ghi chú", ref_url: "Link tham khảo", ref_platform: "Nguồn", ref_metrics: "Chỉ số tham khảo",
    price_ref: "Giá tham khảo", product_group: "Nhóm SP", expected_cost: "Giá vốn dự kiến", expected_price: "Giá bán dự kiến",
    team_id: "Team",
};
// ---------- Nhãn trạng thái hiển thị trong bộ bảng (giống các trường chọn bên Lark) ----------
exports.APPROVAL_OPTS = [
    { value: "Bản nháp", color: 18 }, { value: "Chờ duyệt", color: 3 }, { value: "Đã duyệt", color: 2 }, { value: "Từ chối", color: 5 },
];
exports.APPROVAL_FROM_LABEL = { "Bản nháp": "draft", "Chờ duyệt": "pending", "Đã duyệt": "approved", "Từ chối": "rejected" };
exports.APPROVAL_TO_LABEL = Object.fromEntries(Object.entries(exports.APPROVAL_FROM_LABEL).map(([k, v]) => [v, k]));
// "Giai đoạn hiện tại" theo cách gọi trong Lark
exports.PHASE_OPTS = [
    { value: "P0 · Danh sách sưu tầm", color: 18 }, { value: "P1 · Chờ sản xuất", color: 3 }, { value: "P2 · Đang vẽ 3D", color: 11 }, { value: "P2 · Chờ đặt hàng", color: 5 },
    { value: "P2 · Đang sản xuất", color: 4 }, { value: "P3 · Chưa quay source", color: 6 }, { value: "P3 · Đã quay", color: 7 },
    { value: "P4 · Chưa lên video", color: 14 }, { value: "P4 · Đã lên video", color: 1 }, { value: "P5 · Win", color: 2 },
    { value: "P6 · Thương mại hoá", color: 15 }, { value: "Đã hủy", color: 8 },
];
// Trạng thái vẽ 3D: Chưa vẽ → Đang vẽ → Đã vẽ (người vẽ nộp, chờ duyệt) → Hoàn thành (TỰ ĐỘNG khi Duyệt 3D = Đạt, không chọn tay được)
exports.DRAW_OPTS = [{ value: "Chưa vẽ", color: 18 }, { value: "Đang vẽ", color: 12 }, { value: "Đã vẽ", color: 4 }, { value: "Hoàn thành", color: 1 }];
const drawLabel = (status) => (status === "todo" ? "Chưa vẽ" : status === "doing" || status === "redo" ? "Đang vẽ" : status === "review" ? "Đã vẽ" : "Hoàn thành");
exports.drawLabel = drawLabel;
exports.REVIEW_OPTS = [{ value: "Chờ duyệt", color: 3 }, { value: "Đạt", color: 2 }, { value: "Sửa lại", color: 5 }];
exports.MEDIA_STATUS_OPTS = [{ value: "Chờ xử lý", color: 18 }, { value: "Đang quay", color: 12 }, { value: "Hoàn thành", color: 1 }];
exports.MEDIA_STATUS_FROM = { "Chờ xử lý": "todo", "Đang quay": "doing", "Hoàn thành": "done" };
exports.REVIEW_FROM = { "Chờ duyệt": "pending", "Đạt": "pass", "Sửa lại": "redo" };
exports.RESULT_OPTS = [
    { value: "WIN", color: 2 }, { value: "WIN TRAFFIC", color: 1 }, { value: "FAIL", color: 5 }, { value: "Đang test", color: 17 },
];
exports.RESULT_FROM = { WIN: "win", "WIN TRAFFIC": "win_traffic", "WIN SP": "win_sp", FAIL: "fail" };
exports.RESULT_TO = { win: "WIN", win_traffic: "WIN TRAFFIC", win_sp: "WIN SP", fail: "FAIL", testing: "Đang test" };
// P5 Win: trạng thái WIN do hệ thống tự chấm; việc DUYỆT THƯƠNG MẠI HOÁ hay không là bước làm tay
exports.COMMERCIAL_YES = "Thương mại hoá";
exports.COMMERCIAL_NO = "Không thương mại hoá";
exports.COMMERCIAL_OPTS = [{ value: exports.COMMERCIAL_YES, color: 2 }, { value: exports.COMMERCIAL_NO, color: 5 }];
exports.GROUP_OPTS = Object.entries(exports.PRODUCT_GROUPS).map(([, v], i) => ({ value: v, color: i + 1 }));
// Quyền xoá mẫu (dùng chung bảng Sưu tầm + server): Quản lý xoá mọi mẫu; R&D / người sưu tầm chỉ xoá mẫu CHƯA DUYỆT
// (mẫu đã duyệt → dùng Lý do kill để giữ lịch sử)
const canDeleteProduct = (u, p) => u.role === "admin" || (p.stage === "p0" && (u.role === "rnd" || p.created_by === u.id));
exports.canDeleteProduct = canDeleteProduct;
