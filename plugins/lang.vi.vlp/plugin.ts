/**
 * Amadeus language package: Vietnamese Cephome.
 * Guest entry for amadeus.plugin/v1 — engine evals host-kernel first, then this IIFE.
 */
import { param, plugin } from "@amsvs/api";
import {
  PLUGIN_VERSION,
  finalize as finalizeLang,
  plan as planLang,
  type AuthoredTrack,
  type EngineScore,
  type PhonePlan,
  type TimingEdit,
} from "./implementation.ts";

type Err = { kind: string; message?: string };

function isErr(value: unknown): value is Err {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    typeof (value as Err).kind === "string" &&
    ["unsupported", "malformed", "incompatible_schema", "runtime"].includes((value as Err).kind)
  );
}

function unwrapPlan(value: PhonePlan | Err): PhonePlan {
  if (isErr(value)) throw new Error(value.message ?? value.kind);
  return value;
}

function unwrapScore(value: EngineScore | Err): EngineScore {
  if (isErr(value)) throw new Error(value.message ?? value.kind);
  return value;
}

interface ToneControl {
  tone: number;
  position: number;
  cents: number;
  /** Central phoneme symbol (between - and +). */
  phone: string;
  /** Sinsy phone class from context head: c consonant · v vowel · p pause. */
  cls: "c" | "v" | "p" | "x";
}

/** true if this phone is a tone-bearing rime unit (vowel / semi-vowel nucleus). */
function isRimePhone(ctrl: ToneControl): boolean {
  if (ctrl.cls === "v") return true;
  // Fallback when class missing: common Vietnamese nucleus symbols
  return ["a", "e", "i", "o", "u", "y", "E", "O", "M", "N", "W", "A", "I", "U"].includes(
    ctrl.phone,
  );
}

function isPausePhone(ctrl: ToneControl): boolean {
  return ctrl.cls === "p" || ctrl.phone === "pau" || ctrl.phone === "sil" || ctrl.phone === "br";
}

function extractControl(context: string): ToneControl | null {
  const marker = ["@VIE|", "@VIE&"].find((m) => context.includes(m));
  if (!marker) return null;
  // Must be `.length` (JS); `.len` is Rust-only and was silently NaN here.
  const startIdx = context.indexOf(marker) + marker.length;
  const rest = context.slice(startIdx);
  const toneStr = rest.split("|")[0];
  const tone = parseInt(toneStr ?? "", 10);
  if (isNaN(tone) || tone > 5) return null;

  const phoneEnd = context.indexOf("[");
  if (phoneEnd < 0) return null;
  const phonePrefix = context.slice(0, phoneEnd);
  const remainingStart = phonePrefix.lastIndexOf("!") + 1;
  if (remainingStart <= 0) return null;
  const positionEnd = remainingStart - 1;
  const positionStart = phonePrefix.slice(0, positionEnd).lastIndexOf("-") + 1;
  if (positionStart <= 0) return null;
  const position = parseInt(phonePrefix.slice(positionStart, positionEnd), 10);
  const remaining = parseInt(phonePrefix.slice(remainingStart), 10);
  if (isNaN(position) || isNaN(remaining) || position === 0 || remaining === 0) return null;

  const eEnd = context.indexOf("/F:");
  if (eEnd < 0) return null;
  const ePrefix = context.slice(0, eEnd);
  const centsEnd = ePrefix.lastIndexOf("^");
  if (centsEnd < 0) return null;
  const centsStart = ePrefix.slice(0, centsEnd).lastIndexOf("!") + 1;
  if (centsStart <= 0) return null;
  const cents = parseFloat(ePrefix.slice(centsStart, centsEnd));
  if (!isFinite(cents) || Math.abs(cents) > 120) return null;

  // p[0] class + central phoneme:  v@xx^n-a+o=…  → cls=v, phone=a
  const head = context[0];
  const cls: ToneControl["cls"] = head === "c" || head === "v" || head === "p" ? head : "x";
  const phoneMatch = context.match(/-([^+/=]+)\+/);
  const phone = phoneMatch?.[1] ?? "";

  return { tone, position, cents, phone, cls };
}

/**
 * Tone family for the pure-delta graph.
 *  0 ngang · 1 huyền fall · 2 sắc rise · 3 hỏi dip · 4 ngã rise · 5 nặng fall
 */
type ToneKind = "none" | "rise" | "fall" | "dip";

function toneKind(tone: number): ToneKind {
  if (tone === 1 || tone === 5) return "fall";
  if (tone === 2 || tone === 4) return "rise";
  if (tone === 3) return "dip";
  return "none";
}

/** 0 = linear; 1 = full smoothstep ease (used when nonlinear is on). */
function ease01(t: number, peakEase: number): number {
  const x = Math.max(0, Math.min(1, t));
  const s = x * x * (3 - 2 * x); // smoothstep
  const e = Math.max(0, Math.min(1, peakEase));
  return x * (1 - e) + s * e;
}

/**
 * Pure cents delta graph at normalized time t∈[0,1].
 * - rise/fall: 0 → ±amount (eased when nonlinear)
 * - dip: 0 → −amount at valleyTime → back toward 0 (or slight rise after valley)
 */
function toneDeltaCents(
  kind: ToneKind,
  t: number,
  amountCents: number,
  nonlinear: boolean,
  peakEase: number,
  valleyTime: number,
): number {
  if (kind === "none" || amountCents <= 0) return 0;
  const u = Math.max(0, Math.min(1, t));
  const ease = nonlinear ? peakEase : 0;

  if (kind === "rise") {
    return amountCents * ease01(u, ease);
  }
  if (kind === "fall") {
    return -amountCents * ease01(u, ease);
  }

  // dip (hỏi): down to valley then recover
  const v = Math.max(0.05, Math.min(0.95, valleyTime));
  if (u <= v) {
    const p = v > 1e-6 ? u / v : 1;
    return -amountCents * ease01(p, ease);
  }
  const p = (u - v) / Math.max(1e-6, 1 - v);
  // recover from -amount toward 0 (still pure delta; no overshoot for now)
  return -amountCents * (1 - ease01(p, ease));
}

/** Local model slope sign over voiced frames (for offtone compensation). */
function modelSlopeSign(f0: Float32Array, start: number, end: number): -1 | 0 | 1 {
  let first = -1;
  let last = -1;
  for (let i = start; i < end; i++) {
    const v = f0[i]!;
    if (v >= 40 && isFinite(v)) {
      if (first < 0) first = i;
      last = i;
    }
  }
  if (first < 0 || last <= first) return 0;
  const d = f0[last]! - f0[first]!;
  if (Math.abs(d) < 0.5) return 0; // ~flat
  return d > 0 ? 1 : -1;
}

plugin("lang.vi.vlp")
  .version(PLUGIN_VERSION)
  .name("Vietnamese language processor")
  .params(
    {
      showPhoneSplits: param.boolean({
        default: true,
        label: "Split phoneme",
        help: "Show Cephome phone expansions on the piano roll.",
        cacheScope: "timing_and_later",
      }),
    },
    { label: "Vietnamese phonetics", stages: ["plan", "timing"] },
  )
  // Pitch-step: pure cents delta graphs (no model compression).
  .params(
    {
      toneWeight: param.number({
        // 100¢ = one semitone; default 25¢ is a clear, audible step (¼ tone).
        default: 25,
        min: 0,
        max: 100,
        step: 1,
        label: "Tone amount (cents)",
        help: "Peak pitch delta in cents (100¢ = 1 semitone). Rise/fall ends at ±amount; dip valley = −amount. 0 = off.",
        cacheScope: "f0_and_later",
      }),
      nonlinear: param.boolean({
        default: true,
        label: "Nonlinear mode",
        help: "Ease the tone ramp (smoothstep). Off = pure linear.",
        cacheScope: "f0_and_later",
      }),
      peakEase: param.number({
        default: 50,
        min: 0,
        max: 100,
        step: 1,
        label: "Peak ease (%)",
        help: "In nonlinear mode, blend linear→smoothstep (0 = linear, 100 = full ease).",
        cacheScope: "f0_and_later",
      }),
      valleyTime: param.number({
        default: 55,
        min: 5,
        max: 95,
        step: 1,
        label: "Valley time (%)",
        help: "Where the hỏi (dip) valley bottoms, as % of the syllable.",
        cacheScope: "f0_and_later",
      }),
      offtoneCompensation: param.number({
        default: 0,
        min: 0,
        max: 100,
        step: 1,
        label: "Offtone compensation (%)",
        help: "Boost tone delta when model F0 slope fights the tone direction (contrary).",
        cacheScope: "f0_and_later",
      }),
    },
    { label: "Vietnamese tonal field", stages: ["pitch"] },
  )
  .hooks({
    role: "language",
    plan(track) {
      void this.params.showPhoneSplits;
      return unwrapPlan(planLang(track as AuthoredTrack));
    },
    finalize(plan, timingEdits) {
      void this.params.showPhoneSplits;
      const edits = (timingEdits ?? []) as TimingEdit[];
      return unwrapScore(finalizeLang(plan as PhonePlan, edits));
    },
  })
  .member("tone", (b) =>
    b.hooks({
      stage: "post_pitch",
      order: 30,
      postPitch(ctx) {
        const amountCents = Math.min(100, Math.max(0, Number(this.parent.params.toneWeight ?? 25)));
        if (!(amountCents > 0) || !isFinite(amountCents)) return ctx.f0;

        const nonlinear = Boolean(this.parent.params.nonlinear ?? true);
        const peakEase =
          Math.min(100, Math.max(0, Number(this.parent.params.peakEase ?? 50))) / 100;
        const valleyTime =
          Math.min(95, Math.max(5, Number(this.parent.params.valleyTime ?? 55))) / 100;
        const offtoneComp =
          Math.min(100, Math.max(0, Number(this.parent.params.offtoneCompensation ?? 0))) / 100;

        const f0 = ctx.f0;
        const labels = ctx.labels ?? [];
        const alignment = ctx.alignment ?? [];

        if (alignment.length !== f0.length || labels.length === 0) {
          return f0;
        }

        const controls = labels.map((l) => extractControl(l.fullContext ?? ""));
        const firstFrames = Array.from<number | null>({ length: labels.length }).fill(null);
        const lastFrames = Array.from<number | null>({ length: labels.length }).fill(null);

        for (let i = 0; i < alignment.length; i++) {
          const phoneIdx = alignment[i]! - 1;
          if (phoneIdx >= 0 && phoneIdx < labels.length) {
            if (firstFrames[phoneIdx] === null) firstFrames[phoneIdx] = i;
            lastFrames[phoneIdx] = i;
          }
        }

        const syllables: Array<number[]> = [];
        let curSyl: number[] = [];
        let curTone: number | null = null;

        for (let i = 0; i < controls.length; i++) {
          const ctrl = controls[i];
          if (!ctrl) {
            if (curSyl.length > 0) {
              syllables.push(curSyl);
              curSyl = [];
            }
            curTone = null;
            continue;
          }
          if (ctrl.position === 1) {
            if (curSyl.length > 0) syllables.push(curSyl);
            curSyl = [i];
            curTone = ctrl.tone;
          } else if (curSyl.length === 0 || curTone !== ctrl.tone) {
            if (curSyl.length > 0) syllables.push(curSyl);
            curSyl = [];
            curTone = null;
          } else {
            curSyl.push(i);
          }
        }
        if (curSyl.length > 0) syllables.push(curSyl);

        // In-place contract: `ctx.f0` is the shared mutable yield buffer. Only
        // voiced frames are touched, so unvoiced frames survive untouched.
        for (const syl of syllables) {
          // Whole syllable span (onset + rime + coda)
          let sylStart: number | null = null;
          let sylEnd: number | null = null;
          // Tone-bearing span: first rime/vowel (anchor) → syllable end (includes tail).
          // Pre-vowel (onset) frames stay at δ=0.
          let rimeStart: number | null = null;
          let sylTone = 0;

          for (const phoneIdx of syl) {
            const ctrl = controls[phoneIdx];
            if (!ctrl || isPausePhone(ctrl)) continue;
            // `?? null` (not `||`): frame 0 is a valid first frame.
            const first = firstFrames[phoneIdx] ?? null;
            const last = lastFrames[phoneIdx];
            if (first === null || last === null) continue;
            if (sylStart === null) sylStart = first;
            sylEnd = (last || 0) + 1;
            sylTone = ctrl.tone;
            if (rimeStart === null && isRimePhone(ctrl)) {
              rimeStart = first;
            }
          }

          if (sylStart === null || sylEnd === null) continue;
          // No vowel found → treat whole syllable as rime (legacy fallback).
          if (rimeStart === null) rimeStart = sylStart;

          const kind = toneKind(sylTone);
          if (kind === "none") continue;

          // Offtone: boost amount when model slope (on rime) fights the tone.
          let amount = amountCents;
          if (offtoneComp > 0 && (kind === "rise" || kind === "fall")) {
            const want = kind === "rise" ? 1 : -1;
            const got = modelSlopeSign(f0, rimeStart, sylEnd);
            if (got !== 0 && got !== want) {
              amount = amountCents * (1 + offtoneComp);
            }
          }
          amount = Math.min(100, amount);

          // Ramp only over rime→tail. Pre-vowel holds model F0 (δ=0).
          const n = Math.max(1, sylEnd - rimeStart);
          for (let frame = rimeStart; frame < sylEnd; frame++) {
            const val = f0[frame]!;
            if (val < 40 || !isFinite(val)) continue;
            // t: 0 at vowel onset (anchor), 1 at syllable end — peak hits ±amount.
            const t = n === 1 ? 1 : (frame - rimeStart) / (n - 1);
            const deltaCents = toneDeltaCents(kind, t, amount, nonlinear, peakEase, valleyTime);
            const out = Math.max(40, Math.min(2000, val * Math.pow(2, deltaCents / 1200)));
            if (Math.abs(out - val) > 1e-4) {
              f0[frame] = out;
            }
          }
        }

        return { f0 };
      },
    }),
  )
  .register();
