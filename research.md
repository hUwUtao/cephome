# Rule-Based Vietnamese-to-Japanese Mora Transcription for CeVIO

## Problem framing and constraints

A “Vietnam → Japanese mora” front-end is essentially a **deterministic transliteration/transcription layer**: it converts Vietnamese syllables into a sequence of Japanese-compatible morae (or mora-sized phoneme chunks) so a Japanese TTS/singing engine can output a *proxy* pronunciation. The core engineering constraint is that the output must obey **Japanese mora/phonotactic limits** (mostly CV timing with a small set of “special” morae), otherwise the target engine will either reject the input or reshape it unpredictably. citeturn6view4turn4search1

In **CeVIO AI**, this kind of mapping is particularly practical on the **Song** side because the editor exposes a phoneme-input mode: you can specify singing directly “in phoneme symbols,” and CeVIO provides a phoneme palette and strict parsing rules (comma/space separates phonemes; `|` can disambiguate syllable boundaries; unknown symbols are treated as errors and the note won’t sound). citeturn17view0turn8view0

A key nuance for your “userland-only” requirement is where you draw the boundary. If “userland” means “my converter does not use CNN/TF/low-level neural code,” that is compatible with driving CeVIO externally: CeVIO exposes external integration paths (SAPI5, COM, .NET) for Talk synthesis, and Song-side phoneme entry is fully manual/textual. citeturn12view0turn6view2  
If, instead, you require **no neural processing anywhere in the pipeline**, then CeVIO AI itself is not purely non-neural: the official guide explicitly describes Song Voices as being realized via learning from labeled recordings. citeturn16view0

## Vietnamese syllable structure and what “vần” buys you

Vietnamese syllables are well-suited to rule-based conversion because the language is strongly **syllable-centric** and each syllable includes a tone plus a segmental structure. In a phonological framing used in academic work, each syllable consists of one tone (*thanh*) and a segmental syllable made of **onset + rhyme (vần)**, with an optional /w/ adjunct. citeturn14view0turn13view0

The “vần” abstraction is attractive because it isolates the part that must be “re-moraified” for Japanese timing: in a common two-tier description used in Vietnamese linguistics/phonetics pedagogy, Vietnamese syllables have:
- Tier 1 (required): **onset (âm đầu), vần, tone (thanh điệu)**
- Tier 2 (inside vần): **medial/on-glide (âm đệm), nucleus (âm chính), coda (âm cuối)** citeturn11view0

Two practical details from that same tiered description matter directly for your converter design:

1) Vietnamese codas are from a **small, closed class**. The coda can be a semivowel /w/ (spelled o/u) or /j/ (spelled i/y), a nasal (/m n ɲ ŋ/), or an unreleased voiceless stop (/p t k/ with spellings like p, t, c/ch). citeturn11view0turn1search2

2) Vietnamese also permits a **secondary labial articulation /w/** tied to the onset region (often discussed as a labialized on-glide), e.g., the classic example “hoa” with [hw…]. This corresponds nicely to Japanese `w`-type morae (wa/wi/we/wo) and is one reason a “vần-first” mapping tends to be stable. citeturn13view0turn1search2

The main thing “vần mapping + stitching” gives you is the ability to create a reusable mapping for rimes such as **iên, ương, inh/ình, ang/ãng**, etc., while letting a separate onset map handle consonant inventory mismatch.

## Japanese mora fundamentals and how CeVIO exposes them

Japanese rhythm is conventionally modeled in **morae** rather than syllables. A Japanese “regular” mora is typically V or CV (including palatalized CjV), and the language also uses **special morae** such as the moraic nasal and moraic obstruent (the first half of geminates), plus long-vowel/diphthong second halves in many analyses. citeturn6view4turn4search1

This matters for Vietnamese because Vietnamese allows rich codas (/m n ŋ ɲ p t k/), while Japanese strongly limits “standalone consonant material” to special morae-like behavior (the classic ones being the moraic nasal and gemination). citeturn6view4turn4search1  
Loanword phonology literature further supports the typical Japanese repair strategies: **epenthesis and restructuring** to preserve consonants within Japanese moraic templates. citeturn15view0

On the CeVIO side, there are two relevant “interfaces”:

- **Song Track phoneme input**: CeVIO AI allows direct phoneme-symbol specification for Japanese Song Voices; the editor provides a palette and defines parsing rules (comma/space separators; `|` to separate syllables if ambiguous). citeturn17view0turn8view0  
- **Talk Track mora-centric editing**: the Talk phoneme graph UI is explicitly mora-aware—accent can be placed by clicking a mora, accent phrases can be split/merged “between mora and mora,” and pitch/length/volume can be adjusted at phoneme granularity. citeturn19view0

image_group{"layout":"carousel","aspect_ratio":"16:9","query":["CeVIO AI 日本語 音素パレット","CeVIO Japanese phoneme palette image","CeVIO 音素入力モード 音素パレット"] ,"num_per_query":1}

A particularly important operational constraint for your pipeline is that the Japanese phoneme palette is **finite**. The official CeVIO guide image shows symbols such as `a i u e o`, consonants like `k g s z t d n h f p b m r w y`, palatalized sets like `ky gy ny hy my py by ry`, affricates `ch ts`, plus special items including `N` (moraic nasal) and `cl` (closure used in gemination/glottal stop contexts). citeturn8view0

## Deterministic pipeline architecture for “vần → mora → stitching”

Your proposed pipeline aligns well with how both Vietnamese phonology and CeVIO Song phoneme entry behave:

1) **Normalize and canonicalize the Vietnamese input**  
Vietnamese orthography places tone marks on vowel letters following defined rules, and the same logical letter may appear as different composed glyphs (e.g., vowel quality marks + tone marks). In practice, you want a normalization step that makes segmentation deterministic—typically: lowercase, Unicode-normalize (NFD), strip tone marks while optionally retaining vowel-quality diacritics (ă â ê ô ơ ư, and đ), then recompose (NFC) for stable string keys. The motivation is that Vietnamese writing is diacritics-dense and can be represented in multiple equivalent encodings. citeturn1search7

2) **Segment each syllable into onset and vần components**  
A reliable rule-based segmentor for Quốc Ngữ can be built by:
- matching the **longest onset grapheme** from a fixed list (e.g., ngh, ng, nh, ch, tr, th, ph, kh, gi, gh, qu, … plus single letters),
- then matching the **longest coda** from a fixed list (p, t, c/ch, m, n, ng, nh, and possibly semivowel codas),
- whatever remains is the vowel complex (with potential medial/on-glide). This approach is well-supported by the constrained syllable template descriptions used for Vietnamese. citeturn11view0turn13view0turn1search2

3) **Map onset graphemes to CeVIO Japanese phoneme symbols**  
This mapping is inherently lossy because the CeVIO Japanese inventory is smaller than Vietnamese’s, but the objective is intelligible approximation. The HMU phonetics-oriented description (Northern Vietnamese as reference) provides a handy correspondence list between Vietnamese orthography and IPA-like categories for many onsets, and it explicitly notes /v/, /z/ (for d/r), /f/ (ph), etc., enabling a consistent rule-based onset map. citeturn11view0

4) **Map vần to Japanese mora sequences**  
Instead of enumerating every vần as an atomic unit, you can decompose vần into (medial /w/?) + nucleus (1–2 vowel targets) + coda target (N/cl or vowel-final). This is consistent with the two-tier Vietnamese model and fits Japanese mora building blocks. citeturn11view0turn6view4

5) **Stitch mora sequences and validate against CeVIO’s parser**  
Finally, emit phoneme sequences separated by commas, using `|` when you must force a syllable break. CeVIO explicitly recognizes comma/space as phoneme separators and supports `|` for syllable disambiguation; invalid symbols produce an error and silence the note, which is a convenient “hard fail” signal for automated QA. citeturn17view0

A cache layer fits naturally: cache at three levels (normalized syllable → phoneme string; vần → nucleus/coda expansion; and optional exception dictionary). Your “group by word batch” idea is equivalent to: compute unique normalized keys first, map once, then re-expand to the full list—useful if you are generating large lyric corpora.

## Mapping design details driven by Vietnamese phonotactics and CeVIO’s palette

### Designing the target inventory

The output must be constrained to CeVIO’s Japanese phoneme set, as shown in the official palette image. citeturn8view0  
This means you must decide how to represent Vietnamese features that Japanese lacks:

- **Lateral /l/**: Japanese does not have /l/ as a distinct phoneme; CeVIO’s palette uses `r` for the Japanese liquid. In practice, Vietnamese `l-` is typically mapped to `r-` in Japanese approximations. (This is a design choice; the constraint is the palette.) citeturn8view0
- **Coda stops /p t k/**: Vietnamese permits unreleased stop codas. Japanese instead uses moraic obstruent behavior (gemination) or vowel epenthesis. Mora theory and loanword research both support the idea that Japanese repairs illicit codas via mora-template strategies (including insertion or re-timing). citeturn6view4turn15view0turn1search2
- **Coda nasals /m n ŋ ɲ/**: Japanese’s “moraic nasal” is a special mora and its surface place varies by context; phonological and experimental descriptions emphasize its context-sensitive realization. citeturn4search1turn4search19

### Recommended rule set for a Hanoi-targeted front-end

The examples you gave (e.g., `dinh → z,...`, `dương → z,...`) implicitly assume a **Northern/Hanoi-like mapping** where orthographic `d` (and often `gi`/`r` in many descriptions) aligns with a [z]-like output. That is consistent with widely reported Northern patterns and with a Northern-centric “standard” framing in some Vietnamese phonetic descriptions. citeturn11view0turn1search2

A practical mapping spec (orthography-driven) that stays within the palette is:

**Onset (âm đầu) → CeVIO consonant(s)**  
- `b` → `b`; `p` → `p`; `m` → `m` citeturn11view0turn8view0  
- `ph` → `f` (preferred, since `f` exists in the palette) citeturn11view0turn8view0  
- `v` → `v` (CeVIO palette includes `v`, though Japanese /v/ is marginal; you may optionally back off to `b` if it sounds more stable in a given voice) citeturn8view0turn4search1  
- `t`/`th` → `t`; `đ` → `d` citeturn11view0turn8view0  
- `d`/`gi`/`r` (Northern-style) → `z` citeturn11view0turn1search2turn8view0  
- `n` → `n`; `nh` (onset) → `ny` citeturn11view0turn8view0  
- `c/k/q` → `k`; `g/gh` → `g` citeturn11view0turn8view0  
- `ch` (and often `tr` in merger-prone systems) → `ch` (or sometimes `ty` depending on style goals) citeturn1search2turn8view0  
- `s/x` → `s` (optionally `sh` if you want a “more palatal” flavor in approximation) citeturn1search2turn8view0  
- `h` → `h`; `kh` → `h` (lossy: Japanese lacks /x/) citeturn11view0turn8view0  
- `qu` → commonly `k,w` (because Vietnamese `qu-` patterns as /kw/ in many analyses; your segmentor should treat the `u` as part of onset, not the nucleus) citeturn11view0turn13view0

**Vần nucleus (âm chính) → vowel sequence**
Using the vowel inventory described in the Vietnamese phonetics source, a robust approximation table is:
- i/y → `i`
- ê/e → `e` (both collapse to `e` as Japanese has only one mid front vowel)
- a/ă/â → `a`
- o/ô/ơ → `o`
- u/ư → `u` citeturn11view0turn8view0

For the common diphthong nuclei listed (ia/iê, ưa/ươ, uô/ua), a reasonable Japanese mora expansion is:
- `iê/ia` → `i,e` (matches your `kiên → k,i,e,...` intuition)
- `uô/ua` → `u,o` or `w,a` depending on the orthographic environment
- `ươ/ưa` → often `w,o` (treating the medial /w/ + `o` as a proxy; this aligns with the idea that Vietnamese allows a labial on-glide and Japanese explicitly has `w` morae) citeturn11view0turn13view0turn6view4

**Coda (âm cuối) → special mora strategy**
Vietnamese coda inventory is explicitly constrained (semivowels, nasals, unreleased stops). citeturn11view0turn1search2  
A conservative, “always-valid” CeVIO/Japanese strategy is:
- any nasal coda (`m n ng nh`) → `N`
- any stop coda (`p t c/ch`) → `cl` (often paired with a following consonant if you are encoding a geminate-like effect across a boundary; if the syllable ends the line, `cl` behaves as a “hard stop” marker in many singing-synth workflows) citeturn8view0turn9search1

Two important caveats justify your “manual patching” stage:

- **Orthographic `nh/ch` in final position is dialect- and analysis-sensitive.** Even within Hanoi-focused descriptions, there are competing analyses of final `nh` and `ch` (e.g., whether they are palatal /ɲ, c/ or reflect velar /ŋ, k/ after front vowels with associated diphthongization). If you want stable output, treat these as patch-prone rimes in your cache. citeturn1search2
- **CeVIO’s internal handling of nasal detail differs between Talk and Song.** Community documentation notes that CeVIO often represents “ん” as `N` in phoneme notation without place distinctions, while actual pronunciation can vary; for Song, additional techniques (e.g., `n,g` for nasalized /g/ contexts) are used in tuning workflows. This supports the idea that a default `N` strategy is robust, while finer place targets are “advanced patches.” citeturn6view1

### Reconciling your sample outputs with a stricter “palette-safe” specification

Your provided examples already match the CeVIO phoneme-separator format (comma-separated symbols) and use only palette-available symbols, which is a strong readiness signal. citeturn17view0turn8view0

Where you may want to tighten consistency is nasal codas. Given CeVIO’s strong support for `N` as the moraic nasal, a “strict mora” rewrite of your examples (while preserving your Northern `d→z` and `l→r`) would look like:

- kiên → `k,i,e,N`
- phương → `f,w,o,N` (or, if you prefer keeping `ph` decomposed, keep your `p,h,...` but `f` is directly supported)
- dương → `z,w,o,N`
- vãng → `v,a,N` (since `v` exists in the palette; mapping `v→w` is not required by the target inventory)
- dinh → `z,i,N` (treating “-nh” as nasal coda → `N` in the conservative mode)
- tình → `t,i,N`
- tính → `t,i,N` (already aligned with your example)
- liên → `r,i,e,N`

This isn’t claiming these are “correct Vietnamese”—the claim is that they are **internally consistent Japanese-mora outputs** that (a) fit the palette and (b) reduce the number of coda encodings you have to special-case. The Vietnamese side of the justification is that codas are drawn from a narrow set and “tone + rhyme” is the core unit; the Japanese side is that `N` is the canonical special mora for coda nasals. citeturn11view0turn6view4turn4search1turn8view0

## Readiness criteria, validation strategy, and maintenance

A “ready” system here is less about linguistic perfection and more about **guaranteed well-formedness** + **controlled drift** under manual patches.

The most effective readiness checks are mechanical:

- **Symbol whitelist enforcement**: only emit symbols present in CeVIO’s phoneme palette for Japanese Song Voices (and any explicitly supported “hidden” symbols you knowingly rely on). The official palette image is a concrete reference for the baseline whitelist. citeturn8view0
- **CeVIO parser conformity**: ensure phoneme separators are half-width comma or space, and use `|` when syllable boundaries could be ambiguous. CeVIO’s official guide states this explicitly, and also tells you how failures present (red error, no vocalization). citeturn17view0
- **Unit tests for segmentor invariants**: verify that every input syllable is segmented into exactly one onset + one vần + one tone category (tone often ignored in output, but you should still detect/strip it deterministically). This matches the structural descriptions used in Vietnamese phonetic references. citeturn11view0turn14view0turn13view0

For *auditory* validation, the most efficient approach is staged listening:

1) Start with a small syllable set covering vowel nuclei and codas (especially the full set of nasal codas and stop codas). The Vietnamese description lists exactly which codas exist, which makes coverage-based selection straightforward. citeturn11view0  
2) Iterate on “high-impact patches” first: `ươ/ưa`, `iê/ia`, `qu-`, `gi-`, and final `nh/ch` rimes (because of their analysis variation). citeturn11view0turn1search2  
3) If you target Talk rather than Song, plan for prosody work: CeVIO’s Talk phoneme graph lets you adjust pitch/length/volume by phoneme and explicitly manipulates accent at the mora level, but Japanese pitch accent is not a Vietnamese tone system. Expect a lot of manual or heuristic pitch shaping if tone is a must-have. citeturn19view0turn13view0

Finally, if your “userland” goal includes automation around CeVIO (e.g., regenerate audio after updating the cache), CeVIO’s official documentation describes external integration paths: SAPI5 linkage for compatible 64-bit tools and programmatic interfaces via COM and .NET for more detailed control. citeturn12view0turn6view2

A concise readiness checklist for your specific format (“1 word per line → 1 mora group per line”) is:

- Every output line is a comma-separated sequence that uses only Japanese Song phoneme symbols from the CeVIO palette; any intentional out-of-palette symbol is version-gated and tested. citeturn17view0turn8view0  
- The segmentor deterministically isolates onset vs vần and decomposes vần into medial/nucleus/coda consistent with Vietnamese structural descriptions. citeturn11view0turn14view0turn13view0  
- The mapper has a “conservative mode” that guarantees mora legality (favor `N` and `cl` for codas), plus an override layer for patch-prone rimes (especially those involving final `nh/ch`, and complex nuclei like `ươ`). citeturn1search2turn6view4turn8view0  
- Regression tests include CeVIO-side acceptance: no red lyric errors (invalid phonemes) and stable syllable parsing (add `|` only where required). citeturn17view0