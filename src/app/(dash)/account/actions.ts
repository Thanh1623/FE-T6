"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { attempt } from "@/lib/action-result";
import { TAG, bust } from "@/lib/cache-tags";
import { requireActionUser } from "@/lib/session";
import { sb } from "@/lib/supabase/admin";
import { supabaseAuth } from "@/lib/supabase/server";

// Mỗi người tự sửa họ tên của mình (vai trò / team / email chỉ Quản lý đổi ở trang Người dùng)
export async function updateOwnProfile(fullName: string) {
  return attempt(async () => {
    const user = await requireActionUser();
    const name = fullName.trim().replace(/\s+/g, " ").slice(0, 80);
    if (name.length < 2) throw new Error("Họ tên tối thiểu 2 ký tự");
    const { error } = await sb.core().from("profiles").update({ full_name: name }).eq("id", user.id);
    if (error) throw new Error(error.message);
    bust(TAG.profiles);
    revalidatePath("/", "layout");   // tên hiện ở thanh bên mọi trang
    return name;
  });
}

// Đăng xuất khỏi mọi thiết bị (huỷ mọi phiên đăng nhập, kể cả phiên này)
export async function signOutEverywhere() {
  await requireActionUser();
  await (await supabaseAuth()).auth.signOut({ scope: "global" });
  redirect("/login");
}
