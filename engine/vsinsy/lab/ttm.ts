import { extractTone, normalizeSyllable } from "../../vmora/normalize.ts";
import type * as OnnxRuntime from "onnxruntime-web/wasm";

export interface TtmTimingOptions {
  modelDirectory?: string;
  durationScale?: number;
  minimumDurationMs?: number;
  maximumDurationMs?: number;
}

export interface TtmSyllableFeatures {
  onset: string;
  vowel: string;
  coda: string;
  tone: number;
}

interface TtmVocabulary {
  fwd: {
    onset: Record<string, number>;
    vowel: Record<string, number>;
    coda: Record<string, number>;
    tone: Record<string, number>;
  };
}

interface TtmRuntime {
  ort: typeof OnnxRuntime;
  session: OnnxRuntime.InferenceSession;
  vocabulary: TtmVocabulary;
}

const ONSETS = [
  "NGH",
  "NG",
  "NH",
  "PH",
  "TH",
  "TR",
  "CH",
  "GH",
  "GI",
  "KH",
  "QU",
  "B",
  "C",
  "D",
  "G",
  "H",
  "K",
  "L",
  "M",
  "N",
  "P",
  "R",
  "S",
  "T",
  "V",
  "X",
] as const;

const VOWEL_CLUSTERS = [
  "IÊU",
  "YÊU",
  "OAI",
  "OAY",
  "UÔI",
  "ƯƠI",
  "ƯƠU",
  "UYA",
  "UYÊ",
  "IÊ",
  "YÊ",
  "UÔ",
  "ƯƠ",
  "OA",
  "OĂ",
  "OE",
  "OI",
  "ÔI",
  "ƠI",
  "UA",
  "UĂ",
  "UÂ",
  "UI",
  "ƯA",
  "ƯI",
  "ƯU",
  "UY",
  "AI",
  "AO",
  "AU",
  "AY",
  "EO",
  "ÊU",
  "IA",
  "IU",
] as const;

const CODAS = ["CH", "NG", "NH", "C", "M", "N", "P", "T"] as const;
const SIMPLE_VOWELS = new Set(["A", "Ă", "Â", "E", "Ê", "I", "O", "Ô", "Ơ", "U", "Ư", "Y"]);
const MODEL_TONE_IDS = [0, 2, 1, 3, 4, 5] as const;
const MODEL_FILENAME = "ttm.onnx";
const WEIGHTS_FILENAME = "ttm.onnx.data";
const VOCABULARY_FILENAME = "vocab.json";
const WASM_FILENAME = "ort-wasm-simd-threaded.wasm";

let runtimePromise: Promise<TtmRuntime> | undefined;
let runtimeDirectory: string | undefined;

export function encodeTtmSyllable(syllable: string): TtmSyllableFeatures {
  const base = normalizeSyllable(syllable).toUpperCase().replaceAll("Đ", "D");
  const tone = MODEL_TONE_IDS[extractTone(syllable)] ?? 0;
  let onset = "";
  let remaining = base;

  for (const candidate of ONSETS) {
    if (!remaining.startsWith(candidate)) continue;
    onset = candidate;
    remaining = remaining.slice(candidate.length);
    break;
  }

  let vowel = "";
  let codaPart = remaining;
  for (const candidate of VOWEL_CLUSTERS) {
    if (!remaining.startsWith(candidate)) continue;
    vowel = candidate;
    codaPart = remaining.slice(candidate.length);
    break;
  }

  if (!vowel && remaining[0] && SIMPLE_VOWELS.has(remaining[0])) {
    vowel = remaining[0];
    codaPart = remaining.slice(1);
  }

  let coda = "";
  for (const candidate of CODAS) {
    if (!codaPart.endsWith(candidate)) continue;
    coda = candidate;
    codaPart = codaPart.slice(0, -candidate.length);
    break;
  }

  if (codaPart) vowel = remaining;
  return { onset, vowel, coda, tone };
}

export async function predictTtmDurations(
  syllables: string[],
  options: TtmTimingOptions = {},
): Promise<number[]> {
  if (syllables.length === 0) return [];

  const directory = await resolveModelDirectory(options.modelDirectory);
  const runtime = await loadRuntime(directory);
  const features = syllables.map(encodeTtmSyllable);
  const length = features.length;
  const dimensions = [1, length];
  const ids = (kind: "onset" | "vowel" | "coda"): BigInt64Array =>
    BigInt64Array.from(features, (feature) =>
      BigInt(runtime.vocabulary.fwd[kind][feature[kind]] ?? 0),
    );
  const positions = Float32Array.from(features, (_, index) => index / length);

  const output = await runtime.session.run({
    onset: new runtime.ort.Tensor("int64", ids("onset"), dimensions),
    vowel: new runtime.ort.Tensor("int64", ids("vowel"), dimensions),
    coda: new runtime.ort.Tensor("int64", ids("coda"), dimensions),
    tone: new runtime.ort.Tensor(
      "int64",
      BigInt64Array.from(features, (feature) => BigInt(feature.tone)),
      dimensions,
    ),
    pos: new runtime.ort.Tensor("float32", positions, dimensions),
    lengths: new runtime.ort.Tensor("int64", new BigInt64Array([BigInt(length)]), [1]),
  });

  const duration = output.duration;
  if (!duration || duration.type !== "float32") {
    throw new Error("TTM returned no float32 duration tensor");
  }

  const scale = positiveNumber(options.durationScale, 1);
  const minimum = positiveNumber(options.minimumDurationMs, 10);
  const maximum = Math.max(minimum, positiveNumber(options.maximumDurationMs, 800));
  return Array.from(duration.data as Float32Array, (logDuration) => {
    const milliseconds = (Math.expm1(logDuration) / 10_000) * scale;
    return clamp(milliseconds, minimum, maximum);
  });
}

async function loadRuntime(directory: string): Promise<TtmRuntime> {
  if (!runtimePromise || runtimeDirectory !== directory) {
    runtimeDirectory = directory;
    runtimePromise = createRuntime(directory);
  }
  try {
    return await runtimePromise;
  } catch (error) {
    if (runtimeDirectory === directory) {
      runtimePromise = undefined;
      runtimeDirectory = undefined;
    }
    throw error;
  }
}

async function createRuntime(directory: string): Promise<TtmRuntime> {
  const ort = await import("onnxruntime-web/wasm");
  ort.env.logLevel = "error";
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;

  const [model, weights, vocabularyText, wasm] = await Promise.all([
    Bun.file(`${directory}/${MODEL_FILENAME}`).arrayBuffer(),
    Bun.file(`${directory}/${WEIGHTS_FILENAME}`).arrayBuffer(),
    Bun.file(`${directory}/${VOCABULARY_FILENAME}`).text(),
    Bun.file(`${directory}/${WASM_FILENAME}`).arrayBuffer(),
  ]);
  ort.env.wasm.wasmBinary = new Uint8Array(wasm);
  const vocabulary = JSON.parse(vocabularyText) as TtmVocabulary;
  const session = await ort.InferenceSession.create(new Uint8Array(model), {
    executionProviders: ["wasm"],
    externalData: [{ path: WEIGHTS_FILENAME, data: new Uint8Array(weights) }],
    logSeverityLevel: 3,
  });

  return { ort, session, vocabulary };
}

async function resolveModelDirectory(explicitDirectory?: string): Promise<string> {
  const { existsSync } = await import("node:fs");
  const { dirname, join, resolve } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const configuredDirectory =
    explicitDirectory ??
    process.env.CEPHOME_TTM_MODEL_DIR ??
    (typeof globalThis.talk_timing_model_dir === "string"
      ? globalThis.talk_timing_model_dir
      : undefined);
  if (configuredDirectory) {
    if (hasModelAssets(configuredDirectory, existsSync, join)) return configuredDirectory;
    throw new Error(`TTM assets not found in configured directory: ${configuredDirectory}`);
  }

  const candidates = [
    join(moduleDirectory, "..", "models", "ttm"),
    join(moduleDirectory, "models", "ttm"),
    resolve("engine", "vsinsy", "models", "ttm"),
    resolve("models", "ttm"),
    resolve("bin", "models", "ttm"),
  ];

  const found = candidates.find((candidate) => hasModelAssets(candidate, existsSync, join));
  if (!found) {
    throw new Error(`TTM assets not found; checked: ${candidates.join(", ")}`);
  }
  return found;
}

function hasModelAssets(
  directory: string,
  exists: (path: string) => boolean,
  joinPath: (...paths: string[]) => string,
): boolean {
  return [MODEL_FILENAME, WEIGHTS_FILENAME, VOCABULARY_FILENAME, WASM_FILENAME].every((filename) =>
    exists(joinPath(directory, filename)),
  );
}

function positiveNumber(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

declare global {
  var talk_timing_model_dir: string | undefined;
}
