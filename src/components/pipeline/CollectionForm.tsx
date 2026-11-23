"use client";

import { useActionState } from "react";
import type { PState } from "@/app/(dash)/rnd/pipeline-actions";
import { PRODUCT_GROUPS, REF_PLATFORMS, type CollectionField } from "@/lib/pipeline-constants";
import { Field, btn, btnGhost } from "./ui";

// Gọn: ô cao hơn một dòng chữ một chút, nhãn sát ô; cả phiếu nằm trong khung hẹp (không dàn hết bề ngang trang)
const input = "w-full rounded-md border border-line bg-page px-2.5 py-1.5 text-sm outline-none focus:border-accent disabled:opacity-60";

type Values = Partial<Record<CollectionField, string | number | null>>;

// Phiếu sưu tầm mẫu (tạo mới: lưu nháp / gửi duyệt; sửa: lưu)
export default function CollectionForm({ action, values = {}, teams, suggestions, mode, readOnly }: {
  action: (s: PState, f: FormData) => Promise<PState>;
  values?: Values; teams: { id: string; name: string }[];
  suggestions: Record<"line" | "category" | "material" | "stone", string[]>;
  mode: "create" | "edit"; readOnly?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const v = (k: CollectionField) => (values[k] ?? "") as string | number;
  const suggest = (name: "line" | "category" | "material" | "stone", label: string, placeholder: string) => (
    <Field label={label}>
      <input name={name} defaultValue={v(name)} list={`dl-${name}`} placeholder={placeholder} className={input} disabled={readOnly} />
      <datalist id={`dl-${name}`}>{suggestions[name].map((s) => <option key={s} value={s} />)}</datalist>
    </Field>
  );
  const moneyField = (name: "price_ref" | "expected_cost" | "expected_price", label: string) => (
    <Field label={label}>
      <input name={name} inputMode="numeric" defaultValue={v(name)} placeholder="1500000" className={input} disabled={readOnly} />
    </Field>
  );

  return (
    <form action={formAction} className="grid max-w-3xl grid-cols-12 gap-x-3 gap-y-3">
      <div className="col-span-12">
        <Field label="Tên sản phẩm *">
          <input name="name" required defaultValue={v("name")} placeholder="Dây chuyền ngân hoa S925 đính đá moissanite…" className={input} disabled={readOnly} />
        </Field>
      </div>
      <div className="col-span-12 sm:col-span-8">
        <Field label="Link video / sản phẩm tham khảo">
          <input name="ref_url" type="url" defaultValue={v("ref_url")} placeholder="https://www.instagram.com/reel/…" className={input} disabled={readOnly} />
        </Field>
      </div>
      <div className="col-span-12 sm:col-span-4">
        <Field label="Nguồn">
          <select name="ref_platform" defaultValue={v("ref_platform")} className={input} disabled={readOnly}>
            <option value="">—</option>
            {REF_PLATFORMS.map((p) => <option key={p}>{p}</option>)}
          </select>
        </Field>
      </div>
      <div className="col-span-12">
        <Field label="Chỉ số tham khảo (view, like, bình luận, đã bán…)">
          <input name="ref_metrics" defaultValue={v("ref_metrics")} placeholder="1,2M view · 35K like · đã bán 2K" className={input} disabled={readOnly} />
        </Field>
      </div>
      <div className="col-span-6 sm:col-span-3">{suggest("line", "Dòng SP", "Nhẫn, dây chuyền…")}</div>
      <div className="col-span-6 sm:col-span-3">{suggest("category", "Loại", "Mặt dây, bông tai…")}</div>
      <div className="col-span-6 sm:col-span-3">{suggest("material", "Chất liệu", "Bạc S925, vàng 10K…")}</div>
      <div className="col-span-6 sm:col-span-3">{suggest("stone", "Loại đá", "Moissanite, CZ…")}</div>
      <div className="col-span-12 sm:col-span-4">
        <Field label="Nhóm SP">
          <select name="product_group" defaultValue={v("product_group")} className={input} disabled={readOnly}>
            <option value="">—</option>
            {Object.entries(PRODUCT_GROUPS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
      </div>
      <div className="col-span-12 sm:col-span-4">
        <Field label="Team">
          <select name="team_id" defaultValue={v("team_id")} className={input} disabled={readOnly}>
            <option value="">— (team của người tạo)</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
      </div>
      <div className="col-span-12 sm:col-span-4">
        <Field label="Size">
          <input name="size" defaultValue={v("size")} placeholder="6,5 li / ni 10–16" className={input} disabled={readOnly} />
        </Field>
      </div>
      <div className="col-span-12 sm:col-span-4">{moneyField("price_ref", "Giá tham khảo (đ)")}</div>
      <div className="col-span-12 sm:col-span-4">{moneyField("expected_cost", "Giá vốn dự kiến (đ)")}</div>
      <div className="col-span-12 sm:col-span-4">{moneyField("expected_price", "Giá bán dự kiến (đ)")}</div>
      <div className="col-span-12">
        <Field label="Ghi chú">
          <textarea name="description" rows={2} defaultValue={v("description")} className={input} disabled={readOnly} />
        </Field>
      </div>

      {state.error && <p className="col-span-12 text-sm text-bad">⛔ {state.error}</p>}
      {state.ok && <p className="col-span-12 text-sm text-good">✓ Đã lưu</p>}
      {!readOnly && (
        <div className="col-span-12 flex flex-wrap gap-2">
          {mode === "create" ? (
            <>
              <button name="intent" value="submit" disabled={pending} className={btn}>{pending ? "Đang lưu…" : "Gửi duyệt"}</button>
              <button name="intent" value="draft" disabled={pending} className={btnGhost}>Lưu nháp</button>
            </>
          ) : (
            <button disabled={pending} className={btn}>{pending ? "Đang lưu…" : "Lưu thay đổi"}</button>
          )}
        </div>
      )}
    </form>
  );
}
