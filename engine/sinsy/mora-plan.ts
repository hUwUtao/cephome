import { codaToPhonemes, nucleusToPhonemes } from "../van.ts";
import { onsetToPhonemes } from "../onset.ts";
import { segmentSyllable } from "../segment.ts";
import type { RoleAwareLyricTranspiler, SyllablePhonePlan, TimedPhonePlan } from "./types.ts";
import { validateSinsyPhones } from "./phoneme.ts";

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
      nucleus.forEach((phone, index) => {
        plan.push({ phone, role: index === 0 ? "anchor" : "tail", weight: index === 0 ? 1 : 0.7 });
      });

      for (const phone of codaToPhonemes(parsed.coda, parsed.tone, this.mode)) {
        plan.push({ phone, role: "tail", weight: phone === "cl" ? 0.5 : 0.8 });
      }

      return filterPlan(lyric, plan);
    } catch (error) {
      const reason = error instanceof Error ? error.message.toLowerCase() : "unknown error";
      return { source: lyric, phones: [], plan: [], warnings: [`${lyric}: ${reason}`] };
    }
  }
}

function filterPlan(source: string, plan: TimedPhonePlan[]): SyllablePhonePlan {
  const invalid = validateSinsyPhones(plan.map((item) => item.phone));
  const filtered = plan.filter((item) => !invalid.includes(item.phone));
  return {
    source,
    phones: filtered.map((item) => item.phone),
    plan: filtered,
    warnings: invalid.map((phone) => `${source}: unsupported Sinsy phone "${phone}"`),
  };
}
