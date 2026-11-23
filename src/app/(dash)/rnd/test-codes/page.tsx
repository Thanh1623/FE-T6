import { isRndEditor, requireUser } from "@/lib/session";
import { listTestCodes, peekNextCodes } from "@/lib/test-codes";
import TestCodesView from "./TestCodesView";

// Mã SPU test: Media / R&D / Quản lý cấp mã không trùng + danh sách mọi mã test (ai tạo, đã lên video chưa, kết quả)
export default async function TestCodesPage({ searchParams }: PageProps<"/rnd/test-codes">) {
  const user = await requireUser(["admin", "rnd", "media"]);
  const [sp, rows, next] = await Promise.all([searchParams, listTestCodes(), peekNextCodes()]);
  return <TestCodesView rows={rows} next={next} sp={sp} userName={user.full_name} canLink={isRndEditor(user) || user.role === "media"} />;
}
