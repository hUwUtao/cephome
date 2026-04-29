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
