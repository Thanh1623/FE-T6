import type { Metadata } from "next";

export const metadata: Metadata = { title: "Chính sách bảo mật · Privacy Policy" };

const CONTACT = "sanphamvcb@gmail.com";

// Trang công khai (không cần đăng nhập) — dùng cho hồ sơ ứng dụng TikTok / Meta
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-5 py-10 text-sm leading-relaxed">
      <h1 className="text-2xl font-semibold">Chính sách bảo mật / Privacy Policy</h1>
      <p className="text-ink-2">Cập nhật / Last updated: 10/2026 · Viễn Chí Bảo (nội bộ / internal use)</p>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">1. Chúng tôi là ai / Who we are</h2>
        <p>
          Hệ thống “Thống kê traffic” là công cụ nội bộ của Viễn Chí Bảo, dùng để theo dõi hiệu quả nội dung (video, bài đăng) của các kênh mạng xã hội
          do công ty và nhân viên quản lý, và liên hệ với doanh số sản phẩm.
        </p>
        <p className="text-ink-2">
          “Thống kê traffic” is an internal tool of Viễn Chí Bảo used to measure the performance of content published on the social media accounts
          managed by the company and its staff, and to relate it to product sales.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">2. Dữ liệu chúng tôi thu thập / Data we collect</h2>
        <p>Khi chủ tài khoản TikTok chủ động đăng nhập và đồng ý cấp quyền, hệ thống chỉ đọc:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>Thông tin hồ sơ cơ bản: mã định danh (open_id), tên hiển thị, ảnh đại diện (<code>user.info.basic</code>);</li>
          <li>Số liệu tổng hợp của tài khoản: số người theo dõi, số lượt thích, số video (<code>user.info.stats</code>);</li>
          <li>Danh sách video đã đăng của chính tài khoản đó: mô tả (hashtag), ngày đăng, ảnh bìa, đường dẫn chia sẻ, lượt xem, thích, bình luận, chia sẻ (<code>video.list</code>).</li>
        </ul>
        <p className="text-ink-2">
          When a TikTok account owner voluntarily logs in and grants permission, we only read basic profile info, aggregate account statistics,
          and the account’s own video list with its public performance counts. We do not read private messages, contacts, or any data of other users.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">3. Mục đích sử dụng / How we use it</h2>
        <ul className="list-disc space-y-1 pl-6">
          <li>Thống kê lượt xem và tương tác theo kênh, theo team, theo mã sản phẩm (qua hashtag trong mô tả video);</li>
          <li>Đánh giá sản phẩm / video nào hiệu quả để quyết định sản xuất và nội dung;</li>
          <li>Không dùng để quảng cáo, không bán, không chia sẻ cho bên thứ ba, không dùng để huấn luyện mô hình AI.</li>
        </ul>
        <p className="text-ink-2">
          Used only for internal analytics. We do not sell, rent or share this data with third parties, and do not use it for advertising or to train AI models.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">4. Lưu trữ và bảo mật / Storage and security</h2>
        <p>
          Dữ liệu lưu trên hạ tầng đám mây có kiểm soát truy cập (Supabase, Vercel). Mã truy cập (token) TikTok được lưu trong vùng riêng không truy cập được từ
          trình duyệt, chỉ máy chủ của hệ thống đọc được. Chỉ nhân viên được cấp tài khoản mới xem được số liệu, và chỉ thấy kênh của team mình.
        </p>
        <p className="text-ink-2">
          Data is stored on access-controlled cloud infrastructure. TikTok access tokens are kept in a private, server-only store. Only authenticated staff
          can view statistics, and only for their own team’s accounts.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">5. Quyền của bạn và xoá dữ liệu / Your rights and deletion</h2>
        <p>
          Bạn có thể thu hồi quyền bất kỳ lúc nào trong TikTok (Cài đặt → Bảo mật và quyền → Ứng dụng và dịch vụ) hoặc yêu cầu chúng tôi xoá kênh và toàn bộ số liệu
          đã lưu bằng cách gửi email tới <a className="underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>. Chúng tôi xử lý trong vòng 7 ngày làm việc.
        </p>
        <p className="text-ink-2">
          You can revoke access at any time in TikTok (Settings → Security &amp; permissions → Apps and services), or ask us to delete your account record and all
          stored data by emailing {CONTACT}. We process requests within 7 business days.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">6. Liên hệ / Contact</h2>
        <p><a className="underline" href={`mailto:${CONTACT}`}>{CONTACT}</a></p>
      </section>
    </main>
  );
}
