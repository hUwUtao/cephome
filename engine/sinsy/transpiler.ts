import { transcribeSyllableWithError } from "../index.ts";
import { extractTone } from "../normalize.ts";
import type { LyricTranspilation, LyricTranspiler } from "./types.ts";
import { validateSinsyPhones } from "./phoneme.ts";

export class VietnameseSinsyLyricTranspiler implements LyricTranspiler {
  constructor(private readonly mode: "transparent" | "voicevox" = "voicevox") {}

  transpile(lyric: string): LyricTranspilation {
    const result = transcribeSyllableWithError(lyric, this.mode);
    const phones = result.phonemes ? result.phonemes.split(",").filter(Boolean) : [];
    const invalid = validateSinsyPhones(phones);
    const warnings = [
      ...(result.error ? [`${lyric}: ${result.error}`] : []),
      ...invalid.map((phone) => `${lyric}: unsupported Sinsy phone "${phone}"`),
    ];

    const tone = extractTone(lyric);

    // Simple heuristic for vowel sign in non-plan mode
    const nucleusMatch = lyric.normalize("NFD").match(/[aăâeêoôơuyưi]+/);
    const nucleus = nucleusMatch ? nucleusMatch[0].normalize("NFC") : "";
    const vowelSign = VOWEL_SIGNATURES_STATIC[nucleus] ?? 0;

    return {
      source: lyric,
      phones: phones.filter((phone) => !invalid.includes(phone)),
      tone,
      vowelSign,
      warnings,
    };
  }
}

const VOWEL_SIGNATURES_STATIC: Record<string, number> = {
  a: 1,
  ă: 2,
  â: 3,
  e: 4,
  ê: 5,
  o: 6,
  ô: 7,
  ơ: 8,
  i: 9,
  y: 9,
  u: 10,
  ư: 11,
  iê: 12,
  ia: 12,
  uô: 13,
  ua: 13,
  ươ: 14,
  ưa: 14,
  oa: 15,
  oe: 15,
  yê: 12,
  uyê: 16,
};

export class LiteralPhoneLyricTranspiler implements LyricTranspiler {
  transpile(lyric: string): LyricTranspilation {
    const phones = lyric
      .split(/[,\s]+/)
      .map((phone) => phone.trim())
      .filter(Boolean);
    const invalid = validateSinsyPhones(phones);
    return {
      source: lyric,
      phones: phones.filter((phone) => !invalid.includes(phone)),
      tone: 0,
      vowelSign: 0,
      warnings: invalid.map((phone) => `${lyric}: unsupported Sinsy phone "${phone}"`),
    };
  }
}
