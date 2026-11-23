import { fmtInt } from "@/lib/data";
import { STAGE_LABELS, type Stage } from "@/lib/pipeline-constants";
import type { SpuWin } from "@/lib/spu-win";
import type { WinRules } from "@/lib/spu-tracking";
import Link from "next/link";
import Info from "@/components/InfoTip";

// Định nghĩa các bước theo biên bản họp R&D × ĐVKD (21/10/2026)
const P_INFO: Record<Stage, string> = {
  p0: "Sưu tập / ý tưởng: mọi mẫu đưa về lưu tập trung ở một kho chung — ai cũng truy cập, đóng góp và đề xuất mẫu.",
  p1: "Duyệt nghiên cứu: lọc từ kho P0 các sản phẩm đạt bộ tiêu chuẩn chung để nghiên cứu dựng mẫu.",
  p2: "Đưa vào sản xuất mẫu: sản xuất mẫu thử nghiệm.",
  p3: "Mẫu hoàn thành, cầm được trên tay. R&D đăng ảnh / video thực tế lên kênh nội bộ để ĐVKD tham khảo và lựa chọn. Mục tiêu R&D: khoảng 10 mẫu mới mỗi tháng.",
  p4: "Đưa lên hệ thống kênh / test thị trường: ĐVKD chọn mẫu hợp định hướng kênh, đăng bài / video thử nghiệm toàn hệ thống.",
  p5: "Sản phẩm Win Traffic: test đạt tương tác, lượt xem, bình luận và lượng đặt hàng tốt từ thị trường.",
  p6: "Thương mại hoá / sản xuất hàng loạt: Win đạt chuẩn tối ưu chi phí, công nghệ sản xuất số lượng lớn và có lợi nhuận thực tế.",
};
const MONTHLY_TARGET = 10;   // mục tiêu R&D: ~10 mẫu mới / tháng (biên bản họp)

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

type StageCount = { stage: Stage; count: number; here: number; stuck: number; next: string };

// Thẻ chung cho P và S: cùng cỡ chữ số (text-3xl), bo góc nhỏ, nhãn · số · diễn giải căn giữa; chỉ nhãn mã (P0, S1…) có màu riêng
function FlowCard({ code, title, info, value, color, tone = "", sub, extra, badge }: {
  code: string; title: string; info: string; value: React.ReactNode; color: string; tone?: string; sub: React.ReactNode; extra?: React.ReactNode; badge?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center rounded-md border border-[color-mix(in_srgb,var(--accent)_16%,var(--surface))] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))] px-3 py-3 text-center">
      <div className="flex max-w-full items-center justify-center gap-1.5 text-xs text-ink-2">
        <span className="flex-none rounded-sm px-1.5 text-2xs font-bold text-white" style={{ background: `var(${color})` }}>{code}</span>
        <span className="truncate" title={title}>{title}</span><Info text={info} />{badge}
      </div>
      <div className={`mt-2 text-3xl font-extrabold leading-none tabular-nums ${tone}`}>{value}</div>
      {extra}
      <div className="mt-2 max-w-full text-xs text-ink-2">{sub}</div>
    </div>
  );
}

// Màu từng bước P0–P6 (các màu series dùng chung của hệ thống, có bản tối)
const P_COLOR: Record<Stage, string> = { p0: "--series-1", p1: "--series-7", p2: "--series-5", p3: "--series-2", p4: "--series-4", p5: "--series-3", p6: "--series-6" };

// P0–P6: số mẫu ĐẠT từng mốc TRONG KỲ theo ngày đạt mốc (P1 ngày duyệt, P3 ngày nhận mẫu…; kể cả mẫu sau đó bị dừng) · dòng nhỏ = đang nằm ở bước đó
export function PCards({ stages, monthly, hrefOf }: { stages: StageCount[]; monthly: boolean; hrefOf?: (stage: Stage, here: boolean) => string }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
      {stages.map((s) => {
        const label = STAGE_LABELS[s.stage].replace(/^P\d · /, "");
        const goal = monthly && s.stage === "p3";
        return (
          <FlowCard key={s.stage} code={s.stage.toUpperCase()} title={label} info={P_INFO[s.stage]} value={hrefOf ? <DL href={hrefOf(s.stage, false)} title={`Xem ${fmtInt(s.count)} mẫu đạt mốc ${label} trong kỳ`}>{fmtInt(s.count)}</DL> : fmtInt(s.count)} color={P_COLOR[s.stage]} tone={s.stage === "p6" ? "text-good" : ""}
            extra={goal && (
              <div className="mt-2 w-full" title={`Mục tiêu R&D: ~${MONTHLY_TARGET} mẫu mới / tháng — số mẫu nhận về (hoàn thành mẫu) trong kỳ`}>
                <div className="h-1.5 overflow-hidden rounded-md bg-grid"><div className={`h-full rounded-md ${s.count >= MONTHLY_TARGET ? "bg-good" : "bg-accent"}`} style={{ width: `${Math.min(100, (s.count / MONTHLY_TARGET) * 100)}%` }} /></div>
                <div className="mt-1 text-2xs text-ink-muted">Mục tiêu {MONTHLY_TARGET} mẫu / tháng</div>
              </div>
            )}
            sub={hrefOf ? <Link href={hrefOf(s.stage, true)} prefetch={false} title={`Xem ${s.here} mẫu đang ở bước này`} className="text-ink-muted underline-offset-2 hover:text-accent hover:underline">{s.here} đang ở bước này</Link>
              : <span className="text-ink-muted" title={`${s.here} mẫu đang ở bước này`}>{s.here} đang ở bước này</span>} />
        );
      })}
    </div>
  );
}

// Con số bấm được → danh sách SPU đúng điều kiện (dùng chính các bộ lọc trạng thái của trang Theo dõi SPU, cùng quy tắc tính với thẻ); con trỏ bàn tay + gạch chân khi rê chuột
function DL({ href, title, children }: { href: string; title: string; children: React.ReactNode }) {
  return <Link href={href} prefetch={false} title={title} className="cursor-pointer font-semibold underline-offset-2 hover:underline">{children}</Link>;
}

// S0–S4: quản lý sản phẩm toàn công ty. S0 = SPU Active (tồn kho đã nhập + số bán). S1 = SPU Active có video trong kỳ (theo team / Page đang lọc).
// S2–S4 = SPU Active ĐANG Win Traffic / Win Đơn hàng / Ngôi sao theo QUY TẮC WIN duy nhất ở trang KPI — CUỐN CHIẾU (N ngày gần nhất), KHÔNG phụ thuộc kỳ lọc,
// cùng quy tắc với nút lọc ở trang Theo dõi đẩy hàng — tính ở lib/spu-dash.ts.
export function SCards({ win, s0, s1, winNow, rules, linkFor }: {
  win: SpuWin; rules: WinRules;
  linkFor: (status: string | null) => string;   // địa chỉ danh sách SPU của một trạng thái (trang Theo dõi SPU) — giữ nguyên bộ lọc đang áp dụng
  s0: { active: number; hot: number; normal: number; slow: number; bad: number; noStockSold: number };
  s1: { total: number };
  winNow: { wt: number; win: number; star: number };
}) {
  const active = { length: s0.active };
  const { noStockSold, hot, slow, bad, normal } = s0;
  const R = rules;
  const card = (code: string, title: string, value: React.ReactNode, color: string, tone: string, sub: React.ReactNode, info: string) => (
    <FlowCard key={code} code={code} title={title} info={info} value={value} color={color} tone={tone} sub={sub} />
  );
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
      {card("S0", "SPU Active", <DL href={linkFor(null)} title={`Xem danh sách ${fmtInt(active.length)} SPU Active`}>{fmtInt(active.length)}</DL>, "--series-7", "", <><DL href={linkFor("hot")} title={`Xem ${fmtInt(hot)} SPU bán chạy`}>{fmtInt(hot)}</DL> bán chạy · <DL href={linkFor("normal")} title={`Xem ${fmtInt(normal)} SPU bán thường`}>{fmtInt(normal)}</DL> thường · <span className="text-warn-ink"><DL href={linkFor("slow")} title={`Xem ${fmtInt(slow)} SPU bán chậm`}>{fmtInt(slow)}</DL> chậm</span> · <span className="text-bad"><DL href={linkFor("bad")} title={`Xem ${fmtInt(bad)} SPU tồn xấu`}>{fmtInt(bad)}</DL> tồn xấu</span>{noStockSold > 0 && <> · <DL href={linkFor("outstock")} title={`Xem ${fmtInt(noStockSold)} SPU hết hàng có đơn`}>{fmtInt(noStockSold)}</DL> hết hàng có đơn</>}</>,
        "SPU Active: tất cả SPU còn tồn kho và SPU hết tồn nhưng có phát sinh đơn hàng trong 30 ngày. Phân loại bán chạy / bán thường / bán chậm / tồn xấu theo SL bán 30 ngày (tồn xấu chỉ tính SPU còn hàng; SPU hết hàng vẫn bán được xếp theo số bán). Nguồn: file tồn kho Sapo đã nhập + số bán. Tính mọi mã trong file (kể cả hộp, đá rời, charm — nhóm hàng Khác).")}
      {card("S1", "SPU đăng tải khai thác traffic", <DL href={linkFor("video")} title={`Xem ${fmtInt(s1.total)} SPU Active có video trong kỳ`}>{fmtInt(s1.total)}</DL>, "--series-1", "text-accent",
        <>{fmtInt(win.s1.newCodes)} mới · {fmtInt(win.s1.oldCodes)} cũ · <span title="So với SPU active (S0)">{pct(active.length ? s1.total / active.length : null)} SPU active</span></>,
        "Số Số SPU Active có video đăng trong kỳ (khớp số “SPU Active có video” ở trang Theo dõi đẩy hàng). Tách SPU cũ / mới (mã test xem ở Báo cáo test mẫu). Tỉ lệ so với S0 cho biết mức phủ nội dung.")}
      {card("S2", "Win Traffic", <DL href={linkFor("wintraffic")} title={`Xem ${fmtInt(winNow.wt)} SPU đang Win Traffic`}>{fmtInt(winNow.wt)}</DL>, "--series-3", "text-good", <>{pct(active.length ? winNow.wt / active.length : null)} SPU active · đang Win</>,
        `SPU Active ĐANG Win Traffic (không phụ thuộc kỳ lọc): lượt xem TĂNG THÊM ≥ ${fmtInt(R.traffic.views)} và bình luận TĂNG THÊM ≥ ${R.traffic.comments} trong ${R.traffic.days} ngày gần nhất, cộng dồn mọi video gắn mã SPU. Quy tắc chỉnh ở trang KPI, dùng chung với trang Theo dõi đẩy hàng. Lọc team / Page thì chỉ tính video và số bán của các Page đó.`)}
      {card("S3", "Win Đơn hàng", <DL href={linkFor("win")} title={`Xem ${fmtInt(winNow.win)} SPU đang Win Đơn hàng`}>{fmtInt(winNow.win)}</DL>, "--series-6", "text-good", <>{pct(active.length ? winNow.win / active.length : null)} SPU active · đang Win</>,
        `SPU Active ĐANG Win Đơn hàng (không phụ thuộc kỳ lọc): bán thuần ≥ ${R.order.qty} sản phẩm trong ${R.order.days} ngày gần nhất, không cần có video. Quy tắc chỉnh ở trang KPI.`)}
      {card("S4", "SP Ngôi sao", <DL href={linkFor("star")} title={`Xem ${fmtInt(winNow.star)} SPU Ngôi sao`}>{fmtInt(winNow.star)}</DL>, "--star", "text-[var(--star)]", <>Win Traffic + Win Đơn hàng · <span className="text-bad"><DL href={linkFor("bad")} title={`Xem ${fmtInt(bad)} SPU tồn xấu`}>{fmtInt(bad)}</DL></span> tồn xấu cần đẩy</>,
        "SPU Active đang đạt cả Win Traffic (S2) và Win Đơn hàng (S3). Dòng dưới là số SPU tồn xấu cần phối hợp R&D · ĐVKD · Traffic · Kho để đẩy hàng.")}
    </div>
  );
}
