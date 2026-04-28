/**
 * Map Vietnamese onset graphemes to CeVIO Japanese phoneme symbols.
 * Follows research.md mapping spec for Northern/Hanoi Vietnamese.
 */

const ONSET_MAP: Record<string, string[]> = {
  ngh: ["n", "g"], // velar nasal proxy
  ng: ["n", "g"],
  nh: ["ny"],
  ch: ["ch"],
  tr: ["ty", "z"], // Hand-baked 'bite' from thuyenla.ccs
  th: ["t", "h"], // Hand-baked aspiration
  ph: ["f"],
  kh: ["k"], // 'k' has more bite than 'h'
  gi: ["z"],
  gh: ["g"],
  qu: ["k"], // 'w' glide is handled by medial-w plan
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
  s: ["s"], // Removed 'sh' per user preference
  t: ["t"],
  v: ["v"],
  x: ["s"], // Northern merger s/x -> s
  "": [],
};

export function onsetToPhonemes(onset: string): string[] {
  const result = ONSET_MAP[onset];
  if (result === undefined) {
    throw new Error(`Unknown onset: "${onset}"`);
  }
  return result;
}
