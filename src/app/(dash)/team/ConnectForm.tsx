"use client";

import { useActionState } from "react";
import { connectPages, type ConnectState } from "./actions";
import TeamPicker from "./TeamPicker";

const input = "w-full rounded-lg border border-line bg-page px-3 py-2 text-sm outline-none focus:border-accent";

// Team tự kết nối Page: dán token Facebook cá nhân của người quản trị Page (không lưu token, chỉ lưu Page Token)
export default function ConnectForm({ teams, fixedTeamName, teamId }: { teams: { id: string; name: string }[] | null; fixedTeamName: string | null; teamId?: string }) {
  const [state, action, pending] = useActionState<ConnectState, FormData>(connectPages, {});
  return (
    <section className="space-y-3 rounded-xl border border-line bg-surface p-4 text-sm">
      <div>
        <h2 className="font-medium">🔗 Kết nối Page của team</h2>
        <p className="text-xs text-ink-muted">
          Dành cho người đang quản trị Page trên Facebook: dán token để đưa các Page đó vào {fixedTeamName ? <>team <b>{fixedTeamName}</b></> : "team được chọn"}.
          Hệ thống chỉ lưu token của từng Page (không hết hạn), <b>không lưu token cá nhân</b>.
        </p>
      </div>

      <form action={action} className="space-y-2">
        {teams && <TeamPicker teams={teams} className="max-w-xs" />}
        {teamId && <input type="hidden" name="team_id" value={teamId} />}
        <textarea name="token" required rows={3} spellCheck={false} autoComplete="off" placeholder="Dán token dài (bắt đầu bằng EA…) vào đây"
          className={`${input} font-mono text-xs`} />
        <button disabled={pending} className="rounded-lg bg-accent px-4 py-2 font-medium text-white hover:opacity-90 disabled:opacity-60">
          {pending ? "Đang kết nối…" : "Kết nối Page"}
        </button>
      </form>

      {state.error && <p className="rounded-lg bg-warn-bg px-3 py-2 text-warn-ink">⛔ {state.error}</p>}
      {state.ok && (
        <div className="space-y-1 rounded-lg bg-grid px-3 py-2">
          <p className="font-medium text-good">✓ Đã kết nối {state.connected?.length ?? 0} kênh:</p>
          <ul className="list-disc pl-5">
            {state.connected?.map((c, i) => <li key={i}>{c.name}{c.platform === "instagram" ? " (Instagram)" : ""}</li>)}
          </ul>
          {!!state.skipped?.length && (
            <p className="text-warn-ink">Bỏ qua (đã thuộc team khác): {state.skipped.join("; ")}</p>
          )}
          {state.warning && <p className="text-warn-ink">⚠ {state.warning}</p>}
          <p className="text-xs text-ink-muted">Số liệu về sau lần đồng bộ kế tiếp (tự động, hoặc Quản lý bấm “Đồng bộ ngay”). Kênh mới được kéo 1 năm dữ liệu.</p>
        </div>
      )}

      <details className="rounded-lg border border-line p-3">
        <summary className="cursor-pointer font-medium">📖 Hướng dẫn lấy token (làm 1 lần)</summary>
        <ol className="mt-3 list-decimal space-y-3 pl-5 text-ink-2">
          <li>
            <b>Quản lý thêm nhân viên vào app Meta</b> (chỉ lần đầu): developers.facebook.com → chọn app của công ty → <i>App roles → Roles → Add People</i> →
            thêm Facebook của nhân viên với vai trò <b>Developer</b> hoặc <b>Tester</b>. Nhân viên mở thông báo / link mời và bấm chấp nhận.
          </li>
          <li>
            <b>Nhân viên mở Graph API Explorer:</b> developers.facebook.com/tools/explorer → ở khung bên phải, mục <i>Meta App</i> chọn đúng app của công ty.
          </li>
          <li>
            Mục <i>User or Page</i> chọn <b>Get User Access Token</b>. Trong <i>Permissions</i> thêm:
            <code className="mx-1 rounded bg-grid px-1">pages_show_list</code>
            <code className="mr-1 rounded bg-grid px-1">pages_read_engagement</code>
            <code className="mr-1 rounded bg-grid px-1">read_insights</code>
            <code className="mr-1 rounded bg-grid px-1">pages_read_user_content</code>
            (nên thêm <code className="rounded bg-grid px-1">instagram_basic</code> và <code className="rounded bg-grid px-1">instagram_manage_insights</code> nếu team có Instagram;
            Trang thuộc Business Manager thì thêm <code className="rounded bg-grid px-1">business_management</code>).
          </li>
          <li>
            Bấm <b>Generate Access Token</b>. Facebook hỏi quyền: <b>chọn đúng các Page của team</b> (hoặc “Opt in to all current and future Pages”) → Tiếp tục → Xong.
            Nếu quên tick Page thì hệ thống báo “không quản trị Trang nào”.
          </li>
          <li>
            <b>Kéo dài token (bắt buộc):</b> token vừa tạo chỉ sống 1–2 giờ, và Page Token lấy từ nó cũng hết hạn theo. Copy token → mở
            developers.facebook.com/tools/debug/accesstoken → dán → <b>Debug</b> → bấm <b>Extend Access Token</b> → copy token mới (sống ~60 ngày).
            Page Token sinh ra từ token dài hạn thì <b>không hết hạn</b>.
          </li>
          <li>Dán token dài vào ô phía trên → <b>Kết nối Page</b>. Thấy danh sách kênh đã kết nối là xong; không cần dán lại trừ khi team thêm Page mới.</li>
        </ol>
        <p className="mt-3 text-xs text-ink-muted">
          🔒 Token cá nhân giống mật khẩu đọc dữ liệu Page của bạn — không gửi qua chat / email. Hệ thống không lưu nó; muốn thu hồi, vào Facebook → Cài đặt →
          Tích hợp doanh nghiệp (Business Integrations) → gỡ ứng dụng. Lỗi thường gặp: <i>Token không dùng được</i> = token hết hạn / sao chép thiếu;
          <i> không quản trị Trang nào</i> = chưa tick Page ở bước 4 hoặc Page thuộc Business Manager (cần thêm quyền business_management);
          <i> đã thuộc team khác</i> = Page đó đang do team khác theo dõi — nhờ Quản lý gỡ rồi chọn lại.
        </p>
      </details>
    </section>
  );
}
