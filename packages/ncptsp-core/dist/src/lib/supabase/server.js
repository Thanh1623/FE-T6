"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabaseAuth = supabaseAuth;
require("server-only");
const ssr_1 = require("@supabase/ssr");
const headers_1 = require("next/headers");
// Client theo phiên đăng nhập của người dùng (cookie). Chỉ dùng cho Auth;
// đọc/ghi dữ liệu vẫn qua supabaseAdmin() sau khi đã kiểm tra quyền ở server.
async function supabaseAuth() {
    const store = await (0, headers_1.cookies)();
    return (0, ssr_1.createServerClient)(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
        cookies: {
            getAll: () => store.getAll(),
            setAll: (list) => {
                // Server Component không được ghi cookie → bỏ qua; proxy sẽ làm mới phiên
                try {
                    list.forEach(({ name, value, options }) => store.set(name, value, options));
                }
                catch { }
            },
        },
    });
}
