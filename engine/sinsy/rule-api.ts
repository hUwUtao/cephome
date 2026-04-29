import { SinsyLabelPipeline } from "./index.ts";
import { buildPhraseOverrideText } from "./phrase-override.ts";
import { readGlobalPhraseOverride, writeGlobalPhraseOverride } from "./phrase-override-hooks.ts";

/**
 * Environment-neutral entry point for Vietnamese transcription.
 * Consumes MusicXML bytes and yields two label strings.
 */
export function transcribe(
  xmlBytes: Uint8Array,
  sourceName?: string,
): { full: string; mono: string } {
  const xml = new TextDecoder("utf-8").decode(xmlBytes);
  const pipeline = new SinsyLabelPipeline();
  return pipeline.serialize(xml, sourceName);
}

export async function transcribeWithOverrides(
  xmlBytes: Uint8Array,
  sourceName?: string,
): Promise<{ full: string; mono: string }> {
  const xml = new TextDecoder("utf-8").decode(xmlBytes);
  const phraseOverrideText = await readGlobalPhraseOverride();
  const pipeline = new SinsyLabelPipeline({
    phraseOverrideText,
    phraseOverrideOptions: { omitGhost: readGlobalOmitGhost() },
  });
  const result = pipeline.serializeTrace(xml, sourceName);
  if (!phraseOverrideText?.trim()) {
    await writeGlobalPhraseOverride(buildPhraseOverrideText(result.score));
  }
  return {
    full: result.full,
    mono: result.mono,
  };
}

function readGlobalOmitGhost(): boolean {
  return Reflect.get(globalThis, "omit_phrase_ghost") === true;
}
