// Chuẩn hoá tên tài khoản TikTok để ghép đơn hàng (tag "tiktok_business_<tên>" trên Sapo) với kênh TikTok trong hệ thống.
// PHẢI giống phép chuẩn hoá trong SQL (supabase/qlydonhang/006): trim, gộp khoảng trắng, chữ thường.
export const normTikTokName = (s: string) => s.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();

// page_id do hàm SQL 006 sinh ra cho đơn của tài khoản TikTok chưa ghép được ID kênh
export const TT_NAME_PREFIX = "ttn:";
