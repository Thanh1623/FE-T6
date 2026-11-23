import { redirect } from "next/navigation";

// Trang Traffic cũ đã được thay bằng "Theo dõi hiệu quả SPU" — giữ link cũ còn dùng được
export default function TrafficRedirect() {
  redirect("/spu");
}
