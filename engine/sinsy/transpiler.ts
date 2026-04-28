import { transcribeSyllableWithError } from "../index.ts";
import type { LyricTranspilation, LyricTranspiler } from "./types.ts";
import { validateSinsyPhones } from "./phoneme.ts";
import { DEFAULT_VIETNAMESE_METADATA, metadataForLyric } from "./vietnamese-metadata.ts";

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

    const metadata = metadataForLyric(lyric);

    return {
      source: lyric,
      phones: phones.filter((phone) => !invalid.includes(phone)),
      tone: metadata.tone,
      vowelSign: metadata.vowelSign,
      metadata,
      warnings,
    };
  }
}

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
      metadata: DEFAULT_VIETNAMESE_METADATA,
      warnings: invalid.map((phone) => `${lyric}: unsupported Sinsy phone "${phone}"`),
    };
  }
}
