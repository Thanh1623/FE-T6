"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.oldCodesOf = exports.canonOf = void 0;
exports.loadSpuAliases = loadSpuAliases;
exports.expandCodes = expandCodes;
exports.canonPosts = canonPosts;
require("server-only");
const cache_1 = require("next/cache");
const admin_1 = require("@/lib/supabase/admin");
const cache_tags_1 = require("@/lib/cache-tags");
// BẢNG QUY ĐỔI MÃ SPU CŨ → MỚI (sales.spu_aliases, migration 066): gộp tồn, số bán và video của mã cũ vào SPU mới khi tổng hợp.
// KHÔNG sửa dữ liệu gốc — tồn kho, số bán, bài đăng, đánh giá vẫn mang mã cũ; chỉ khi gom theo SPU thì mã cũ được quy về mã mới (xoá dòng trong bảng = hoàn tác).
// SPU cũ tách theo cỡ đá sang nhiều SPU mới không dùng bảng này mà dùng sales.sku_spu_overrides (theo từng SKU).
// Chưa chạy migration 066 / lỗi đọc → bảng rỗng, mọi thứ chạy như cũ.
const cached = (0, cache_1.unstable_cache)(async () => (0, admin_1.fetchAll)((a, b) => admin_1.sb.sales().from("spu_aliases").select("old_code, new_code").order("old_code").range(a, b)), ["spu-aliases", "v1"], { tags: [cache_tags_1.TAG.spuData], revalidate: 21_600 });
async function loadSpuAliases() {
    try {
        return new Map((await cached()).map((r) => [r.old_code.toUpperCase(), r.new_code.toUpperCase()]));
    }
    catch {
        return new Map();
    }
}
// Quy mã về mã SPU mới (mã không có trong bảng giữ nguyên)
const canonOf = (aliases) => (code) => aliases.get(code.toUpperCase()) ?? code;
exports.canonOf = canonOf;
// Mọi mã cũ đã gộp vào một SPU mới (để lọc bài đăng / video theo SPU gồm cả bài còn gắn mã cũ)
const oldCodesOf = (aliases, code) => [...aliases].filter(([, n]) => n === code.toUpperCase()).map(([o]) => o);
exports.oldCodesOf = oldCodesOf;
// Danh sách mã + toàn bộ mã cũ đã gộp vào các mã đó (truy vấn theo mã SPU mới phải lấy luôn dữ liệu của mã cũ). Bảng rỗng → trả nguyên danh sách, không tốn thêm.
function expandCodes(aliases, codes) {
    if (!aliases.size)
        return codes;
    const want = new Set(codes.map((c) => c.toUpperCase()));
    const out = new Set(codes);
    for (const [o, n] of aliases)
        if (want.has(n))
            out.add(o);
    return [...out];
}
// Bài đăng với product_codes đã quy về mã SPU mới (khử trùng); bảng rỗng → giữ nguyên mảng gốc
function canonPosts(aliases, posts) {
    if (!aliases.size)
        return posts;
    const canon = (0, exports.canonOf)(aliases);
    return posts.map((p) => ({ ...p, product_codes: [...new Set(p.product_codes.map(canon))] }));
}
