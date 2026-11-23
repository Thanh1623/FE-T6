// Dữ liệu mẫu cho bộ bảng R&D, lấy ~40 sản phẩm THẬT từ app đặt hàng (Qlydonhang · product_stock — chỉ đọc):
// tên, ảnh, giá vốn, NCC, chất liệu. Ảnh được chép vào kho ảnh của app (bucket rnd-images) như ảnh R&D tải lên.
// Mọi mẫu có mô tả bắt đầu bằng "[MOCK]".
//   Tạo lại:  node scripts/seed-rnd-mock.mjs          (tự xoá bộ mock cũ trước)
//   Xoá sạch: node scripts/seed-rnd-mock.mjs --clean
// Mã SKU ở bước P3 trở đi dùng ZZ9xxx (không trùng mã thật → không lẫn số liệu video / số bán thật).
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const orders = createClient(env.ORDERS_SUPABASE_URL, env.ORDERS_SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const rnd = () => db.schema("rnd");
const BUCKET = "rnd-images";
const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

const DAY = 86_400_000;
const ago = (d) => new Date(Date.now() - d * DAY).toISOString();
const dateAgo = (d) => ago(d).slice(0, 10);

async function clean() {
  const mock = must(await rnd().from("products").select("id, image_paths").like("description", "[MOCK]%"));
  if (!mock.length) return 0;
  const ids = mock.map((p) => p.id);
  const design = must(await rnd().from("design_tasks").select("image_paths").in("product_id", ids));
  const orderRows = must(await rnd().from("sample_orders").select("id").in("product_id", ids));
  const media = must(await rnd().from("media_requests").select("id, photo_paths").in("product_id", ids));
  const paths = [...mock.flatMap((p) => p.image_paths), ...design.flatMap((d) => d.image_paths), ...media.flatMap((m) => m.photo_paths)];
  for (let i = 0; i < paths.length; i += 100) await db.storage.from(BUCKET).remove(paths.slice(i, i + 100));
  if (orderRows.length) must(await rnd().from("status_log").delete().eq("entity", "order").in("entity_id", orderRows.map((o) => String(o.id))));
  if (media.length) must(await rnd().from("status_log").delete().eq("entity", "media").in("entity_id", media.map((m) => String(m.id))));
  must(await rnd().from("status_log").delete().eq("entity", "design").in("entity_id", ids));
  must(await rnd().from("products").delete().in("id", ids));   // cascade: việc 3D, đơn, media, lịch sử, kết luận
  return ids.length;
}

console.log(`Đã xoá ${await clean()} mẫu mock cũ`);
if (process.argv.includes("--clean")) process.exit(0);

// ---------- Lấy sản phẩm thật từ app đặt hàng ----------
const LINE = { N: "Nhẫn", D: "Dây chuyền", B: "Bông tai", L: "Lắc", M: "Mặt dây", K: "Kiềng" };
const stock = must(await orders.from("product_stock").select("sku, masp, ten, gia_von, image_url, ncc, chat_lieu").not("image_url", "is", null).limit(3000));
const byCode = new Map();
for (const r of stock) {
  const code = String(r.masp || r.sku).split("-")[0].toUpperCase();
  const prefix = code.match(/^[A-Z]+/)?.[0];
  if (!LINE[prefix] || !/^[A-Z]\d{3,}$/.test(code)) continue;   // bỏ phụ kiện (hộp, khăn, nước rửa…)
  const cur = byCode.get(code) ?? { code, prefix, name: r.ten, cost: r.gia_von, ncc: r.ncc, material: r.chat_lieu, images: [] };
  if (r.image_url && !cur.images.includes(r.image_url)) cur.images.push(r.image_url);
  byCode.set(code, cur);
}
// Trộn đều các dòng SP, lấy 40
const groups = Object.keys(LINE).map((k) => [...byCode.values()].filter((p) => p.prefix === k));
const picked = [];
for (let i = 0; picked.length < 40 && groups.some((g) => g[i]); i++) for (const g of groups) if (g[i] && picked.length < 40) picked.push(g[i]);
console.log(`Lấy ${picked.length} sản phẩm từ app đặt hàng (${groups.map((g, i) => `${Object.values(LINE)[i]} ${g.length}`).join(", ")})`);

const cleanName = (n) => String(n).replace(/\s*-\s*Viễn Chí Bảo.*$/i, "").replace(/\s*-\s*[^-]*$/, (m) => (/\d|size|ni|li/i.test(m) ? "" : m)).trim();
const stoneOf = (n) => {
  const s = [];
  if (/mois/i.test(n)) s.push("Moissanite");
  if (/\bcz\b/i.test(n)) s.push("CZ");
  if (/sapphire/i.test(n)) s.push("Sapphire");
  if (/ruby/i.test(n)) s.push("Ruby");
  if (/ngọc trai|pearl/i.test(n)) s.push("Ngọc trai");
  if (/aquamarine/i.test(n)) s.push("Aquamarine");
  if (/thạch anh/i.test(n)) s.push("Thạch anh");
  return s.length ? s.join(", ") : "Không đá";
};
const materialOf = (p) => (/s999/i.test(p.name) ? "Bạc S999" : /vàng\s*(10|14|18)k/i.test(p.name) ? `Vàng ${p.name.match(/vàng\s*(10|14|18)k/i)[1]}K` : p.material && /925/.test(p.material) ? "Bạc S925" : "Bạc S925");

// Chép ảnh vào kho ảnh của app
async function copyImage(url, path) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Tải ảnh lỗi ${res.status}`);
  const type = res.headers.get("content-type") ?? "image/jpeg";
  const { error } = await db.storage.from(BUCKET).upload(path, Buffer.from(await res.arrayBuffer()), { contentType: type, upsert: true });
  if (error) throw new Error(error.message);
  return path;
}

const admin = must(await db.schema("core").from("profiles").select("id").eq("role", "admin").eq("is_active", true).limit(1).single()).id;
const teams = must(await db.schema("core").from("teams").select("id, name").eq("is_active", true)).filter((t) => t.name !== "BOD");
const PLATFORMS = ["Instagram", "Facebook", "TikTok", "Pinterest", "Douyin", "Etsy"];
const METRICS = ["like:84,1k cmt:581", "like:12,4k cmt:53", "views 1,2M", "like:162k cmt:610", "lượt lưu 8k", "đã bán 2,3k", "like:5,8k cmt:78", "like:339k cmt:829"];

// 40 mẫu chia theo bước quy trình
const PLAN = [
  ...Array(2).fill("draft"), ...Array(4).fill("pending"), ...Array(2).fill("rejected"),
  "p0", "p0", "p0-doing", "p0-doing", "p0-review", "p0-review",
  "p1-cast", "p1-cast", "p1-cast", "p1-film", "p1-film", "p1-film", "p1-film",
  ...Array(5).fill("p2"), ...Array(5).fill("p3"), ...Array(5).fill("p4"), "p5", "p5", "killed", "killed",
];
const STAGE = { draft: "collection", pending: "collection", rejected: "collection", p0: "p0", "p0-doing": "p0", "p0-review": "p0",
  "p1-cast": "p1", "p1-film": "p1", p2: "p2", p3: "p3", p4: "p4", p5: "p5", killed: "p1" };
let sku = 9001;

for (const [i, src] of picked.entries()) {
  const kind = PLAN[i % PLAN.length];
  const stage = STAGE[kind];
  const d = 3 + Math.round((i / picked.length) * 45);   // ngày sưu tầm rải trong ~1,5 tháng
  const approved = !["draft", "pending", "rejected"].includes(kind);
  const code = ["p3", "p4", "p5"].includes(kind) ? `ZZ${sku++}` : null;
  const cost = src.cost ? Math.round(Number(src.cost)) : 300000 + (i % 7) * 50000;
  const price = Math.round((cost * (2.6 + (i % 4) * 0.2)) / 10000) * 10000;
  const team = teams[i % teams.length];
  const p = must(await rnd().from("products").insert({
    name: cleanName(src.name), description: `[MOCK] Dữ liệu mẫu từ app đặt hàng (${src.code}) — ${kind}`,
    team_id: team?.id ?? null, stage, stage_at: ago(Math.max(0, d - 4)), entry_source: "rnd",
    approval: approved ? "approved" : kind, approval_note: kind === "rejected" ? "Trùng mẫu đang bán" : null,
    approved_by: approved || kind === "rejected" ? admin : null, approved_at: approved ? ago(d - 1) : null, approved_qty: approved ? 2 : null,
    line: LINE[src.prefix], material: materialOf(src), stone: stoneOf(src.name), product_group: i % 3 === 2 ? "traffic" : "gmv",
    ref_platform: PLATFORMS[i % PLATFORMS.length], ref_url: `https://vienchibao.com/search?query=${src.code}`, ref_metrics: METRICS[i % METRICS.length],
    price_ref: Math.round(price * 1.3 / 10000) * 10000, expected_cost: cost, expected_price: price,
    source_status: approved ? "Đã có source" : "Chưa có", code, status: stage === "p5" ? "ended" : "researching", origin: "manual",
    killed_at: kind === "killed" ? ago(4) : null, kill_reason: kind === "killed" ? (i % 2 ? "Giá vốn cao" : "Khó sản xuất") : null,
    created_by: admin, updated_by: admin, created_at: ago(d),
    ...(["p3", "p4", "p5"].includes(kind) ? { source_url: "https://drive.google.com/drive/folders/mock-source", traffic_owner: admin } : {}),
    ...(["p4", "p5"].includes(kind) ? { customer_feedback: "Nhiều khách hỏi size, khen đá sáng", ads_cost: 1500000, traffic_review: "Tốt" } : {}),
    ...(kind === "p5" ? { win_qty: 30, launch_date: dateAgo(12) } : {}),
  }).select("id, st_code").single());

  // Ảnh SP (ảnh đầu) + ảnh 3D (ảnh biến thể khác nếu có, không thì dùng lại ảnh SP)
  const productImgs = [];
  for (const [k, url] of src.images.slice(0, 2).entries()) {
    try { productImgs.push(await copyImage(url, `${p.id}/mock-${k}.${url.match(/\.(png|webp|jpe?g)/i)?.[1] ?? "jpg"}`)); } catch (e) { console.warn(`  ảnh ${src.code}: ${e.message}`); }
  }
  if (productImgs.length) must(await rnd().from("products").update({ image_paths: productImgs }).eq("id", p.id));
  console.log(`${p.st_code}  ${kind.padEnd(9)} ${src.code.padEnd(7)} ${productImgs.length} ảnh  ${cleanName(src.name)}`);

  // Bảng Thiết kế 3D
  if (approved) {
    const status = kind === "p0" ? "todo" : kind === "p0-doing" ? "doing" : kind === "p0-review" ? "review" : "done";
    let img3d = [];
    if (status !== "todo" && src.images.length) {
      const url = src.images[src.images.length - 1];
      try { img3d = [await copyImage(url, `${p.id}/3d/mock-3d.${url.match(/\.(png|webp|jpe?g)/i)?.[1] ?? "jpg"}`)]; } catch { /* bỏ qua */ }
    }
    must(await rnd().from("design_tasks").insert({
      product_id: p.id, assignee_id: status === "todo" ? null : admin, status, image_paths: img3d,
      file_url: status === "todo" || status === "doing" ? null : "https://drive.google.com/drive/folders/mock-3d",
      note: i % 4 === 0 ? "Dây 45cm, đá chủ 6li" : null, submitted_at: ["review", "done"].includes(status) ? ago(d - 3) : null,
      done_at: status === "done" ? ago(d - 4) : null, reviewed_by: status === "done" ? admin : null, created_at: ago(d - 1),
    }));
  }

  // Bảng Theo dõi đặt hàng (+ nhật ký trạng thái → thời gian từng bước)
  if (["p1-cast", "p1-film", "p2", "p3", "p4", "p5", "killed"].includes(kind)) {
    const finished = ["p2", "p3", "p4", "p5"].includes(kind);
    const steps = finished ? ["Đặt hàng", "Chốt đúc", "Quay chế tác", "Hoàn thành"]
      : kind === "p1-film" ? ["Đặt hàng", "Chốt đúc", "Quay chế tác"] : kind === "killed" ? ["Đặt hàng", "Huỷ"] : ["Đặt hàng", "Chốt đúc"];
    const start = d - 5;
    const o = must(await rnd().from("sample_orders").insert({
      product_id: p.id, supplier: src.ncc || "ENSHIDO", status: steps.at(-1), ordered_at: dateAgo(start), expected_at: dateAgo(start - 15),
      received_at: finished ? dateAgo(start - 12) : null, qty: kind === "p1-film" ? 2 : 1, unit: src.prefix === "B" ? "Đôi" : "Chiếc",
      color: i % 3 ? "Xi vàng trắng" : "Xi vàng vàng", weight_chi: Math.round((0.6 + (i % 5) * 0.3) * 10) / 10,
      size: src.prefix === "N" ? "10–16" : src.prefix === "D" ? "45cm" : null,
      cost: Math.round(cost * 2.4), cost_other: 120000, price,
      note: kind === "p1-film" ? "Đặt 2 cái: 1 cái quay chế tác, 1 cái hoàn thiện" : "đã có phôi", created_by: null, created_at: ago(start),
    }).select("id").single());
    must(await rnd().from("status_log").insert(steps.map((v, k) => ({ entity: "order", entity_id: String(o.id), value: v, actor_id: k ? admin : null, at: ago(start - k * 4) }))));

    // Bảng Media
    if (kind !== "p1-cast" && kind !== "killed") {
      const reqs = [{ request_type: "Quay chế tác", sample_order_id: o.id }];
      if (finished) reqs.push({ request_type: "Quay sản phẩm" }, { request_type: "Chụp sản phẩm" });
      for (const [k, r] of reqs.entries()) {
        const done = ["p3", "p4", "p5"].includes(kind) || (kind === "p2" && k === 0);
        const doing = kind === "p1-film" || (kind === "p2" && k === 1);
        let photos = [];
        if (r.request_type === "Chụp sản phẩm" && done && productImgs[0]) {
          try { photos = [await copyImage(src.images[0], `${p.id}/media-photo/mock.jpg`)]; } catch { /* bỏ qua */ }
        }
        must(await rnd().from("media_requests").insert({
          product_id: p.id, ...r, assignee_id: admin, lead_id: admin, deadline: dateAgo(start - 14 - k),
          status: done ? "done" : doing ? "doing" : "todo", approval: done ? "pass" : kind === "p2" && k === 1 ? "pending" : null,
          drive_url: done || doing ? "https://drive.google.com/drive/folders/mock-media" : null, photo_paths: photos,
          done_at: done ? ago(start - 14 - k) : null, reviewed_by: done ? admin : null, created_by: k === 0 ? null : admin, received_at: ago(start - 8 - k),
        }));
      }
    }
  }

  if (kind === "p5") must(await rnd().from("decisions").insert({ product_id: p.id, result: "win", suggested: null, note: "Mock: duyệt Win", snapshot: { suggested: null }, decided_by: admin, decided_at: ago(12) }));
  must(await rnd().from("product_events").insert({ product_id: p.id, actor_id: admin, action: "created", created_at: ago(d) }));
}
console.log(`\nĐã tạo ${picked.length} mẫu mock từ app đặt hàng. Xoá: node scripts/seed-rnd-mock.mjs --clean`);
