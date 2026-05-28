import { test, expect, describe } from "bun:test";
import { readMonoLabel, framePhonemeMap } from "./index.ts";

const MONO_PATH = import.meta.dir + "/../../example/em-la-mam-non-cua-dang.mono.lab";

describe("mono label", () => {
  let text: string;

  test("loads file", async () => {
    const file = Bun.file(MONO_PATH);
    expect(await file.exists()).toBe(true);
    text = await file.text();
    expect(text.length).toBeGreaterThan(0);
  });

  test("parses phoneme segments", () => {
    const segs = readMonoLabel(text);
    expect(segs.length).toBe(403);

    // First segment: lead silence
    expect(segs[0]!.phoneme).toBe("pau");
    expect(segs[0]!.start100ns).toBe(0);
    expect(segs[0]!.end100ns).toBe(10000000);
    expect(segs[0]!.startSec).toBe(0);
    expect(segs[0]!.endSec).toBe(1);
    expect(segs[0]!.durationSec).toBe(1);
  });

  test("timing matches WAV duration", () => {
    const segs = readMonoLabel(text);
    const last = segs[segs.length - 1]!;
    expect(last.endSec).toBeCloseTo(41.223, 2);
  });

  test("frame alignment", () => {
    const segs = readMonoLabel(text);
    // First phoneme "pau": 0-1s → frames 0-100
    expect(segs[0]!.frameStart).toBe(0);
    expect(segs[0]!.frameEnd).toBe(100);
  });
});

describe("framePhonemeMap", () => {
  test("maps all frames to phoneme indices", () => {
    const segs = readMonoLabel("0 10000000 pau\n10000000 20000000 a\n");
    const map = framePhonemeMap(segs, 200);
    expect(map.length).toBe(200);
    // First 100 frames → phoneme 0 (pau)
    for (let i = 0; i < 100; i++) expect(map[i]).toBe(0);
    // Next 100 frames → phoneme 1 (a)
    for (let i = 100; i < 200; i++) expect(map[i]).toBe(1);
  });
});
