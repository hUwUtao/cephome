#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, sep } from "node:path";
import { transcribeWithOverrides, installPhraseOverrideHooks } from "../index.ts";

export interface MusicXmlToLabelArgs {
  inputPath: string;
  fullLabelPath: string;
  monoLabelPath: string;
  omitGhost?: boolean;
  quiet?: boolean;
  noSvg?: boolean;
}

export function parseMusicXmlToLabelArgs(argv: string[]): MusicXmlToLabelArgs {
  const omitGhost = argv.includes("--omit-ghost");
  const quiet = argv.includes("--quiet") || argv.includes("-q");
  const noSvg = argv.includes("--no-svg");
  const args = argv.filter(
    (arg) =>
      arg !== "--" &&
      arg !== "--omit-ghost" &&
      arg !== "--quiet" &&
      arg !== "-q" &&
      arg !== "--no-svg",
  );
  if (args.length !== 3 || args.includes("-h") || args.includes("--help")) {
    throw new Error(usage());
  }

  return {
    inputPath: args[0]!,
    fullLabelPath: args[1]!,
    monoLabelPath: args[2]!,
    omitGhost,
    quiet,
    noSvg,
  };
}

export async function runMusicXmlToLabelAsync(args: MusicXmlToLabelArgs): Promise<void> {
  const inputPath = normalizeCliPath(args.inputPath);
  const fullLabelPath = normalizeCliPath(args.fullLabelPath);
  const monoLabelPath = normalizeCliPath(args.monoLabelPath);

  assertInputFile(inputPath);
  prepareOutputFile(fullLabelPath);
  prepareOutputFile(monoLabelPath);
  prepareTimingLabelDirectory(fullLabelPath);

  console.error(`Convert MusicXML to label -> ${inputPath}`);
  const restoreHooks = installPhraseOverrideHooks(
    inputPath,
    args.omitGhost === true,
    args.quiet === true,
    args.noSvg === true,
  );
  try {
    const result = await transcribeWithOverrides(readFileSync(inputPath), inputPath);

    writeFileSync(fullLabelPath, result.full, "utf8");
    writeFileSync(monoLabelPath, result.mono, "utf8");
  } finally {
    restoreHooks();
  }

  if (!args.quiet) {
    console.error(`output full label -> ${fullLabelPath}`);
    console.error(`output mono label -> ${monoLabelPath}`);
  }
}

function normalizeCliPath(path: string): string {
  return sep === "\\" ? path : path.replace(/\\/g, sep);
}

function assertInputFile(path: string): void {
  if (!existsSync(path)) {
    throw new Error(`Input MusicXML does not exist: ${path}`);
  }
  if (!statSync(path).isFile()) {
    throw new Error(`Input MusicXML is not a file: ${path}`);
  }
}

function prepareOutputFile(path: string): void {
  if (existsSync(path) && statSync(path).isDirectory()) {
    throw new Error(`Output path is a directory, expected file: ${path}`);
  }

  const parent = dirname(path);
  if (!parent || parent === ".") return;

  if (existsSync(parent)) {
    if (!statSync(parent).isDirectory()) {
      throw new Error(`Output parent exists but is not a directory: ${parent}`);
    }
    return;
  }

  mkdirSync(parent, { recursive: true });
}

function prepareTimingLabelDirectory(fullLabelPath: string): void {
  const fullDir = dirname(fullLabelPath);
  if (basename(fullDir).toLowerCase() !== "full") return;

  const timingDir = join(dirname(fullDir), "timing");
  if (existsSync(timingDir)) {
    if (!statSync(timingDir).isDirectory()) {
      throw new Error(`Timing label path exists but is not a directory: ${timingDir}`);
    }
    return;
  }

  mkdirSync(timingDir, { recursive: true });
}

function usage(): string {
  return [
    "usage: musicXMLtoLabel [--omit-ghost] [--quiet] [--no-svg] <input.musicxml> <full.lab> <mono.lab>",
    "",
    "Drop-in NEUTRINO musicXMLtoLabel substitute.",
  ].join("\n");
}

export async function main(argv: string[]): Promise<void> {
  try {
    await runMusicXmlToLabelAsync(parseMusicXmlToLabelArgs(argv));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (import.meta.main) {
  void main(process.argv.slice(2));
}
