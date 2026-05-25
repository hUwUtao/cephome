import { expect, test } from "bun:test";
import { parseTextToScore, flatTtsToLabel } from "./flat-tts.ts";

test("flat-tts: parse simple text to score", () => {
  const score = parseTextToScore("Nào bạn.");
  // "Nào", "bạn", and rest "."
  expect(score.notes).toHaveLength(3);
  expect(score.notes[0]?.lyric).toBe("nào");
  expect(score.notes[0]?.isRest).toBe(false);
  expect(score.notes[0]?.pitch?.midi).toBe(60); // C4

  expect(score.notes[1]?.lyric).toBe("bạn");
  expect(score.notes[1]?.isRest).toBe(false);

  expect(score.notes[2]?.isRest).toBe(true);
  expect(score.notes[2]?.lyric).toBeNull();
});

test("flat-tts: parse text with punctuation to score", () => {
  const score = parseTextToScore("Chào bạn, hôm nay thế nào?");
  // "Chào", "bạn", comma (rest), "hôm", "nay", "thế", "nào", question mark (rest)
  expect(score.notes).toHaveLength(8);
  expect(score.notes[0]?.lyric).toBe("chào");
  expect(score.notes[2]?.isRest).toBe(true); // comma
  expect(score.notes[2]?.durationDiv).toBe(2); // short rest

  expect(score.notes[7]?.isRest).toBe(true); // question mark
  expect(score.notes[7]?.durationDiv).toBe(4); // long rest
});

test("flat-tts: yields valid label outputs", () => {
  const result = flatTtsToLabel("Chào bạn.");
  expect(result.mono).toContain("pau");
  expect(result.full).toContain("/A:");
});

test("flat-tts: auto-detect plain text in transcribe API", () => {
  const { transcribe } = require("./rule-api.ts");
  const bytes = new TextEncoder().encode("Chào bạn.");
  const result = transcribe(bytes);
  expect(result.mono).toContain("pau");
  expect(result.full).toContain("/A:");
});
