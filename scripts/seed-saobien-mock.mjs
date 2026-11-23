// Dữ liệu mẫu cho trang "Đẩy mẫu ĐVKD" (/sample-push): đủ 6 tab — Chờ phân công · Chờ tiếp nhận · Đã tiếp nhận · Đã lên video · Danh sách video · Từ chối.
// Tạo mẫu "[MOCK]" (mã ZZ91xx — không trùng mã thật), phiếu giao việc (rnd.handoffs + lịch sử), kênh "[MOCK]" gắn team nhận và vài video mẫu
// (social.posts) để tab "Đã lên video" / "Danh sách video" có nội dung. Mọi thứ đều đánh dấu [MOCK] / mã ZZ91xx và xoá sạch được.
//   Tạo (tự xoá bộ mock cũ trước):  node scripts/seed-saobien-mock.mjs
//   Xoá sạch:                        node scripts/seed-saobien-mock.mjs --clean
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const rnd = () => db.schema("rnd");
const social = () => db.schema("social");
const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
const DAY = 86_400_000, HOUR = 3_600_000;
const ago = (d) => new Date(Date.now() - d * DAY).toISOString();
const after = (iso, h) => new Date(Date.parse(iso) + h * HOUR).toISOString();
const dateAhead = (d) => new Date(Date.now() + d * DAY).toISOString().slice(0, 10);
const CH_PREFIX = "mock-sp-ch-", POST_PREFIX = "mock-sp-post-";

// ---------- Xoá bộ mock cũ ----------
async function clean() {
  const prods = must(await rnd().from("products").select("id, code").like("description", "[MOCK-SP]%"));
  const ids = prods.map((p) => p.id), codes = prods.map((p) => p.code).filter(Boolean);
  if (ids.length) must(await rnd().from("handoffs").delete().in("product_id", ids));   // cascade: handoff_events
  must(await db.schema("sales").from("daily_sales").delete().like("code", "ZZ91%"));   // số bán mock
  must(await social().from("posts").delete().like("id", `${POST_PREFIX}%`));
  must(await social().from("channels").delete().like("id", `${CH_PREFIX}%`));
  if (codes.length) {
    must(await rnd().from("evaluations").delete().in("code", codes));
    must(await rnd().from("product_events").delete().in("product_id", ids));
  }
  if (ids.length) must(await rnd().from("products").delete().in("id", ids));
  return ids.length;
}
console.log(`Đã xoá ${await clean()} mẫu mock cũ (kèm phiếu, kênh, video mock)`);
if (process.argv.includes("--clean")) process.exit(0);

// ---------- Người, team ----------
const people = must(await db.schema("core").from("profiles").select("id, full_name, role, team_id"));
const admin = people.find((p) => p.role === "admin") ?? people[0];
const rndUser = people.find((p) => p.role === "rnd") ?? admin;
const teams = must(await db.schema("core").from("teams").select("id, name").eq("is_active", true).order("name"));
// Team yêu cầu (R&D) = "PT Sản Phẩm": tài khoản Quản lý không thuộc team nào nên KHÔNG suy ra từ người dùng
const ownTeam = teams.find((t) => /sản phẩm/i.test(t.name)) ?? teams[0];
const others = teams.filter((t) => t.id !== ownTeam.id);
if (others.length < 4) throw new Error("Cần ít nhất 5 team đang hoạt động để tạo dữ liệu mẫu");
const tn = (i) => others[i % others.length];

// ---------- Mẫu mock ----------
const NAMES = [
  ["Nhẫn đôi đá moissanite 5ly", "Nhẫn", "Bạc S925", "Moissanite"], ["Dây chuyền cỏ 4 lá mạ vàng", "Dây chuyền", "Bạc S925", "CZ"],
  ["Bông tai hoa tuyết", "Bông tai", "Vàng 10K", "Moissanite"], ["Lắc tay tennis đá vuông", "Lắc", "Bạc S925", "CZ"],
  ["Mặt dây trái tim đá hồng", "Mặt dây", "Vàng 14K", "Ruby"], ["Nhẫn nam khắc rồng", "Nhẫn", "Bạc S999", "Không đá"],
  ["Kiềng cổ bi tròn", "Kiềng", "Vàng 18K", "Không đá"], ["Charm thiên nga ngọc trai", "Charm", "Bạc S925", "Ngọc trai"],
  ["Nhẫn solitaire 3ly", "Nhẫn", "Vàng 14K", "Moissanite"], ["Bông tai tròn đính đá", "Bông tai", "Bạc S925", "CZ"],
  ["Dây chuyền chữ cái", "Dây chuyền", "Bạc S925", "Không đá"], ["Lắc chân đá xanh", "Lắc", "Bạc S925", "Aquamarine"],
];
// [tab, kết quả, team nhận (chỉ số), có hạn, số video đã lên, ghi chú R&D, ghi chú team nhận, số ngày trước]
const PLAN = [
  ["unassigned", "win", null, false, 0, "Bán rất tốt, cần team khác lên video nhanh", null, 0],
  ["unassigned", null, null, false, 0, "Mẫu mới xong, chưa có kết quả test — cho các team thử video", null, 1],
  ["pending", "win_traffic", 0, true, 0, "Video đầu lên trend, cần 3 video mới trong tuần", null, 1],
  ["pending", null, 1, true, 0, "Quay kiểu unbox, đăng TikTok + Page", null, 2],
  ["received", "win", 2, true, 0, "Ưu tiên bản đá xanh", "Đã nhận mẫu, đang quay", 4],
  ["received", "win_sp", 3, false, 0, "Khách quen mua lại nhiều", "Chờ thợ chụp ảnh sản phẩm", 6],
  ["developing", "win", 0, true, 3, "Mẫu chủ lực quý này", "Đã lên 3 video, đang chạy ads", 9],
  ["developing", null, 1, true, 2, "Thử mẫu trên kênh mới", "Lên 2 video, chờ số liệu", 11],
  ["done", "win", 2, true, 4, "Win lớn nhất tháng", "Hoàn thành: 4 video, tổng 180k view", 20],
  ["done", "win_traffic", 3, false, 3, "Kéo traffic cho cả dòng", "Hoàn thành, đã chuyển sang chạy ads", 26],
  ["returned", "win_traffic", 4, true, 0, "Thử đẩy theo lượt xem", "Team đang kẹt lịch quay, xin nhận đợt sau", 7],
  ["returned", null, 5, false, 0, "Cho team test thử", "Mẫu này không hợp tệp khách của team", 12],
];

// Ảnh bìa video: dùng lại ĐƯỜNG DẪN ảnh của vài bài thật (chỉ đọc, không chép / không xoá) để giao diện có ảnh
const thumbs = (must(await social().from("posts").select("thumbnail_url").not("thumbnail_url", "is", null).eq("kind", "video").order("views", { ascending: false }).limit(12)))
  .map((r) => r.thumbnail_url);

// Kênh mock cho các team nhận (để video "của team" khớp với phiếu): mỗi team dùng trong kế hoạch 1 kênh
const usedTeams = [...new Set(PLAN.filter((r) => r[2] !== null).map((r) => tn(r[2])))];
for (const [i, t] of usedTeams.entries()) {
  must(await social().from("channels").insert({
    id: `${CH_PREFIX}${i + 1}`, platform: i % 2 ? "tiktok" : "facebook", name: `[MOCK] Kênh ${t.name}`, is_active: true, team_id: t.id,
  }));
}
const chOf = (team) => `${CH_PREFIX}${usedTeams.findIndex((t) => t.id === team.id) + 1}`;

let seq = 0;
for (const [i, row] of PLAN.entries()) {
  const [tab, result, teamIdx, hasDeadline, nVideos, rndNote, teamNote, daysAgo] = row;
  const [name, line, material, stone] = NAMES[i];
  const code = `ZZ91${String(i + 1).padStart(2, "0")}`;
  const team = teamIdx === null ? null : tn(teamIdx);
  const created = ago(daysAgo + 0.3);
  const p = must(await rnd().from("products").insert({
    name, description: "[MOCK-SP] Dữ liệu mẫu cho trang Đẩy mẫu ĐVKD", team_id: ownTeam.id, stage: result ? "p5" : "p4", stage_at: ago(daysAgo + 2),
    entry_source: "rnd", approval: "approved", approved_by: admin.id, approved_at: ago(daysAgo + 14), line, material, stone,
    product_group: i % 3 === 2 ? "traffic" : "gmv", ref_platform: "Instagram", ref_url: "https://example.com/mock", expected_cost: 350000, expected_price: 990000,
    source_status: "Đã có source", source_url: `https://drive.google.com/drive/folders/mock-${code.toLowerCase()}`, code, status: "ended", origin: "manual",
    created_by: rndUser.id, updated_by: admin.id, created_at: ago(daysAgo + 20),
  }).select("id").single());

  const status = tab === "unassigned" ? "pending" : tab;
  const received = ["received", "developing", "done"].includes(status) ? after(created, 6 + i) : null;
  const done = status === "done" ? after(received, 24 * 5) : null;
  const views = 40000 + i * 21000;
  const snapshot = result ? {
    suggested: result, window: [ago(daysAgo + 10).slice(0, 10), ago(daysAgo + 3).slice(0, 10)],
    metrics: { views, viewers: Math.round(views * 0.66), qty_net: 8 + i * 3, ctr: +(1.4 + i * 0.2).toFixed(2), conversion: +(0.4 + i * 0.25).toFixed(2), engagement_rate: 3.4 },
  } : {};
  const h = must(await rnd().from("handoffs").insert({
    product_id: p.id, result, snapshot, source_url: `https://drive.google.com/drive/folders/mock-${code.toLowerCase()}`,
    rnd_note: rndNote, saobien_note: teamNote, status, team_id: team?.id ?? null, deadline: hasDeadline ? dateAhead(3 + (i % 5) * 2 - (status === "pending" && i === 3 ? 6 : 0)) : null,
    assignee_id: received ? rndUser.id : null, created_by: rndUser.id, created_at: created, received_at: received, done_at: done,
    updated_at: done ?? received ?? created,
  }).select("id").single());

  const ev = [{ action: "created", actor_id: rndUser.id, note: rndNote, created_at: created }];
  if (team) ev.push({ action: "assigned", actor_id: rndUser.id, note: `${team.name} — ${rndNote}`, created_at: after(created, 1) });
  if (received) ev.push({ action: "received", actor_id: rndUser.id, created_at: received });
  if (status === "developing" || status === "done") ev.push({ action: "developing", actor_id: rndUser.id, note: teamNote, created_at: after(received, 30) });
  if (status === "done") ev.push({ action: "done", actor_id: rndUser.id, note: teamNote, created_at: done });
  if (status === "returned") ev.push({ action: "returned", actor_id: rndUser.id, note: teamNote, created_at: after(created, 20) });
  must(await rnd().from("handoff_events").insert(ev.map((e) => ({ handoff_id: h.id, ...e }))));

  // Video team đã lên cho mẫu (đăng ở kênh mock của team, sau ngày giao việc)
  for (let v = 0; v < nVideos; v++) {
    const published = after(received ?? created, 40 + v * 30);
    const viewsV = 3000 + ((seq * 7919 + v * 4421) % 60000);
    must(await social().from("posts").insert({
      id: `${POST_PREFIX}${++seq}`, channel_id: chOf(team), platform: usedTeams.findIndex((t) => t.id === team.id) % 2 ? "tiktok" : "facebook", published_at: published, kind: "video",
      message: `${name} #${code} — video ${v + 1} (mock)`, permalink_url: "https://example.com/mock-video", thumbnail_url: thumbs[(seq - 1) % Math.max(1, thumbs.length)] ?? null,
      hashtags: [code], product_codes: [code], views: viewsV, viewers: Math.round(viewsV * 0.7), reactions: Math.round(viewsV / 90), comments: Math.round(viewsV / 400), shares: Math.round(viewsV / 800),
      clicks: Math.round(viewsV / 60), video_views: viewsV,
    }));
  }
  // Số bán mock của team (ở kênh mock của team, các ngày sau khi giao) để cột "SL bán" có số
  if (team && ["received", "developing", "done"].includes(status)) {
    const base = nVideos ? 4 + nVideos * 3 : 2;
    const rows = [];
    for (let d = 1; d <= 5; d++) {
      const day = new Date(Date.parse(created) + d * DAY);
      if (day.getTime() > Date.now()) break;
      rows.push({ code, date: day.toISOString().slice(0, 10), page_id: chOf(team), channel: "facebook", qty_sold: base + ((i + d) % 4), qty_returned: d === 3 && nVideos ? 1 : 0, revenue: 990000 * (base + 1) });
    }
    if (rows.length) must(await db.schema("sales").from("daily_sales").insert(rows));
  }
  console.log(`${tab.padEnd(10)} ${code} ${name}${team ? ` → ${team.name}` : ""}${nVideos ? ` · ${nVideos} video` : ""}`);
}
const counts = must(await rnd().from("handoffs").select("status, team_id, product:products!inner(description)").like("product.description", "[MOCK-SP]%"));
const by = {}; for (const c of counts) { const k = c.status === "pending" && !c.team_id ? "chờ phân công" : c.status; by[k] = (by[k] ?? 0) + 1; }
console.log("Đã tạo:", by);
