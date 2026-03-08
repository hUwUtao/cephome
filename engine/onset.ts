/**
 * Map Vietnamese onset graphemes to CeVIO Japanese phoneme symbols.
 * Follows research.md mapping spec for Northern/Hanoi Vietnamese.
 */

const ONSET_MAP: Record<string, string[]> = {
  ngh: ["n", "g", "h"],  // velar nasal + glide before vowel
  ng: ["n", "g"],        // velar nasal as onset
  nh: ["n", "h"],
  ch: ["ch"],
  tr: ["ch"],
  th: ["t", "h"],
  ph: ["p", "h"],
  kh: ["k", "h"],
  gi: ["z"],
  gh: ["g"],
  qu: ["k"],  // medial w is added separately
  b: ["b"],
  c: ["k"],
  d: ["z"],
  đ: ["d"],
  g: ["g"],
  h: ["h"],
  k: ["k"],
  l: ["r"],
  m: ["m"],
  n: ["n"],
  p: ["p"],
  r: ["z"],
  s: ["s"],
  t: ["t"],
  v: ["v"],
  x: ["s"],
  "": [],     // null onset
};

export function onsetToPhonemes(onset: string): string[] {
  const result = ONSET_MAP[onset];
  if (result === undefined) {
    throw new Error(`Unknown onset: "${onset}"`);
  }
  return result;
}
