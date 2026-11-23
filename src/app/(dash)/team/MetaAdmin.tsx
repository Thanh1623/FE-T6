import Paged from "@/components/Paged";
import RediscoverButton from "./RediscoverButton";
import TeamSelect from "./TeamSelect";
import { getTeams } from "@/lib/pipeline";
import { sb } from "@/lib/supabase/admin";
import { fmtDate, fmtDateTime, getLatestSyncLogs } from "@/lib/data";
import { OPTIONAL_SCOPES, REQUIRED_SCOPES, TOKEN_LABELS, tokenStatuses, type TokenSource, type TokenStatus } from "@/lib/meta/token";

type ChannelRow = {
  id: string; platform: string; name: string;
  token_source?: TokenSource | null; last_seen_at?: string | null; team_id?: string | null;
};

// Kênh có last_seen_at cũ hơn lần quét mới nhất > 2 ngày → token không còn quyền với kênh đó
const STALE_MS = 2 * 86_400_000;

// Quản trị token Meta (chỉ Quản lý): trạng thái token, quét lại danh sách kênh, kênh nào phát hiện qua token nào
export default async function MetaAdmin() {
  const [tokens, logs, { data: tokenRows }, teams] = await Promise.all([
    tokenStatuses(), getLatestSyncLogs(), sb.social().rpc("channel_tokens"), getTeams(true),
  ]);

  // Trước migration 014 chưa có token_source/last_seen_at → đọc không kèm
  let migrated = true;
  let channels: ChannelRow[];
  const full = await sb.social().from("channels")
    .select("id, platform, name, token_source, last_seen_at, team_id").eq("is_active", true).order("platform").order("name");
  if (full.error) {
    migrated = false;
    const basic = await sb.social().from("channels").select("id, platform, name").eq("is_active", true).order("platform").order("name");
    if (basic.error) throw basic.error;
    channels = basic.data;
  } else channels = full.data as ChannelRow[];

  const hasToken = new Set(((tokenRows ?? []) as { channel_id: string }[]).map((t) => t.channel_id));
  const lastSeenMax = Math.max(0, ...channels.map((c) => (c.last_seen_at ? Date.parse(c.last_seen_at) : 0)));
  const syncOf = new Map(logs.filter((l) => l.job === "channel").map((l) => [l.channel_id, l]));
  const setupLogs = logs.filter((l) => l.job === "setup" && l.channel_id?.startsWith("token:"));

  return (
    <details className="rounded-xl border border-line bg-surface">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold">Quản trị kết nối Meta <span className="font-normal text-ink-muted">· token, quét lại kênh, đồng bộ (Quản lý)</span></summary>
      <div className="space-y-6 border-t border-line p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <p className="text-sm text-ink-2">
            Token dùng để tự phát hiện Trang/Instagram. Số liệu từng kênh đọc bằng Page Token riêng (không hết hạn) lưu trong kho bảo mật.
          </p>
          <RediscoverButton />
        </div>

        {!migrated && (
          <div className="rounded-lg bg-warn-bg px-4 py-3 text-sm text-warn-ink">
            Chưa chạy <code>supabase/migrations/014_channel_token_source.sql</code> — chưa theo dõi được kênh nào đến từ token nào.
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-2">
          <TokenCard source="system" status={tokens.find((t) => t.source === "system")} envName="FB_SYSTEM_TOKEN" />
          <TokenCard source="user" status={tokens.find((t) => t.source === "user")} envName="FB_USER_TOKEN" />
        </section>

        {setupLogs.length > 0 && (
          <ul className="space-y-0.5 text-xs text-ink-muted">
            {setupLogs.map((l) => (
              <li key={l.channel_id}>
                Lần quét gần nhất ({TOKEN_LABELS[l.channel_id!.slice(6) as TokenSource]}): {l.finished_at ? fmtDateTime(l.finished_at) : ""} —{" "}
                {l.status === "success" ? l.message : <span className="text-bad">lỗi: {l.message}</span>}
              </li>
            ))}
          </ul>
        )}

        <section className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b border-line text-left text-ink-2">
              <tr>
                <th className="px-3 py-2 font-medium">Kênh ({channels.length})</th>
                <th className="px-3 py-2 font-medium">Nền tảng</th>
                <th className="px-3 py-2 font-medium" title="Page thuộc team nào — dùng cho số liệu “Page của team” ở bảng Traffic / Duyệt Win">Team</th>
                <th className="px-3 py-2 font-medium">Phát hiện qua</th>
                <th className="px-3 py-2 font-medium">Lần cuối còn thấy</th>
                <th className="px-3 py-2 font-medium">Đồng bộ gần nhất</th>
              </tr>
            </thead>
            <tbody>
              <Paged size={50} cols={6}>{channels.map((c) => {
                const stale = !!c.last_seen_at && lastSeenMax - Date.parse(c.last_seen_at) > STALE_MS;
                const s = syncOf.get(c.id);
                return (
                  <tr key={c.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-2">
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-ink-muted">{c.id}</div>
                    </td>
                    <td className="px-3 py-2">{c.platform === "instagram" ? "Instagram" : c.platform === "facebook" ? "Facebook" : c.platform}</td>
                    <td className="px-3 py-2">{migrated ? <TeamSelect channelId={c.id} teamId={c.team_id ?? null} teams={teams} /> : <span className="text-ink-muted">–</span>}</td>
                    <td className="px-3 py-2">
                      {c.token_source ? TOKEN_LABELS[c.token_source] : <span className="text-ink-muted">–</span>}
                      {!hasToken.has(c.id) && <div className="text-xs text-bad">Chưa có Page Token</div>}
                    </td>
                    <td className="px-3 py-2">
                      {c.last_seen_at ? fmtDate(c.last_seen_at) : <span className="text-ink-muted">–</span>}
                      {stale && <div className="text-xs text-bad">Token không còn thấy kênh này — kiểm tra quyền trong Business Manager</div>}
                    </td>
                    <td className="px-3 py-2">
                      {c.platform !== "facebook" ? <span className="text-ink-muted">qua Page liên kết</span>
                        : !s ? <span className="text-ink-muted">chưa chạy</span>
                        : <span className={s.status === "success" ? "" : "text-bad"} title={s.message ?? ""}>
                            {s.status === "success" ? "✓" : "⛔"} {s.finished_at ? fmtDateTime(s.finished_at) : ""}
                          </span>}
                    </td>
                  </tr>
                );
              })}</Paged>
            </tbody>
          </table>
        </section>

        <section className="rounded-xl border border-line bg-surface p-4 text-sm text-ink-2">
          <h2 className="mb-2 font-medium text-ink-1">Khi đã tạo Người dùng hệ thống</h2>
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              Tạo mã truy cập cho Người dùng hệ thống, hạn <b>Không bao giờ</b>, với các quyền bắt buộc <code>{REQUIRED_SCOPES.join(", ")}</code>;
              nên thêm <code>{OPTIONAL_SCOPES.join(", ")}</code>.
            </li>
            <li>
              Tự dán vào <code>.env.local</code> dòng <code>FB_SYSTEM_TOKEN=…</code> (không gửi token qua chat). Nếu app bật “Yêu cầu khoá bí mật
              của ứng dụng”, thêm <code>FB_APP_ID</code> và <code>FB_APP_SECRET</code>.
            </li>
            <li>Khởi động lại app, bấm <b>Quét lại danh sách kênh</b>. Thẻ “Người dùng hệ thống” phải báo Hợp lệ; cột “Phát hiện qua” chuyển sang Người dùng hệ thống.</li>
            <li>Giữ <code>FB_USER_TOKEN</code> cho tới khi mọi kênh đã chuyển sang Người dùng hệ thống, sau đó có thể xoá.</li>
          </ol>
        </section>
      </div>
    </details>
  );
}

function TokenCard({ source, status, envName }: { source: TokenSource; status?: TokenStatus; envName: string }) {
  const badge = !status ? ["bg-grid text-ink-2", "Chưa cấu hình"]
    : status.valid && !status.missing.length ? ["border border-good text-good", "Hợp lệ"]
    : ["bg-warn-bg text-warn-ink", status.valid ? "Thiếu quyền" : "Lỗi"];
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-medium">{TOKEN_LABELS[source]}</h2>
        <span className={`rounded-md px-2 py-0.5 text-xs ${badge[0]}`}>{badge[1]}</span>
      </div>
      <p className="mt-1 text-xs text-ink-muted">
        <code>{envName}</code> · {source === "system" ? "không hết hạn, thuộc Business Manager công ty" : "dài hạn ~60 ngày, gắn với Facebook cá nhân"}
      </p>
      {status && (
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-ink-2">Tài khoản</dt><dd>{status.owner ?? "–"}</dd>
          <dt className="text-ink-2">Hết hạn</dt>
          <dd>{!status.valid ? "–" : status.expiresAt ? `${fmtDate(status.expiresAt)} (còn ${status.daysLeft} ngày)` : "Không hết hạn"}</dd>
          <dt className="text-ink-2">Quyền</dt>
          <dd className="break-words">{status.missing.length ? <span className="text-bad">Thiếu: {status.missing.join(", ")}</span> : "Đủ quyền bắt buộc"}</dd>
          {status.error && <><dt className="text-ink-2">Lỗi</dt><dd className="text-bad">{status.error}</dd></>}
        </dl>
      )}
    </div>
  );
}
