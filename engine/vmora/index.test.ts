import { test, expect } from "bun:test";
import { transcribeSyllable, transcribeWord, transcribe, transcribeText } from "./index.ts";

// Research.md core examples - MUST PASS
test("research: kiên", () => {
  expect(transcribeSyllable("kiên")).toBe("k,i,e,n");
});

test("research: phương", () => {
  expect(transcribeSyllable("phương")).toBe("f,u,o,n,g");
});

test("research: dương", () => {
  expect(transcribeSyllable("dương")).toBe("z,u,o,n,g");
});

test("research: vãng", () => {
  expect(transcribeSyllable("vãng")).toBe("v,a,n,g,cl");
});

test("research: dinh", () => {
  expect(transcribeSyllable("dinh")).toBe("z,i,n,h");
});

test("research: tình", () => {
  expect(transcribeSyllable("tình")).toBe("t,i,n,h");
});

test("research: liên", () => {
  expect(transcribeSyllable("liên")).toBe("r,i,e,n");
});

// Additional basic test cases
test("transcribe: null onset vowel", () => {
  expect(transcribeSyllable("ơi")).toBe("o,i");
});

test("transcribe: stop coda", () => {
  expect(transcribeSyllable("thác")).toBe("ty,a,k");
});

test("transcribe: qu- medial w", () => {
  expect(transcribeSyllable("quốc")).toBe("k,u,o,k");
});

test("transcribe: quân with medial w", () => {
  expect(transcribeSyllable("quân")).toBe("k,u,a,n");
});

test("transcribe: hoa labialized", () => {
  expect(transcribeSyllable("hoa")).toBe("h,u,a");
});

test("transcribe: hoàng labialized + nasal", () => {
  expect(transcribeSyllable("hoàng")).toBe("h,u,a,n,g");
});

test("transcribe: xuân", () => {
  expect(transcribeSyllable("xuân")).toBe("s,u,a,n");
});

test("transcribe: chiêng", () => {
  expect(transcribeSyllable("chiêng")).toBe("ch,i,e,n,g");
});

test("transcribe: tiết", () => {
  expect(transcribeSyllable("tiết")).toBe("t,i,e,t");
});

test("transcribe: mướp", () => {
  expect(transcribeSyllable("mướp")).toBe("m,u,o,p");
});

test("transcribe: phước", () => {
  expect(transcribeSyllable("phước")).toBe("f,u,o,k");
});

// Coda variations
test("transcribe: cat (stop t)", () => {
  expect(transcribeSyllable("cát")).toBe("k,a,t");
});

test("transcribe: kit (stop t)", () => {
  expect(transcribeSyllable("kít")).toBe("k,i,t");
});

test("transcribe: tắm (nasal m)", () => {
  expect(transcribeSyllable("tắm")).toBe("t,a,m");
});

test("transcribe: san (nasal n)", () => {
  expect(transcribeSyllable("san")).toBe("s,a,n");
});

test("transcribe: tay (y coda)", () => {
  expect(transcribeSyllable("tay")).toBe("t,a,i");
});

// Multi-character onset (ngh → n,g, ng → n,g per new mapping)
test("transcribe: ngh onset", () => {
  expect(transcribeSyllable("nghèo")).toBe("n,g,e,o");
});

test("transcribe: ng onset", () => {
  expect(transcribeSyllable("ngang")).toBe("n,g,a,n,g");
});

test("transcribe: nh onset", () => {
  expect(transcribeSyllable("nhà")).toBe("ny,a");
});

// Word transcription
test("transcribeWord: single syllable", () => {
  expect(transcribeWord("kiên")).toEqual(["k,i,e,n"]);
});

// Full text transcription (toneless)
test("transcribeText: single word", () => {
  const result = transcribeText("kiên");
  expect(result).toBe("k,i,e,n"); // phonemes only, no tone marks
});

test("transcribe: structured result", () => {
  const result = transcribe("kiên");
  expect(result.input).toBe("kiên");
  expect(result.lines).toHaveLength(1);
  expect(result.lines[0]?.word).toBe("kiên");
  expect(result.lines[0]?.syllables).toHaveLength(1);
  expect(result.lines[0]?.syllables[0]?.phonemes).toBe("k,i,e,n");
});

// Error tolerance: invalid inputs don't throw, return empty or partial results
test("transcribeSyllable: error-tolerant (invalid input returns empty)", () => {
  const result = transcribeSyllable("xyz");
  expect(result).toBe("");
});

// VOICEVOX mode tests — nasal/stop codas converted to N/cl, digraph onsets simplified
test("voicevox: vãng (nasal ng → N)", () => {
  expect(transcribeSyllable("vãng", "voicevox")).toBe("v,a,N,cl");
});

test("voicevox: kiên (nasal n → N)", () => {
  expect(transcribeSyllable("kiên", "voicevox")).toBe("k,i,e,N");
});

test("voicevox: phương (ph → f onset, nasal ng → N)", () => {
  expect(transcribeSyllable("phương", "voicevox")).toBe("f,u,o,N");
});

test("voicevox: thác (th → ty onset, stop t → cl)", () => {
  expect(transcribeSyllable("thác", "voicevox")).toBe("ty,a,cl");
});

test("voicevox: nhà (nh → ny onset)", () => {
  expect(transcribeSyllable("nhà", "voicevox")).toBe("ny,a");
});

test("voicevox: ngã (ng → n,g onset)", () => {
  expect(transcribeSyllable("ngã", "voicevox")).toBe("n,g,a,cl");
});

test("transparent mode preserves ngã/nặng tone closure", () => {
  expect(transcribeSyllable("dạ")).toBe("z,a,cl");
  expect(transcribeSyllable("ngã")).toBe("n,g,a,cl");
});

// New tests for derived rules
test("transcribe: thu (th→ty)", () => {
  expect(transcribeSyllable("thu")).toBe("ty,u");
});

test("transcribe: như (nh→ny)", () => {
  expect(transcribeSyllable("như")).toBe("ny,u");
});

test("transcribe: thuyền (triphthong uyê)", () => {
  expect(transcribeSyllable("thuyền")).toBe("ty,u,y,e,n");
});

test("transcribe: theo (th→ty, coda o)", () => {
  expect(transcribeSyllable("theo")).toBe("ty,e,o");
});

test("transcribe: đâu (âu diphthong)", () => {
  expect(transcribeSyllable("đâu")).toBe("d,o,u");
});

test("transcribe: xuôi (medial u)", () => {
  expect(transcribeSyllable("xuôi")).toBe("s,u,o,i");
});
