import { copyFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const ASSET_FILENAMES = [
  "ttm.onnx",
  "ttm.onnx.data",
  "vocab.json",
  "ort-wasm-simd-threaded.wasm",
] as const;

const root = resolve(import.meta.dir, "..");

export function copyTtmAssets(
  outputDirectory: string,
  sourceDirectory: string = join(root, "engine", "vsinsy", "models", "ttm"),
): void {
  const source = resolve(sourceDirectory);
  const targetDirectory = resolve(outputDirectory, "models", "ttm");
  mkdirSync(targetDirectory, { recursive: true });

  for (const filename of ASSET_FILENAMES) {
    copyFileSync(join(source, filename), join(targetDirectory, filename));
  }
}

if (import.meta.main) {
  copyTtmAssets(process.argv[2] ?? "bin");
}
