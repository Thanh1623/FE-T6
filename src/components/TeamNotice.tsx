import Link from "next/link";
import type { TeamScope } from "@/lib/team-scope";

// Dải thông báo đầu trang báo cáo cho người bị giới hạn theo team
export default function TeamNotice({ scope, pages }: { scope: TeamScope; pages: number }) {
  if (!scope.limited) return null;
  const warn = !scope.teamId || pages === 0;
  return (
    <p className={`rounded-lg px-3 py-1.5 text-xs ${warn ? "bg-warn-bg text-warn-ink" : "bg-grid text-ink-2"}`}>
      {!scope.teamId ? "Bạn chưa thuộc team nào — nhờ Quản lý gán team để xem số liệu."
        : pages === 0 ? <>Team {scope.teamName} chưa chọn Page nào — <Link href="/team" className="font-medium underline">vào “Team của tôi”</Link> để chọn Page theo dõi.</>
        : <>Đang xem số liệu của team <b>{scope.teamName}</b> · {pages} Page · <Link href="/team" className="underline">Quản lý Page</Link></>}
    </p>
  );
}
