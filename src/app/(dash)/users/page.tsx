import UserAdmin from "@/components/users/UserAdmin";
import { requireUser } from "@/lib/session";
import { sb, supabaseAdmin } from "@/lib/supabase/admin";
import { getTeams } from "@/lib/pipeline";
import { normalizeRole } from "@/lib/roles";

export default async function UsersPage() {
  const me = await requireUser(["admin"]);
  const db = supabaseAdmin();
  const [{ data: profiles, error }, { data: auth }, teams] = await Promise.all([
    sb.core().from("profiles").select("*").order("created_at"),
    db.auth.admin.listUsers({ perPage: 1000 }),
    getTeams(),
  ]);
  if (error) throw error;
  const lastSignIn = new Map((auth?.users ?? []).map((u) => [u.id, u.last_sign_in_at ?? null]));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-semibold">Người dùng</h1>
        <p className="text-sm text-ink-2">
          Quản lý: mọi quyền + cài KPI · R&amp;D: sưu tầm mẫu, đặt xưởng, giao việc, duyệt 3D/source ·
          Thiết kế 3D / Media: làm việc được giao · Đẩy mẫu ĐVKD: team nhận việc xem mẫu, mở Source · Trưởng team: duyệt mẫu + duyệt Win của team
        </p>
      </div>
      <UserAdmin meId={me.id} teams={teams}
        users={(profiles ?? []).map((p) => ({
          id: p.id, email: p.email, full_name: p.full_name, role: normalizeRole(p.role), is_active: p.is_active, approved_at: p.approved_at,
          team_id: p.team_id ?? null, team2_id: p.team2_id ?? null, is_team_lead: !!p.is_team_lead, created_at: p.created_at, last_sign_in_at: lastSignIn.get(p.id) ?? null,
        }))} />
    </div>
  );
}
