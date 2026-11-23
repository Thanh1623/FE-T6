import type { Metadata } from "next";

export const metadata: Metadata = { title: "Điều khoản sử dụng · Terms of Service" };

const CONTACT = "sanphamvcb@gmail.com";

// Trang công khai (không cần đăng nhập) — dùng cho hồ sơ ứng dụng TikTok / Meta
export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-5 py-10 text-sm leading-relaxed">
      <h1 className="text-2xl font-semibold">Điều khoản sử dụng / Terms of Service</h1>
      <p className="text-ink-2">Cập nhật / Last updated: 10/2026 · Viễn Chí Bảo (nội bộ / internal use)</p>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">1. Phạm vi / Scope</h2>
        <p>
          “Thống kê traffic” là công cụ nội bộ của Viễn Chí Bảo, chỉ dành cho nhân viên và đối tác được công ty cấp tài khoản. Bằng việc đăng nhập và kết nối
          tài khoản mạng xã hội của mình, bạn đồng ý để hệ thống đọc số liệu của tài khoản đó theo Chính sách bảo mật.
        </p>
        <p className="text-ink-2">
          “Thống kê traffic” is an internal tool for staff and partners to whom Viễn Chí Bảo has issued accounts. By signing in and connecting your own social
          account you allow the system to read that account’s statistics as described in the Privacy Policy.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">2. Trách nhiệm người dùng / User responsibilities</h2>
        <ul className="list-disc space-y-1 pl-6">
          <li>Chỉ kết nối tài khoản bạn là chủ sở hữu hoặc được phép quản lý;</li>
          <li>Không chia sẻ tài khoản đăng nhập hệ thống hoặc số liệu cho người ngoài công ty;</li>
          <li>Tuân thủ điều khoản của TikTok, Meta và các nền tảng liên quan.</li>
        </ul>
        <p className="text-ink-2">Connect only accounts you own or are authorised to manage; do not share access or data outside the company; follow the platforms’ own terms.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">3. Ngắt kết nối / Disconnecting</h2>
        <p>
          Bạn có thể thu hồi quyền truy cập bất kỳ lúc nào trong cài đặt của TikTok, hoặc liên hệ <a className="underline" href={`mailto:${CONTACT}`}>{CONTACT}</a> để xoá kênh
          và dữ liệu đã lưu. Công ty có thể ngừng quyền truy cập của một tài khoản bất kỳ lúc nào.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">4. Giới hạn trách nhiệm / Disclaimer</h2>
        <p>
          Số liệu được lấy từ các nền tảng và có thể chậm hoặc chưa đầy đủ. Hệ thống được cung cấp “nguyên trạng” để phục vụ phân tích nội bộ.
        </p>
        <p className="text-ink-2">Statistics come from third-party platforms and may be delayed or incomplete. The tool is provided “as is” for internal analysis.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">5. Liên hệ / Contact</h2>
        <p><a className="underline" href={`mailto:${CONTACT}`}>{CONTACT}</a></p>
      </section>
    </main>
  );
}
