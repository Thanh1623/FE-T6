import { requireUser } from "@/lib/session";
import { getRndOptions } from "@/lib/pipeline";
import { OPTION_KEYS, type OptionKey } from "@/lib/rnd-options";
import OptionEditor from "./OptionEditor";

// Cấu hình danh sách lựa chọn của các ô chọn trong bộ bảng R&D
export default async function RndConfigPage() {
  const user = await requireUser(["admin", "rnd"]);
  const options = await getRndOptions();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-semibold">Cấu hình</h1>
        <p className="text-sm text-ink-2">
          Danh sách lựa chọn của các ô chọn. Đổi tên 1 lựa chọn thì dữ liệu cũ cũng đổi theo (trừ ô chọn nhiều: Dòng SP, Loại đá, Màu sắc).
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(Object.keys(OPTION_KEYS) as OptionKey[]).map((k) => (
          <OptionEditor key={k} optionKey={k} label={OPTION_KEYS[k]} initial={options[k]} canEdit={user.role === "admin" || user.role === "rnd"} />
        ))}
      </div>
    </div>
  );
}
