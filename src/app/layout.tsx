import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { themeInitScript } from "@/lib/theme";

export const metadata: Metadata = {
  title: "R&D · Nghiên cứu và phát triển sản phẩm",
  description: "Traffic Facebook Page, hiệu quả sản phẩm theo hashtag mã SP",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: data-theme được script đặt trước khi React hydrate
    <html lang="vi" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full">
        {/* Đặt theme trước khi trang hiện ra (không nháy màu); next/script tự đưa vào <head> */}
        <Script id="theme-init" strategy="beforeInteractive">{themeInitScript}</Script>
        {children}
      </body>
    </html>
  );
}
