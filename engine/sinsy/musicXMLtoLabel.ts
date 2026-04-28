#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, sep } from "node:path";
import { SinsyLabelPipeline } from "./index.ts";

export interface MusicXmlToLabelArgs {
  inputPath: string;
  fullLabelPath: string;
  monoLabelPath: string;
}

export function parseMusicXmlToLabelArgs(argv: string[]): MusicXmlToLabelArgs {
  const args = argv.filter((arg) => arg !== "--");
  if (args.length !== 3 || args.includes("-h") || args.includes("--help")) {
    throw new Error(usage());
  }

  return {
    inputPath: args[0]!,
    fullLabelPath: args[1]!,
    monoLabelPath: args[2]!,
  };
}

export function runMusicXmlToLabel(args: MusicXmlToLabelArgs): void {
  const inputPath = normalizeCliPath(args.inputPath);
  const fullLabelPath = normalizeCliPath(args.fullLabelPath);
  const monoLabelPath = normalizeCliPath(args.monoLabelPath);

  assertInputFile(inputPath);
  prepareOutputFile(fullLabelPath);
  prepareOutputFile(monoLabelPath);

  console.error(`Convert MusicXML to label -> ${inputPath}`);
  const xml = readFileSync(inputPath, "utf8");
  const result = new SinsyLabelPipeline().serialize(xml, inputPath);

  writeFileSync(fullLabelPath, result.full, "utf8");
  writeFileSync(monoLabelPath, result.mono, "utf8");

  console.error(`output full label -> ${fullLabelPath}`);
  console.error(`output mono label -> ${monoLabelPath}`);
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

function usage(): string {
  return [
    "usage: musicXMLtoLabel <input.musicxml> <full.lab> <mono.lab>",
    "",
    "Drop-in NEUTRINO musicXMLtoLabel substitute.",
  ].join("\n");
}

export async function main(argv: string[]): Promise<void> {
  try {
    runMusicXmlToLabel(parseMusicXmlToLabelArgs(argv));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (import.meta.main) {
  void main(process.argv.slice(2));
}
