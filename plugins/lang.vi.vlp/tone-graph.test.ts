/**
 * Accurate tone-graph simulation (math ≡ live IIFE).
 *
 * Run from the Cephome root:
 *   bun test plugins/lang.vi.vlp/tone-graph.test.ts
 *
 * Pure delta only. Not an editor test.
 */

interface PostPitchContext {
  f0: Float32Array;
  scoreF0: Float32Array;
  alignment: number[];
  labels: Array<{ phone: string; fullContext: string }>;
}

interface UnitContext {
  parent: { params: Record<string, boolean | number> };
}

type PostPitchHook = (
  this: UnitContext,
  context: PostPitchContext,
) => Float32Array | { f0: Float32Array };

interface PluginDefinition {
  id: string;
  members?: PluginDefinition[];
  postPitch?: PostPitchHook;
}

declare global {
  var __plugin: (id: string, definition: PluginDefinition) => PluginDefinition;
}

const definitions: PluginDefinition[] = [];
globalThis.__plugin = (_id, definition) => {
  definitions.push(definition);
  return definition;
};

await import("./plugin.ts");
const plugin = definitions[0];
if (!plugin) throw new Error("plugin did not register");
const tone = plugin.members?.find((member) => member.id === ".tone");
const postPitch = tone?.postPitch;
if (!postPitch) throw new Error("tone member did not register post_pitch");

function hzToCents(hz: number, reference: number): number {
  return 1200 * Math.log2(hz / reference);
}

function ease01(t: number, peakEase: number): number {
  const x = Math.max(0, Math.min(1, t));
  const s = x * x * (3 - 2 * x);
  const e = Math.max(0, Math.min(1, peakEase));
  return x * (1 - e) + s * e;
}

type Kind = "none" | "rise" | "fall" | "dip";

function toneDeltaCents(
  kind: Kind,
  t: number,
  amountCents: number,
  nonlinear: boolean,
  peakEase: number,
  valleyTime: number,
): number {
  if (kind === "none" || amountCents <= 0) return 0;
  const u = Math.max(0, Math.min(1, t));
  const ease = nonlinear ? peakEase : 0;
  if (kind === "rise") return amountCents * ease01(u, ease);
  if (kind === "fall") return -amountCents * ease01(u, ease);
  const v = Math.max(0.05, Math.min(0.95, valleyTime));
  if (u <= v) {
    const p = v > 1e-6 ? u / v : 1;
    return -amountCents * ease01(p, ease);
  }
  const p = (u - v) / Math.max(1e-6, 1 - v);
  return -amountCents * (1 - ease01(p, ease));
}

function sim(kind: Kind, frames: number, amount: number, nl: boolean, pe: number, vt: number) {
  const out: number[] = [];
  for (let i = 0; i < frames; i++) {
    // Frame-edge t: 0 at the first frame, 1 at the last — matches the hook's
    // `t = (frame - rimeStart) / (sylEnd - rimeStart - 1)` mapping (peak at end).
    out.push(toneDeltaCents(kind, i / (frames - 1), amount, nl, pe, vt));
  }
  return out;
}

function mono(tone: number): string {
  return (
    `xx^xx-a+xx=xx~xx-1!1[xx$xx]xx/A:xx/B:1_1_1@VIE|${tone}|0/C:xx/D:xx/` +
    `E:A4]tail!0^0/F:next/G:xx`
  );
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const frames = 40;
const amount = 50;

// --- closed-form expectations ---
{
  const rise = sim("rise", frames, amount, false, 0, 0.55);
  // Frame-edge t: last frame at t=1 → full amount (50¢).
  assert(Math.abs(rise[frames - 1]! - 50) < 1e-9, `rise end ${rise[frames - 1]}`);
  assert(Math.abs(rise[0]!) < 1e-9, `rise start ${rise[0]}`);

  const fall = sim("fall", frames, amount, false, 0, 0.55);
  assert(Math.abs(fall[frames - 1]! + 50) < 1e-9, `fall end ${fall[frames - 1]}`);

  const dip = sim("dip", frames, amount, false, 0, 0.55);
  // valley near t=0.55 → frame index ~ round(0.55*(frames-1)) ≈ 21
  const imin = dip.indexOf(Math.min(...dip));
  const tValley = imin / (frames - 1);
  assert(Math.abs(tValley - 0.55) < 0.03, `dip valley t=${tValley}`);
  assert(Math.min(...dip) < -48, `dip min ${Math.min(...dip)}`);
  console.log("math closed-form OK", {
    riseEnd: rise[frames - 1],
    fallEnd: fall[frames - 1],
    dipMin: Math.min(...dip),
    dipValleyT: tValley.toFixed(3),
  });
}

// --- live IIFE must match math bit-for-bit (cents) ---
async function liveCents(tone: number, cfg: Record<string, unknown>): Promise<number[]> {
  const f0 = new Float32Array(frames).fill(220);
  const result = postPitch.call(
    { parent: { params: cfg as Record<string, boolean | number> } },
    {
      f0,
      scoreF0: new Float32Array([220]),
      alignment: Array.from({ length: frames }, () => 1),
      labels: [{ phone: "a", fullContext: mono(tone) }],
    },
  );
  const out = result instanceof Float32Array ? { f0: result } : result;
  const cents: number[] = [];
  for (let i = 0; i < frames; i++) cents.push(hzToCents(out.f0[i]!, 220));
  return cents;
}

const cases: Array<{
  name: string;
  tone: number;
  kind: Kind;
  cfg: Record<string, unknown>;
  nl: boolean;
  pe: number;
  vt: number;
}> = [
  {
    name: "rise linear",
    tone: 2,
    kind: "rise",
    cfg: {
      toneWeight: 50,
      nonlinear: false,
      peakEase: 0,
      valleyTime: 55,
      offtoneCompensation: 0,
    },
    nl: false,
    pe: 0,
    vt: 0.55,
  },
  {
    name: "rise ease100",
    tone: 2,
    kind: "rise",
    cfg: {
      toneWeight: 50,
      nonlinear: true,
      peakEase: 100,
      valleyTime: 55,
      offtoneCompensation: 0,
    },
    nl: true,
    pe: 1,
    vt: 0.55,
  },
  {
    name: "fall linear",
    tone: 1,
    kind: "fall",
    cfg: {
      toneWeight: 50,
      nonlinear: false,
      peakEase: 0,
      valleyTime: 55,
      offtoneCompensation: 0,
    },
    nl: false,
    pe: 0,
    vt: 0.55,
  },
  {
    name: "dip valley55",
    tone: 3,
    kind: "dip",
    cfg: {
      toneWeight: 50,
      nonlinear: false,
      peakEase: 0,
      valleyTime: 55,
      offtoneCompensation: 0,
    },
    nl: false,
    pe: 0,
    vt: 0.55,
  },
];

let worst = 0;
for (const c of cases) {
  const math = sim(c.kind, frames, 50, c.nl, c.pe, c.vt);
  const live = await liveCents(c.tone, c.cfg);
  let maxErr = 0;
  for (let i = 0; i < frames; i++) {
    maxErr = Math.max(maxErr, Math.abs(math[i]! - live[i]!));
  }
  worst = Math.max(worst, maxErr);
  console.log(
    c.name,
    `max|math−live|=${maxErr.toFixed(4)}¢`,
    `end=${live[frames - 1]!.toFixed(2)}¢`,
  );
  assert(maxErr < 0.05, `${c.name} diverged by ${maxErr}¢`);
}

// offtone: falling tone + rising model → 2× amount when offtoneCompensation=100
{
  const f0up = new Float32Array(frames);
  for (let i = 0; i < frames; i++) f0up[i] = 200 + i * 2;
  const base = {
    toneWeight: 50,
    nonlinear: false,
    peakEase: 0,
    valleyTime: 55,
    offtoneCompensation: 0,
  };
  const ctx = {
    f0: new Float32Array(f0up),
    scoreF0: new Float32Array([220]),
    alignment: Array.from({ length: frames }, () => 1),
    labels: [{ phone: "a", fullContext: mono(1) }],
  };
  const aResult = postPitch.call({ parent: { params: base } }, ctx);
  const bResult = postPitch.call(
    { parent: { params: { ...base, offtoneCompensation: 100 } } },
    { ...ctx, f0: new Float32Array(f0up) },
  );
  const a = aResult instanceof Float32Array ? { f0: aResult } : aResult;
  const b = bResult instanceof Float32Array ? { f0: bResult } : bResult;
  const d0 = hzToCents(a.f0[frames - 1]!, f0up[frames - 1]!);
  const d1 = hzToCents(b.f0[frames - 1]!, f0up[frames - 1]!);
  console.log("offtone", { d0: d0.toFixed(2), d1: d1.toFixed(2), ratio: (d1 / d0).toFixed(3) });
  assert(Math.abs(Math.abs(d1 / d0) - 2) < 0.02, `offtone ratio ${d1 / d0}`);
}

console.log(`\nALL OK  (worst math↔live ${worst.toFixed(5)}¢)`);
