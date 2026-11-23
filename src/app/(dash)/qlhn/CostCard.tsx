"use client";

import Link from "next/link";
import { useState } from "react";
import { fmtTr } from "@/lib/format";
import { CostStack } from "./Charts";
import GoLink from "./GoLink";

export type CostSide = { rows: { name: string; q: number; orders?: number; rev: number; cost: number }[]; t: { q: number; orders?: number; rev: number; cost: number } };
const ratio = (x: { rev: number; cost: number }) => (x.rev ? (x.cost / x.rev) * 100 : null);
const f1 = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 1 });

// Thẻ giá vốn / giá bán của Dashboard: 2 tab (theo ngày giao hàng / theo ngày đặt hàng) + cột chồng. Chỉ Quản lý (trang đã chặn).
export default function CostCard({ delivery, order, excl, exclHref, range }: { delivery: CostSide; order: CostSide; excl: boolean; exclHref: string; range: string }) {
  const [by, setBy] = useState<"delivery" | "order">("delivery");
  const cur = by === "delivery" ? delivery : order, oth = by === "delivery" ? order : delivery;
  const rc = ratio(cur.t), ro = ratio(oth.t);
  return (
    <section className="card" id="cost-card">
      <div className="card-h"><h2>Tỷ lệ giá vốn / giá bán, đơn giao thành công<span className="tag">Chỉ quản lý xem</span></h2><span className="hint">{range}</span></div>
      <div className="seg" role="tablist" aria-label="Cách tính" style={{ alignSelf: "flex-start" }}>
        <button role="tab" type="button" aria-selected={by === "delivery"} onClick={() => setBy("delivery")}>Theo ngày giao hàng</button>
        <button role="tab" type="button" aria-selected={by === "order"} onClick={() => setBy("order")}>Theo ngày đặt hàng</button>
      </div>
      <div className="hint">{by === "delivery" ? "Dòng giao trong kỳ, kể cả đơn đặt tháng trước." : "Đơn đặt trong kỳ, mới giao tới nay (số tạm thời)."}</div>
      <div className="costgrid">
        <div className="cstat">
          <div><b style={{ fontSize: 22, lineHeight: "30px", fontWeight: 600 }}>{rc === null ? "–" : `${f1(rc)}%`}</b> <span className="hint">giá vốn / giá bán</span></div>
          <div className="minis" style={{ gridTemplateColumns: "1fr" }}>
            <div className="mini"><b>{cur.t.orders === undefined ? "–" : cur.t.orders.toLocaleString("vi-VN")}</b><span>đơn · {cur.t.q.toLocaleString("vi-VN")} sản phẩm</span></div>
            <div className="mini"><b>{fmtTr(cur.t.rev)}</b><span>doanh thu</span></div>
            <div className="mini"><b>{fmtTr(cur.t.cost)}</b><span>vốn</span></div>
            <div className="mini"><b>{fmtTr(cur.t.rev - cur.t.cost)}</b><span>lợi nhuận gộp (chưa trừ chi phí khác)</span></div>
          </div>
          <div className="hint">{ro === null ? "" : `${by === "delivery" ? "Theo ngày đặt hàng" : "Theo ngày giao hàng"}: ${f1(ro)}%`}</div>
        </div>
        <div style={{ minWidth: 0 }}>
          <CostStack rows={[...cur.rows.filter((r) => r.q > 0), { name: "Tổng", ...cur.t }]} />
          <div className="legend" style={{ marginTop: 6 }}><span><i style={{ background: "#2a78d6" }} />Vốn</span><span><i style={{ background: "#cfe0f7" }} />Lợi nhuận gộp</span><span className="hint">Rê chuột vào cột</span></div>
        </div>
      </div>
      <div className="hint">
        <Link href={exclHref} scroll={false} style={{ display: "inline-flex", gap: 6, alignItems: "center", color: "inherit" }}><input type="checkbox" readOnly checked={excl} style={{ pointerEvents: "none" }} aria-hidden /> Loại dòng có vốn lớn hơn giá bán (khách gửi vàng cũ)</Link>
        {" · "}<GoLink to="cost" className="tab-link" >Xem bảng chi tiết</GoLink>
      </div>
    </section>
  );
}
