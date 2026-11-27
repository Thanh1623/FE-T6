import * as esbuild from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { esbuildAliases } from "./build-aliases.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

await esbuild.build({
  entryPoints: [path.join(here, "entries/videos.handlers.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: path.join(here, "dist/videos-bundle.cjs"),
  target: "node20",
  sourcemap: true,
  logLevel: "info",
  packages: "external",
  alias: esbuildAliases,
});

console.log("ncptsp-core: videos OK → dist/videos-bundle.cjs");