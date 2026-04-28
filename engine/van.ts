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
  const phonemes =
    mode === "voicevox" ? voicevoxCodaToPhonemes(coda) : transparentCodaToPhonemes(coda);
  const hasStopCoda = ["p", "t", "c", "ch"].includes(coda);

  if ((tone === 4 || tone === 5) && !hasStopCoda && !phonemes.includes("cl")) {
    phonemes.push("cl");
  }

  return phonemes;
}

function transparentCodaToPhonemes(coda: string): string[] {
  const phonemes: string[] = [];
  if (coda === "m") phonemes.push("m");
  else if (coda === "n") phonemes.push("n");
  else if (coda === "ng") phonemes.push("n", "g");
  else if (coda === "nh") phonemes.push("n", "h");
  else if (coda === "p") phonemes.push("p");
  else if (coda === "t") phonemes.push("t");
  else if (coda === "c") phonemes.push("k");
  else if (coda === "ch")
    phonemes.push("k"); // ch coda -> k
  else if (["i", "y"].includes(coda)) phonemes.push("i");
  else if (coda === "u") phonemes.push("u");
  else if (coda === "o") phonemes.push("o");
  return phonemes;
}

function voicevoxCodaToPhonemes(coda: string): string[] {
  if (["m", "n", "ng", "nh"].includes(coda)) return ["N"];
  if (["p", "t", "c", "ch"].includes(coda)) return ["cl"];
  if (["i", "y"].includes(coda)) return ["i"];
  if (coda === "u") return ["u"];
  if (coda === "o") return ["o"];
  return [];
}
