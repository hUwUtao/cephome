import { test, expect } from "bun:test";
import {
  transcribeSyllable,
  transcribeWord,
  transcribe,
  transcribeText,
} from "./index.ts";

// Research.md core examples - MUST PASS
test("research: kiên", () => {
  expect(transcribeSyllable("kiên")).toBe("k,i,e,n");
});

test("research: phương", () => {
  expect(transcribeSyllable("phương")).toBe("p,h,w,o,n,g");
});

test("research: dương", () => {
  expect(transcribeSyllable("dương")).toBe("z,w,o,n,g");
});

test("research: vãng", () => {
  expect(transcribeSyllable("vãng")).toBe("v,a,n,g");
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
  expect(transcribeSyllable("thác")).toBe("t,h,a,k");
});

test("transcribe: qu- medial w", () => {
  expect(transcribeSyllable("quốc")).toBe("k,w,o,k");
});

test("transcribe: quân with medial w", () => {
  expect(transcribeSyllable("quân")).toBe("k,w,a,n");
});

test("transcribe: hoa labialized", () => {
  expect(transcribeSyllable("hoa")).toBe("h,w,a");
});

test("transcribe: hoàng labialized + nasal", () => {
  expect(transcribeSyllable("hoàng")).toBe("h,w,a,n,g");
});

test("transcribe: xuân", () => {
  expect(transcribeSyllable("xuân")).toBe("s,w,a,n");
});

test("transcribe: chiêng", () => {
  expect(transcribeSyllable("chiêng")).toBe("ch,i,e,n,g");
});

test("transcribe: tiết", () => {
  expect(transcribeSyllable("tiết")).toBe("t,i,e,t");
});

test("transcribe: mướp", () => {
  expect(transcribeSyllable("mướp")).toBe("m,w,o,p");
});

test("transcribe: phước", () => {
  expect(transcribeSyllable("phước")).toBe("p,h,w,o,k");
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

// Multi-character onset (ngh, ng output empty consonant)
test("transcribe: ngh onset", () => {
  expect(transcribeSyllable("nghèo")).toBe("n,g,h,e,u");
});

test("transcribe: ng onset", () => {
  expect(transcribeSyllable("ngang")).toBe("n,g,a,n,g");
});

test("transcribe: nh onset", () => {
  expect(transcribeSyllable("nhà")).toBe("n,h,a");
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
