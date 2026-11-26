import * as esbuild from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ncptspRoot = path.resolve(here, "../..");
const shim = (name) => path.join(here, "shim", name);

const result = await esbuild.build({
  entryPoints: [path.join(ncptspRoot, "src/lib/sync/index.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: path.join(here, "dist/sync-bundle.cjs"),
  target: "node20",
  sourcemap: true,
  logLevel: "info",
  packages: "external",
  alias: {
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
  },
});

if (result.errors.length) process.exit(1);
console.log("ncptsp-core: sync bundle OK → dist/sync-bundle.cjs");