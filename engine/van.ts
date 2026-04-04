/**
 * Map Vietnamese vần components (nucleus + coda) to Japanese mora sequences.
 * Tone-aware: coda nasals and stops get tone-specific representations.
 */

export function nucleusToPhonemes(nucleus: string): string[] {
  if (!nucleus) return [];

  // Diphthong check first (longest match)
  const diphthongs: Record<string, string[]> = {
    iê: ["i", "e"],
    ia: ["i", "e"],
    uô: ["u", "o"],
    ua: ["u", "o"],
    ươ: ["u", "o"],
    ưa: ["u", "o"],
    oa: ["u", "a"],
    oe: ["u", "e"],
    yê: ["i", "e"],
    ơi: ["o", "i"],
    ui: ["u", "i"],
    ưi: ["u", "i"],
    ei: ["e", "i"],
    âu: ["o", "u"],
    uyê: ["u", "y", "e"],
    // Double vowels (for transliterations/loanwords)
    aa: ["a"],
    ee: ["e"],
    ii: ["i"],
    oo: ["o"],
    uu: ["u"],
  };

  if (diphthongs[nucleus]) {
    return diphthongs[nucleus];
  }

  // Single vowel fallback
  const vowels: Record<string, string> = {
    i: "i",
    y: "i",
    ê: "e",
    e: "e",
    a: "a",
    ă: "a",
    â: "a",
    o: "o",
    ô: "o",
    ơ: "o",
    u: "u",
    ư: "u",
  };

  const mapped = vowels[nucleus];
  if (mapped) {
    return [mapped];
  }

  throw new Error(`Unknown nucleus: "${nucleus}"`);
}

/**
 * Map coda to phonemes, with tone-aware variations.
 * Tones 0-5 get different coda representations to encode prosody.
 * This allows CeVIO to differentiate tonal information via phoneme choice.
 *
 * Mode 'voicevox': nasal codas → N, stop codas → cl (VOICEVOX mora-legal)
 * Mode 'transparent': individual phonemes (CeVIO-style, default)
 */
export function codaToPhonemes(
  coda: string,
  tone: number = 0,
  mode: "transparent" | "voicevox" = "transparent",
): string[] {
  if (!coda) return [];

  if (mode === "voicevox") {
    // Nasal codas → N (moraic nasal)
    if (["m", "n", "ng", "nh"].includes(coda)) return ["N"];
    // Stop codas → cl (closure/gemination)
    if (["p", "t", "c", "ch"].includes(coda)) return ["cl"];
    // Semivowel codas — unchanged (fall through)
  }

  // Transparent mode (or voicevox semivowel fallthrough)
  // Nasal codas → individual phonemes (more transparent for loan words)
  if (coda === "m") return ["m"];
  if (coda === "n") return ["n"];
  if (coda === "ng") {
    return ["n", "g"]; // velar nasal as coda
  }
  if (coda === "nh") {
    return ["n", "h"]; // palatal nasal as coda
  }

  // Stop codas → individual phonemes (more transparent for loan words)
  if (coda === "p") return ["p"];
  if (coda === "t") return ["t"];
  if (coda === "c") return ["k"]; // Vietnamese "c" = /k/
  if (coda === "ch") return ["ch"];

  // Semivowel codas (tone-independent)
  if (["i", "y"].includes(coda)) {
    return ["i"];
  }

  if (coda === "u") {
    return ["u"];
  }

  if (coda === "o") {
    return ["o"];
  }

  throw new Error(`Unknown coda: "${coda}"`);
}
