import type { AutoResult } from "@/lib/eval/rules";

const TEXT: Record<AutoResult, string> = { win: "WIN", win_traffic: "WIN TRAFFIC", win_sp: "WIN SP", fail: "FAIL", testing: "ĐANG TEST" };
const CLS: Record<AutoResult, string> = {
  win: "bg-res-win text-white", win_traffic: "bg-res-wt text-white", win_sp: "bg-res-wsp text-white", fail: "bg-res-fail text-white", testing: "bg-grid text-ink-2",
};
const ICON: Record<AutoResult, string> = { win: "🏆", win_traffic: "📈", win_sp: "🛒", fail: "✕", testing: "⏳" };

// Nhãn kết quả: luôn có chữ + biểu tượng, màu chỉ là mã hoá phụ
export default function ResultBadge({ result, size = "sm" }: { result: AutoResult; size?: "sm" | "xs" }) {
  return (
    <span className={`inline-flex flex-none items-center gap-1 rounded-md font-medium ${CLS[result]} ${size === "xs" ? "px-1.5 py-0.5 text-2xs" : "px-2 py-0.5 text-xs"}`}>
      <span aria-hidden>{ICON[result]}</span>{TEXT[result]}
    </span>
  );
}
