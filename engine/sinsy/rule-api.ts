import { SinsyLabelPipeline } from "./index.ts";
import { buildPhraseOverrideText } from "./phrase-override.ts";
import { readGlobalPhraseOverride, writeGlobalPhraseOverride } from "./phrase-override-hooks.ts";
import { flatTtsToLabel } from "./flat-tts.ts";

function isXml(content: string): boolean {
  const trimmed = content.trim();
  return (
    trimmed.startsWith("<?xml") ||
    trimmed.startsWith("<score-partwise") ||
    trimmed.startsWith("<score-timewise")
  );
}

/**
 * Environment-neutral entry point for Vietnamese transcription.
 * Consumes MusicXML or plain text bytes and yields two label strings.
 */
export function transcribe(
  xmlBytes: Uint8Array,
  sourceName?: string,
): { full: string; mono: string } {
  const content = new TextDecoder("utf-8").decode(xmlBytes);
  if (!isXml(content)) {
    return flatTtsToLabel(content);
  }
  const pipeline = new SinsyLabelPipeline();
  return pipeline.serialize(content, sourceName);
}

export async function transcribeWithOverrides(
  xmlBytes: Uint8Array,
  sourceName?: string,
): Promise<{ full: string; mono: string }> {
  const content = new TextDecoder("utf-8").decode(xmlBytes);
  if (!isXml(content)) {
    return flatTtsToLabel(content);
  }
  const phraseOverrideText = await readGlobalPhraseOverride();
  const pipeline = new SinsyLabelPipeline({
    phraseOverrideText,
    phraseOverrideOptions: { omitGhost: readGlobalOmitGhost() },
  });
  const result = pipeline.serializeTrace(content, sourceName);
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
