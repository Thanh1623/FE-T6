import ChangePassword from "@/components/users/ChangePassword";
import { ProfileForm, SignOutAll } from "@/components/users/ProfileForm";
import { roleLabel, requireUser } from "@/lib/session";
import { getTeams } from "@/lib/pipeline";
import { sb, supabaseAdmin } from "@/lib/supabase/admin";

const dt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "—");

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <h2 className="font-semibold">{title}</h2>
      {hint && <p className="mt-0.5 text-sm text-ink-2">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default async function AccountPage() {
  const user = await requireUser();
  const [teams, { data: profile }, { data: auth }] = await Promise.all([
    getTeams(),
    sb.core().from("profiles").select("created_at").eq("id", user.id).maybeSingle(),
    supabaseAdmin().auth.admin.getUserById(user.id),
  ]);
  const team = user.team_id ? teams.find((t) => t.id === user.team_id)?.name ?? null : null;
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="font-semibold">Tài khoản</h1>
      <Card title="Hồ sơ">
        <ProfileForm fullName={user.full_name} rows={[
          { label: "Email", value: user.email },
          { label: "Vai trò", value: roleLabel(user.role, team) },
          { label: "Team", value: team ? `${team}${user.is_team_lead ? " · trưởng team" : ""}` : "Chưa có team" },
          { label: "Tham gia", value: dt(profile?.created_at as string | undefined) },
          { label: "Đăng nhập gần nhất", value: dt(auth?.user?.last_sign_in_at) },
        ]} />
        <p className="mt-3 text-xs text-ink-muted">Vai trò, team và email do Quản lý thay đổi.</p>
      </Card>
      <Card title="Đổi mật khẩu"><ChangePassword /></Card>
      <Card title="Phiên đăng nhập"><SignOutAll /></Card>
    </div>
  );
}
