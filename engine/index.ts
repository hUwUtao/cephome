/**
 * Vietnamese → CeVIO Mora Transcription Engine
 * Public API for text-to-CeVIO-phoneme conversion.
 * 
 * Handles:
 * - Alphabet Vietnamese text
 * - Ignores punctuation & numbers (placeholder for numbers)
 * - Tone-aware coda variations (N vs n vs N,j etc)
 * - Error-tolerant: failed conversions replaced with placeholder
 */

import type { ParsedSyllable, TranscribeResult } from "./types.ts";
import { segmentSyllable, segmentWord } from "./segment.ts";
import { onsetToPhonemes } from "./onset.ts";
import { nucleusToPhonemes, codaToPhonemes } from "./van.ts";
import { filterValidPhonemes } from "./validate.ts";
import { extractTone } from "./normalize.ts";

/**
 * Clean text: keep alphabet and Vietnamese diacritics
 * Numbers and non-Vietnamese characters become word separators (spaces)
 * Linebreaks treated as word separators (converted to spaces)
 */
function cleanText(text: string): string {
  return text
    .split("")
    .map((char) => {
      const code = char.charCodeAt(0);
      // Basic ASCII letters
      const isAlpha = (code >= 65 && code <= 90) || (code >= 97 && code <= 122); // A-Z, a-z
      // Vietnamese accented vowels: à á ả ã ạ ă ằ ắ ẳ ẵ ặ â ầ ấ ẩ ẫ ậ đ etc
      // Latin-1 Supplement (U+0080-U+00FF): à á â ã ä å ç è é ê ë ì í î ï ð ñ ò ó ô õ ö ø ù ú û ü ý þ ÿ
      // Latin Extended-A (U+0100-U+017F): ā ă ą ć etc
      // Latin Extended-B (U+0180-U+024F): ơ ư etc
      // Include Latin-1 Supplement, Extended-A, Extended-B, and Latin Extended Additional
      const isVietnamese = code >= 192 && code <= 0x1EFF; // U+00C0 to U+1EFF
      const isSpace = char === " " || char === "\n" || char === "\r" || char === "\t";

      if (isAlpha || isVietnamese) return char;
      if (isSpace) return " ";
      // Non-Vietnamese characters (punctuation, numbers, etc.) become separators
      return " ";
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Transcribe result with optional error info
 */
export interface TranscribeSyllableResult {
  phonemes: string;
  error?: string;
}

/**
 * Transcribe a single Vietnamese syllable to CeVIO phoneme string.
 * Returns comma-separated phoneme symbols + optional error info.
 * Error-tolerant: returns error reason instead of throwing.
 *
 * @example transcribeSyllable("kiên") → { phonemes: "k,i,e,N,j" }
 * @example transcribeSyllable("xyz") → { phonemes: "", error: "no vowel found" }
 */
export function transcribeSyllableWithError(
  syl: string
): TranscribeSyllableResult {
  try {
    const parsed = segmentSyllable(syl);
    const phonemes = syllableToPhonemes(parsed);
    // Filter out any invalid phonemes
    const validPhonemes = filterValidPhonemes(phonemes);
    return { phonemes: validPhonemes.join(",") };
  } catch (err) {
    const reason =
      err instanceof Error ? err.message.toLowerCase() : "unknown error";
    return { phonemes: "", error: reason };
  }
}

/**
 * Legacy: simple version without error info
 */
export function transcribeSyllable(syl: string): string {
  const result = transcribeSyllableWithError(syl);
  return result.phonemes;
}

/**
 * Transcribe a Vietnamese word (space-free) into per-syllable phoneme strings.
 * Returns array of comma-separated phoneme strings.
 *
 * @example transcribeWord("kiên") → ["k,i,e,N,j"]
 */
export function transcribeWord(word: string): string[] {
  const syllables = segmentWord(word);
  return syllables.map((syl) => transcribeSyllable(syl));
}

/**
 * Transcribe arbitrary Vietnamese text (words separated by spaces or punctuation).
 * Returns structured result with per-word, per-syllable phoneme mappings.
 * Failed syllables show placeholder error message.
 *
 * @example transcribe("kiên phương") → { input: "kiên phương", lines: [...] }
 */
export function transcribe(text: string): TranscribeResult {
  const cleaned = cleanText(text);
  const words = cleaned.split(/\s+/).filter((w) => w.length > 0);

  const lines = words.map((word) => ({
    word,
    syllables: segmentWord(word).map((syl) => {
      const tone = extractTone(syl);
      const result = transcribeSyllableWithError(syl);

      return {
        raw: syl,
        phonemes: result.phonemes || `-- ${syl}: ${result.error} --`,
        tone,
        toneMark: "",
      };
    }),
  }));

  return {
    input: text,
    lines,
  };
}

/**
 * Transcribe text and return a flat, UI-friendly string.
 * One line per word; syllables joined by "|"; phonemes joined by ",".
 * Toneless output, but tone information is encoded in coda phonemes.
 * Invalid syllables show placeholder errors.
 *
 * @example transcribeText("kiên phương")
 * → "k,i,e,N,j|f,w,o,N"
 */
export function transcribeText(text: string): string {
  const result = transcribe(text);
  return result.lines
    .map((line) => line.syllables.map((s) => s.phonemes).join("|"))
    .join("\n");
}

/**
 * Convert a parsed syllable to CeVIO phoneme tokens.
 * Internal helper used by transcribeSyllable.
 * Tone-aware: passes tone to coda mapping for prosodic encoding.
 */
function syllableToPhonemes(parsed: ParsedSyllable): string[] {
  const phonemes: string[] = [];

  // Onset
  phonemes.push(...onsetToPhonemes(parsed.onset));

  // Medial w (labialized on-glide)
  if (parsed.medial === "w") {
    phonemes.push("w");
  }

  // Nucleus (vowel complex)
  phonemes.push(...nucleusToPhonemes(parsed.nucleus));

  // Coda (tone-aware: different representations per tone)
  phonemes.push(...codaToPhonemes(parsed.coda, parsed.tone));

  return phonemes;
}

// Export types for downstream use
export type { ParsedSyllable, TranscribeResult };
