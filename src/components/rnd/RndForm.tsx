"use client";

import { useActionState } from "react";
import { RND_STATUS } from "@/lib/rnd-constants";
import type { FormState } from "@/app/(dash)/rnd/actions";

type Values = Partial<Record<"code" | "sapo_code" | "name" | "line" | "category" | "material" | "stone" | "size" | "description" | "source_url" | "status", string | null>>;

const input = "w-full rounded-lg border border-line bg-page px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-60";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-muted">{hint}</span>}
    </label>
  );
}

export default function RndForm({ action, values = {}, suggestions, readOnly, submitLabel }: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  values?: Values;
  suggestions: Record<"line" | "category" | "material" | "stone", string[]>;
  readOnly?: boolean;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const v = (k: keyof Values) => values[k] ?? "";

  // Ô có gợi ý từ giá trị đã dùng, vẫn gõ tự do được
  const suggest = (name: "line" | "category" | "material" | "stone", label: string, placeholder: string) => (
    <Field label={label}>
      <input name={name} defaultValue={v(name)} list={`dl-${name}`} placeholder={placeholder} className={input} disabled={readOnly} />
      <datalist id={`dl-${name}`}>{suggestions[name].map((s) => <option key={s} value={s} />)}</datalist>
    </Field>
  );

  return (
    <form action={formAction} className="space-y-4">
      <Field label="Mã mẫu (SPU) *" hint="= mã mẫu trên Sapo, phần trước dấu '-' (VD D0123-00-S-WH → D0123). Dùng làm hashtag #D0123 và để nối số bán.">
        <input name="code" defaultValue={v("code")} required placeholder="D0123" className={`${input} uppercase`} disabled={readOnly} />
      </Field>
      <Field label="Tên mẫu *">
        <input name="name" defaultValue={v("name")} required placeholder="Nhẫn nữ đá radian trắng…" className={input} disabled={readOnly} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {suggest("line", "Line sản phẩm", "VD: Moissanite cao cấp")}
        {suggest("category", "Loại", "Nhẫn, dây chuyền…")}
        {suggest("material", "Chất liệu", "Bạc S925, vàng 10K…")}
        {suggest("stone", "Đá", "Moissanite, CZ…")}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Size">
          <input name="size" defaultValue={v("size")} placeholder="VD: 6,5 li / ni 10–16" className={input} disabled={readOnly} />
        </Field>
        <Field label="Trạng thái">
          <select name="status" defaultValue={v("status") || "researching"} className={input} disabled={readOnly}>
            {Object.entries(RND_STATUS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Link kho Source quay chế tác" hint="Link Google Drive/thư mục chứa video, ảnh gốc — team nhận việc lên video mở từ đây.">
        <input name="source_url" type="url" defaultValue={v("source_url")} placeholder="https://drive.google.com/…" className={input} disabled={readOnly} />
      </Field>
      <Field label="Mô tả / ghi chú">
        <textarea name="description" defaultValue={v("description")} rows={3} className={input} disabled={readOnly} />
      </Field>

      {state.error && <p className="text-sm text-bad">⛔ {state.error}</p>}
      {state.ok && <p className="text-sm text-good">✓ Đã lưu</p>}
      {!readOnly && (
        <button disabled={pending} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60">
          {pending ? "Đang lưu…" : submitLabel}
        </button>
      )}
    </form>
  );
}
