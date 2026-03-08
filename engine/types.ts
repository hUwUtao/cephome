export interface ParsedSyllable {
  raw: string;        // original grapheme cluster
  onset: string;      // onset grapheme (may be empty for null onset)
  medial: string;     // "w" or ""
  nucleus: string;    // vowel complex (tone-stripped)
  coda: string;       // coda grapheme (may be empty)
  tone: number;       // 0-5 (ignored in output, for future prosody)
}

export interface TranscribeResult {
  input: string;
  lines: Array<{
    word: string;
    syllables: Array<{
      raw: string;
      phonemes: string;
      tone: number; // 0-5
      toneMark: string; // visual representation
    }>;
  }>;
}

export interface SegmentationError {
  syllable: string;
  reason: string;
}
