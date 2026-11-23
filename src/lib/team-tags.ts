import "server-only";
import { sb, supabaseOrders } from "@/lib/supabase/admin";
import { TT_NAME_PREFIX, normTikTokName } from "@/lib/tiktok/name";

// Tag thủ công của team: dán tag Sapo của đơn hàng để số bán của đơn mang tag đó tính cho team.
// Cách hoạt động: mỗi tag thành 1 "kênh" trong social.channels (không token, không đồng bộ lượt xem) gán cho team, với id đúng bằng
// page_id mà số bán đã lưu (sales.daily_sales.page_id) — nên mọi báo cáo theo Trang / team tự cộng số bán của tag, không cần sửa SQL.
//   tiktok_business_<tên>      → kênh TikTok id "ttn:<tên chuẩn hoá>" (như hàm SQL 006)
//   tiktok_business_id_<id>    → tra đơn mang tag này để biết tên tài khoản, rồi như trên (SQL 006 bỏ qua tag id, chỉ dùng tag tên)
//   page_id_<số> hoặc <số>     → Trang Facebook theo ID

export type TagChannel = { id: string; name: string; platform: "tiktok" | "facebook"; username: string | null };
export type ParsedTag = { raw: string } & ({ kind: "ttn"; name: string } | { kind: "ttid"; value: string } | { kind: "page"; value: string });

export function parseTags(input: string): { tags: ParsedTag[]; bad: string[] } {
  const tags: ParsedTag[] = [], bad: string[] = [];
  for (const raw of input.split(/[,\n]/).map((s) => s.trim()).filter(Boolean)) {
    let m: RegExpMatchArray | null;
    if ((m = raw.match(/^tiktok_business_id_(.+)$/i))) tags.push({ raw, kind: "ttid", value: m[1].trim() });
    else if ((m = raw.match(/^tiktok_business_(.+)$/i))) tags.push({ raw, kind: "ttn", name: m[1].trim() });
    else if ((m = raw.match(/^(?:page_id_)?(\d{6,})$/i))) tags.push({ raw, kind: "page", value: m[1] });
    else bad.push(raw);
  }
  return { tags, bad };
}

// Tag → danh sách kênh cần tạo. Lỗi (không tra được tên…) trả về trong errors.
export async function resolveTags(parsed: ParsedTag[]): Promise<{ channels: TagChannel[]; errors: string[] }> {
  const out = new Map<string, TagChannel>(), errors: string[] = [];
  for (const t of parsed) {
    if (t.kind === "ttn") {
      const id = TT_NAME_PREFIX + normTikTokName(t.name);
      out.set(id, { id, name: t.name, platform: "tiktok", username: t.raw });
    } else if (t.kind === "page") {
      out.set(t.value, { id: t.value, name: `Trang ${t.value}`, platform: "facebook", username: t.raw });
    } else {
      const tag = `tiktok_business_id_${t.value}`;
      // Đã tra trước đó → dùng bảng của project này (sales.tag_aliases); chưa có mới tra đơn Qlydonhang rồi lưu lại
      let name = (await sb.sales().from("tag_aliases").select("alias_name").eq("tag", tag).maybeSingle()).data?.alias_name as string | undefined;
      if (!name) {
        // Ưu tiên đơn hàng đã nhập ở dự án này (sales.imported_order_lines.tags); không thấy mới hỏi hệ thống Qlydonhang
        let data: { sapo_tags: string | null }[] | null = null;
        const ours = await sb.sales().from("imported_order_lines").select("tags").like("tags", `%${tag}%`).limit(300);
        if (!ours.error && ours.data?.length) data = ours.data.map((r) => ({ sapo_tags: r.tags as string | null }));
        else {
          const r = await supabaseOrders().from("orders").select("sapo_tags").like("sapo_tags", `%${tag}%`).limit(300);
          if (r.error) { errors.push(`${t.raw}: ${r.error.message}`); continue; }
          data = r.data as { sapo_tags: string | null }[];
        }
        const count = new Map<string, number>();
        for (const r of data ?? []) {
          for (const tg of String(r.sapo_tags ?? "").split(",").map((x) => x.trim())) {
            const m = tg.match(/^tiktok_business_(?!id_)(.+)$/i);
            if (m) count.set(m[1].trim(), (count.get(m[1].trim()) ?? 0) + 1);
          }
        }
        const top = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
        if (!top) { errors.push(`${t.raw}: không có đơn nào mang tag này kèm tag tên tài khoản (tiktok_business_<tên>) để biết tên — dán thêm tag tên`); continue; }
        name = top[0];
        await sb.sales().from("tag_aliases").upsert({ tag, alias_name: name, hits: top[1], source: "orders", updated_at: new Date().toISOString() });   // chưa chạy 032 → bỏ qua lỗi, vẫn dùng được
      }
      const id = TT_NAME_PREFIX + normTikTokName(name);
      out.set(id, { id, name, platform: "tiktok", username: t.raw });
    }
  }
  return { channels: [...out.values()], errors };
}

// Ghi các kênh tag cho team. Tag đã thuộc team khác → báo lỗi (mỗi tag / Page chỉ thuộc 1 team).
export async function saveTagChannels(channels: TagChannel[], teamId: string) {
  const added: string[] = [], errors: string[] = [];
  for (const c of channels) {
    const { data: ex } = await sb.social().from("channels").select("id, team_id, name").eq("id", c.id).maybeSingle();
    if (ex && ex.team_id && ex.team_id !== teamId) {
      const { data: t } = await sb.core().from("teams").select("name").eq("id", ex.team_id).maybeSingle();
      errors.push(`${ex.name}: đang thuộc team ${t?.name ?? "khác"} — gỡ khỏi team đó trước`);
      continue;
    }
    const { error } = ex
      ? await sb.social().from("channels").update({ team_id: teamId, is_active: true }).eq("id", c.id)
      : await sb.social().from("channels").insert({ id: c.id, platform: c.platform, name: c.name, username: c.username, team_id: teamId, is_active: true });
    if (error) errors.push(`${c.name}: ${error.message}`); else added.push(c.name);
  }
  return { added, errors };
}
