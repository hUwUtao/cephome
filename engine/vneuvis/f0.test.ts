import { test, expect, describe } from "bun:test";
import { readF0, hzToMidi, midiToNoteName } from "./index.ts";

const F0_PATH = import.meta.dir + "/../../example/emlamamnoncuadang.f0";

describe(".f0 format", () => {
  let buf: ArrayBuffer;

  test("loads file", async () => {
    const file = Bun.file(F0_PATH);
    expect(await file.exists()).toBe(true);
    buf = await file.arrayBuffer();
    expect(buf.byteLength).toBe(16488);
  });

  test("parses F0Data", () => {
    const f0 = readF0(buf);
    expect(f0.frames).toBe(4122);
    expect(f0.durationSec).toBeCloseTo(41.22, 2);
    expect(f0.values.length).toBe(4122);
    expect(f0.values.BYTES_PER_ELEMENT).toBe(4); // float32
  });

  test("detects silence frames", () => {
    const f0 = readF0(buf);
    // first 100 frames should be 0.0 (lead silence)
    for (let i = 0; i < 100; i++) {
      expect(f0.values[i]).toBe(0);
    }
    // frame 100 should be non-zero (first voiced)
    expect(f0.values[100]).toBeGreaterThan(0);
    // silence count
    expect(f0.voicedCount).toBe(4012);
    expect(f0.voiced[0]).toBe(0);
    expect(f0.voiced[100]).toBe(1);
  });

  test("Hz range matches known values", () => {
    const f0 = readF0(buf);
    expect(f0.minHz).toBeCloseTo(182.1, 0);
    expect(f0.maxHz).toBeCloseTo(724.0, 0);
    expect(f0.meanHz).toBeCloseTo(446.2, 0);
  });

  test("throws on misaligned buffer", () => {
    const bad = new Uint8Array([1, 2, 3]); // 3 bytes, not multiple of 4
    expect(() => readF0(bad)).toThrow("aligned to float32");
  });

  test("F0 range corresponds to F#3–F#5", () => {
    const f0 = readF0(buf);
    expect(f0.minHz).toBeGreaterThan(170); // ~F#3
    expect(f0.maxHz).toBeLessThan(730); // ~F#5
  });
});

describe("pitch utilities", () => {
  test("hzToMidi: A4 = 440Hz = 69", () => {
    expect(hzToMidi(440)).toBeCloseTo(69, 5);
  });

  test("hzToMidi: 0 returns 0", () => {
    expect(hzToMidi(0)).toBe(0);
  });

  test("midiToNoteName: 69 → A4", () => {
    expect(midiToNoteName(69)).toBe("A4");
  });

  test("midiToNoteName: 0 → REST", () => {
    expect(midiToNoteName(0)).toBe("REST");
  });

  test("midiToNoteName: 60 → C4", () => {
    expect(midiToNoteName(60)).toBe("C4");
  });
});
