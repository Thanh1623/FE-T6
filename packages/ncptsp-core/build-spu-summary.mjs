import * as esbuild from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { esbuildAliases } from "./build-aliases.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

await esbuild.build({
  entryPoints: [path.join(here, "entries/spu-summary.handlers.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: path.join(here, "dist/spu-summary-bundle.cjs"),
  target: "node20",
  sourcemap: true,
  logLevel: "info",
  packages: "external",
  alias: esbuildAliases,
});

console.log("ncptsp-core: spu-summary OK → dist/spu-summary-bundle.cjs");