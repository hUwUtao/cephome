import { codaToPhonemes, nucleusToPhonemes } from "../van.ts";
import { onsetToPhonemes } from "../onset.ts";
import { segmentSyllable } from "../segment.ts";
import type { RoleAwareLyricTranspiler, SyllablePhonePlan, TimedPhonePlan } from "./types.ts";
import { validateSinsyPhones } from "./phoneme.ts";

const VOWEL_SIGNATURES: Record<string, number> = {
  a: 1, ă: 2, â: 3, e: 4, ê: 5, o: 6, ô: 7, ơ: 8, i: 9, y: 9, u: 10, ư: 11,
  iê: 12, ia: 12, uô: 13, ua: 13, ươ: 14, ưa: 14, oa: 15, oe: 15, yê: 12, uyê: 16
};

export class VietnameseMoraPlanTranspiler implements RoleAwareLyricTranspiler {
  constructor(private readonly mode: "transparent" | "voicevox" = "voicevox") {}

  transpile(lyric: string): SyllablePhonePlan {
    return this.plan(lyric);
  }

  plan(lyric: string): SyllablePhonePlan {
    try {
      const parsed = segmentSyllable(lyric);
      const plan: TimedPhonePlan[] = [];

      for (const phone of onsetToPhonemes(parsed.onset)) {
        plan.push({ phone, role: "pre", weight: 1 });
      }
      if (parsed.medial === "w") {
        plan.push({ phone: "u", role: "pre", weight: 0.6 });
      }

      const nucleus = nucleusToPhonemes(parsed.nucleus);
      // ă and â are inherently short vowels
      const isShortVowel = ["ă", "â"].includes(parsed.nucleus);
      const vowelWeight = isShortVowel ? 0.5 : 1.0;

      nucleus.forEach((phone, index) => {
        plan.push({ 
          phone, 
          role: index === 0 ? "anchor" : "tail", 
          weight: (index === 0 ? 1 : 0.7) * vowelWeight 
        });
      });

      for (const phone of codaToPhonemes(parsed.coda, parsed.tone, this.mode)) {
        plan.push({ phone, role: "tail", weight: phone === "cl" ? 0.5 : 0.8 });
      }

      const vowelSign = VOWEL_SIGNATURES[parsed.nucleus] ?? 0;

      return filterPlan(lyric, parsed.tone, vowelSign, plan);
    } catch (error) {
      const reason = error instanceof Error ? error.message.toLowerCase() : "unknown error";
      return { source: lyric, phones: [], tone: 0, plan: [], warnings: [`${lyric}: ${reason}`] };
    }
  }
}

function filterPlan(source: string, tone: number, vowelSign: number, plan: TimedPhonePlan[]): SyllablePhonePlan {
  const invalid = validateSinsyPhones(plan.map((item) => item.phone));
  const filtered = plan.filter((item) => !invalid.includes(item.phone));
  return {
    source,
    phones: filtered.map((item) => item.phone),
    tone,
    vowelSign,
    plan: filtered.map(f => ({ ...f, vowelSign })),
    warnings: invalid.map((phone) => `${source}: unsupported Sinsy phone "${phone}"`),
  };
}
