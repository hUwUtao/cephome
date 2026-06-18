import { canonicalizeVietnamese } from "../../vmora/normalize.ts";
import { DEFAULT_VIETNAMESE_METADATA, metadataForLyric } from "../mxl/vietnamese-metadata.ts";
import { VietnameseMoraPlanTranspiler } from "./mora-plan.ts";
import { formatPhoneUnit, formatSimplePhoneGroups, parsePhoneGroups } from "./phone-plan.ts";
import type { VietnameseDictionaryEntries } from "../dict/dictionary.ts";
import type { PhonePlanParseOptions } from "./phone-plan.ts";
import type {
  ScoreDocument,
  ScoreNote,
  TimedPhonePlan,
  VietnameseSyllableMetadata,
} from "./types.ts";

export function parseLyricOverride(
  text: string,
  metadata: VietnameseSyllableMetadata = DEFAULT_VIETNAMESE_METADATA,
): TimedPhonePlan[] | null {
  if (!text.includes("|")) return null;
  const groups = text
    .split("|")
    .map((g) => g.trim())
    .filter(Boolean);
  if (groups.length < 2) return null;
  const parsed = parsePhoneGroups(groups, metadata, "lyric-override");
  return parsed.plan.length > 0 ? parsed.plan : null;
}

interface LyricPhrase {
  index: number;
  text: string;
  notes: ScoreNote[];
}

export interface PhraseOverrideDictionary {
  entries: VietnameseDictionaryEntries;
  warnings: string[];
  applied: number;
}

export function buildPhraseOverrideText(
  score: ScoreDocument,
  transpiler = new VietnameseMoraPlanTranspiler(),
): string {
  const lines = [
    "# cephome pronunciation dictionary v1",
    "# Format: word pre | nucleus | tail",
    "# [] marks ghost/compressed phones. Run with --omit-ghost to drop bracketed phones.",
    "# !N sets velocity. Tailing / \\ ? ~ . is accepted as a tone hint.",
    "# Example: khiên k h | i [w] e | n",
    "",
  ];
  const emitted = new Set<string>();

  for (const phrase of collectLyricPhrases(score)) {
    lines.push(`# [${phrase.index}] ${phrase.text}`);
    for (const note of phrase.notes) {
      if (!note.lyric) continue;
      const key = dictionaryKey(note.lyric);
      if (!key || emitted.has(key)) continue;
      emitted.add(key);
      lines.push(`${note.lyric} ${formatGeneratedUnit(note, transpiler)}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function phraseOverrideDictionaryFromText(
  _score: ScoreDocument,
  text: string,
  options: PhonePlanParseOptions = {},
): PhraseOverrideDictionary {
  const entries: VietnameseDictionaryEntries = {};
  const warnings: string[] = [];
  let applied = 0;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const parsed = parseDictionaryLine(line, options);
    if (!parsed) {
      warnings.push(`override: invalid dictionary line "${line}"`);
      continue;
    }
    warnings.push(...parsed.warnings);
    if (parsed.unit.length === 0) continue;
    const previous = entries[parsed.key];
    if (previous && previous !== parsed.unit) {
      warnings.push(`${parsed.lyric}: duplicate dictionary override, later entry wins`);
    }
    entries[parsed.key] = parsed.unit;
    applied++;
  }

  return { entries, warnings, applied };
}

export function collectLyricPhrases(score: ScoreDocument): LyricPhrase[] {
  const phrases: LyricPhrase[] = [];
  let current: ScoreNote[] = [];

  const flush = (): void => {
    if (current.length === 0) return;
    const index = phrases.length + 1;
    phrases.push({
      index,
      text: current
        .map((note) => note.lyric)
        .filter(Boolean)
        .join(" "),
      notes: current,
    });
    current = [];
  };

  for (const note of score.notes) {
    if (note.isRest) {
      flush();
      continue;
    }
    if (note.lyric) current.push(note);
    if (note.hasBreath) flush();
  }
  flush();

  return phrases;
}

function formatGeneratedUnit(note: ScoreNote, transpiler: VietnameseMoraPlanTranspiler): string {
  if (!note.lyric) return "pau@breath*1";
  return formatSimplePhoneGroups(transpiler.plan(note.lyric).plan);
}

function dictionaryKey(lyric: string): string {
  return canonicalizeVietnamese(lyric).toLowerCase();
}

function parseDictionaryLine(
  line: string,
  options: PhonePlanParseOptions,
): { key: string; lyric: string; unit: string; warnings: string[] } | null {
  const groups = line.split("|").map((group) => group.trim());
  if (groups.length < 2) return null;

  const firstGroupTokens = groups[0]!.split(/[,\s]+/).filter(Boolean);
  const lyric = firstGroupTokens.shift();
  if (!lyric) return null;
  const key = dictionaryKey(lyric);
  if (!key) return null;

  const parsed = parsePhoneGroups(
    [firstGroupTokens.join(" "), ...groups.slice(1)],
    metadataForLyric(lyric),
    `dictionary:${lyric}`,
    options,
  );
  return {
    key,
    lyric,
    unit: parsed.plan.length === 0 ? "" : formatPhoneUnit(parsed.plan),
    warnings: parsed.warnings,
  };
}
