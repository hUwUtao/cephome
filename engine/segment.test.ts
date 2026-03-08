import { test, expect } from "bun:test";
import { segmentSyllable } from "./segment.ts";

// Core segmentation tests covering the Vietnamese syllable structure

test("segment: ba (basic CV)", () => {
  const result = segmentSyllable("ba");
  expect(result.onset).toBe("b");
  expect(result.nucleus).toBe("a");
  expect(result.coda).toBe("");
});

test("segment: ăn (null onset, nasal coda)", () => {
  const result = segmentSyllable("ăn");
  expect(result.onset).toBe("");
  expect(result.nucleus).toBe("ă");
  expect(result.coda).toBe("n");
});

test("segment: ơi (null onset, diphthong)", () => {
  const result = segmentSyllable("ơi");
  expect(result.onset).toBe("");
  expect(result.nucleus).toBe("ơi");
  expect(result.coda).toBe("");
});

test("segment: ngh + vowel (3-char onset)", () => {
  const result = segmentSyllable("nghe");
  expect(result.onset).toBe("ngh");
  expect(result.nucleus).toBe("e");
});

test("segment: quốc (qu- medial detection)", () => {
  const result = segmentSyllable("quốc");
  expect(result.onset).toBe("qu");
  expect(result.medial).toBe("w");
  expect(result.coda).toBe("c");
});

test("segment: quân (qu- medial)", () => {
  const result = segmentSyllable("quân");
  expect(result.onset).toBe("qu");
  expect(result.medial).toBe("w");
  expect(result.nucleus).toBe("â");
  expect(result.coda).toBe("n");
});

test("segment: hoa (labialized onset)", () => {
  const result = segmentSyllable("hoa");
  expect(result.onset).toBe("h");
  expect(result.medial).toBe("w");
  expect(result.nucleus).toBe("a");
});

test("segment: hoàng (labialized + nasal coda)", () => {
  const result = segmentSyllable("hoàng");
  expect(result.onset).toBe("h");
  expect(result.medial).toBe("w");
  expect(result.nucleus).toBe("a");
  expect(result.coda).toBe("ng");
});

test("segment: xuân (x + labialized medial)", () => {
  const result = segmentSyllable("xuân");
  expect(result.onset).toBe("x");
  expect(result.medial).toBe("w");
  expect(result.nucleus).toBe("â");
  expect(result.coda).toBe("n");
});

test("segment: chiêng (ch- onset + diphthong)", () => {
  const result = segmentSyllable("chiêng");
  expect(result.onset).toBe("ch");
  expect(result.nucleus).toBe("iê");
  expect(result.coda).toBe("ng");
});

test("segment: dinh (d- + palatal nasal coda)", () => {
  const result = segmentSyllable("dinh");
  expect(result.onset).toBe("d");
  expect(result.nucleus).toBe("i");
  expect(result.coda).toBe("nh");
});

test("segment: thác (stop coda)", () => {
  const result = segmentSyllable("thác");
  expect(result.onset).toBe("th");
  expect(result.nucleus).toBe("a");
  expect(result.coda).toBe("c");
});

test("segment: kiếp (diphthong + stop coda)", () => {
  const result = segmentSyllable("kiếp");
  expect(result.onset).toBe("k");
  expect(result.nucleus).toBe("iê");
  expect(result.coda).toBe("p");
});

test("segment: phước (ph- onset + labialized + stop)", () => {
  const result = segmentSyllable("phước");
  expect(result.onset).toBe("ph");
  expect(result.medial).toBe("w");
  expect(result.coda).toBe("c");
});

// Invariant: nucleus is never empty
test("segment: nucleus never empty invariant", () => {
  const testCases = [
    "ba",
    "ăn",
    "ơi",
    "nghe",
    "kiên",
    "phương",
    "dương",
    "quốc",
  ];

  for (const syl of testCases) {
    const parsed = segmentSyllable(syl);
    expect(parsed.nucleus.length).toBeGreaterThan(0);
  }
});

