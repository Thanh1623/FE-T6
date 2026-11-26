"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseTags = parseTags;
exports.resolveTags = resolveTags;
exports.saveTagChannels = saveTagChannels;
require("server-only");
const admin_1 = require("@/lib/supabase/admin");
const name_1 = require("@/lib/tiktok/name");
function parseTags(input) {
    const tags = [], bad = [];
    for (const raw of input.split(/[,\n]/).map((s) => s.trim()).filter(Boolean)) {
        let m;
        if ((m = raw.match(/^tiktok_business_id_(.+)$/i)))
            tags.push({ raw, kind: "ttid", value: m[1].trim() });
        else if ((m = raw.match(/^tiktok_business_(.+)$/i)))
            tags.push({ raw, kind: "ttn", name: m[1].trim() });
        else if ((m = raw.match(/^(?:page_id_)?(\d{6,})$/i)))
            tags.push({ raw, kind: "page", value: m[1] });
        else
            bad.push(raw);
    }
    return { tags, bad };
}
// Tag → danh sách kênh cần tạo. Lỗi (không tra được tên…) trả về trong errors.
async function resolveTags(parsed) {
    const out = new Map(), errors = [];
    for (const t of parsed) {
        if (t.kind === "ttn") {
            const id = name_1.TT_NAME_PREFIX + (0, name_1.normTikTokName)(t.name);
            out.set(id, { id, name: t.name, platform: "tiktok", username: t.raw });
        }
        else if (t.kind === "page") {
            out.set(t.value, { id: t.value, name: `Trang ${t.value}`, platform: "facebook", username: t.raw });
        }
        else {
            const tag = `tiktok_business_id_${t.value}`;
            // Đã tra trước đó → dùng bảng của project này (sales.tag_aliases); chưa có mới tra đơn Qlydonhang rồi lưu lại
            let name = (await admin_1.sb.sales().from("tag_aliases").select("alias_name").eq("tag", tag).maybeSingle()).data?.alias_name;
            if (!name) {
                // Ưu tiên đơn hàng đã nhập ở dự án này (sales.imported_order_lines.tags); không thấy mới hỏi hệ thống Qlydonhang
                let data = null;
                const ours = await admin_1.sb.sales().from("imported_order_lines").select("tags").like("tags", `%${tag}%`).limit(300);
                if (!ours.error && ours.data?.length)
                    data = ours.data.map((r) => ({ sapo_tags: r.tags }));
                else {
                    const r = await (0, admin_1.supabaseOrders)().from("orders").select("sapo_tags").like("sapo_tags", `%${tag}%`).limit(300);
                    if (r.error) {
                        errors.push(`${t.raw}: ${r.error.message}`);
                        continue;
                    }
                    data = r.data;
                }
                const count = new Map();
                for (const r of data ?? []) {
                    for (const tg of String(r.sapo_tags ?? "").split(",").map((x) => x.trim())) {
                        const m = tg.match(/^tiktok_business_(?!id_)(.+)$/i);
                        if (m)
                            count.set(m[1].trim(), (count.get(m[1].trim()) ?? 0) + 1);
                    }
                }
                const top = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
                if (!top) {
                    errors.push(`${t.raw}: không có đơn nào mang tag này kèm tag tên tài khoản (tiktok_business_<tên>) để biết tên — dán thêm tag tên`);
                    continue;
                }
                name = top[0];
                await admin_1.sb.sales().from("tag_aliases").upsert({ tag, alias_name: name, hits: top[1], source: "orders", updated_at: new Date().toISOString() }); // chưa chạy 032 → bỏ qua lỗi, vẫn dùng được
            }
            const id = name_1.TT_NAME_PREFIX + (0, name_1.normTikTokName)(name);
            out.set(id, { id, name, platform: "tiktok", username: t.raw });
        }
    }
    return { channels: [...out.values()], errors };
}
// Ghi các kênh tag cho team. Tag đã thuộc team khác → báo lỗi (mỗi tag / Page chỉ thuộc 1 team).
async function saveTagChannels(channels, teamId) {
    const added = [], errors = [];
    for (const c of channels) {
        const { data: ex } = await admin_1.sb.social().from("channels").select("id, team_id, name").eq("id", c.id).maybeSingle();
        if (ex && ex.team_id && ex.team_id !== teamId) {
            const { data: t } = await admin_1.sb.core().from("teams").select("name").eq("id", ex.team_id).maybeSingle();
            errors.push(`${ex.name}: đang thuộc team ${t?.name ?? "khác"} — gỡ khỏi team đó trước`);
            continue;
        }
        const { error } = ex
            ? await admin_1.sb.social().from("channels").update({ team_id: teamId, is_active: true }).eq("id", c.id)
            : await admin_1.sb.social().from("channels").insert({ id: c.id, platform: c.platform, name: c.name, username: c.username, team_id: teamId, is_active: true });
        if (error)
            errors.push(`${c.name}: ${error.message}`);
        else
            added.push(c.name);
    }
    return { added, errors };
}
