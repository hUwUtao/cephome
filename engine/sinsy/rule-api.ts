import { SinsyLabelPipeline } from "./index.ts";

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
