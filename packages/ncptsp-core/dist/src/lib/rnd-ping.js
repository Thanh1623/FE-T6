"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pingRnd = pingRnd;
require("server-only");
const server_1 = require("next/server");
const admin_1 = require("@/lib/supabase/admin");
const rnd_workspace_types_1 = require("@/lib/rnd-workspace-types");
// Báo mọi trình duyệt đang mở R&D: "dữ liệu vừa đổi, tải lại". Tín hiệu KHÔNG chứa dữ liệu (chỉ thời điểm);
// trình duyệt tự gọi /api/rnd/workspace (có kiểm tra đăng nhập + quyền). Chạy sau khi trả phản hồi (after) → không làm chậm thao tác.
function pingRnd() {
    const send = async () => {
        try {
            const r = await (0, admin_1.supabaseAdmin)().channel(rnd_workspace_types_1.RND_CHANNEL).httpSend("changed", { at: Date.now() });
            if (!r.success)
                console.error("pingRnd:", r.error);
        }
        catch (e) {
            console.error("pingRnd:", e);
        }
    };
    try {
        (0, server_1.after)(send);
    }
    catch {
        void send();
    } // ngoài ngữ cảnh request (script) → gửi luôn
}
