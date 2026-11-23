import type { ReactNode } from "react";

// Khung chung cho 3 thẻ KPI (Traffic · Bán hàng · Ngôi sao): biểu tượng + tên + nhãn kết quả khi đạt + nút sửa; nội dung bên dưới.
// tone: tên biến màu kết quả (vd "--res-win")
export default function CardShell({ icon, title, result, tone, action, children }: { icon: string; title: string; result: string; tone: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-2xl border border-line bg-surface p-5 shadow-sm">
      <header className="flex items-start gap-3">
        <span aria-hidden className="flex h-9 w-9 flex-none items-center justify-center rounded-lg text-lg"
          style={{ background: `color-mix(in srgb, var(${tone}) 14%, transparent)` }}>{icon}</span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold leading-tight">{title}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-2">
            Đạt
            <span className="rounded-md px-2 py-0.5 text-2xs font-bold tracking-wide"
              style={{ color: `var(${tone})`, background: `color-mix(in srgb, var(${tone}) 14%, transparent)` }}>{result}</span>
          </p>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
