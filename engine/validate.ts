/**
 * CeVIO Japanese phoneme palette validation.
 * Based on the official CeVIO AI guide phoneme palette.
 */

export const CEVIO_PALETTE = new Set([
  // Vowels
  "a",
  "i",
  "u",
  "e",
  "o",

  // Consonants
  "k",
  "g",
  "s",
  "z",
  "t",
  "d",
  "n",
  "h",
  "f",
  "p",
  "b",
  "m",
  "r",
  "w",
  "y",

  // Palatalized
  "ky",
  "gy",
  "ny",
  "hy",
  "my",
  "py",
  "by",
  "ry",

  // Affricates
  "ch",
  "ts",

  // Special mora
  "N",   // moraic nasal
  "cl",  // closure (gemination/glottal stop)

  // Optional (marginal in Japanese)
  "v",
]);

export interface ValidationResult {
  valid: boolean;
  invalidTokens: string[];
  warnings: string[];
}

export function validatePhonemes(tokens: string[]): ValidationResult {
  const invalidTokens: string[] = [];
  const warnings: string[] = [];

  for (const token of tokens) {
    if (!CEVIO_PALETTE.has(token)) {
      invalidTokens.push(token);
      warnings.push(`Unknown phoneme: "${token}" (skipped)`);
    }
  }

  return {
    valid: invalidTokens.length === 0,
    invalidTokens,
    warnings,
  };
}

/**
 * Filter out invalid phonemes, keeping only CeVIO-compliant ones
 */
export function filterValidPhonemes(tokens: string[]): string[] {
  return tokens.filter((token) => CEVIO_PALETTE.has(token));
}
