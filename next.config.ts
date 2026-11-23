import type { NextConfig } from "next";

// Header bảo mật cho mọi trang (HSTS do Vercel tự thêm trên HTTPS)
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },                                   // chống nhúng trang vào iframe (clickjacking)
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },                         // app nội bộ: không cho công cụ tìm kiếm lập chỉ mục
];

// Đường dẫn cũ (tiếng Việt) → mới (tiếng Anh): link đã lưu / gửi trước đây vẫn mở được (chuyển hướng tạm thời, giữ nguyên tham số sau dấu ?)
const OLD_ROUTES: [string, string][] = [
  ["/bai-viet", "/posts"], ["/ket-noi", "/connections"], ["/nguoi-dung", "/users"],
  ["/sao-bien", "/sample-push"], ["/tai-khoan", "/account"], ["/viec", "/tasks"], ["/video-rnd", "/rnd-library"], ["/dang-ky", "/register"],
  ["/rnd/3d", "/rnd/design-3d"], ["/rnd/cau-hinh", "/rnd/settings"], ["/rnd/da-duyet", "/rnd/approved"], ["/rnd/dat-hang", "/rnd/orders"],
  ["/rnd/duyet-win", "/rnd/win"], ["/rnd/hieu-qua", "/rnd/commercial"], ["/rnd/quy-trinh", "/rnd/kanban"], ["/rnd/thong-ke", "/rnd/stats"],
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Tải file nhập tồn kho / số bán qua server action: mặc định chỉ 1 MB. Vercel nhận tối đa ~4,5 MB mỗi yêu cầu nên đặt 4 MB
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  async redirects() {
    return OLD_ROUTES.map(([source, destination]) => ({ source, destination, permanent: false }));
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
