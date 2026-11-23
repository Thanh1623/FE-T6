import "server-only";
import { after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { RND_CHANNEL } from "@/lib/rnd-workspace-types";

// Báo mọi trình duyệt đang mở R&D: "dữ liệu vừa đổi, tải lại". Tín hiệu KHÔNG chứa dữ liệu (chỉ thời điểm);
// trình duyệt tự gọi /api/rnd/workspace (có kiểm tra đăng nhập + quyền). Chạy sau khi trả phản hồi (after) → không làm chậm thao tác.
export function pingRnd() {
  const send = async () => {
    try {
      const r = await supabaseAdmin().channel(RND_CHANNEL).httpSend("changed", { at: Date.now() });
      if (!r.success) console.error("pingRnd:", r.error);
    } catch (e) { console.error("pingRnd:", e); }
  };
  try { after(send); } catch { void send(); }   // ngoài ngữ cảnh request (script) → gửi luôn
}
