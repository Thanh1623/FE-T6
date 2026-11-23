"use client";

import { useEffect, useState, type ReactNode } from "react";

// Khung trang QLHN: tiêu đề + 2 tab (Dashboard / Bảng chi tiết, nhớ trong #hash) + hai bảng nội dung.
// Hai tab cùng được dựng sẵn ở máy chủ, chuyển tab không tải lại.
// Đổi tab thì ghi một mục lịch sử mới (#chi-tiet hoặc không hash) để nút Quay lại của trình duyệt về tab trước đó; chọn lại tab đang xem thì không ghi thêm
function push(t: "dashboard" | "chi-tiet") {
  const cur = window.location.hash === "#chi-tiet" ? "chi-tiet" : "dashboard";
  if (cur !== t) history.pushState(null, "", `${location.pathname}${location.search}${t === "chi-tiet" ? "#chi-tiet" : ""}`);
}

export default function Tabs({ left, bar, dash, detail }: { left: ReactNode; bar: ReactNode; dash: ReactNode; detail: ReactNode }) {
  const [tab, setTab] = useState<"dashboard" | "chi-tiet">("dashboard");
  useEffect(() => {
    const read = () => setTab(window.location.hash === "#chi-tiet" ? "chi-tiet" : "dashboard");
    const go = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (id === "dashboard") { document.querySelectorAll(".qlhn .hl").forEach((x) => x.classList.remove("hl")); setTab("dashboard"); push("dashboard"); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
      setTab("chi-tiet");
      push("chi-tiet");
      setTimeout(() => {
        const t = document.getElementById(id === "cost" ? "d-cost" : `d-${id}`);
        if (!t) return;
        const d = t.querySelector("details"); if (d) d.open = true;
        t.scrollIntoView({ behavior: "smooth", block: "start" });
        // Làm nổi bảng vừa nhảy tới (viền xanh + quầng sáng mờ dần) để dễ nhận ra
        document.querySelectorAll(".qlhn .hl").forEach((e) => e.classList.remove("hl"));
        void t.offsetWidth; t.classList.add("hl");   // viền xanh giữ nguyên tới khi nhảy sang bảng khác hoặc đổi tab
      }, 30);
    };
    read();
    window.addEventListener("hashchange", read);
    window.addEventListener("popstate", read);   // nút Quay lại của trình duyệt: về tab trước đó
    window.addEventListener("qlhn-go", go);
    return () => { window.removeEventListener("hashchange", read); window.removeEventListener("popstate", read); window.removeEventListener("qlhn-go", go); };
  }, []);
  const pick = (t: "dashboard" | "chi-tiet") => { document.querySelectorAll(".qlhn .hl").forEach((e) => e.classList.remove("hl")); setTab(t); push(t); window.scrollTo({ top: 0 }); };
  return (
    <>
      <header className="top"><div className="top-in">
        <div className="team">{left}</div><div className="spacer" />
        <div className="seg" role="tablist" aria-label="Chọn nội dung">
          <button role="tab" aria-selected={tab === "dashboard"} onClick={() => pick("dashboard")}>Dashboard</button>
          <button role="tab" aria-selected={tab === "chi-tiet"} onClick={() => pick("chi-tiet")}>Bảng chi tiết</button>
        </div>
      </div></header>
      <main className="wrap">
        {bar}
        <div className="panel" id="p-dash" role="tabpanel" hidden={tab !== "dashboard"}>{dash}</div>
        <div className="panel" id="p-detail" role="tabpanel" hidden={tab !== "chi-tiet"}>{detail}</div>
      </main>
    </>
  );
}
