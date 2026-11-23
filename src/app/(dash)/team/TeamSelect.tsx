"use client";

import { useState, useTransition } from "react";
import { setChannelTeam } from "./meta-actions";

export default function TeamSelect({ channelId, teamId, teams }: { channelId: string; teamId: string | null; teams: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <div>
      <select defaultValue={teamId ?? ""} disabled={pending}
        onChange={(e) => {
          const v = e.target.value;
          start(async () => {
            setErr(null);
            try { await setChannelTeam(channelId, v || null); } catch (x) { setErr(x instanceof Error ? x.message : "Lỗi"); }
          });
        }}
        className="rounded-lg border border-line bg-page px-2 py-1 text-sm disabled:opacity-60">
        <option value="">— Chưa gán —</option>
        {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      {err && <div className="text-xs text-bad">{err}</div>}
    </div>
  );
}
