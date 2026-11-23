"use client";

import { useState } from "react";
import { fmtTr } from "@/lib/format";
import type { MixStats, RevMix } from "@/lib/team-report";
import { Donut, nf, pct } from "./Parts";

// Thẻ "Cơ cấu SPU mới và cũ": hai tab ngay trong thẻ — "Sản phẩm bán" (số sản phẩm, SPU) và "Doanh thu" (chỉ Quản lý, cần migration 078).
// Cạnh mỗi số có mức tăng / giảm so với kỳ trước (liền trước, cùng số ngày); hàng Tổng ở cuối cả hai bảng.
const AGE: Record<string, { label: string; color: string }> = {
  old: { label: "SPU cũ", color: "#2a78d6" }, new: { label: "SPU mới", color: "#1baf7a" },
  made: { label: "Chế tác", color: "#eda100" }, out: { label: "SP bảo hành", color: "#c3c2b7" },
};
const ORDER = ["old", "new", "made", "out"] as const;

// "▲ 12%": tăng = xanh, giảm = đỏ (đều là doanh số / sản phẩm bán nên tăng là tốt); chưa có kỳ trước hoặc kỳ trước bằng 0 thì "–"
function Chg({ cur, prev, title }: { cur: number; prev: number | null; title: string }) {
  const base = { marginLeft: 6, display: "inline-block", minWidth: 46, textAlign: "right" as const, fontSize: 12 };
  if (prev === null || prev === 0) return <span style={{ ...base, color: "var(--mute)" }} title={title}>–</span>;
  const pc = Math.round(((cur - prev) / prev) * 100);
  if (pc === 0) return <span style={{ ...base, color: "var(--mute)" }} title={title}>0%</span>;
  return <span style={{ ...base, color: pc > 0 ? "var(--ok)" : "#d03b3b" }} title={title}>{pc > 0 ? "▲" : "▼"} {Math.abs(pc)}%</span>;
}

// Chừa chỗ bằng phần chênh lệch (▲ x%) để tiêu đề cột thẳng hàng với số, không lệch sang phải
const Pad = () => <span style={{ display: "inline-block", width: 52 }} aria-hidden />;

export default function AgeCard({ age, rev, range, prevAge, prevRev, prevLabel }: {
  age: MixStats["age"]; rev: RevMix | null; range: string; prevAge: MixStats["age"] | null; prevRev: RevMix | null; prevLabel: string;
}) {
  const [tab, setTab] = useState<"q" | "rev">("q");
  const qOf = (list: MixStats["age"] | null, c: string) => list?.find((x) => x.cat === c);
  const qTotal = age.reduce((n, a) => n + a.q, 0), spuTotal = age.reduce((n, a) => n + a.spus, 0);
  const pqTotal = prevAge ? prevAge.reduce((n, a) => n + a.q, 0) : null, pSpuTotal = prevAge ? prevAge.reduce((n, a) => n + a.spus, 0) : null;
  const revOf = (r: RevMix | null, c: string) => r?.cats.find((x) => x.cat === c)?.rev ?? 0;
  const revTotal = ORDER.reduce((n, c) => n + revOf(rev, c), 0), pRevTotal = prevRev ? ORDER.reduce((n, c) => n + revOf(prevRev, c), 0) : null;
  const dot = (c: string) => <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 1, marginRight: 8, background: AGE[c].color }} />;
  const tip = `So với kỳ trước (${prevLabel})`;
  return (
    <section className="card">
      <div className="card-h"><h2>Cơ cấu SPU mới và cũ</h2><span className="hint">{range} · so với {prevLabel}</span></div>
      {rev && (
        <div className="seg" role="tablist" aria-label="Chỉ tiêu" style={{ alignSelf: "flex-start" }}>
          <button role="tab" type="button" aria-selected={tab === "q"} onClick={() => setTab("q")}>Sản phẩm bán</button>
          <button role="tab" type="button" aria-selected={tab === "rev"} onClick={() => setTab("rev")}>Doanh thu</button>
        </div>
      )}
      <div className="agebox" style={{ flexWrap: "nowrap" }}>   {/* biểu đồ và bảng luôn nằm cạnh nhau */}
        {tab === "q" || !rev ? (
          <>
            <Donut center={nf(qTotal)} unit="sản phẩm" items={age.map((a) => ({ name: AGE[a.cat].label, value: a.q, color: AGE[a.cat].color }))} />
            <table style={{ minWidth: 0, flex: "1 1 0", width: "auto" }}>
              <thead><tr><th>Nhóm</th><th className="n">Bán<Pad /></th><th className="n">Tỷ trọng</th><th className="n">SPU<Pad /></th></tr></thead>
              <tbody>
                {ORDER.map((c) => { const a = qOf(age, c); if (!a) return null; const p = qOf(prevAge, c); return (
                  <tr key={c}><td>{dot(c)}{AGE[c].label}</td>
                    <td className="n">{nf(a.q)}<Chg cur={a.q} prev={prevAge ? p?.q ?? 0 : null} title={tip} /></td>
                    <td className="n">{a.q / qTotal < 0.005 ? "<1%" : pct(a.q, qTotal, 0)}</td>
                    {c === "made"
                      ? <td className="n" title="Chế tác tính theo số đơn">{a.orders ?? a.spus} đơn<Chg cur={a.orders ?? a.spus} prev={prevAge ? p?.orders ?? p?.spus ?? 0 : null} title={tip} /></td>
                      : <td className="n">{a.spus}<Chg cur={a.spus} prev={prevAge ? p?.spus ?? 0 : null} title={tip} /></td>}</tr>); })}
                <tr><td><b>Tổng</b></td>
                  <td className="n"><b>{nf(qTotal)}</b><Chg cur={qTotal} prev={pqTotal} title={tip} /></td>
                  <td className="n"><b>100%</b></td>
                  <td className="n"><b>{spuTotal}</b><Chg cur={spuTotal} prev={pSpuTotal} title={tip} /></td></tr>
              </tbody>
            </table>
          </>
        ) : (
          <>
            <Donut center={fmtTr(revTotal)} unit="doanh thu" items={ORDER.map((c) => ({ name: AGE[c].label, value: revOf(rev, c), color: AGE[c].color }))} />
            <table style={{ minWidth: 0, flex: "1 1 0", width: "auto" }}>
              <thead><tr><th>Nhóm</th><th className="n">Doanh thu<Pad /></th><th className="n">Tỷ trọng</th></tr></thead>
              <tbody>
                {ORDER.filter((c) => revOf(rev, c) > 0 || revOf(prevRev, c) > 0).map((c) => (
                  <tr key={c}><td>{dot(c)}{AGE[c].label}</td>
                    <td className="n">{fmtTr(revOf(rev, c))}<Chg cur={revOf(rev, c)} prev={prevRev ? revOf(prevRev, c) : null} title={tip} /></td>
                    <td className="n">{revOf(rev, c) / revTotal < 0.005 ? "<1%" : pct(revOf(rev, c), revTotal, 0)}</td></tr>
                ))}
                <tr><td><b>Tổng</b></td><td className="n"><b>{fmtTr(revTotal)}</b><Chg cur={revTotal} prev={pRevTotal} title={tip} /></td><td className="n"><b>100%</b></td></tr>
              </tbody>
            </table>
          </>
        )}
      </div>
    </section>
  );
}
