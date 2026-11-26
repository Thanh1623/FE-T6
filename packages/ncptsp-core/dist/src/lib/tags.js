"use strict";
// Tách hashtag bài đăng theo quy ước của team — hàm thuần (server + client + kiểm thử).
//   Mã sản phẩm: chữ + số, CHỈ nhận nếu có trên Sapo hoặc đã khai báo R&D (VD #D0008, #MD0033, #K0002)
//   Nhân sự:     K + 3 số (#K301 = team K3, người 01) — không bao giờ là mã SP
//   Tuyến:       #a1 … #a5
//   Concept:     #C = cũ, #M = mới
//   Mã test:     T + số loại hàng (1 nhẫn … 9 set) + số thứ tự (T10001 nhẫn, T30002 dây chuyền, T20003 lắc…) — sản phẩm lấy source ngoài,
//                chưa có mã Sapo / chưa qua R&D → luôn là mã SP hợp lệ, không bị xếp vào "mã lạ"
//   Gõ thừa M:   team quen gõ #MD0002 trong khi mã thật là D0002 → chỉ bỏ chữ M khi mã đầy đủ CHƯA có mà bản bỏ M thì có
//                (mã M… có thật như MD0033 giữ nguyên)
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSystemTestCode = exports.TEST_CATEGORY_NAMES = exports.isTestCode = exports.DEFAULT_RULES = void 0;
exports.parseTestCode = parseTestCode;
exports.testCodeProductName = testCodeProductName;
exports.parseTags = parseTags;
exports.categoryOf = categoryOf;
exports.DEFAULT_RULES = { staff_pattern: "^k[0-9]{3}$", line_pattern: "^a[1-5]$", concept: { c: "old", m: "new" } };
const CODE_SHAPE = /^[a-z]{1,4}[0-9]{1,}$/;
// Mã SPU test = T + số loại hàng (1 nhẫn … 9 set) + số thứ tự 4 chữ số, ví dụ T10007 = nhẫn test thứ 7.
// Mã kiểu cũ (T + chữ loại, ví dụ TN0007) vẫn được nhận ra.
const TEST_SHAPE = /^t(?:[1-9][0-9]{4,}|[a-z]{1,2}[0-9]+)$/;
const isTestCode = (code) => TEST_SHAPE.test(code.toLowerCase());
exports.isTestCode = isTestCode;
exports.TEST_CATEGORY_NAMES = {
    1: "Nhẫn test",
    2: "Lắc tay test",
    3: "Dây chuyền test",
    4: "Bông tai test",
    5: "Kiềng test",
    6: "Mặt dây test",
    7: "Vòng test",
    8: "Cài áo test",
    9: "Set test",
};
// Chữ loại của mã kiểu cũ → số loại mới
const LEGACY_LETTER = { N: "1", L: "2", D: "3", B: "4", K: "5", M: "6", V: "7", C: "8", S: "9" };
// Tách mã test: loại (1–9) + số thứ tự; null nếu không phải mã test
// Mã test ĐƯỢC TẠO TRÊN HỆ THỐNG (trang Mã SPU test → có người tạo): dùng cho danh sách và thống kê. Mã chỉ xuất hiện trên bài đăng / do hệ thống tự sinh hồ sơ
// (created_by trống — vd mã đồ da TX…, T131002 cùng dạng T + số) KHÔNG tính.
const isSystemTestCode = (code, createdBy) => !!createdBy && (0, exports.isTestCode)(code);
exports.isSystemTestCode = isSystemTestCode;
function parseTestCode(code) {
    const c = code.toUpperCase();
    let m = c.match(/^T([1-9])(\d{4,})$/);
    if (m)
        return { cat: m[1], num: parseInt(m[2], 10), legacy: false };
    m = c.match(/^T([A-Z]{1,2})(\d+)$/);
    if (m)
        return { cat: LEGACY_LETTER[m[1]] ?? m[1], num: parseInt(m[2], 10), legacy: true };
    return null;
}
function testCodeProductName(code) {
    const p = parseTestCode(code);
    if (!p)
        return null;
    const cat = exports.TEST_CATEGORY_NAMES[p.cat] ?? `Mẫu test ${p.cat}`;
    return `${cat} ${code.toUpperCase()} (#${p.num})`;
}
// tags: hashtag đã chuẩn hoá chữ thường, không có '#'. known: tập mã SP hợp lệ (CHỮ HOA).
function parseTags(tags, known, rules = exports.DEFAULT_RULES) {
    const staff = new RegExp(rules.staff_pattern, "i"), line = new RegExp(rules.line_pattern, "i");
    const out = { product_codes: [], unknown_codes: [], content_line: null, concept: null, staff_code: null };
    for (const raw of tags) {
        const t = raw.toLowerCase();
        if (staff.test(t)) {
            out.staff_code ??= t.toUpperCase();
            continue;
        }
        if (line.test(t)) {
            out.content_line ??= t.toUpperCase();
            continue;
        }
        if (t in rules.concept) {
            out.concept ??= rules.concept[t];
            continue;
        }
        if (!CODE_SHAPE.test(t))
            continue;
        let code = t.toUpperCase();
        if (!known.has(code) && code.startsWith("M") && known.has(code.slice(1)))
            code = code.slice(1); // #MD0002 → D0002
        if (known.has(code) || TEST_SHAPE.test(t)) {
            if (!out.product_codes.includes(code))
                out.product_codes.push(code);
        }
        else if (!out.unknown_codes.includes(code))
            out.unknown_codes.push(code);
    }
    return out;
}
// Loại hàng từ chữ cái đầu của mã (M mặt dây, D dây chuyền…)
function categoryOf(code, prefix) {
    return prefix[code.charAt(0).toUpperCase()] ?? null;
}
