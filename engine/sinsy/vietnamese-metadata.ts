import { extractTone } from "../normalize.ts";
import { segmentSyllable } from "../segment.ts";
import type {
  CodaClass,
  NucleusClass,
  PhonationClass,
  RhymeClass,
  VietnameseSyllableMetadata,
} from "./types.ts";

export const VOWEL_SIGNATURES: Record<string, number> = {
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

export const DEFAULT_VIETNAMESE_METADATA: VietnameseSyllableMetadata = {
  tone: 0,
  vowelSign: 0,
  nucleusClass: "none",
  codaClass: "none",
  rhymeClass: "open",
  phonation: "modal",
  glottalization: 0,
  codaTransition: 0,
};

export function metadataForLyric(lyric: string): VietnameseSyllableMetadata {
  const tone = extractTone(lyric);
  try {
    const parsed = segmentSyllable(lyric);
    const codaClass = classifyCoda(parsed.coda);
    return {
      tone,
      vowelSign: VOWEL_SIGNATURES[parsed.nucleus] ?? 0,
      nucleusClass: classifyNucleus(parsed.nucleus),
      codaClass,
      rhymeClass: rhymeForCoda(codaClass),
      phonation: phonationForTone(tone, codaClass),
      glottalization: glottalizationForTone(tone, codaClass),
      codaTransition: codaTransitionForCoda(codaClass),
    };
  } catch {
    return {
      ...DEFAULT_VIETNAMESE_METADATA,
      tone,
      vowelSign: fallbackVowelSign(lyric),
    };
  }
}

export function encodeVietnameseMetadata(metadata: VietnameseSyllableMetadata): string {
  return `${metadata.tone}|${metadata.vowelSign}`;
}

export function encodeVietnameseResearchMetadata(metadata: VietnameseSyllableMetadata): string {
  return [
    metadata.tone,
    metadata.vowelSign,
    codeRhyme(metadata.rhymeClass),
    codeCoda(metadata.codaClass),
    codeNucleus(metadata.nucleusClass),
    codePhonation(metadata.phonation),
    metadata.glottalization,
    metadata.codaTransition,
  ].join("|");
}

function classifyNucleus(nucleus: string): NucleusClass {
  const phones = VOWEL_SIGNATURES[nucleus] ? nucleus.length : 0;
  if (phones >= 3) return "triphthong";
  if (phones === 2) return "diphthong";
  if (phones === 1) return "single";
  return "none";
}

function classifyCoda(coda: string): CodaClass {
  if (!coda) return "none";
  if (["i", "y", "u", "o"].includes(coda)) return "glide";
  if (["m", "n", "ng", "nh"].includes(coda)) return "nasal";
  if (["p", "t", "c", "ch"].includes(coda)) return "stop";
  return "none";
}

function rhymeForCoda(codaClass: CodaClass): RhymeClass {
  if (codaClass === "stop") return "checked";
  if (codaClass === "nasal") return "nasal";
  if (codaClass === "glide") return "glide";
  return "open";
}

function phonationForTone(tone: number, codaClass: CodaClass): PhonationClass {
  if (codaClass === "stop") return "checked";
  if (tone === 4) return "glottalized";
  if (tone === 5) return "creaky";
  return "modal";
}

function glottalizationForTone(tone: number, codaClass: CodaClass): number {
  if (codaClass === "stop") return 1;
  if (tone === 4) return 2;
  if (tone === 5) return 3;
  return 0;
}

function codaTransitionForCoda(codaClass: CodaClass): number {
  if (codaClass === "stop") return 3;
  if (codaClass === "nasal") return 2;
  if (codaClass === "glide") return 1;
  return 0;
}

function fallbackVowelSign(lyric: string): number {
  const nucleusMatch = lyric.normalize("NFD").match(/[aăâeêoôơuyưi]+/);
  const nucleus = nucleusMatch ? nucleusMatch[0]!.normalize("NFC") : "";
  return VOWEL_SIGNATURES[nucleus] ?? 0;
}

function codeRhyme(value: RhymeClass): number {
  if (value === "glide") return 1;
  if (value === "nasal") return 2;
  if (value === "checked") return 3;
  return 0;
}

function codeCoda(value: CodaClass): number {
  if (value === "glide") return 1;
  if (value === "nasal") return 2;
  if (value === "stop") return 3;
  return 0;
}

function codeNucleus(value: NucleusClass): number {
  if (value === "single") return 1;
  if (value === "diphthong") return 2;
  if (value === "triphthong") return 3;
  return 0;
}

function codePhonation(value: PhonationClass): number {
  if (value === "creaky") return 1;
  if (value === "glottalized") return 2;
  if (value === "checked") return 3;
  return 0;
}
