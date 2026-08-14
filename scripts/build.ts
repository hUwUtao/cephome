import { spawnSync } from "child_process";
import { copyFileSync, mkdirSync, existsSync } from "fs";
import { copyTtmAssets } from "./copy-ttm-assets.ts";

console.log("Building frontend...");
const feResult = spawnSync(
  "bun",
  [
    "build",
    "./src/index.html",
    "--outdir=dist",
    "--sourcemap",
    "--target=browser",
    "--minify",
    "--define:process.env.NODE_ENV='\"production\"'",
  ],
  { stdio: "inherit" },
);

if (feResult.status !== 0) {
  process.exit(feResult.status ?? 1);
}

console.log("Building Windows stub...");
const stubResult = spawnSync(
  "bun",
  [
    "build",
    "--compile",
    "--target=bun-windows-x64",
    "./engine/vsinsy/bin/stub.ts",
    "--outfile",
    "./bin/musicXMLtoLabel.exe",
  ],
  { stdio: "inherit" },
);

if (stubResult.status !== 0) {
  process.exit(stubResult.status ?? 1);
}

console.log("Building Player CLI...");
const playerResult = spawnSync(
  "bun",
  [
    "build",
    "--compile",
    "--target=bun-windows-x64",
    "./engine/vsinsy/generator/player-cli.ts",
    "--outfile",
    "./bin/cephome-player.exe",
  ],
  { stdio: "inherit" },
);

if (playerResult.status !== 0) {
  process.exit(playerResult.status ?? 1);
}

console.log("Building Sinsy rule.js...");
const ruleResult = spawnSync(
  "bun",
  [
    "build",
    "./engine/vsinsy/bin/rule-api.ts",
    "--minify",
    "--bundle",
    "--format",
    "esm",
    "--target",
    "bun",
    "--sourcemap=inline",
    "--outfile",
    "./bin/rule.js",
  ],
  { stdio: "inherit" },
);

if (ruleResult.status !== 0) {
  process.exit(ruleResult.status ?? 1);
}

copyTtmAssets("bin");

console.log("Copying binaries to dist/...");
if (!existsSync("dist")) {
  mkdirSync("dist");
}

copyFileSync("./bin/musicXMLtoLabel.exe", "./dist/musicXMLtoLabel.exe");
copyFileSync("./bin/cephome-player.exe", "./dist/cephome-player.exe");
copyFileSync("./bin/rule.js", "./dist/rule.js");
copyTtmAssets("dist");

console.log("Copying example players to dist/...");
copyFileSync(
  "./example/lathuyenuocmo.musicxml.player.html",
  "./dist/lathuyenuocmo.musicxml.player.html",
);
copyFileSync(
  "./example/emlamamnoncuadang.musicxml.player.html",
  "./dist/emlamamnoncuadang.musicxml.player.html",
);
if (existsSync("./example/emlamamnoncuadang.opus")) {
  copyFileSync("./example/emlamamnoncuadang.opus", "./dist/emlamamnoncuadang.opus");
}

console.log("Build completed successfully!");
