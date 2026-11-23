import { orderCost } from "@/lib/order-cost";
import "server-only";
import { sb, fetchAll } from "@/lib/supabase/admin";
import { canSeeProfit, isRndEditor, profileNames, type CurrentUser } from "@/lib/session";
import { loadChannelMarkets, marketForSql, type Market } from "@/lib/channel-market";
import { entryDate, getTeams, inVnRange, type PipelineItem } from "@/lib/pipeline";
import { signImages } from "@/lib/rnd";
import { PRODUCT_GROUPS, STAGES, stageIndex, type Stage } from "@/lib/pipeline-constants";

// Dashboard R&D theo LỨA: mọi khối tính trên cùng tập mẫu = mẫu sưu tầm trong kỳ (theo ngày ST) [+ team].
// Mốc đạt được lấy từ dữ liệu từng bảng (không phụ thuộc lịch sử), nên số luôn khớp giữa các khối.

const DAY = 86_400_000;
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export const FUNNEL: { stage: Stage; label: string; step: string }[] = [
  { stage: "p0", label: "Sưu tầm", step: "" },
  { stage: "p1", label: "Được duyệt", step: "Sưu tầm → duyệt" },
  { stage: "p2", label: "Sản xuất mẫu", step: "Duyệt → bắt đầu sản xuất" },
  { stage: "p3", label: "Hoàn thành mẫu", step: "Sản xuất → hoàn thành mẫu" },
  { stage: "p4", label: "Đã quay video", step: "Hoàn thành mẫu → video trên tay đạt" },
  { stage: "p5", label: "Win", step: "Đăng video → hệ thống đánh giá Win" },
  { stage: "p6", label: "Thương mại hoá", step: "Win → duyệt thương mại hoá" },
];

// Ngưỡng "kẹt" (ngày ở 1 mốc) — P4 = cửa sổ test (core.settings.evaluation.window_days, mặc định 14)
const STUCK_DAYS: Record<Stage, number> = { p0: 3, p1: 5, p2: 21, p3: 10, p4: 14, p5: 7, p6: 999 };
const NEXT: Record<Stage, string> = {
  p0: "Chờ duyệt mẫu", p1: "Chờ bắt đầu sản xuất", p2: "Chờ hoàn thành mẫu", p3: "Chờ quay video trên tay",
  p4: "Chờ đăng video / kết quả test", p5: "Chờ duyệt thương mại hoá", p6: "",
};

export type Bucket = { key: string; name: string; total: number; approved: number; video: number; win: number; tested: number; sampleDays: number | null; sampleCost: number };

export async function rndDashboard(user: CurrentUser, f: { from: string; to: string; teams: string[]; market?: Market }) {
  let q = sb.rnd().from("products").select("*").not("stage", "is", null);
  if (f.teams.length) q = q.in("team_id", f.teams);
  // Hai truy vấn nhỏ không phụ thuộc gì: chạy NGAY song song với truy vấn mẫu (Promise.resolve để kích hoạt — query builder chỉ chạy khi được await) thay vì nối đuôi phía sau
  const pEvalSetting = Promise.resolve(sb.core().from("settings").select("value").eq("key", "evaluation").maybeSingle());
  const pRndChannels = Promise.resolve(sb.social().from("channels").select("id, name").eq("is_active", true).eq("is_rnd", true).order("name"));
  const { data, error } = await q;
  if (error) throw error;
  const allProducts = (data ?? []) as PipelineItem[];
  // Lứa = ngày vào luồng R&D (sưu tầm; hoặc ngày team nhận mẫu từ luồng Media)
  const items = allProducts.filter((p) => inVnRange(entryDate(p), f.from, f.to));
  // Đơn / media / quyết định / nhật ký mốc của MỌI mẫu (không chỉ lứa): thẻ P0–P6 đếm theo NGÀY ĐẠT MỐC trong kỳ, cần mốc của cả mẫu sưu tầm từ trước
  const ids = allProducts.map((p) => p.id);
  const none = !ids.length;

  const [{ data: orders }, { data: media }, { data: decs }, { data: evs }, teams, { data: events }, names] = await Promise.all([
    none ? { data: [] } : sb.rnd().from("sample_orders").select("product_id, received_at, cost, cost_other, qty, status").in("product_id", ids),
    none ? { data: [] } : sb.rnd().from("media_requests").select("product_id, approval, done_at").in("product_id", ids),
    none ? { data: [] } : sb.rnd().from("current_decisions").select("product_id, result, decided_at").in("product_id", ids),
    items.some((p) => p.code) ? sb.rnd().from("evaluations").select("code, first_post_date, result, metrics").in("code", items.map((p) => p.code).filter(Boolean) as string[]) : { data: [] },
    getTeams(),
    none ? { data: [] } : sb.rnd().from("product_events").select("product_id, changes, created_at").eq("action", "stage_changed").in("product_id", ids),
    profileNames(allProducts.map((p) => p.created_by)),
  ]);
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const by = <T extends { product_id: string }>(rows: T[] | null) => {
    const m = new Map<string, T[]>();
    for (const r of rows ?? []) m.set(r.product_id, [...(m.get(r.product_id) ?? []), r]);
    return m;
  };
  const oBy = by(orders as { product_id: string; received_at: string | null; cost: number | null; cost_other: number | null; qty: number | null; status: string }[]);
  const mBy = by(media as { product_id: string; approval: string | null; done_at: string | null }[]);
  const dec = new Map(((decs ?? []) as { product_id: string; result: string; decided_at: string }[]).map((d) => [d.product_id, d]));
  const evResult = new Map(((evs ?? []) as { code: string; result: string }[]).map((e) => [e.code, e.result]));
  const evMetrics = new Map(((evs ?? []) as { code: string; metrics: { views?: number; qty_net?: number; videos?: number } | null }[]).map((e) => [e.code, e.metrics ?? {}]));
  const resOf = (p: PipelineItem) => (p.code ? evResult.get(p.code) : undefined);
  const evBy = by(events as { product_id: string; changes: { stage?: [string, string] } | null; created_at: string }[]);

  // Thời điểm đạt từng mốc của mỗi mẫu
  const reachedAt = (p: PipelineItem): Partial<Record<Stage, string>> => {
    const t: Partial<Record<Stage, string>> = { p0: entryDate(p) };
    const ev = (s: Stage) => (evBy.get(p.id) ?? []).filter((e) => e.changes?.stage?.[1] === s).map((e) => e.created_at).sort()[0];
    const idx = stageIndex(p.stage);
    if (idx >= 1) t.p1 = p.approved_at ?? ev("p1");
    if (idx >= 2) t.p2 = ev("p2");   // bấm "Bắt đầu sản xuất"
    if (idx >= 3) t.p3 = (oBy.get(p.id) ?? []).map((o) => o.received_at).filter(Boolean).sort()[0] ?? ev("p3");
    if (idx >= 4) t.p4 = (mBy.get(p.id) ?? []).map((m) => m.done_at).filter(Boolean).sort().at(-1) ?? ev("p4");
    if (idx >= 5) t.p5 = ev("p5");
    if (idx >= 6) t.p6 = dec.get(p.id)?.decided_at ?? ev("p6");
    if (!t[p.stage] && p.stage_at) t[p.stage] = p.stage_at;   // thiếu dữ liệu ngày của mốc HIỆN TẠI (vd đơn hoàn thành chưa ghi ngày nhận) → ngày lên mốc đã lưu
    for (const k of Object.keys(t) as Stage[]) if (!t[k]) delete t[k];
    return t;
  };
  const reach = new Map(allProducts.map((p) => [p.id, reachedAt(p)]));
  const days = (a?: string, b?: string) => (a && b ? Math.max(0, (Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / DAY) : null);

  // ① Số chính
  const decided = items.filter((p) => p.approval === "approved" || p.approval === "rejected").length;
  const approved = items.filter((p) => stageIndex(p.stage) >= 1).length;
  const tested = items.filter((p) => stageIndex(p.stage) >= 4).length;   // vào P4 (đã quay video, đi test)
  const wins = items.filter((p) => stageIndex(p.stage) >= 5).length;    // P5 = hệ thống đánh giá Win / Win traffic
  const kpi = {
    total: items.length, approved, decided, pending: items.filter((p) => p.stage === "p0" && p.approval === "pending" && !p.killed_at).length,
    approvalRate: decided ? approved / decided : null,
    wip: items.filter((p) => !p.killed_at && stageIndex(p.stage) >= 1 && stageIndex(p.stage) <= 3).length,
    video: items.filter((p) => stageIndex(p.stage) >= 4).length,
    wins, tested, winRate: tested ? wins / tested : null, killed: items.filter((p) => p.killed_at).length,
    fromMedia: items.filter((p) => p.entry_source === "media").length,
  };

  // ② Phễu + trung vị số ngày mỗi bước
  const funnel = FUNNEL.map((s, i) => {
    const n = items.filter((p) => stageIndex(p.stage) >= i).length;
    const prev = i ? items.filter((p) => stageIndex(p.stage) >= i - 1).length : n;
    const ds = i ? items.map((p) => days(reach.get(p.id)![FUNNEL[i - 1].stage], reach.get(p.id)![s.stage])).filter((x): x is number => x !== null) : [];
    return { ...s, count: n, stepRate: i && prev ? n / prev : null, medianDays: median(ds) };
  });

  // ③ Mẫu đang kẹt
  const today = new Date().toISOString();
  const { data: evalSetting } = await pEvalSetting;
  const windowDays = Number((evalSetting?.value as { window_days?: number } | null)?.window_days ?? 14);
  const stuckAfter = { ...STUCK_DAYS, p4: windowDays };
  const stuck = items.filter((p) => !p.killed_at && p.stage !== "p6" && !(p.stage === "p0" && p.approval !== "pending"))
    .map((p) => {
      const since = reach.get(p.id)![p.stage] ?? p.stage_at ?? p.created_at;
      return { id: p.id, st_code: p.st_code, name: p.name, stage: p.stage, next: NEXT[p.stage], days: Math.floor(days(since, today) ?? 0) };
    })
    .filter((x) => x.days > stuckAfter[x.stage]).sort((a, b) => b.days - a.days);

  // ④ Theo team / nhân viên
  const bucket = (key: string, name: string): Bucket => ({ key, name, total: 0, approved: 0, video: 0, win: 0, tested: 0, sampleDays: null, sampleCost: 0 });
  const people = new Map<string, Bucket & { _d: number[] }>(), teamB = new Map<string, Bucket & { _d: number[] }>();
  for (const p of items) {
    const rows = [
      people.get(p.created_by ?? "?") ?? { ...bucket(p.created_by ?? "?", names.get(p.created_by ?? "") ?? "?"), _d: [] },
      teamB.get(p.team_id ?? "-") ?? { ...bucket(p.team_id ?? "-", p.team_id ? teamName.get(p.team_id) ?? "?" : "Chưa gắn team"), _d: [] },
    ];
    people.set(rows[0].key, rows[0]); teamB.set(rows[1].key, rows[1]);
    const r = reach.get(p.id)!;
    const sd = days(r.p1, r.p3);
    const cost = (oBy.get(p.id) ?? []).reduce((t, o) => t + orderCost(o), 0);
    for (const b of rows) {
      b.total += 1;
      if (stageIndex(p.stage) >= 1) b.approved += 1;
      if (stageIndex(p.stage) >= 4) b.video += 1;
      if (stageIndex(p.stage) >= 4) b.tested += 1;
      if (stageIndex(p.stage) >= 5) b.win += 1;
      if (sd !== null) b._d.push(sd);
      b.sampleCost += cost;
    }
  }
  const finish = (m: Map<string, Bucket & { _d: number[] }>) =>
    [...m.values()].map(({ _d, ...b }) => ({ ...b, sampleDays: median(_d) })).sort((a, b) => b.total - a.total);

  // ⑤ Kết quả test & tiền
  const showCost = isRndEditor(user) || canSeeProfit(user) || user.is_team_lead;
  const sampleCost = [...oBy.values()].flat().reduce((t, o) => t + orderCost(o), 0);
  const results = {
    win: items.filter((p) => stageIndex(p.stage) >= 4 && resOf(p) === "win").length,
    winTraffic: items.filter((p) => stageIndex(p.stage) >= 4 && resOf(p) === "win_traffic").length,
    winSp: items.filter((p) => resOf(p) === "win_sp").length,
    fail: items.filter((p) => stageIndex(p.stage) >= 4 && resOf(p) === "fail").length,
    testing: items.filter((p) => p.stage === "p4" && (!resOf(p) || resOf(p) === "testing") && !p.killed_at).length,
    sampleCost: showCost ? sampleCost : null,
    costPerWin: showCost && wins ? sampleCost / wins : null,
  };

  // ⑥ Cơ cấu dòng SP / nhóm SP / chất liệu / loại đá của các mẫu ĐÃ DUYỆT: số mẫu, % lên video, % Win; mẫu thiếu dữ liệu
  const dim = (get: (p: PipelineItem) => string[]) => {
    const m = new Map<string, { name: string; total: number; approved: number; video: number; win: number; res: { win: number; wt: number; fail: number; testing: number } }>();
    let missing = 0;
    for (const p of items) {
      if (stageIndex(p.stage) < 1) continue;   // cơ cấu chỉ tính mẫu ĐÃ DUYỆT (P1 trở đi, kể cả mẫu duyệt rồi mới dừng); mẫu sưu tầm chưa duyệt / bị từ chối không tính
      const keys = get(p);
      if (!keys.length) { missing += 1; continue; }
      for (const k of keys) {
        const b = m.get(k) ?? { name: k, total: 0, approved: 0, video: 0, win: 0, res: { win: 0, wt: 0, fail: 0, testing: 0 } };
        b.total += 1;
        // Kết quả test của mẫu (đã vào P4): dùng cho biểu đồ cột chồng
        if (stageIndex(p.stage) >= 4) {
          const r = resOf(p);
          if (r === "win") b.res.win += 1; else if (r === "win_traffic") b.res.wt += 1; else if (r === "fail") b.res.fail += 1; else if (!p.killed_at) b.res.testing += 1;
        }
        if (stageIndex(p.stage) >= 1) b.approved += 1;
        if (stageIndex(p.stage) >= 4) b.video += 1;
        if (stageIndex(p.stage) >= 5) b.win += 1;
        m.set(k, b);
      }
    }
    return { rows: [...m.values()].sort((a, b) => b.total - a.total), missing };
  };
  const lines = dim((p) => (p.line ?? "").split(/\s*,\s*/).filter(Boolean));
  const groups = dim((p) => (p.product_group ? [PRODUCT_GROUPS[p.product_group]] : []));

  // Thêm: chất liệu · loại đá
  const materials = dim((p) => (p.material ? [p.material] : []));
  const stones = dim((p) => (p.stone ?? "").split(/\s*,\s*/).filter(Boolean));

  // Giá bán / giá vốn / biên lợi nhuận DỰ KIẾN (giá vốn là dữ liệu nhạy cảm: chỉ người có quyền thấy)
  const mean = (xs: number[]) => (xs.length ? xs.reduce((t, v) => t + v, 0) / xs.length : null);
  const priced = items.filter((p) => Number(p.expected_price) > 0), costed = items.filter((p) => Number(p.expected_cost) > 0);
  const both = items.filter((p) => Number(p.expected_price) > 0 && Number(p.expected_cost) > 0);
  const price = {
    avgPrice: mean(priced.map((p) => Number(p.expected_price))), pricedCount: priced.length,
    avgCost: showCost ? mean(costed.map((p) => Number(p.expected_cost))) : null,
    margin: showCost ? mean(both.map((p) => (Number(p.expected_price) - Number(p.expected_cost)) / Number(p.expected_price))) : null,
  };
  const killReason = (() => {
    const m = new Map<string, number>();
    for (const p of items) if (p.killed_at) m.set(p.kill_reason ?? "Chưa ghi lý do", (m.get(p.kill_reason ?? "Chưa ghi lý do") ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
  })();

  // Số mẫu ĐÃ ĐI QUA từng giai đoạn (đã tới mốc đó hoặc xa hơn — kể cả mẫu sau đó bị dừng) + số đang nằm ở giai đoạn đó + số kẹt
  // here = số mẫu thực tế hiện đang ở bước này (trên toàn bộ hệ thống / theo team), khớp với số đếm trên thanh bảng R&D
  // Thẻ P0–P6 (theo team đang lọc): P0 = mẫu SƯU TẦM trong kỳ · P1 = mẫu được DUYỆT trong kỳ (mọi lứa sưu tầm) ·
  //   P2–P6 = trong số mẫu được duyệt trong kỳ, bao nhiêu mẫu đã đi tới mốc đó (tính tới hiện tại; mẫu tới mốc rồi mới bị dừng vẫn tính).
  const inPeriod = (p: PipelineItem, s: Stage) => { const d = reach.get(p.id)![s]; return !!d && inVnRange(d, f.from, f.to); };
  const approvedCohort = allProducts.filter((p) => inPeriod(p, "p1"));
  const reachedList = (stage: Stage) => (stage === "p0" ? allProducts.filter((p) => inPeriod(p, "p0"))
    : approvedCohort.filter((p) => stageIndex(p.stage) >= stageIndex(stage)));
  const reachedIn = (stage: Stage) => reachedList(stage).length;
  // Danh sách mẫu sau từng con số của thẻ (bấm số → trang /rnd/milestone): mẫu đạt mốc trong kỳ · mẫu đang nằm ở bước đó
  const brief = (p: PipelineItem, date: string | null | undefined) => ({
    id: p.id, st_code: p.st_code, code: p.code, name: p.name, team: p.team_id ? teamName.get(p.team_id) ?? null : null,
    stage: p.stage, killed: !!p.killed_at, date: date ?? null, image: p.image_paths?.[0] ?? null,
  });
  const stageLists = Object.fromEntries(STAGES.map((s) => [s, {
    reached: reachedList(s).map((p) => brief(p, reach.get(p.id)![s])).sort((a, b) => String(b.date).localeCompare(String(a.date))),
    here: allProducts.filter((p) => p.stage === s && !p.killed_at).map((p) => brief(p, reach.get(p.id)![s] ?? p.stage_at)).sort((a, b) => String(a.date).localeCompare(String(b.date))),
  }])) as Record<Stage, { reached: ReturnType<typeof brief>[]; here: ReturnType<typeof brief>[] }>;
  const stageCounts = STAGES.map((stage) => ({
    stage, next: NEXT[stage],
    count: reachedIn(stage),
    here: allProducts.filter((p) => p.stage === stage && !p.killed_at).length,
    stuck: stuck.filter((x) => x.stage === stage).length,
  }));

  // ⑦ P5/P4: điều kiện Win (số video lên kênh · số view · số đơn) — trung bình của mẫu Win so với mẫu còn lại ở P4
  const condOf = (list: PipelineItem[]) => {
    const m = list.map((p) => (p.code ? evMetrics.get(p.code) : undefined)).filter((x): x is NonNullable<typeof x> => !!x);
    const avg = (k: "videos" | "views" | "qty_net") => (m.length ? m.reduce((t, x) => t + Number(x[k] ?? 0), 0) / m.length : null);
    return { n: list.length, videos: avg("videos"), views: avg("views"), sold: avg("qty_net") };
  };
  const reachedP4 = items.filter((p) => stageIndex(p.stage) >= 4);
  const winCond = {
    win: condOf(reachedP4.filter((p) => stageIndex(p.stage) >= 5)),
    rest: condOf(reachedP4.filter((p) => stageIndex(p.stage) === 4)),
  };

  // ⑧ P4: mọi mẫu từ P3 trở đi phải được đăng lên hệ thống kênh R&D (Page đánh dấu R&D)
  const { data: rndCh, error: rndErr } = await pRndChannels;
  const mSel = marketForSql(f.market);   // thị trường: chỉ giữ kênh R&D thuộc thị trường đang chọn (mặc định của trang là Trong nước)
  const mk = mSel ? await loadChannelMarkets() : null;
  const rndChannels = (rndErr ? [] : (rndCh ?? []) as { id: string; name: string }[]).filter((c) => !mk || (mk[c.id] ?? "vn") === mSel);
  const needPost = items.filter((p) => stageIndex(p.stage) >= 3 && !p.killed_at);
  const needCodes = needPost.map((p) => p.code).filter((c): c is string => !!c);
  const posted = new Map<string, Set<string>>();   // mã → các kênh R&D đã đăng
  const winCodes = new Set(needPost.filter((p) => stageIndex(p.stage) >= 5 && p.code).map((p) => p.code!));
  const videosOn = new Map<string, number>();       // kênh R&D → số video gắn mã mẫu (từ P3 trở đi)
  const winVideosOn = new Map<string, number>();    // kênh R&D → số video của mẫu Win
  let videos = 0, winVideos = 0;                    // tổng video đã lên · số video của mẫu Win (đã tới P5)
  if (rndChannels.length && needCodes.length) {
    const posts = await fetchAll<{ channel_id: string; product_codes: string[]; kind: string }>((a, b) => sb.social().from("posts").select("channel_id, product_codes, kind")
      .in("channel_id", rndChannels.map((c) => c.id)).overlaps("product_codes", needCodes).order("id").range(a, b));
    for (const po of posts) {
      const mine = po.product_codes.filter((c) => needCodes.includes(c));
      for (const c of mine) posted.set(c, (posted.get(c) ?? new Set()).add(po.channel_id));
      if (mine.length && (po.kind === "video" || po.kind === "reel")) {
        videos += 1;
        videosOn.set(po.channel_id, (videosOn.get(po.channel_id) ?? 0) + 1);
        if (mine.some((c) => winCodes.has(c))) { winVideos += 1; winVideosOn.set(po.channel_id, (winVideosOn.get(po.channel_id) ?? 0) + 1); }
      }
    }
  }
  const onAny = needPost.filter((p) => p.code && (posted.get(p.code)?.size ?? 0) > 0);
  const p4cover = {
    total: needPost.length, anyChannel: onAny.length, videos, winVideos,
    channels: rndChannels.map((c) => ({ id: c.id, name: c.name, posted: needPost.filter((p) => p.code && posted.get(p.code)?.has(c.id)).length, videos: videosOn.get(c.id) ?? 0, winVideos: winVideosOn.get(c.id) ?? 0 })),
    missing: needPost.filter((p) => !p.code || !(posted.get(p.code)?.size)).map((p) => ({
      id: p.id, st_code: p.st_code, name: p.name, stage: p.stage, noCode: !p.code, days: Math.floor(days(reach.get(p.id)![p.stage] ?? p.stage_at ?? p.created_at, today) ?? 0),
    })).sort((a, b) => b.days - a.days),
    hasChannels: rndChannels.length > 0,
  };

  return { kpi, stageCounts, stageLists, funnel, stuck, winCond, p4cover, people: finish(people), teams: finish(teamB), results, lines, groups, materials, stones, price, killReason, teams_list: teams, showCost };
}


// ---------- Banner thông báo mẫu Win ----------
export type WinNotice = {
  id: string; st_code: string | null; code: string | null; name: string; result: "win" | "win_traffic" | "win_sp";
  decided_at: string; by: string | null; image: string | null;
};

// Mẫu được duyệt WIN / WIN TRAFFIC trong `days` ngày gần nhất (không theo lứa — là thông báo) + số mẫu hệ thống
// đề xuất Win đang chờ duyệt. team = lọc theo team đang chọn trên dashboard.
export async function winNotices(team: string | null, days = 14) {
  const since = new Date(Date.now() - days * DAY).toISOString();
  // 2 nhánh độc lập chạy song song: mẫu vừa Win + số mẫu chờ duyệt
  const recent = async () => {
    const { data: decs } = await sb.rnd().from("current_decisions").select("product_id, result, decided_at, decided_by")
      .in("result", ["win", "win_traffic", "win_sp"]).gte("decided_at", since).order("decided_at", { ascending: false }).limit(30);
    const ids = (decs ?? []).map((d) => d.product_id as string);
    if (!ids.length) return { decs: decs ?? [], prods: [] };
    let pq = sb.rnd().from("products").select("id, st_code, code, name, image_paths, team_id, killed_at").in("id", ids);
    if (team) pq = pq.eq("team_id", team);
    const { data: prods } = await pq;
    return { decs: decs ?? [], prods: prods ?? [] };
  };
  // Chờ duyệt: P4 chưa kết luận, hệ thống đề xuất WIN / WIN TRAFFIC
  const waiting = async () => {
    let wq = sb.rnd().from("products").select("id, code").eq("stage", "p4").is("killed_at", null).not("code", "is", null);
    if (team) wq = wq.eq("team_id", team);
    const { data: p4 } = await wq;
    if (!p4?.length) return 0;
    const [{ data: ev }, { data: decided }] = await Promise.all([
      sb.rnd().from("evaluations").select("code, result").in("code", p4.map((p) => p.code as string)).in("result", ["win", "win_traffic", "win_sp"]),
      sb.rnd().from("current_decisions").select("product_id").in("product_id", p4.map((p) => p.id as string)),
    ]);
    const done = new Set((decided ?? []).map((d) => d.product_id as string));
    const winCodes = new Set((ev ?? []).map((e) => e.code as string));
    return p4.filter((p) => winCodes.has(p.code as string) && !done.has(p.id as string)).length;
  };
  const [{ decs, prods }, pending] = await Promise.all([recent(), waiting()]);
  const byId = new Map(prods.filter((p) => !p.killed_at).map((p) => [p.id as string, p]));

  const list = decs.filter((d) => byId.has(d.product_id as string));
  const [names, imgs] = await Promise.all([
    profileNames(list.map((d) => d.decided_by as string | null)),
    signImages(list.map((d) => (byId.get(d.product_id as string)!.image_paths as string[])[0]).filter(Boolean)),
  ]);
  const wins: WinNotice[] = list.map((d) => {
    const p = byId.get(d.product_id as string)!;
    const first = (p.image_paths as string[])[0];
    return {
      id: p.id, st_code: p.st_code, code: p.code, name: p.name, result: d.result as "win" | "win_traffic" | "win_sp",
      decided_at: d.decided_at as string, by: d.decided_by ? names.get(d.decided_by as string) ?? null : null, image: first ? imgs[first] ?? null : null,
    };
  });
  return { wins, pending, days };
}
