"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";

// Link chỉ tải trước khi người dùng rê chuột / chạm vào (có ý định bấm), thay vì tải trước MỌI link đang hiện.
// Mặc định Next tải trước toàn bộ link trên màn hình (sidebar + mỗi dòng bảng) → ~50 yêu cầu máy chủ mỗi lần mở trang,
// mỗi yêu cầu chạy kiểm tra đăng nhập + truy vấn → máy chủ bận, trang mở sau bị chậm.
export default function HoverLink({ href, onMouseEnter, onTouchStart, onFocus, ...rest }: ComponentProps<typeof Link> & { href: string }) {
  const router = useRouter();
  const warm = () => router.prefetch(href);
  return (
    <Link href={href} prefetch={false} {...rest}
      onMouseEnter={(e) => { warm(); onMouseEnter?.(e); }}
      onTouchStart={(e) => { warm(); onTouchStart?.(e); }}
      onFocus={(e) => { warm(); onFocus?.(e); }} />
  );
}
