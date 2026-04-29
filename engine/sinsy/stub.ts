import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, sep, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export interface StubArgs {
  inputPath: string;
  fullLabelPath: string;
  monoLabelPath: string;
  omitGhost?: boolean;
}

export interface RuleModule {
  transcribe?: RuleTranscriber;
  transcribeWithOverrides?: RuleTranscriber;
}

type RuleTranscriber = (
  xmlBytes: Uint8Array,
  sourceName?: string,
) => { full: string; mono: string } | Promise<{ full: string; mono: string }>;

export function parseStubArgs(argv: string[]): StubArgs {
  const omitGhost = argv.includes("--omit-ghost");
  const args = argv.filter((arg) => arg !== "--" && arg !== "--omit-ghost");
  if (args.length !== 3 || args.includes("-h") || args.includes("--help")) {
    throw new Error("usage: musicXMLtoLabel [--omit-ghost] <input.musicxml> <full.lab> <mono.lab>");
  }

  return {
    inputPath: args[0]!,
    fullLabelPath: args[1]!,
    monoLabelPath: args[2]!,
    omitGhost,
  };
}

export async function runStub(args: StubArgs): Promise<void> {
  const inputPath = normalizeCliPath(args.inputPath);
  const fullLabelPath = normalizeCliPath(args.fullLabelPath);
  const monoLabelPath = normalizeCliPath(args.monoLabelPath);
  const rulePath = findRulePath();

  if (!rulePath) {
    throw new Error(
      "rule.js not found next to musicXMLtoLabel, next to this stub, or in the current directory",
    );
  }

  assertInputFile(inputPath);
  prepareOutputFile(fullLabelPath);
  prepareOutputFile(monoLabelPath);

  console.error(`Load rule -> ${rulePath}`);
  const restorePhraseOverrideHooks = installPhraseOverrideHooks(inputPath, args.omitGhost === true);
  try {
    const transcribe = await loadRule(rulePath);

    console.error(`Convert MusicXML to label -> ${inputPath}`);
    const xmlBytes = readFileSync(inputPath);
    const result = await transcribe(xmlBytes, inputPath);

    writeFileSync(fullLabelPath, result.full, "utf8");
    writeFileSync(monoLabelPath, result.mono, "utf8");
  } finally {
    restorePhraseOverrideHooks();
  }

  console.error(`output full label -> ${fullLabelPath}`);
  console.error(`output mono label -> ${monoLabelPath}`);
}

export function findRulePath(): string | undefined {
  const explicitPath = process.env.CEPHOME_RULE_PATH;
  if (explicitPath && existsSync(explicitPath)) return normalizeCliPath(explicitPath);

  const exeDir = dirname(process.execPath);
  const stubDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(process.cwd(), "rule.js"),
    join(process.cwd(), "bin", "rule.js"),
    join(exeDir, "rule.js"),
    join(exeDir, "..", "rule.js"),
    join(stubDir, "rule.js"),
    join(stubDir, "..", "rule.js"),
  ];

  return candidates.find((path) => existsSync(path));
}

async function loadRule(rulePath: string): Promise<RuleTranscriber> {
  const module = (await import(pathToFileURL(rulePath).href)) as Partial<RuleModule>;
  const transcribe = module.transcribeWithOverrides ?? module.transcribe;
  if (typeof transcribe !== "function") {
    throw new Error(`${rulePath} does not export transcribe(xmlBytes, sourceName)`);
  }

  return transcribe;
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

function installPhraseOverrideHooks(inputPath: string, omitGhost: boolean): () => void {
  const path = `${inputPath}.override.txt`;
  const previousRead: unknown = Reflect.get(globalThis, "read_phrase_override");
  const previousWrite: unknown = Reflect.get(globalThis, "write_phrase_override");
  const previousOmitGhost: unknown = Reflect.get(globalThis, "omit_phrase_ghost");
  Reflect.set(globalThis, "omit_phrase_ghost", omitGhost);
  Reflect.set(globalThis, "read_phrase_override", async () => {
    try {
      if (!existsSync(path) || !statSync(path).isFile()) return "";
      return readFileSync(path, "utf8");
    } catch {
      return "";
    }
  });
  Reflect.set(globalThis, "write_phrase_override", async (content: string) => {
    try {
      if (!existsSync(path)) writeFileSync(path, content, "utf8");
    } catch {
      // Best-effort sidecar only.
    }
    return path;
  });
  return () => {
    restoreGlobal("read_phrase_override", previousRead);
    restoreGlobal("write_phrase_override", previousWrite);
    restoreGlobal("omit_phrase_ghost", previousOmitGhost);
  };
}

function restoreGlobal(identifier: string, value: unknown): void {
  if (value === undefined) {
    Reflect.deleteProperty(globalThis, identifier);
    return;
  }
  Reflect.set(globalThis, identifier, value);
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  try {
    await runStub(parseStubArgs(argv));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (import.meta.main) {
  void main();
}
