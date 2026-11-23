import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Client theo phiên đăng nhập của người dùng (cookie). Chỉ dùng cho Auth;
// đọc/ghi dữ liệu vẫn qua supabaseAdmin() sau khi đã kiểm tra quyền ở server.
export async function supabaseAuth() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        // Server Component không được ghi cookie → bỏ qua; proxy sẽ làm mới phiên
        try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch {}
      },
    },
  });
}
