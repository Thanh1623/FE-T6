/** Worker không dùng cookie Supabase SSR. */

export async function supabaseAuth(): Promise<{
  auth: { getClaims: () => Promise<{ data: { claims?: unknown } | null }> };
}> {
  return {
    auth: {
      getClaims: async () => ({ data: null }),
    },
  };
}