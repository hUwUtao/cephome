import { test, expect, describe } from "bun:test";
import { readMelSpec, melAt, MEL_SILENCE } from "./index.ts";

const MEL_PATH = import.meta.dir + "/../../example/emlamamnoncuadang.melspec";

describe(".melspec format", () => {
  let buf: ArrayBuffer;

  test("loads file", async () => {
    const file = Bun.file(MEL_PATH);
    expect(await file.exists()).toBe(true);
    buf = await file.arrayBuffer();
    expect(buf.byteLength).toBe(1648800);
  });

  test("parses MelSpecData", () => {
    const mel = readMelSpec(buf);
    expect(mel.frames).toBe(4122);
    expect(mel.bins).toBe(100);
    expect(mel.durationSec).toBeCloseTo(41.22, 2);
    expect(mel.values.length).toBe(412200);
    expect(mel.values.BYTES_PER_ELEMENT).toBe(4);
  });

  test("detects silence padding", () => {
    const mel = readMelSpec(buf);
    // first frame should be all -7.0
    for (let b = 0; b < 100; b++) {
      expect(mel.values[b]).toBe(-7.0);
    }
    expect(mel.silentFrames).toBe(99);
  });

  test("frame access helpers", () => {
    const mel = readMelSpec(buf);
    expect(melAt(mel, 0, 0)).toBe(MEL_SILENCE);
    const v = melAt(mel, 100, 50);
    expect(v).toBeGreaterThan(MEL_SILENCE);
    expect(v).toBeLessThan(2);
  });

  test("value range matches known values", () => {
    const mel = readMelSpec(buf);
    expect(mel.min).toBeCloseTo(-4.317, 1);
    expect(mel.max).toBeCloseTo(1.0, 1);
    expect(mel.mean).toBeCloseTo(-1.667, 1);
  });

  test("throws on misaligned buffer", () => {
    const bad = new Uint8Array(399); // not divisible by 400
    expect(() => readMelSpec(bad)).toThrow("not divisible by");
  });
});
