import { expect, test } from "bun:test";
import {
  flatTtsToLabel,
  parseTextToTalkScore,
  parseTextToTalkScoreWithTimingModel,
  parseTextToScore,
  talkaloidToLabelAuto,
  talkaloidToLabel,
  talkaloidToLabelWithTimingModel,
} from "./talkaloid.ts";
import { normalizeTalkNumbers, readVietnameseNumber } from "./text-normalize.ts";
import { encodeTtmSyllable, predictTtmDurations } from "./ttm.ts";
import { expressionForNote } from "./expression.ts";

test("talk mode: uses compact explicit silence before the first sentence", () => {
  const score = parseTextToTalkScore("Nào bạn.");
  expect(score.notes).toHaveLength(4);
  expect(score.notes[0]?.isRest).toBe(true);
  expect(score.notes[0]?.durationDiv).toBe(24);
  expect(score.notes[0]?.expression).toBe("talk-silence");
  expect(score.notes[1]?.lyric).toBe("nào");
  expect(score.notes[1]?.isRest).toBe(false);
  expect(score.notes[2]?.lyric).toBe("bạn");
  expect(score.notes[2]?.isRest).toBe(false);
  expect(score.notes[3]?.isRest).toBe(true);
  expect(score.notes[3]?.lyric).toBeNull();
  expect(score.notes[1]?.pitch?.midi).toBe(60);
  expect(score.notes[2]?.pitch?.midi).toBe(60);
});

test("talk mode: preserves clause and sentence phrasing across full text", () => {
  const score = parseTextToTalkScore("Chào bạn, hôm nay thế nào?\nTôi khỏe.");
  expect(score.notes).toHaveLength(12);
  expect(score.notes[1]?.lyric).toBe("chào");
  expect(score.notes[3]?.isRest).toBe(true);
  expect(score.notes[8]?.isRest).toBe(true);
  expect(score.notes[8]?.durationDiv).toBeGreaterThan(score.notes[3]?.durationDiv ?? 0);
  expect(score.notes[3]?.expression).toBe("talk-pause");
  expect(score.notes[8]?.expression).toBe("talk-silence");
});

test("talk mode: can keep comma boundaries connected without removing sentence release", () => {
  const score = parseTextToTalkScore("Chào bạn, hôm nay vui.", {
    shortBoundaryMode: "connected",
  });
  const rests = score.notes.filter((note) => note.isRest);

  expect(rests).toHaveLength(2);
  expect(rests[0]?.expression).toBe("talk-silence");
  expect(rests[1]?.expression).toBe("talk-silence");
});

test("talk mode: promotes a connected comma to breath after a long phrase", () => {
  const score = parseTextToTalkScore("một hai, ba bốn, năm sáu.", {
    maxPhraseSyllables: 4,
    shortBoundaryMode: "connected",
  });
  const rests = score.notes.filter((note) => note.isRest);

  expect(rests.map((note) => note.expression)).toEqual([
    "talk-silence",
    "talk-breath",
    "talk-silence",
  ]);
});

test("talk mode: accepts explicit one-based breath word indices", () => {
  const score = parseTextToTalkScore("một hai ba bốn.", {
    breathAfterWordIndices: [2],
    maxPhraseSyllables: 100,
    shortBoundaryMode: "connected",
  });
  const rests = score.notes.filter((note) => note.isRest);

  expect(rests.map((note) => note.expression)).toEqual([
    "talk-silence",
    "talk-breath",
    "talk-silence",
  ]);
});

test("talk mode: serializes semantic boundaries as explicit phones", () => {
  const sentence = talkaloidToLabel("xin chào.").mono;
  expect(sentence.trim().split("\n")[0]?.endsWith(" sil")).toBe(true);
  expect(sentence.trim().split("\n").at(-1)?.endsWith(" sil")).toBe(true);

  const breath = talkaloidToLabel("một hai ba bốn năm", { maxPhraseSyllables: 4 }).mono;
  expect(breath).toContain(" br\n");
});

test("talk mode: optionally preserves Vietnamese coda place", () => {
  const text = "cam can càng cành cáp cát các cách";
  const compact = talkaloidToLabel(text).mono;
  const placeAware = talkaloidToLabel(text, { codaMode: "place-aware" }).mono;

  expect(compact).toContain(" N\n");
  expect(compact).toContain(" cl\n");
  for (const phone of ["m", "n", "g", "h", "p", "t", "k"]) {
    expect(placeAware).toContain(` ${phone}\n`);
  }
});

test("talk mode: adds breath pauses to long unpunctuated text", () => {
  const score = parseTextToTalkScore("một hai ba bốn năm sáu bảy", {
    maxPhraseSyllables: 4,
  });
  const rests = score.notes.filter((note) => note.isRest);
  expect(rests).toHaveLength(2);
  expect(rests[0]?.durationDiv).toBe(24);
  expect(rests[1]?.durationDiv).toBeGreaterThan(0);
});

test("talk mode: does not quantize punctuation into note pitch", () => {
  const statement = parseTextToTalkScore("bạn.");
  const question = parseTextToTalkScore("bạn?");
  expect(question.notes[1]?.pitch?.midi).toBe(statement.notes[1]?.pitch?.midi);
});

test("talk mode: keeps a neutral register while amplifying dấu contours", () => {
  const score = parseTextToTalkScore("ma mà má mả mã mạ.");
  const voiced = score.notes.filter((note) => !note.isRest);
  expect(voiced.map((note) => note.pitch?.midi)).toEqual([60, 60, 60, 60, 60, 60]);

  const sắc = parseTextToTalkScore("má.").notes.find((note) => !note.isRest)!;
  const talkOffset = expressionForNote(sắc, null, null, 2, 2, 3).tonalPitchOffset;
  const musicOffset = expressionForNote(
    { ...sắc, expression: null },
    null,
    null,
    2,
    2,
    3,
  ).tonalPitchOffset;
  expect(talkOffset).toBeGreaterThan(0.9);
  expect(talkOffset).toBeGreaterThan(musicOffset);
});

test("talk mode: uses phonetic and phrase context for syllable durations", () => {
  const score = parseTextToTalkScore("má mảng mạ.");
  const durations = score.notes.filter((note) => !note.isRest).map((note) => note.durationDiv);
  expect(new Set(durations).size).toBeGreaterThan(1);
});

test("talk mode: gives tonal vowels four internal contour windows", () => {
  const lines = talkaloidToLabel("là bão").mono.trim().split("\n");
  const vowelWindows = lines
    .map((line) => line.split(/\s+/u))
    .filter((fields) => fields[2] === "a")
    .map((fields) => Number(fields[1]) - Number(fields[0]));

  expect(vowelWindows).toHaveLength(8);
  expect(vowelWindows.every((duration) => duration >= 180_000)).toBe(true);
});

test("TTM: encodes the feature and tone IDs used during training", () => {
  expect(encodeTtmSyllable("khách")).toEqual({ onset: "KH", vowel: "A", coda: "CH", tone: 1 });
  expect(encodeTtmSyllable("bằng")).toEqual({ onset: "B", vowel: "Ă", coda: "NG", tone: 2 });
  expect(encodeTtmSyllable("nghiệp")).toEqual({
    onset: "NGH",
    vowel: "IÊ",
    coda: "P",
    tone: 5,
  });
});

test("TTM: predicts bounded contextual durations through WASM", async () => {
  const durations = await predictTtmDurations(["xin", "chào", "các", "bạn"]);
  expect(durations).toHaveLength(4);
  expect(durations.every((duration) => duration >= 10 && duration <= 800)).toBe(true);
  expect(durations[0]).toBeCloseTo(240.9139, 2);
  expect(durations[3]).toBeCloseTo(252.6211, 2);
  expect(new Set(durations.map(Math.round)).size).toBeGreaterThan(1);
});

test("talk mode: applies TTM predictions to score durations", async () => {
  const heuristic = parseTextToTalkScore("xin chào các bạn");
  const predicted = await parseTextToTalkScoreWithTimingModel("xin chào các bạn");
  const heuristicDurations = heuristic.notes.map((note) => note.durationDiv);
  const predictedDurations = predicted.notes.map((note) => note.durationDiv);
  expect(predictedDurations).not.toEqual(heuristicDurations);
});

test("talk mode: applies speed after timing inference without shrinking the launch bank", async () => {
  const normal = await parseTextToTalkScoreWithTimingModel("xin chào các bạn", { talkSpeed: 1 });
  const fast = await parseTextToTalkScoreWithTimingModel("xin chào các bạn", { talkSpeed: 2 });
  const speechDuration = (score: typeof normal): number =>
    score.notes.filter((note) => !note.isRest).reduce((total, note) => total + note.durationDiv, 0);

  expect(normal.notes[0]?.durationDiv).toBe(24);
  expect(fast.notes[0]?.durationDiv).toBe(24);
  expect(fast.notes[0]?.durationDiv).toBe(normal.notes[0]?.durationDiv);
  expect(Math.abs(speechDuration(fast) - speechDuration(normal) / 2)).toBeLessThanOrEqual(1);
});

test("talk mode: keeps comma-separated clauses in one TTM context", async () => {
  const score = await parseTextToTalkScoreWithTimingModel("xin chào, các bạn");
  const durations = score.notes.filter((note) => !note.isRest).map((note) => note.durationDiv);
  expect(Math.min(...durations)).toBeGreaterThanOrEqual(12);
});

test("TTM: rejects an incomplete configured model directory", async () => {
  await expect(
    predictTtmDurations(["xin"], { modelDirectory: "/tmp/cephome-missing-ttm" }),
  ).rejects.toThrow("TTM assets not found in configured directory");
});

test("TTM: supports a full twelve-syllable phrase", async () => {
  const durations = await predictTtmDurations([
    "một",
    "hai",
    "ba",
    "bốn",
    "năm",
    "sáu",
    "bảy",
    "tám",
    "chín",
    "mười",
    "mười",
    "một",
  ]);
  expect(durations).toHaveLength(12);
});

test("talk mode: falls back to heuristic timing when TTM assets are unavailable", async () => {
  let fallbackMessage = "";
  const actual = await talkaloidToLabelAuto(
    "xin chào",
    { timingModelDirectory: "/tmp/cephome-missing-ttm" },
    (error) => {
      fallbackMessage = error.message;
    },
  );
  expect(actual).toEqual(talkaloidToLabel("xin chào"));
  expect(fallbackMessage).toContain("TTM assets not found");
});

test("talk mode: normalizes Vietnamese integers and decimals before tokenization", () => {
  expect(readVietnameseNumber("1.234.567")).toBe(
    "một triệu hai trăm ba mươi tư nghìn năm trăm sáu mươi bảy",
  );
  expect(readVietnameseNumber("12.500,50")).toBe("mười hai nghìn năm trăm chấm năm");
  expect(normalizeTalkNumbers("giá 3,14 đồng")).toContain("ba chấm mười bốn");
  const normalizedMeasurement = normalizeTalkNumbers("42 năm (968-1010), rộng 13,87km²")
    .replace(/\s+/g, " ")
    .trim();
  expect(normalizedMeasurement).toBe(
    "bốn mươi hai năm ( chín trăm sáu mươi tám đến một ngàn không trăm mười ; ), rộng mười ba chấm tám mươi bảy ki lô mét vuông ;",
  );

  const score = parseTextToTalkScore("Tôi có 1.234 đồng.");
  const lyrics = score.notes.flatMap((note) => (note.lyric ? [note.lyric] : []));
  expect(lyrics).toEqual(["tôi", "có", "một", "ngàn", "hai", "trăm", "ba", "mươi", "tư", "đồng"]);
  // The following period replaces the virtual comma instead of duplicating it.
  expect(score.notes.filter((note) => note.isRest)).toHaveLength(2);
});

test("talk mode: inserts releasing virtual commas after complete numeric groups", () => {
  expect(normalizeTalkNumbers("2023").replace(/\s+/gu, " ").trim()).toBe(
    "hai ngàn không trăm hai mươi ba ;",
  );
  expect(normalizeTalkNumbers("1.965.000đ").replace(/\s+/gu, " ").trim()).toBe(
    "một triệu chín trăm sáu mươi lăm ngàn đồng ;",
  );
  expect(normalizeTalkNumbers("200 km2").replace(/\s+/gu, " ").trim()).toBe(
    "hai trăm ki lô mét vuông ;",
  );
  expect(normalizeTalkNumbers("10k").replace(/\s+/gu, " ").trim()).toBe("mười ka ;");
  expect(normalizeTalkNumbers("33 người")).not.toContain(";");

  const result = talkaloidToLabel("Năm 2023, chúng ta tiến lên.", {
    shortBoundaryMode: "connected",
  });
  expect(
    result.mono
      .trim()
      .split("\n")
      .filter((line) => line.endsWith(" pau")),
  ).toHaveLength(1);
});

test("talk mode: yields valid continuous label outputs", () => {
  const result = talkaloidToLabel("Chào bạn. Hôm nay bạn khỏe không?");
  expect(result.mono).toContain("sil");
  expect(result.full).toContain("/A:");
  expect(result.full).toContain("VIE");

  const rows = result.mono.trim().split("\n");
  expect(rows[0]).toBe("0 1200000 sil");
  for (let index = 1; index < rows.length; index++) {
    const previousEnd = Number(rows[index - 1]?.split(" ")[1]);
    const currentStart = Number(rows[index]?.split(" ")[0]);
    expect(currentStart).toBe(previousEnd);
  }
});

test("talk mode: keeps model-backed numeric labels positive and continuous", async () => {
  const result = await talkaloidToLabelWithTimingModel("Tôi có 1.234 đồng.");
  const rows = result.mono.trim().split("\n");
  for (let index = 0; index < rows.length; index++) {
    const fields = rows[index]!.split(" ");
    const start = Number(fields[0]);
    const end = Number(fields[1]);
    expect(end).toBeGreaterThan(start);
    if (index > 0) expect(start).toBe(Number(rows[index - 1]!.split(" ")[1]));
  }
});

test("talk mode: auto-detects plain text in transcribe API", async () => {
  const { transcribe } = require("../bin/rule-api.ts");
  const bytes = new TextEncoder().encode("Chào bạn.");
  const result = await transcribe(bytes);
  expect(result.mono).toContain("sil");
});

test("talk mode: keeps flat TTS compatibility aliases", () => {
  expect(parseTextToScore("xin chào").notes).toHaveLength(3);
  expect(flatTtsToLabel("xin chào").mono).toBe(talkaloidToLabel("xin chào").mono);
});
