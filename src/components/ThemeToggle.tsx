"use client";

import { useEffect, useState } from "react";
import { THEME_KEY as KEY } from "@/lib/theme";

type Theme = "system" | "light" | "dark";
const OPTIONS: [Theme, string, string][] = [["light", "☀️", "Sáng"], ["dark", "🌙", "Tối"], ["system", "💻", "Theo hệ thống"]];

function apply(theme: Theme) {
  if (theme === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", theme);
}

// Lựa chọn lưu ở trình duyệt của từng người (localStorage có thể bị chặn → bọc try/catch)
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    let saved: Theme = "system";
    try { saved = (localStorage.getItem(KEY) as Theme) || "system"; } catch {}
    setTheme(saved); // eslint-disable-line react-hooks/set-state-in-effect -- đọc localStorage chỉ có ở client
  }, []);

  function choose(t: Theme) {
    setTheme(t);
    apply(t);
    try { if (t === "system") localStorage.removeItem(KEY); else localStorage.setItem(KEY, t); } catch {}
  }

  return (
    <div className="flex w-full rounded-md bg-grid/70 p-0.5" role="radiogroup" aria-label="Giao diện">
      {OPTIONS.map(([t, icon, label]) => (
        <button key={t} role="radio" aria-checked={theme === t} title={label} onClick={() => choose(t)}
          className={`flex-1 rounded px-2 py-0 text-[10px] leading-4 ${theme === t ? "bg-surface shadow-sm" : "opacity-60 hover:opacity-100"}`}>
          {icon}
        </button>
      ))}
    </div>
  );
}
