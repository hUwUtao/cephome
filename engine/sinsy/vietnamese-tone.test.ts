import { expect, test } from "bun:test";
import {
  SinsyLabelPipeline,
  VietnameseMoraPlanTranspiler,
  expressionForNote,
} from "./index.ts";

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
  // Mock note
  const note: any = {
    pitch: { midi: 60, name: "C4" },
    durationDiv: 2,
    divisions: 2,
    tempo: 120,
    dynamic: "mf"
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

test("Sinsy labels contain Vietnamese tone information", () => {
  const pipeline = new SinsyLabelPipeline();
  const result = pipeline.serialize(TONAL_XML);

  // Check for VIE marker and tone numbers in B and C sections
  // Example: /B:4_1_1@VIE|5
  expect(result.full).toContain("@VIE|5"); // 'dạ' (tone 5)
  expect(result.full).toContain("@VIE|4"); // 'ngã' (tone 4)
  expect(result.full).toContain("@VIE|0"); // 'mây' (tone 0)

  // Check for microtoning in E section (midi field)
  // 'dạ' (tone 5) should have decreasing midi values for later phonemes if rounded
  // 'z' (pos 0), 'a' (pos 1), 'cl' (pos 2)
  // tone 5 offset for pos 2 of 3 is -0.7 * (2/2) = -0.7.
  // midi 60 - 0.7 = 59.3 -> rounded to 59.
  expect(result.full).toContain("]59^"); 
});

test("Vowel signature and short-vowel timing", () => {
  const transpiler = new VietnameseMoraPlanTranspiler();
  
  // 'phân' uses 'â' (signature 3, short)
  const phan = transpiler.plan("phân");
  expect(phan.vowelSign).toBe(3);
  const vowelA = phan.plan.find(p => p.phone === "a");
  expect(vowelA?.weight).toBe(0.5);

  // 'phê' uses 'ê' (signature 5, modal)
  const phe = transpiler.plan("phê");
  expect(phe.vowelSign).toBe(5);
  const vowelE = phe.plan.find(p => p.phone === "e");
  expect(vowelE?.weight).toBe(1.0);

  // 'trăng' uses 'ă' (signature 2, short)
  const trang = transpiler.plan("trăng");
  expect(trang.vowelSign).toBe(2);
  const vowelAW = trang.plan.find(p => p.phone === "a");
  expect(vowelAW?.weight).toBe(0.5);
});
