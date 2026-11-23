"use client";

import { useActionState } from "react";
import { addTeamTags, removeTeamTag, type TagState } from "./actions";

export type TeamTag = { id: string; name: string; platform: string; raw: string | null; teamId: string; teamName: string };

// Tag Sapo thủ công của team: dán tag (nhiều tag cách nhau bằng dấu phẩy / xuống dòng) → số bán của đơn mang tag đó tính cho team.
export default function TagManager({ tags, canPick, teamId }: {
  tags: TeamTag[]; teams?: { id: string; name: string }[]; isAdmin?: boolean; canPick: boolean; teamId: string;   // teamId: team đang xem — tag thêm vào đúng team này
}) {
  const [state, action, pending] = useActionState<TagState, FormData>(addTeamTags, {});
  const mine = tags.filter((t) => t.teamId === teamId);
  const byTeam = new Map<string, TeamTag[]>();
  for (const t of mine) byTeam.set(t.teamName, [...(byTeam.get(t.teamName) ?? []), t]);

  return (
    <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <header>
        <h2 className="font-semibold">🏷️ Tag Sapo của team</h2>
        <p className="mt-0.5 text-xs text-ink-muted">
          Dùng khi đơn hàng mang tag nguồn mà hệ thống chưa nhận ra là Page của team (vd tài khoản TikTok chưa kết nối). Dán tag Sapo của đơn
          — số bán của mọi đơn mang tag đó sẽ tính cho team ở “Theo dõi SPU”. Chưa có lượt xem vì chưa kết nối tài khoản.
        </p>
      </header>

      {canPick && (
        <form action={action} className="space-y-2">
          <textarea name="tags" required rows={2} placeholder={"tiktok_business_Tên tài khoản, tiktok_business_id_-000…\npage_id_1234567890"}
            className="w-full rounded-lg border border-line bg-page px-3 py-2 font-mono text-xs outline-none focus:border-accent" />
          <div className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="team_id" value={teamId} />
            <button disabled={pending} className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60">
              {pending ? "Đang thêm…" : "＋ Thêm tag"}
            </button>
            <span className="text-xs text-ink-muted">Hỗ trợ: tiktok_business_&lt;tên&gt; · tiktok_business_id_&lt;mã&gt; · page_id_&lt;số&gt;</span>
          </div>
          {state.added && state.added.length > 0 && <p className="rounded-lg bg-grid px-3 py-2 text-sm text-good">✓ Đã thêm: {state.added.join(", ")}</p>}
          {state.errors && state.errors.length > 0 && (
            <ul className="space-y-0.5 rounded-lg bg-warn-bg px-3 py-2 text-xs text-warn-ink">{state.errors.map((e, i) => <li key={i}>⛔ {e}</li>)}</ul>
          )}
        </form>
      )}

      {mine.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-sm text-ink-muted">Chưa có tag thủ công nào.</p>
      ) : (
        <div className="space-y-3">
          {[...byTeam.entries()].map(([team, list]) => (
            <div key={team}>
              <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
                {list.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span aria-hidden>{t.platform === "tiktok" ? "🎵" : "📘"}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium" title={t.name}>{t.name}</span>
                      {t.raw && <span className="block truncate font-mono text-2xs text-ink-muted" title={t.raw}>{t.raw}</span>}
                    </span>
                    {canPick && (
                      <form action={removeTeamTag}>
                        <input type="hidden" name="channel_id" value={t.id} />
                        <button className="rounded-md border border-line px-2.5 py-1 text-xs text-ink-2 hover:bg-grid">Gỡ</button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
