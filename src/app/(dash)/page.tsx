import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";

// Trang chủ: Dashboard R&D cho mọi vai trò.
export default async function Home() {
  await requireUser();
  redirect("/rnd/dashboard");
}
