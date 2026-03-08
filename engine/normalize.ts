/**
 * Normalize Vietnamese text for consistent processing.
 * - Lowercase
 * - NFD (decompose combining marks)
 * - Strip tone marks (U+0300–U+0309)
 * - Keep vowel quality diacritics (ă â ê ô ơ ư đ)
 * - NFC (recompose)
 */

export function normalizeSyllable(s: string): string {
  if (!s) return "";

  // Lowercase
  let result = s.toLowerCase();

  // NFD: decompose combining marks
  result = result.normalize("NFD");

  // Strip tone marks (Vietnamese tone marks are U+0300–U+0309 and U+0323)
  // Keep vowel quality diacritics: ă (0103), â (0103 + 0302), ê (0040 + 0302), etc.
  // Tone marks to remove: grave (0300), acute (0301), question (0309), tilde (0303), dot-below (0323)
  result = result.replace(/[\u0300\u0301\u0303\u0309\u0323]/g, "");

  // NFC: recompose (stabilize the string)
  result = result.normalize("NFC");

  return result;
}

/**
 * Extract tone from a Vietnamese syllable (for future prosody work).
 * Returns 0-5.
 */
export function extractTone(s: string): number {
  if (!s) return 0;

  // Normalize to NFD to expose combining marks
  const nfd = s.normalize("NFD");

  // Check for tone marks (Vietnamese tone diacritics)
  for (const char of nfd) {
    if (char === "\u0300") return 1; // grave (huyền, low falling) → 1
    if (char === "\u0301") return 2; // acute (sắc, high rising) → 2
    if (char === "\u0303") return 4; // tilde (ngã, rising) → 4
    if (char === "\u0309") return 3; // hook-above (hỏi, question) → 3
    if (char === "\u0323") return 5; // dot-below (nặng, heavy) → 5
  }

  return 0; // level tone (unmarked) → 0
}
