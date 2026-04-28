# Engine: Vietnamese → CeVIO Phonemetizer

Pure TypeScript library for converting Vietnamese text to CeVIO Japanese phoneme sequences.

## Quick Start

```bash
bun test                       # Run tests
echo "Nào bạn" | bun run cli.ts  # Pipe Vietnamese → phonetics
```

## Architecture: 5-Layer Pipeline

1. **Normalize** (`normalize.ts`): Lowercase, NFD decompose, extract tone marks, NFC recompose
2. **Segment** (`segment.ts`): Parse onset, medial glide, nucleus, coda
3. **Onset Map** (`onset.ts`): Vietnamese grapheme → CeVIO phoneme(s)
4. **Nucleus/Coda** (`van.ts`): Vowel sequences + nasals/stops → mora tokens
5. **Validate** (`validate.ts`): Filter against CeVIO palette whitelist

## Phoneme Mappings

### Onsets (Vietnamese grapheme → CeVIO phoneme)

| Grapheme          | Output      | Notes                             |
| ----------------- | ----------- | --------------------------------- |
| `ngh`, `ng`       | `["n","g"]` | Velar nasal as separate mora      |
| `nh`              | `["ny"]`    | Palatal nasal /ɲ/                 |
| `th`              | `["ty"]`    | Aspirated → palatalized mora      |
| `ch`, `tr`        | `["ch"]`    | Affricate                         |
| `ph`              | `["f"]`     | Fricative                         |
| `kh`              | `["k"]`     | Aspirated → plain                 |
| `gi`              | `["z"]`     | Northern Vietnamese               |
| `qu`              | `["k"]`     | + medial `w`                      |
| Single consonants | mapped      | `l→r`, `r→z`, `đ→d`, `c→k`, `x→s` |
| `""`              | `[]`        | Null onset                        |

**Segmentation order** (longest-first): `ngh` → `ng` → `nh` → single chars

**Medial `w` detection**: Onsets `qu`, `h`, `x`, `ph`, `kh`, `th` followed by `u/ư/o/ô` + vowel consume that character as medial `w`, emitted as `"u"` mora.

### Nucleus (Vietnamese syllable nucleus → CeVIO moras)

**Diphthongs & triphthongs** (longest-match):

| Nucleus          | Moras                 | Examples                                |
| ---------------- | --------------------- | --------------------------------------- |
| `iê`, `ia`, `yê` | `i,e`                 | kiên, gia, yêu                          |
| `uô`, `ua`       | `u,o`                 | quốc, quân                              |
| `ươ`, `ưa`       | `u,o`                 | phương, dương                           |
| `ưi`             | `u,i`                 | mười                                    |
| `oa`, `oe`       | `u,a` / `u,e`         | hoa, hoè                                |
| `ơi`, `ui`, `ei` | `o,i` / `u,i` / `e,i` | phối, quý, hei                          |
| `âu`             | `o,u`                 | đâu, nhau                               |
| `uyê`            | `u,y,e`               | thuyền, khuyên                          |
| Single vowels    | direct                | `a→a`, `i→i`, `u→u`, `ơ→o`, `ư→u`, etc. |

**Diphthong protection** (`segment.ts:87`): List of known diphthongs that prevent semivowel codas from splitting off.

### Codas (ending consonants/semivowels)

**Transparent mode** (default):

- `m`, `n` → `["m"]`, `["n"]`
- `ng` → `["n","g"]`
- `nh` → `["n","h"]`
- `p`, `t`, `c`, `ch` → individual or `["k"]`
- `i`, `y` → `["i"]`
- `u` → `["u"]`
- `o` → `["o"]`

**VOICEVOX mode**: Nasals → `N`, stops → `cl`, semivowels unchanged

## CeVIO Palette

Vowels: `a`, `i`, `u`, `e`, `o`

Consonants: `k`, `g`, `s`, `z`, `t`, `d`, `n`, `h`, `f`, `p`, `b`, `m`, `r`, `w`, `y`

Palatalized: `ky`, `gy`, `ny`, `hy`, `my`, `py`, `by`, `ry`, `ty`

Affricates: `ch`, `ts`

Special mora: `N` (nasal), `cl` (closure)

Optional: `v`

## Public API

```ts
import {
  transcribeSyllable, // syl → "k,i,e,n"
  transcribeWord, // word → ["k,i,e,n"]
  transcribe, // text → structured result
  transcribeText, // text → UI-friendly string
} from "./index.ts";
```

All functions accept optional `mode: "transparent" | "voicevox"` (default: transparent).

## CLI

**Stream Vietnamese text to phonetics:**

```bash
echo "Nào bạn lại đây" | bun run cli.ts
# Outputs: space-separated syllables per line
# n,a,o
# b,a,n
# r,a,i
# d,a,i
```

Works with pipes and files:

```bash
cat lyrics.txt | bun run cli.ts > phonetics.txt
```

## Code Style

- **Tabs** (not spaces)
- **Double quotes**, trailing semicolons
- **No comments** unless logic is non-obvious
- **Named exports** per module
- **Test colocated** with source (`.test.ts`)
- Keep functions small; one responsibility each

## Testing

```bash
bun test                    # Run all tests
bun test --watch           # Watch mode
```

Test files use `bun:test` framework. Each test names the function being tested + what it should do.

## Future Improvements

- Tone-aware coda encoding (tones 0–5 → different mora tokens for prosody)
- Multi-syllable word segmentation (currently words need pre-segmentation)
- Performance optimization for batch transcription
