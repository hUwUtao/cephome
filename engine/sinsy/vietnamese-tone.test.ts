import { expect, test } from "bun:test";
import { SinsyLabelPipeline, VietnameseMoraPlanTranspiler, expressionForNote } from "./index.ts";
import type { ScoreNote } from "./types.ts";

const TONAL_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Voice</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>2</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <direction><sound tempo="120"/></direction>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>2</duration>
        <voice>1</voice>
        <lyric><text>mây</text></lyric>
      </note>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>2</duration>
        <voice>1</voice>
        <lyric><text>trôi</text></lyric>
      </note>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>2</duration>
        <voice>1</voice>
        <lyric><text>dạ</text></lyric>
      </note>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>2</duration>
        <voice>1</voice>
        <lyric><text>ngã</text></lyric>
      </note>
    </measure>
  </part>
</score-partwise>`;

test("Vietnamese tonal aware phonemes (cl for tones 4 and 5)", () => {
  const transpiler = new VietnameseMoraPlanTranspiler("voicevox");

  // 'dạ' is tone 5 (nặng) -> should have 'cl' at the end
  const da = transpiler.plan("dạ");
  expect(da.tone).toBe(5);
  expect(da.phones).toContain("cl");

  // 'ngã' is tone 4 (ngã) -> should have 'cl' at the end
  const nga = transpiler.plan("ngã");
  expect(nga.tone).toBe(4);
  expect(nga.phones).toContain("cl");

  // 'mây' is tone 0 (ngang) -> no 'cl'
  const may = transpiler.plan("mây");
  expect(may.tone).toBe(0);
  expect(may.phones).not.toContain("cl");
});

test("Tonal pitch microtoning calculation", () => {
  const note: ScoreNote = {
    id: "P1:1:0",
    partId: "P1",
    measureNumber: "1",
    voice: "1",
    staff: "1",
    startDiv: 0,
    endDiv: 2,
    pitch: { step: "C", alter: 0, octave: 4, midi: 60, pitchClass: 0, name: "C4" },
    durationDiv: 2,
    divisions: 2,
    tempo: 120,
    beat: { beats: 4, beatType: 4 },
    isRest: false,
    isChord: false,
    isGrace: false,
    isCue: false,
    isPrintable: true,
    lyric: "má",
    carriedPhones: null,
    carriedTone: null,
    syllabic: "single",
    tie: null,
    slur: null,
    hasBreath: false,
    dynamic: "mf",
    hasAccent: false,
    hasStaccato: false,
  };

  // Tone 2 (Sắc) -> High rising
  const exp2_0 = expressionForNote(note, null, null, 2, 0, 3);
  const exp2_2 = expressionForNote(note, null, null, 2, 2, 3);
  expect(exp2_0.tonalPitchOffset).toBe(0);
  expect(exp2_2.tonalPitchOffset).toBeGreaterThan(0);

  // Tone 1 (Huyền) -> Low falling
  const exp1_2 = expressionForNote(note, null, null, 1, 2, 3);
  expect(exp1_2.tonalPitchOffset).toBeLessThan(0);
});

test("Sinsy labels contain Vietnamese tone metadata without mutating score pitch", () => {
  const pipeline = new SinsyLabelPipeline();
  const result = pipeline.serialize(TONAL_XML);

  // Check for VIE marker and tone numbers in B and C sections
  // Example: /B:4_1_1@VIE|5
  expect(result.full).toContain("@VIE|5"); // 'dạ' (tone 5)
  expect(result.full).toContain("@VIE|4"); // 'ngã' (tone 4)
  expect(result.full).toContain("@VIE|0"); // 'mây' (tone 0)

  expect(result.full).toContain("/E:C4]0^");
  expect(result.full).not.toContain("/E:C4]60^");
});

test("Vowel signature and short-vowel timing", () => {
  const transpiler = new VietnameseMoraPlanTranspiler();

  // 'phân' uses 'â' (signature 3, short)
  const phan = transpiler.plan("phân");
  expect(phan.vowelSign).toBe(3);
  const vowelA = phan.plan.find((p) => p.phone === "a");
  expect(vowelA?.weight).toBe(0.5);

  // 'phê' uses 'ê' (signature 5, modal)
  const phe = transpiler.plan("phê");
  expect(phe.vowelSign).toBe(5);
  const vowelE = phe.plan.find((p) => p.phone === "e");
  expect(vowelE?.weight).toBe(1.0);

  // 'trăng' uses 'ă' (signature 2, short)
  const trang = transpiler.plan("trăng");
  expect(trang.vowelSign).toBe(2);
  const vowelAW = trang.plan.find((p) => p.phone === "a");
  expect(vowelAW?.weight).toBe(0.5);
});

test("Sinsy singing plan keeps checked codas without artificial support glides", () => {
  const transpiler = new VietnameseMoraPlanTranspiler();

  expect(transpiler.plan("thấp").phones).toEqual(["t", "h", "a", "p"]);
  expect(transpiler.plan("nếp").phones).toEqual(["n", "e", "p"]);
  expect(transpiler.plan("nước").phones).toEqual(["n", "u", "o", "k"]);
  expect(transpiler.plan("thênh").phones).toEqual(["t", "h", "e", "N"]);
  expect(transpiler.plan("tôi").phones).toEqual(["t", "o", "i"]);
  expect(transpiler.plan("xuôi").phones).toEqual(["s", "w", "o", "i"]);
  expect(transpiler.plan("chung").phones).toEqual(["ch", "u", "N", "g"]);
  expect(transpiler.plan("trên").phones).toEqual(["ty", "z", "e", "N"]);
  expect(transpiler.plan("thoáng").phones).toEqual(["t", "h", "o", "a", "N", "g"]);
});

test("Vietnamese plan exposes research metadata tiers", () => {
  const transpiler = new VietnameseMoraPlanTranspiler();

  const khat = transpiler.plan("khát");
  expect(khat.metadata.rhymeClass).toBe("checked");
  expect(khat.metadata.codaClass).toBe("stop");
  expect(khat.metadata.codaTransition).toBe(3);
  expect(khat.metadata.phonation).toBe("checked");

  const nga = transpiler.plan("ngã");
  expect(nga.metadata.rhymeClass).toBe("open");
  expect(nga.metadata.phonation).toBe("glottalized");
  expect(nga.metadata.glottalization).toBe(2);
});

test("Sinsy labels keep compact NEUTRINO-safe Vietnamese context", () => {
  const xml = TONAL_XML.replace(
    "<pitch><step>C</step><octave>4</octave></pitch>\n        <duration>2</duration>\n        <voice>1</voice>\n        <lyric><text>ngã</text></lyric>",
    "<pitch><step>D</step><octave>4</octave></pitch>\n        <duration>2</duration>\n        <voice>1</voice>\n        <lyric><text>ngã</text></lyric>",
  );
  const result = new SinsyLabelPipeline().serialize(xml);

  expect(result.full).toContain("@VIE|4|1");
  expect(result.full).toContain("@VIE|5|1");
  expect(result.full).not.toContain("glottalized");
  expect(result.full).not.toContain("contrary");
});

test("low A3 lyrics keep exact score pitch class in full labels", () => {
  const xml = TONAL_XML.replaceAll(
    "<step>C</step><octave>4</octave>",
    "<step>A</step><octave>3</octave>",
  ).replace("<text>mây</text>", "<text>Dừng</text>");
  const result = new SinsyLabelPipeline().serialize(xml);

  expect(result.full).toContain("/E:A3]9^");
  expect(result.full).not.toContain("/E:A3]57^");
});
