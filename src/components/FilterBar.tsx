"use client";

import { startRouteProgress } from "@/components/RouteProgress";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import MultiSelect from "@/components/content/MultiSelect";
import DateRangeSelect from "@/components/DateRangeSelect";

type Props = {
  filters: { from: string; to: string; range: string; scope: string; channels: string[]; teams?: string[] };
  teams?: { id: string; name: string }[];   // có → hiện bộ lọc Team (chỉ tính Page thuộc team đã chọn)
  accounts?: { id: string; name: string; platform?: string }[];   // có → hiện bộ lọc Page (tick chọn nhiều)
  channels?: Record<string, string>;            // có → hiện bộ lọc kênh
  scopeAllLabel?: string;
  extra?: Record<string, string>;   // tham số URL giữ nguyên khi đổi bộ lọc (vd tab đang xem)
  compact?: boolean;   // kiểu gọn cho thanh công cụ một hàng: ô không viền, hai ô ngày nằm TRONG bảng thả xuống của ô thời gian
  only?: "date" | "selects";   // chỉ hiện một phần, để trang tự xen ô lọc riêng vào giữa (vd Nền tảng · Page · Kết quả … · thời gian)
};

// Bộ lọc nằm 1 hàng phía trên biểu đồ; mọi thay đổi ghi vào URL để chia sẻ/tải lại được
export default function FilterBar({ filters, teams, accounts, channels, scopeAllLabel = "Toàn hệ thống", extra, compact, only }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  // Đang tải số liệu theo bộ lọc mới: làm mờ CẢ nội dung trang + hiện nhãn "Đang tải…" (globals.css, html[data-filter-pending]).
  // Trước đây chỉ thanh lọc mờ đi, còn số liệu CŨ vẫn hiện rõ dưới bộ lọc MỚI (vd chọn "1 năm qua" nhưng bảng vẫn là số 30 ngày trong lúc chờ) → dễ đọc nhầm.
  useEffect(() => {
    const el = document.documentElement;
    if (pending) el.setAttribute("data-filter-pending", ""); else el.removeAttribute("data-filter-pending");
    return () => el.removeAttribute("data-filter-pending");
  }, [pending]);
  const selectedPages = filters.scope === "all" ? [] : filters.scope === "mine" ? (accounts ?? []).map((a) => a.id) : filters.scope.split(",");

  function go(patch: Record<string, string>) {
    const cur = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
    if (!cur.has("range") && filters.range) cur.set("range", filters.range);
    if (!cur.has("scope") && filters.scope && filters.scope !== "all") cur.set("scope", filters.scope);
    if (filters.range === "custom") {
      if (filters.from) cur.set("from", filters.from);
      if (filters.to) cur.set("to", filters.to);
    }
    if (filters.teams?.length && !cur.has("team")) cur.set("team", filters.teams.join(","));
    if (filters.channels?.length && !cur.has("channels")) cur.set("channels", filters.channels.join(","));
    if (extra) {
      for (const [k, v] of Object.entries(extra)) if (v) cur.set(k, v);
    }
    for (const [k, v] of Object.entries(patch)) {
      if (v && v !== "all") cur.set(k, v);
      else cur.delete(k);
    }
    for (const [k, v] of [...cur.entries()]) if (!v) cur.delete(k);
    if (cur.get("range") !== "custom") { cur.delete("from"); cur.delete("to"); }
    cur.delete("page");
    const qs = cur.toString();
    start(() => { startRouteProgress(); router.push(`${pathname}${qs ? `?${qs}` : ""}`); });
  }

  return (
    <div className={`flex flex-wrap items-center ${compact ? "gap-1.5" : "gap-2"} ${pending ? "opacity-60" : ""}`}>
      {only !== "selects" && (
        <DateRangeSelect compact={compact} range={filters.range} from={filters.from} to={filters.to}
          onPick={(range, from, to) => go(range === "custom" ? { range, from: from!, to: to! } : { range })} />
      )}

      {only !== "date" && teams && teams.length > 0 && (
        <MultiSelect soft={compact} label="Team" emptyLabel="Tất cả team" fullIsAll={false} selected={filters.teams ?? []}
          options={teams.map((t) => ({ value: t.id, label: t.name }))}
          onApply={(v) => go({ team: v.join(","), scope: "all" })} />   // đổi team → bỏ tick Page cũ (có thể không thuộc team mới)
      )}

      {only !== "date" && accounts && (
        <MultiSelect soft={compact} label="Page" emptyLabel={scopeAllLabel} fullIsAll={false} selected={selectedPages}
          options={accounts.map((a) => ({ value: a.id, label: a.name, hint: a.platform === "instagram" ? "Instagram" : undefined }))}
          onApply={(v) => go({ scope: v.length ? v.join(",") : "all" })} />
      )}

      {only !== "date" && channels && (
        <MultiSelect soft={compact} label="Kênh bán" emptyLabel="Tất cả (trừ bảo hành)" fullIsAll={false} selected={filters.channels}
          options={Object.entries(channels).map(([value, label]) => ({ value, label }))}
          onApply={(v) => go({ channels: v.join(",") })} />
      )}
    </div>
  );
}
