import * as esbuild from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ncptspRoot = path.resolve(here, "../..");

await esbuild.build({
  entryPoints: [path.join(ncptspRoot, "src/lib/sync/auth.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: path.join(here, "dist/sync-auth.cjs"),
  target: "node20",
  packages: "external",
  alias: {
    "@": path.join(ncptspRoot, "src"),
    "server-only": path.join(here, "shim/server-only.ts"),
  },
});
console.log("ncptsp-core: sync-auth OK");