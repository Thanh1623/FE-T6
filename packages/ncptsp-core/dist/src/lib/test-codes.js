"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TEST_CATEGORIES = void 0;
exports.peekNextCodes = peekNextCodes;
exports.createTestCode = createTestCode;
exports.listTestCodes = listTestCodes;
require("server-only");
const admin_1 = require("@/lib/supabase/admin");
const session_1 = require("@/lib/session");
const tags_1 = require("@/lib/tags");
const code_links_1 = require("@/lib/code-links");
// Mã SPU test (T10001 nhẫn test, T20003 lắc test… — số đầu là loại hàng, 1 nhẫn đến 9 set): Media tự test mẫu chưa có mã Sapo. Mã được CẤP TẬP TRUNG ở đây để không ai tạo trùng nhau:
//   • số thứ tự kế tiếp = số lớn nhất đã dùng ở loại đó + 1 (tính cả mã đã có trên bài đăng nhưng chưa có hồ sơ);
//   • tạo hồ sơ mẫu ngay (rnd.products.code là duy nhất) — hai người bấm cùng lúc thì DB từ chối người sau, hệ thống tự lấy số kế tiếp.
const test_codes_shared_1 = require("@/lib/test-codes-shared");
Object.defineProperty(exports, "TEST_CATEGORIES", { enumerable: true, get: function () { return test_codes_shared_1.TEST_CATEGORIES; } });
const STANDARD = /^T[1-9]\d{4}$/i; // mã cấp từ trang này: T + số loại hàng + 4 chữ số
const codeOf = (cat, n) => `T${cat}${String(n).padStart(4, "0")}`; // 4 chữ số: đúng ràng buộc products_code_check (≥ 3 số)
async function maxNumbers() {
    const { data, error } = await admin_1.sb.rnd().from("products").select("code").like("code", "T%");
    if (error)
        throw error;
    const max = {};
    for (const r of data ?? []) {
        const p = (0, tags_1.parseTestCode)(String(r.code)); // mã kiểu cũ (TN0007) tính vào cùng loại để số thứ tự không lùi
        if (p && !p.legacy && !STANDARD.test(String(r.code)))
            continue; // mã dài kiểu T171002 cấp từ trước (không đúng T + loại + 4 số) không được đẩy số thứ tự lên
        // Mã kiểu cũ chỉ tính khi đúng dạng mã test cũ (T + 1–2 chữ cái + tối đa 5 chữ số, vd TN0007). Mã thiết kế dài như TK0151001 (túi da, không phải mã test) trước đây bị hiểu là "Kiềng số 151001" và đẩy mã kế tiếp thành T5151002.
        if (p && p.legacy && !/^T[A-Z]{1,2}\d{1,5}$/i.test(String(r.code)))
            continue;
        if (p && !(p.legacy && String(r.code).length < 6))
            max[p.cat] = Math.max(max[p.cat] ?? 0, p.num);
    }
    return max;
}
// Mã kế tiếp mỗi loại (chỉ để xem trước — mã thật được cấp lúc bấm tạo)
async function peekNextCodes() {
    const max = await maxNumbers();
    return Object.fromEntries(test_codes_shared_1.TEST_CATEGORIES.map((c) => [c.key, codeOf(c.key, (max[c.key] ?? 0) + 1)]));
}
// Số đầu tiên ≥ from mà mã chưa xuất hiện trên bài đăng nào (đề phòng bài gắn mã trước khi có hồ sơ)
async function firstUnusedOnPosts(cat, from) {
    for (let start = from; start < from + 300; start += 25) {
        const cands = Array.from({ length: 25 }, (_, i) => codeOf(cat, start + i));
        const [a, b] = await Promise.all([
            admin_1.sb.social().from("posts").select("product_codes").overlaps("product_codes", cands).limit(200),
            admin_1.sb.social().from("posts").select("unknown_codes").overlaps("unknown_codes", cands).limit(200),
        ]);
        const used = new Set([...(a.data ?? []).flatMap((r) => r.product_codes), ...(b.data ?? []).flatMap((r) => r.unknown_codes)].map((c) => c.toUpperCase()));
        const free = cands.findIndex((c) => !used.has(c));
        if (free >= 0)
            return start + free;
    }
    throw new Error("Không tìm được số còn trống");
}
async function createTestCode(user, cat, note) {
    if (!(cat in tags_1.TEST_CATEGORY_NAMES))
        throw new Error("Chọn loại hàng");
    const text = note.trim().slice(0, 120);
    let last = "";
    for (let attempt = 0; attempt < 8; attempt++) {
        const max = await maxNumbers();
        const n = await firstUnusedOnPosts(cat, (max[cat] ?? 0) + 1 + attempt); // + attempt: mỗi lần thử lại luôn nhảy sang số kế tiếp, kể cả khi lần đọc vừa rồi chưa thấy mã người khác mới tạo
        const code = codeOf(cat, n);
        const base = (0, tags_1.testCodeProductName)(code) ?? code;
        const { data, error } = await admin_1.sb.rnd().from("products").insert({
            code, name: text ? `${base} — ${text}` : base, description: text || null, status: "testing", origin: "auto", created_by: user.id, team_id: user.team_id, // origin chỉ nhận manual / auto; mã test nhận ra qua dạng mã (isTestCode)
        }).select("id").single();
        if (!error) {
            await admin_1.sb.rnd().from("product_events").insert({ product_id: data.id, actor_id: user.id, action: "created", changes: { code: [null, code] } });
            return { code, id: data.id };
        }
        if (error.code !== "23505")
            throw new Error(error.message); // 23505 = người khác vừa lấy đúng số này → thử số kế tiếp
        last = `${code}: ${error.message}`;
    }
    throw new Error(`Nhiều người đang tạo mã cùng lúc — bấm tạo lại (${last})`);
}
async function listTestCodes() {
    const { data, error } = await admin_1.sb.rnd().from("products").select("id, code, name, description, created_at, created_by, stage").like("code", "T%").order("created_at", { ascending: false }).limit(2000);
    if (error)
        throw error;
    const rows = (data ?? []).filter((p) => { const t = (0, tags_1.parseTestCode)(p.code); return t && !t.legacy && !!p.created_by; }); // chỉ T1…T9 + số, và chỉ mã do người dùng tạo trên hệ thống (bỏ mã kiểu cũ TX… và hồ sơ hệ thống tự sinh từ bài đăng, vd mã đồ da)
    const codes = rows.map((p) => p.code);
    const linkRows = await (0, code_links_1.loadCodeLinks)();
    const [names, { data: evs }, { data: livePosts }] = await Promise.all([
        (0, session_1.profileNames)(rows.map((p) => p.created_by)),
        codes.length ? admin_1.sb.rnd().from("evaluations").select("code, result, first_post_date, metrics").in("code", codes) : { data: [] },
        // Số video / lượt xem ĐỌC TRỰC TIẾP từ bài đăng đã gắn mã (lần đánh giá tự động chạy vài lần mỗi ngày nên mã mới đăng video có thể chưa có dòng đánh giá → trước đây báo "chưa lên video" dù đã có video)
        codes.length ? admin_1.sb.social().from("posts").select("product_codes, views, kind, published_at").overlaps("product_codes", codes).in("kind", ["video", "reel"]) : { data: [] },
    ]);
    const live = new Map();
    for (const po of livePosts ?? [])
        for (const c of po.product_codes ?? []) {
            const cur = live.get(c) ?? { videos: 0, views: 0, first: null };
            cur.videos += 1;
            cur.views += Number(po.views ?? 0);
            const d = po.published_at ? String(po.published_at).slice(0, 10) : null;
            if (d && (!cur.first || d < cur.first))
                cur.first = d;
            live.set(c, cur);
        }
    const ev = new Map((evs ?? []).map((e) => [e.code, e]));
    return rows.map((p) => {
        const e = ev.get(p.code);
        return {
            id: p.id, code: p.code, cat: (0, tags_1.parseTestCode)(p.code).cat, name: p.name, note: p.description ?? null,
            createdAt: p.created_at, createdBy: p.created_by ? names.get(p.created_by) ?? null : null,
            result: e?.result ?? null, firstPost: e?.first_post_date ?? live.get(p.code)?.first ?? null, videos: Math.max(Number(e?.metrics?.videos ?? 0), live.get(p.code)?.videos ?? 0), views: Math.max(Number(e?.metrics?.views ?? 0), live.get(p.code)?.views ?? 0), stage: p.stage ?? null,
            links: linkRows.filter((l) => l.product_id === p.id).map((l) => ({ id: l.id, sku: l.sku_code, launch: l.launch_date })),
        };
    });
}
