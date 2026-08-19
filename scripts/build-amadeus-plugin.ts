/**
 * Build lang.vi.vlp guest IIFE + plugin.toml (amadeus.plugin/v1).
 * Requires engine-provided __plugin at load time (not embedded).
 */
import { mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";

const root = join(import.meta.dir, "..");
const entry = join(root, "plugins/lang.vi.vlp/plugin.ts");
const outDir = resolve(root, process.argv[2] ?? "dist/amadeus-plugin");
const outJs = join(outDir, "plugin.iife.js");
const outToml = join(outDir, "plugin.toml");
const pagesBaseUrl = "https://huwutao.github.io/cephome";

await mkdir(outDir, { recursive: true });

const result = await Bun.build({
  entrypoints: [entry],
  target: "browser",
  format: "iife",
  minify: true,
});

if (!result.success) {
  throw new AggregateError(result.logs, "amadeus plugin build failed");
}
const artifact = result.outputs[0];
if (!artifact) throw new Error("no bundle output");

let code = await artifact.text();
const forbidden = /\bimport\s+|\bexport\s+|\b(?:Bun\.|node:)/;
if (forbidden.test(code)) throw new Error("bundle is not runtime-independent");

await Bun.write(outJs, code);

const sha256 = createHash("sha256").update(code).digest("hex");
const toml = `\
protocol = "amadeus.plugin/v1"
id = "lang.vi.vlp"
version = "2.0.2"
name = "Vietnamese language processor"
role = "language"
runtime = "quickjs"
entry = "plugin.iife.js"
sha256 = "${sha256}"
enabled_by_default = true
order = 10

[update]
enabled = true
metadata_url = "${pagesBaseUrl}/amadeus-plugin/plugin.toml"
entry_url = "${pagesBaseUrl}/amadeus-plugin/plugin.iife.js"
`;

await Bun.write(outToml, toml);
console.log(outJs);
console.log(outToml);
console.log("sha256", sha256);
console.log("bytes", Buffer.byteLength(code));
