"use client";

import { useTransition } from "react";
import { setAgeOverride } from "@/app/(dash)/rnd/actions";

// Chọn phân loại mới/cũ: "Tự động" = để hệ thống phân loại theo dữ liệu
export default function AgeSelect({ productId, value, disabled }: { productId: string; value: "new" | "old" | null; disabled?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <select value={value ?? ""} disabled={disabled || pending}
      onChange={(e) => start(() => setAgeOverride(productId, (e.target.value || null) as "new" | "old" | null))}
      className="rounded border border-line bg-page px-2 py-1 text-xs disabled:opacity-60">
      <option value="">Tự động</option>
      <option value="new">Mẫu mới</option>
      <option value="old">Mẫu cũ</option>
    </select>
  );
}
