/**
 * Pure label plugin for Amadeus (and other hosts that own FS).
 *
 * `transcribe(xmlBytes) → { full, mono }` — no SVG, player, phrase sidecars, or node:fs.
 * NEUTRINO keeps `rule-api.ts` → `bin/rule.js` with side effects.
 */
import { SinsyLabelPipeline } from "../index.ts";
import { isXml, talkaloidToLabel } from "../lab/talkaloid.ts";

export type LabelResult = { mono: string; full: string };

export function transcribe(
  content: Uint8Array | string,
  sourceName = "score.musicxml",
): LabelResult {
  const text = typeof content === "string" ? content : new TextDecoder().decode(content);
  if (!isXml(text)) {
    return talkaloidToLabel(text);
  }
  return new SinsyLabelPipeline({ quiet: true, noSvg: true }).serialize(text, sourceName);
}

/** Alias so hosts that expect the NEUTRINO name still work. */
export const transcribeWithOverrides = transcribe;
