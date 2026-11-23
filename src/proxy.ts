import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Làm mới phiên Supabase Auth mỗi request + chặn trang khi chưa đăng nhập.
// Phân quyền theo vai trò kiểm tra ở từng trang/action (requireUser), không ở đây.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getClaims: tự làm mới phiên khi hết hạn + kiểm chữ ký JWT tại chỗ (không gọi Supabase Auth mỗi request)
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub && !["/login", "/register"].some((p) => request.nextUrl.pathname.startsWith(p))) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return response;
}

export const config = {
  // privacy / terms: trang công khai (TikTok / Meta yêu cầu địa chỉ Điều khoản + Chính sách bảo mật mở được khi chưa đăng nhập)
  matcher: ["/((?!api/cron|api/setup|privacy|terms|tiktok.*\.txt|_next/static|_next/image|favicon.ico).*)"],
};
