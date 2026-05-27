import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";

type PhraseOverrideReader = () => Promise<string> | string;
type PhraseOverrideWriter = (content: string) => Promise<string> | string;
type GlobalCallable = (...args: string[]) => Promise<string> | string;

export function unwrapGlobalFunc<F extends GlobalCallable>(identifier: string): NonNullable<F> {
  const value: unknown = Reflect.get(globalThis, identifier);
  if (typeof value !== "function") throw new Error(`${identifier} is not supported`);
  return value as NonNullable<F>;
}

export async function readGlobalPhraseOverride(): Promise<string | null> {
  try {
    const read = unwrapGlobalFunc<PhraseOverrideReader>("read_phrase_override");
    return await read();
  } catch {
    return null;
  }
}

export async function writeGlobalPhraseOverride(content: string): Promise<boolean> {
  try {
    const write = unwrapGlobalFunc<PhraseOverrideWriter>("write_phrase_override");
    await write(content);
    return true;
  } catch {
    return false;
  }
}

export function installPhraseOverrideHooks(
  inputPath: string,
  omitGhost: boolean,
  quiet: boolean,
  noSvg: boolean,
  noPlayer = false,
): () => void {
  const path = `${inputPath}.override.txt`;
  const previousRead: unknown = Reflect.get(globalThis, "read_phrase_override");
  const previousWrite: unknown = Reflect.get(globalThis, "write_phrase_override");
  const previousOmitGhost: unknown = Reflect.get(globalThis, "omit_phrase_ghost");
  const previousQuiet: unknown = Reflect.get(globalThis, "quiet");
  const previousNoSvg: unknown = Reflect.get(globalThis, "no_svg");
  const previousNoPlayer: unknown = Reflect.get(globalThis, "no_player");

  Reflect.set(globalThis, "omit_phrase_ghost", omitGhost);
  Reflect.set(globalThis, "quiet", quiet);
  Reflect.set(globalThis, "no_svg", noSvg);
  Reflect.set(globalThis, "no_player", noPlayer);

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
    restoreGlobal("quiet", previousQuiet);
    restoreGlobal("no_svg", previousNoSvg);
    restoreGlobal("no_player", previousNoPlayer);
  };
}

function restoreGlobal(identifier: string, value: unknown): void {
  if (value === undefined) {
    Reflect.deleteProperty(globalThis, identifier);
    return;
  }
  Reflect.set(globalThis, identifier, value);
}
