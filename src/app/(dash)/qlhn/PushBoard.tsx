"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fmtCompact } from "@/lib/format";
import { UNASSIGNED, VERDICT, type Cls, type Priority, type PushRequest, type PushRow, type Verdict } from "@/lib/team-push-types";
import { createPushRequest, deletePushRequest, setPushStatus } from "./push-actions";
import { Pill, nf } from "./Parts";

// BẢNG 3 — Tồn kho & Đẩy hàng theo team (migration 085). Gốc dữ liệu là MỌI SPU ĐANG TỒN KHO (không phải danh sách đã bán).
// Chọn một team ở ô "Team" thì các cột video / bán / "chưa đẩy" tính theo team đó; để "Tất cả team" thì tính theo mọi team.
type Tab = "all" | "unpushed" | "pushed" | "ineffective" | "slow" | "dead";
const TABS: [Tab, string][] = [["all", "Tất cả"], ["unpushed", "Chưa đẩy"], ["pushed", "Đang đẩy"], ["ineffective", "Đẩy chưa hiệu quả"], ["slow", "Bán chậm"], ["dead", "Tồn xấu"]];
const CLS: Record<Cls, { label: string; tone: "ok" | "info" | "warn" | "bad" }> = {
  hot: { label: "Bán chạy", tone: "ok" }, normal: { label: "Bán thường", tone: "info" }, slow: { label: "Bán chậm", tone: "warn" }, bad: { label: "Tồn xấu", tone: "bad" },
};
const PRI: Record<Priority, { label: string; tone: "bad" | "warn" | "mute" }> = { high: { label: "Cao", tone: "bad" }, mid: { label: "Trung bình", tone: "warn" }, low: { label: "Thấp", tone: "mute" } };
const VTONE: Record<Verdict, "ok" | "warn" | "mute" | "info"> = { pushing: "ok", weak: "warn", idle: "mute", sold_no_video: "info" };
const STATUS: Record<PushRequest["status"], { label: string; tone: "mute" | "info" | "ok" }> = { todo: { label: "Chưa triển khai", tone: "mute" }, doing: { label: "Đang triển khai", tone: "info" }, done: { label: "Đã hoàn thành", tone: "ok" } };
const PAGE = 12;
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 86_400_000).toISOString().slice(0, 10);
const dmy = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "–");

// Sắp xếp theo cột (bấm tiêu đề): lần đầu số lớn → nhỏ, chữ A → Z; bấm lại đảo chiều. Chưa chọn = thứ tự mặc định (ưu tiên rồi tồn)
type SortKey = "spu" | "cls" | "stock" | "incoming" | "age" | "sold30" | "videos" | "sold" | "pushing" | "idle" | "priority";
const CLS_RANK: Record<Cls, number> = { hot: 0, normal: 1, slow: 2, bad: 3 };
const PRI_RANK: Record<Priority, number> = { high: 0, mid: 1, low: 2 };
const TEXT_KEYS = new Set<SortKey>(["spu", "cls", "priority"]);

type View = { row: PushRow; videos: number; views: number; sold: number; unpushed: boolean; ineffective: boolean };

export default function PushBoard({ rows, teams, requests, canCreate, myTeam, focusTeam, defaultTeam, range, today, refreshedAt }: {
  rows: PushRow[]; teams: string[]; requests: PushRequest[]; canCreate: boolean; myTeam: string | null; focusTeam: string; defaultTeam: string; range: string; today: string; refreshedAt: string | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [team, setTeam] = useState<string>(teams.includes(defaultTeam) ? defaultTeam : "");   // mặc định xem theo team của tài khoản; "" = tất cả team
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  const [rsort, setRsort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [rq, setRq] = useState<"all" | PushRequest["status"]>("all");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const views: View[] = useMemo(() => rows.map((r) => {
    const c = team ? r.teams.find((x) => x.team === team) : null;
    const videos = team ? c?.videos ?? 0 : r.videos, views = team ? c?.views ?? 0 : r.views, sold = team ? c?.sold ?? 0 : r.sold;
    const tv = team ? videos : r.teamVideos;   // "đẩy" = team vận hành video đăng; video của Page chưa gán team / ADS không tính là đẩy
    const unpushed = tv === 0 && r.cls !== "bad";
    const ineffective = tv > 0 && (r.cls === "slow" || r.cls === "bad" || (team && c?.verdict === "weak" ? true : false));
    return { row: r, videos, views, sold, unpushed, ineffective };
  }), [rows, team]);

  const count = (f: (v: View) => boolean) => views.filter(f).length;
  const n = { all: views.length, unpushed: count((v) => v.unpushed), pushed: count((v) => (team ? v.videos : v.row.teamVideos) > 0), ineffective: count((v) => v.ineffective), slow: count((v) => v.row.cls === "slow"), dead: count((v) => v.row.cls === "bad") };
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const valOf = (v: View, k: SortKey): number | string => {
    const r = v.row;
    return k === "spu" ? r.code : k === "cls" ? CLS_RANK[r.cls] : k === "stock" ? r.stock : k === "incoming" ? r.incoming : k === "age" ? r.age ?? -1 : k === "sold30" ? r.sold30 ?? -1
      : k === "videos" ? v.videos : k === "sold" ? v.sold : k === "pushing" ? r.pushing.length : k === "idle" ? r.idle.length : PRI_RANK[r.priority];
  };
  const filtered = views.filter((v) => (tab === "all" || (tab === "unpushed" ? v.unpushed : tab === "pushed" ? (team ? v.videos : v.row.teamVideos) > 0 : tab === "ineffective" ? v.ineffective : tab === "slow" ? v.row.cls === "slow" : v.row.cls === "bad"))
    && words.every((w) => `${v.row.code} ${v.row.name}`.toLowerCase().includes(w)));
  const list = sort
    ? [...filtered].sort((a, b) => {
      const x = valOf(a, sort.key), y = valOf(b, sort.key);
      return ((typeof x === "string" ? x.localeCompare(String(y), "vi") : x - (y as number)) * sort.dir) || a.row.code.localeCompare(b.row.code);
    })
    : filtered;
  const sortBy = (key: SortKey) => { setSort(sort?.key === key ? { key, dir: (-sort.dir) as 1 | -1 } : { key, dir: TEXT_KEYS.has(key) ? 1 : -1 }); setPage(1); };
  const sth = (key: SortKey, label: string, cls: string, title?: string) => (
    <th className={`srt ${cls}`} title={title} data-dir={sort?.key === key ? (sort.dir > 0 ? "asc" : "desc") : undefined} onClick={() => sortBy(key)}>{label}</th>
  );
  const pages = Math.max(1, Math.ceil(list.length / PAGE)), cur = Math.min(page, pages);
  const slice = list.slice((cur - 1) * PAGE, cur * PAGE);
  // Hàng Tổng: cộng mọi SPU đang lọc (cả các trang khác), không chỉ trang đang xem
  const sum = (f: (v: View) => number) => list.reduce((t, v) => t + f(v), 0);
  const tot = { stock: sum((v) => v.row.stock), incoming: sum((v) => v.row.incoming), sold30: sum((v) => v.row.sold30 ?? 0), videos: sum((v) => v.videos), sold: sum((v) => v.sold) };

  const run = (f: () => Promise<{ ok: true } | { ok: false; error: string }>, done?: string) => start(async () => {
    const r = await f();
    setMsg(r.ok ? { ok: true, text: done ?? "Đã lưu" } : { ok: false, text: r.error });
    if (r.ok) router.refresh();
  });

  // Form giao việc đẩy hàng cho một SPU
  const [form, setForm] = useState({ team: "", priority: "mid" as Priority, target: 3, due: addDays(today, 7), note: "" });
  const openForm = (r: PushRow, t: string) => setForm({ team: t, priority: r.priority, target: r.priority === "high" ? 5 : 3, due: addDays(today, 7), note: "" });

  const rval = (r: PushRequest, k: string): number | string => (k === "code" ? r.code : k === "team" ? r.team : k === "priority" ? PRI_RANK[r.priority] : k === "videos" ? r.done_videos / Math.max(1, r.target)
    : k === "due" ? r.due ?? "9999" : k === "status" ? ["todo", "doing", "done"].indexOf(r.status) : k === "by" ? r.by ?? "" : 0);
  const reqFiltered = requests.filter((r) => rq === "all" || r.status === rq);
  const reqRows = rsort
    ? [...reqFiltered].sort((a, b) => { const x = rval(a, rsort.key), y = rval(b, rsort.key); return ((typeof x === "string" ? x.localeCompare(String(y), "vi") : x - (y as number)) * rsort.dir) || b.id - a.id; })
    : reqFiltered;
  const rsortBy = (key: string) => setRsort(rsort?.key === key ? { key, dir: (-rsort.dir) as 1 | -1 } : { key, dir: ["code", "team", "by", "due", "priority", "status"].includes(key) ? 1 : -1 });
  const rth = (key: string, label: string, cls = "") => <th className={`srt ${cls}`.trim()} data-dir={rsort?.key === key ? (rsort.dir > 0 ? "asc" : "desc") : undefined} onClick={() => rsortBy(key)}>{label}</th>;
  const openByCode = (code: string) => requests.filter((r) => r.code === code && r.status !== "done");
  const th = "n";
  const chip = (label: string, value: number, tab2: Tab | null, tone?: string, hint?: string) => (
    <button type="button" className={`kc kcb${tone ? ` ${tone}` : ""}`} title={hint} onClick={() => { if (tab2) { setTab(tab2); setPage(1); } }} style={tab2 ? undefined : { cursor: "default" }}>
      <b>{nf(value)}</b><span>{label}</span>
    </button>
  );

  return (
    <>
      <section className="card" id="d-push">
        <div className="card-h">
          <h2>Tồn kho và đẩy hàng theo team</h2>
          <span className="hint">{range}{refreshedAt ? ` · tồn tính lúc ${new Date(refreshedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" })}` : ""}</span>
        </div>
        <div className="chips">
          {chip("SPU tồn kho (tồn > 0)", n.all, "all", undefined, "Mọi SPU còn tồn kho, không chỉ SPU đã bán")}
          {chip("SPU chưa được đẩy", n.unpushed, "unpushed", "warn", team ? `${team} chưa đăng video trong kỳ` : "Không team vận hành video nào đăng video trong kỳ (video Page chưa gán team / ADS không tính)")}
          {chip("SPU đang được đẩy", n.pushed, "pushed", "ok", "Có video trong kỳ")}
          {chip("SPU bán chậm", n.slow, "slow", undefined, "Theo ngưỡng ở trang KPI")}
          {chip("SPU tồn xấu", n.dead, "dead", "bad", "Còn hàng nhưng 30 ngày không bán được")}
          {chip("SPU đẩy chưa hiệu quả", n.ineffective, "ineffective", "warn", "Có video nhưng bán thấp")}
        </div>

        <div className="push-tools">
          <div className="seg" role="tablist" aria-label="Nhóm SPU">
            {TABS.map(([k, label]) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setPage(1); }}>{label} {nf(n[k])}</button>)}
          </div>
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Tìm mã SPU, tên sản phẩm…" className="push-in" aria-label="Tìm SPU" />
          <select value={team} onChange={(e) => { setTeam(e.target.value); setPage(1); }} className="push-in" aria-label="Team">
            <option value="">Tất cả team</option>
            {teams.map((t) => <option key={t} value={t}>{t}{t === focusTeam ? " (đang xem)" : ""}</option>)}
            <option value={UNASSIGNED}>{UNASSIGNED} (Page chưa gán)</option>
          </select>
        </div>
        {msg && <div className={`hint push-msg ${msg.ok ? "ok" : "bad"}`} role="status">{msg.ok ? "✓" : "⛔"} {msg.text}</div>}

        <div className="scroll"><table className="dtbl push-tbl">
          <thead><tr>
            {sth("spu", "SPU", "pc-spu")}{sth("cls", "Phân loại", "c")}
            {sth("stock", "Tồn", th, "Tồn kho hiện tại (cộng mọi kho)")}{sth("incoming", "Hàng về", th, "Hàng đang về: PO đã đặt, chưa nhập kho")}
            {sth("age", "Tuổi tồn", th, "Số ngày tồn, ưu tiên theo lô nhập")}{sth("sold30", "Bán 30 ngày", th, "SL bán 30 ngày gần nhất của cả công ty")}
            {sth("videos", "Video", th, team ? `Số video ${team} đăng trong kỳ` : "Số video đăng trong kỳ của toàn công ty (gồm cả Page chưa gán team và ADS) — khớp trang Theo dõi đẩy hàng")}
            {sth("sold", "Bán trong kỳ", th, team ? `Bán của ${team} trong kỳ` : "Bán của toàn công ty trong kỳ (mọi team, kể cả ADS, TMĐT, Cửa hàng, đơn chưa gán team) — khớp trang Theo dõi đẩy hàng")}
            {sth("pushing", "Team đang đẩy", "pc-team", "Sắp xếp theo số team đang đẩy")}{sth("idle", "Chưa đẩy", "c", "Số team chưa đăng video / số team vận hành video")}
            {sth("priority", "Ưu tiên", "c")}<th />
          </tr></thead>
          <tbody>
            {slice.map(({ row: r, videos, sold }) => (
              <Fragment key={r.code}>
                <tr className={open === r.code ? "push-open" : undefined}>
                  <td className="pc-spu" title={`${r.name} · ${r.why}`}><b className="code">{r.code}</b><span className="nm">{r.name}</span></td>
                  <td className="c"><Pill tone={CLS[r.cls].tone}>{CLS[r.cls].label}</Pill></td>
                  <td className="n"><b>{nf(r.stock)}</b></td>
                  <td className="n">{r.incoming ? <span style={{ color: "var(--ok)" }}>+{nf(r.incoming)}</span> : <span className="hint">–</span>}</td>
                  <td className="n">{r.age ? `${r.age} ngày` : <span className="hint">–</span>}</td>
                  <td className="n">{r.sold30 === null ? "–" : nf(r.sold30)}</td>
                  <td className="n">{videos ? <b>{nf(videos)}</b> : <span className="hint">0</span>}</td>
                  <td className="n">{sold ? nf(sold) : <span className="hint">0</span>}</td>
                  <td className="pc-team" title={r.pushing.join(", ")}>{r.pushing.length ? <span>{r.pushing.slice(0, 2).join(", ")}{r.pushing.length > 2 ? <span className="hint"> +{r.pushing.length - 2}</span> : null}</span> : <span className="hint">Chưa team nào</span>}</td>
                  <td className="c" title={r.idle.join(", ")}>{r.idle.length}/{teams.length}</td>
                  <td className="c" title={r.why}><Pill tone={PRI[r.priority].tone}>{PRI[r.priority].label}</Pill>{openByCode(r.code).length ? <span className="hint" title="Đã có yêu cầu đẩy đang chạy"> ●</span> : null}</td>
                  <td className="c"><button type="button" className="lnk" onClick={() => setOpen(open === r.code ? null : r.code)}>{open === r.code ? "Thu gọn" : "Chi tiết"}</button></td>
                </tr>
                {open === r.code && (
                  <tr className="push-detail"><td colSpan={11}>
                    <div className="hint" style={{ marginBottom: 6 }}>{r.why}</div>
                    <table className="dtbl push-matrix">
                      <thead><tr><th>Team</th><th className="n">Video</th><th className="n">Lượt xem</th><th className="n">SL bán</th><th>Đánh giá</th>{canCreate && <th />}</tr></thead>
                      <tbody>
                        {r.teams.map((c) => (
                          <tr key={c.team}>
                            <td>{c.team}{c.team === focusTeam ? <span className="hint"> (đang xem)</span> : null}</td>
                            <td className="n">{nf(c.videos)}</td><td className="n">{c.views ? fmtCompact(c.views) : "0"}</td><td className="n">{nf(c.sold)}</td>
                            <td><Pill tone={VTONE[c.verdict]}>{VERDICT[c.verdict]}</Pill></td>
                            {canCreate && <td>{teams.includes(c.team) && c.verdict !== "pushing" && <button type="button" className="lnk" onClick={() => openForm(r, c.team)}>Yêu cầu đẩy ›</button>}</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {openByCode(r.code).length > 0 && (
                      <div className="hint" style={{ marginTop: 6 }}>Đang giao: {openByCode(r.code).map((x) => `${x.team} (${x.done_videos}/${x.target} video, ${STATUS[x.status].label.toLowerCase()})`).join(" · ")}</div>
                    )}
                    {canCreate && (
                      <form className="push-form" onSubmit={(e) => { e.preventDefault(); run(() => createPushRequest({ code: r.code, team: form.team, priority: form.priority, target: form.target, due: form.due, note: form.note }), `Đã giao ${r.code} cho ${form.team}`); }}>
                        <b>Yêu cầu đẩy hàng · {r.code}</b>
                        <label>Team<select value={form.team} onChange={(e) => setForm({ ...form, team: e.target.value })} required><option value="">Chọn team…</option>{teams.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
                        <label>Ưu tiên<select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}>{(Object.keys(PRI) as Priority[]).map((p) => <option key={p} value={p}>{PRI[p].label}</option>)}</select></label>
                        <label>Số video<input type="number" min={1} max={200} value={form.target} onChange={(e) => setForm({ ...form, target: Number(e.target.value) })} style={{ width: 70 }} /></label>
                        <label>Hạn<input type="date" min={today} value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} /></label>
                        <label style={{ flex: "1 1 200px" }}>Ghi chú<input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Góc quay, kênh, lưu ý…" style={{ width: "100%" }} maxLength={500} /></label>
                        <button type="submit" disabled={pending || !form.team} className="push-btn">Gửi yêu cầu</button>
                      </form>
                    )}
                  </td></tr>
                )}
              </Fragment>
            ))}
            {!slice.length && <tr><td colSpan={11} className="hint">Không có SPU nào trong nhóm này.</td></tr>}
          </tbody>
          {list.length > 0 && (
            <tfoot><tr className="push-total">
              <td className="pc-spu"><b>Tổng · {nf(list.length)} SPU</b></td><td />
              <td className="n"><b>{nf(tot.stock)}</b></td>
              <td className="n"><b>{tot.incoming ? `+${nf(tot.incoming)}` : "–"}</b></td>
              <td />
              <td className="n"><b>{nf(tot.sold30)}</b></td>
              <td className="n"><b>{nf(tot.videos)}</b></td>
              <td className="n"><b>{nf(tot.sold)}</b></td>
              <td colSpan={4} />
            </tr></tfoot>
          )}
        </table></div>
        <div className="pager">
          <span>{list.length ? `${(cur - 1) * PAGE + 1}–${Math.min(cur * PAGE, list.length)} / ${nf(list.length)} SPU` : "0 SPU"}</span>
          <span><button type="button" disabled={cur <= 1} onClick={() => setPage(cur - 1)}>‹ Trước</button> Trang <b>{cur}</b> / {pages} <button type="button" disabled={cur >= pages} onClick={() => setPage(cur + 1)}>Sau ›</button></span>
        </div>
      </section>

      <section className="card" id="d-pushreq">
        <div className="card-h"><h2>Yêu cầu đẩy hàng{myTeam ? ` · ${myTeam}` : ""}</h2><span className="hint">Hoàn thành khi team đăng đủ số video thực tế kể từ ngày giao việc</span></div>
        <div className="seg" role="tablist" aria-label="Trạng thái" style={{ alignSelf: "flex-start" }}>
          {([["all", "Tất cả"], ["todo", "Chưa triển khai"], ["doing", "Đang triển khai"], ["done", "Đã hoàn thành"]] as const).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={rq === k} onClick={() => setRq(k)}>{label} {nf(k === "all" ? requests.length : requests.filter((x) => x.status === k).length)}</button>
          ))}
        </div>
        <div className="scroll"><table className="dtbl">
          <thead><tr>{rth("code", "SPU")}{rth("team", "Team")}{rth("priority", "Ưu tiên")}{rth("videos", "Video thực tế", "n")}{rth("due", "Hạn", "n")}{rth("status", "Trạng thái")}{rth("by", "Người giao")}<th /></tr></thead>
          <tbody>
            {reqRows.map((r) => {
              const late = r.status !== "done" && r.due && r.due < today, enough = r.done_videos >= r.target, can = canCreate || myTeam === r.team;
              return (
                <tr key={r.id} title={r.note ?? undefined}>
                  <td><b className="code">{r.code}</b> <span className="nm">{r.name}</span></td>
                  <td>{r.team}</td>
                  <td><Pill tone={PRI[r.priority].tone}>{PRI[r.priority].label}</Pill></td>
                  <td className="n"><b style={{ color: enough ? "var(--ok)" : undefined }}>{r.done_videos}</b> / {r.target}</td>
                  <td className="n" style={late ? { color: "#d03b3b", fontWeight: 600 } : undefined}>{dmy(r.due)}{late ? " · quá hạn" : ""}</td>
                  <td><Pill tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Pill></td>
                  <td>{r.by ?? "–"} <span className="hint">{dmy(r.created.slice(0, 10))}</span></td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {can && r.status === "todo" && <button type="button" className="lnk" disabled={pending} onClick={() => run(() => setPushStatus(r.id, "doing"), "Đã chuyển sang Đang triển khai")}>Bắt đầu ›</button>}
                    {can && r.status === "doing" && <button type="button" className="lnk" disabled={pending} title={enough ? "Xác nhận hoàn thành" : `Mới ${r.done_videos}/${r.target} video thực tế`} onClick={() => run(() => setPushStatus(r.id, "done"), "Đã hoàn thành")}>Hoàn thành ✓</button>}
                    {can && r.status === "done" && canCreate && <button type="button" className="lnk" disabled={pending} onClick={() => run(() => setPushStatus(r.id, "doing"), "Đã mở lại")}>Mở lại</button>}
                    {canCreate && <button type="button" className="lnk" disabled={pending} style={{ marginLeft: 8 }} title="Xoá yêu cầu" onClick={() => { if (confirm(`Xoá yêu cầu đẩy ${r.code} của ${r.team}?`)) run(() => deletePushRequest(r.id), "Đã xoá yêu cầu"); }}>✕</button>}
                  </td>
                </tr>
              );
            })}
            {!reqRows.length && <tr><td colSpan={8} className="hint">Chưa có yêu cầu đẩy hàng. Mở một SPU ở bảng trên, chọn team chưa đẩy rồi bấm &ldquo;Yêu cầu đẩy&rdquo;.</td></tr>}
          </tbody>
        </table></div>
      </section>
    </>
  );
}
