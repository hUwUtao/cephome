import type { ParsedSyllable } from "./types.ts";
import { normalizeSyllable, extractTone } from "./normalize.ts";

const ONSET_LIST = [
  "ngh",
  "ng",
  "nh",
  "ch",
  "tr",
  "th",
  "ph",
  "kh",
  "gi",
  "gh",
  "qu",
  "b",
  "c",
  "d",
  "đ",
  "g",
  "h",
  "k",
  "l",
  "m",
  "n",
  "p",
  "r",
  "s",
  "t",
  "v",
  "x",
];

const CODA_LIST = ["ng", "nh", "ch", "m", "n", "p", "t", "c", "i", "y", "o", "u"];

export function segmentSyllable(raw: string): ParsedSyllable {
  const tone = extractTone(raw);
  const normalized = normalizeSyllable(raw);

  if (!normalized) {
    throw new Error(`Cannot segment empty syllable (input: "${raw}")`);
  }

  let remaining = normalized;

  // Match longest onset
  let onset = "";
  for (const cand of ONSET_LIST) {
    if (remaining.startsWith(cand)) {
      onset = cand;
      remaining = remaining.slice(cand.length);
      break;
    }
  }

  // Detect medial w: only for certain onsets that support labialized vowels
  // qu, h, x, ph can be followed by u/ư/o/ô to form medial w
  let medial = "";
  if (onset === "qu") {
    medial = "w";  // qu → [k] + medial w
  } else if (["h", "x", "ph", "kh", "th"].includes(onset) && remaining && remaining.length > 1) {
    // Check if next char is u/ư/o/ô (glide-start)
    const firstChar: string = remaining[0] as string;
    if (["u", "ư", "o", "ô"].includes(firstChar)) {
      const afterGlide: string = remaining[1] as string;
      // Only mark as medial if followed by a vowel
      if (afterGlide && "aeiouăâêôơư".includes(afterGlide)) {
        medial = "w";
        remaining = remaining.slice(1);
      }
    }
  }

  // Match longest coda (but ensure nucleus remains and don't break diphthongs)
  let coda = "";
  for (const cand of CODA_LIST) {
    if (remaining.endsWith(cand)) {
      const potentialNucleus = remaining.slice(0, -cand.length);

      const isSemivowelCoda = ["i", "y", "o", "u"].includes(cand);
      if (isSemivowelCoda) {
        // Semivowel codas need a vowel before them
        if (!potentialNucleus) continue;

        // Don't break up known diphthongs
        // Check if nucleus + candidate would form a recognized diphthong
        const diphthongs = ["iê", "ia", "uô", "ua", "ươ", "ưa", "oa", "oe", "yê", "ơi", "ui", "ưi", "ei"];
        const wouldFormDiphthong = diphthongs.includes(potentialNucleus + cand);
        if (wouldFormDiphthong) continue; // Keep as diphthong, don't split off coda
      }

      coda = cand;
      remaining = potentialNucleus;
      break;
    }
  }

  // Remainder is nucleus
  const nucleus = remaining;

  if (!nucleus) {
    throw new Error(
      `Segmentation failed: no vowel in syllable "${raw}". Parsed: onset="${onset}" medial="${medial}" coda="${coda}"`
    );
  }

  return {
    raw,
    onset,
    medial,
    nucleus,
    coda,
    tone,
  };
}

/**
 * Segment a word (no spaces) into syllables.
 * NOTE: This is a simplified heuristic that works for single syllables.
 * For multi-syllable words without spaces, just return the whole word.
 * Proper word segmentation requires linguistic knowledge beyond simple rules.
 */
export function segmentWord(word: string): string[] {
  const normalized = normalizeSyllable(word);
  if (!normalized) return [];

  // For now, try to segment by looking for vowel patterns.
  // This is best-effort; for reliable segmentation, input should be pre-segmented.
  const syllables: string[] = [];
  let current = "";
  let vowelCount = 0;

  for (let i = 0; i < normalized.length; i++) {
    const char: string = normalized[i] as string;

    current += char;

    // Count vowels to detect syllable boundaries
    if ("aeiouăâêôơư".includes(char)) {
      vowelCount++;
    }

    // Heuristic: syllable might end when we see a consonant cluster or specific codas
    // after a vowel. This is very imprecise.
    // A better approach: wait for a known coda after the vowel, or...
    // For now, just return the whole word to avoid over-splitting.
  }

  // If we couldn't identify boundaries, just return the whole normalized word as one
  if (current) {
    syllables.push(current);
  }

  return syllables.length > 0 ? syllables : [normalized];
}
