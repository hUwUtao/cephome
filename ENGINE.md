# Engine: Vietnamese → CeVIO Mora Transcription

## Summary

A complete TypeScript corelib for Vietnamese→Japanese mora transcription, ready to be plugged into the UI via REST API.

**Status**: ✅ Production-ready | 45 tests passing | All research.md examples working

## What Was Built

```
engine/
├── index.ts           # Public text-to-text API (4 export functions)
├── types.ts           # TypeScript interfaces
├── normalize.ts       # Unicode normalization + tone extraction
├── segment.ts         # Syllable segmentation (onset, medial, nucleus, coda)
├── onset.ts           # Vietnamese consonant → CeVIO phoneme mapping
├── van.ts             # Vần (nucleus + coda) → mora token expansion
├── validate.ts        # CeVIO phoneme palette validation
├── index.test.ts      # 32 transcription tests
├── segment.test.ts    # 13 segmentation tests
└── README.md          # Full documentation
```

## Core API

```typescript
// Single syllable
transcribeSyllable("kiên") → "k,i,e,N"

// Structured result
transcribe("kiên phương") → {
  input: "kiên phương",
  lines: [
    { word: "kiên", syllables: [{ raw: "kiên", phonemes: "k,i,e,N" }] },
    { word: "phương", syllables: [{ raw: "phương", phonemes: "f,w,o,N" }] }
  ]
}

// Flat text output (UI-ready)
transcribeText("kiên phương") → "k,i,e,N\nf,w,o,N"
```

## REST Endpoint

**POST** `/api/transcribe`

**Request:**
```json
{
  "text": "kiên phương",
  "format": "text"  // or "structured"
}
```

**Response (text format):**
```json
{
  "success": true,
  "result": "k,i,e,N\nf,w,o,N"
}
```

**Response (structured format):**
```json
{
  "success": true,
  "result": {
    "input": "kiên phương",
    "lines": [...]
  }
}
```

## Research.md Coverage

All 7 core examples from `research.md` pass:

| Vietnamese | Output | Status |
|------------|--------|--------|
| kiên | k,i,e,N | ✅ |
| phương | f,w,o,N | ✅ |
| dương | z,w,o,N | ✅ |
| vãng | v,a,N | ✅ |
| dinh | z,i,N | ✅ |
| tình | t,i,N | ✅ |
| liên | r,i,e,N | ✅ |

## Implementation Highlights

1. **Deterministic**: Rule-based segmentation + phoneme mapping (no ML)
2. **Unicode-safe**: NFD normalization, tone mark detection, vowel diacritic preservation
3. **Quốc Ngữ-aware**: Handles multi-character onsets (ngh, ng, nh, ch, tr, th, ph, kh, etc.)
4. **Japanese-compliant**: Output respects CeVIO's mora constraints and palette
5. **Well-tested**: 45 tests covering segmentation invariants, phoneme mapping, edge cases
6. **Extensible**: Cache layer, exception dictionary, and patch-prone rime overrides ready for implementation

## Phoneme Inventory

CeVIO Japanese Song Voice palette (26 phonemes):

**Vowels (5)**: a, i, u, e, o  
**Base consonants (15)**: k, g, s, z, t, d, n, h, f, p, b, m, r, w, y  
**Palatalized (8)**: ky, gy, ny, hy, my, py, by, ry  
**Affricates (2)**: ch, ts  
**Special (2)**: N (moraic nasal), cl (closure/gemination)  
**Marginal (1)**: v

## Key Design Decisions

- **Tone marks stripped**: Tone information is extracted (0-5) but not output; reserved for future prosody work
- **Medial glides auto-detected**: u/ư/o/ô before another vowel → output as "w"
- **Nasal/stop codas normalized**: All nasals → "N"; all stops → "cl" (respecting Japanese mora structure)
- **Segmentation via longest-match**: Onset → medial → coda matching prevents over-splitting
- **Validation hard-fail**: Invalid phonemes throw errors for immediate QA feedback

## Testing

```bash
# Run all tests
bun test engine/

# Test individually
bun test engine/index.test.ts    # Transcription tests
bun test engine/segment.test.ts  # Segmentation tests
```

## Next Steps (Optional)

The engine is complete as-is, but can optionally be enhanced with:

1. **Multi-syllable word segmentation**: Proper Vietnamese word segmentor (currently assumes space-separated words)
2. **Cache layer**: Memoize `normalized syllable → phoneme string` for large corpora
3. **Exception dictionary**: Override specific rimes (e.g., final nh/ch analysis variants)
4. **Tone-to-pitch heuristics**: Map Vietnamese tones (0-5) to pitch accents for Talk mode
5. **OTEL metrics**: Export segmentation stats and coverage metrics

## Files Modified

- `src/index.ts` — Added `/api/transcribe` endpoint (imports from `../engine/index.ts`)

## Files Created

- All 8 engine modules + tests (see structure above)
