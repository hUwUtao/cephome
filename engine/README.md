# Vietnamese → CeVIO Mora Transcription Engine

A deterministic, rule-based engine for converting Vietnamese Quốc Ngữ to CeVIO Japanese-compatible phoneme sequences.

## Usage

```typescript
import {
  transcribeSyllable,
  transcribeWord,
  transcribe,
  transcribeText,
} from "./engine/index.ts";

// Single syllable
transcribeSyllable("kiên") // → "k,i,e,N"

// Text with multiple words
transcribeText("kiên phương") // → "k,i,e,N\nf,w,o,N"

// Structured result
transcribe("kiên phương")
// → {
//   input: "kiên phương",
//   lines: [
//     { word: "kiên", syllables: [{ raw: "kiên", phonemes: "k,i,e,N" }] },
//     { word: "phương", syllables: [{ raw: "phương", phonemes: "f,w,o,N" }] }
//   ]
// }
```

## API

### `transcribeSyllable(syl: string): string`
Converts a single Vietnamese syllable to comma-separated CeVIO phoneme symbols.

**Example:**
```typescript
transcribeSyllable("kiên") // "k,i,e,N"
transcribeSyllable("phương") // "f,w,o,N"
```

### `transcribeWord(word: string): string[]`
Transcribes a word (assumed single syllable or pre-segmented). Returns array of phoneme strings.

### `transcribe(text: string): TranscribeResult`
Transcribes arbitrary Vietnamese text (word-separated by spaces). Returns structured result.

### `transcribeText(text: string): string`
Transcribes text and returns newline-separated lines (one per word) with syllables separated by `|`.

**Example:**
```typescript
transcribeText("kiên phương dương")
// "k,i,e,N"
// "f,w,o,N"
// "z,w,o,N"
```

## Design

The engine implements a 5-layer pipeline:

1. **Normalize**: Unicode NFD → strip tone marks → NFC
2. **Segment**: Match longest onset, detect medial glide, match longest coda → nucleus
3. **Map Onset**: Vietnamese consonant grapheme → CeVIO phoneme symbol(s)
4. **Map Vần**: Nucleus + coda → Japanese mora tokens
5. **Validate**: Check all phonemes against CeVIO palette whitelist

### Supported Phonemes

Output is constrained to the CeVIO Japanese Song Voice palette:

**Vowels**: a, i, u, e, o  
**Consonants**: k, g, s, z, t, d, n, h, f, p, b, m, r, w, y  
**Palatalized**: ky, gy, ny, hy, my, py, by, ry  
**Affricates**: ch, ts  
**Special**: N (moraic nasal), cl (closure/gemination), v

### Coverage

**Core research.md examples (100% pass):**
- kiên → k,i,e,N
- phương → f,w,o,N
- dương → z,w,o,N
- vãng → v,a,N
- dinh → z,i,N
- tình → t,i,N
- liên → r,i,e,N

**Extended test suite:** 45 tests covering null onsets, multi-character onsets, semivowel codas, labialized nuclei, diphthongs, and stop codas.

## Testing

```bash
bun test engine/
```

## Notes

- **Tone marks are stripped** during normalization; tone information is extracted but not output (reserved for future prosody work)
- **Medial glides** (`u`, `ư`, `o`, `ô` before another vowel) are detected and output as `w`
- **Nasals and stops** in coda position map to special morae (`N` and `cl` respectively) to respect Japanese phonotactics
- **Multi-syllable words without spaces** are treated as single units; pre-segment by spaces or provide syllable-by-syllable input for reliable handling
