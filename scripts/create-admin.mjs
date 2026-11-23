// Tạo tài khoản Quản lý đầu tiên (các tài khoản sau tạo trong trang "Người dùng").
// Chạy: npm run create-admin -- <email> "<Họ tên>"
// Mật khẩu tạm được in ra màn hình — đăng nhập rồi đổi ngay.
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const [email, fullName] = process.argv.slice(2);
if (!email || !fullName) {
  console.error('Cách dùng: npm run create-admin -- email@vd.com "Họ tên"');
  process.exit(1);
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const password = randomBytes(9).toString("base64url");

const { data, error } = await db.auth.admin.createUser({ email: email.toLowerCase(), password, email_confirm: true });
if (error) { console.error("❌", error.message); process.exit(1); }

const { error: e2 } = await db.schema("core").from("profiles").upsert({ id: data.user.id, email: email.toLowerCase(), full_name: fullName, role: "admin" });
if (e2) { console.error("❌", e2.message); process.exit(1); }

console.log(`✅ Đã tạo tài khoản Quản lý: ${email}`);
console.log(`   Mật khẩu tạm: ${password}`);
