import "server-only";
import { type SupabaseClient } from "@supabase/supabase-js";
export declare function supabaseAdmin(): SupabaseClient<any, "public", "public", any, any>;
export declare const sb: {
    core: () => import("@supabase/postgrest-js").PostgrestClient<any, any, "core", any>;
    social: () => import("@supabase/postgrest-js").PostgrestClient<any, any, "social", any>;
    sales: () => import("@supabase/postgrest-js").PostgrestClient<any, any, "sales", any>;
    rnd: () => import("@supabase/postgrest-js").PostgrestClient<any, any, "rnd", any>;
};
export declare function supabaseOrders(): SupabaseClient<any, "public", "public", any, any>;
export { fetchAll, fetchAllByKey } from "@/lib/paging";
