import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ncptspRoot = path.resolve(here, "../..");
const shim = (name) => path.join(here, "shim", name);

export const ncptspRootDir = ncptspRoot;

export const esbuildAliases = {
  "@/lib/session": shim("session-worker.ts"),
  "@/lib/supabase/server": shim("supabase-server-worker.ts"),
  "@": path.join(ncptspRoot, "src"),
  "server-only": shim("server-only.ts"),
  "next/cache": shim("next-cache.ts"),
  "next/server": shim("next-server.ts"),
  "next/headers": shim("next-headers.ts"),
  "next/navigation": shim("next-navigation.ts"),
  "react/cache": shim("react-cache.ts"),
  react: shim("react-shim.ts"),
  "@/components/grid/types": shim("grid-types.ts"),
};