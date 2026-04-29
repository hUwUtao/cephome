import { canonicalizeVietnamese, normalizeSyllable } from "../normalize.ts";
import rawDictionary from "./vietnamese-dictionary.json" with { type: "json" };
import { metadataForLyric } from "./vietnamese-metadata.ts";
import { parsePhoneUnit } from "./phone-plan.ts";
import type { ParsedPhonePlan } from "./phone-plan.ts";

interface VietnameseDictionaryFile {
  version: number;
  entries: Record<string, string | string[]>;
}

const DICTIONARY = rawDictionary as VietnameseDictionaryFile;

export type VietnameseDictionaryEntries = Record<string, string | string[]>;

export function dictionaryPlanForLyric(
  lyric: string,
  entries: VietnameseDictionaryEntries = {},
): ParsedPhonePlan | null {
  const entry = dictionaryEntryForLyric(lyric, entries);
  if (!entry) return null;
  const unit = Array.isArray(entry) ? entry.join(",") : entry;
  return parsePhoneUnit(unit, metadataForLyric(lyric), `dictionary:${lyric}`);
}

function dictionaryEntryForLyric(
  lyric: string,
  entries: VietnameseDictionaryEntries,
): string | string[] | null {
  const canonical = canonicalizeVietnamese(lyric).toLowerCase();
  const normalized = normalizeSyllable(canonical);
  return (
    entries[canonical] ??
    entries[normalized] ??
    DICTIONARY.entries[canonical] ??
    DICTIONARY.entries[normalized] ??
    null
  );
}
